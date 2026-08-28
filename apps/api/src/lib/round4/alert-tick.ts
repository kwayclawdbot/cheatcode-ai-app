/**
 * Evaluating armed alerts inside the paper tick.
 *
 * Round 2 shipped alerts as `armed_no_feed` — activated but never checked,
 * because there was no evaluation loop and saying otherwise would have been a
 * lie in a financial product. Round 4 needs Watching → Active to be REAL
 * (spec §9: "a card moves to Active only after a VERIFIED event"), so the
 * evaluation lives where the marks already are: the paper tick.
 *
 * WHAT COUNTS AS VERIFIED
 * A structured price condition met by a quote we actually received, with its
 * timestamp and freshness recorded on the trigger. Nothing else fires:
 *   - an alert with no expressible price condition is left alone rather than
 *     "probably triggered";
 *   - a symbol with no quote this tick is left alone rather than assumed
 *     unchanged;
 *   - an alert already triggered is not re-triggered.
 *
 * A trigger writes `status='triggered'`, stamps the evaluation onto
 * `refs.round4.last_evaluated`, raises the user event and notifies. The alert
 * CARD reads the status and moves itself to Active — there is no second copy of
 * the state to drift.
 */
import { serviceClient } from '../db';
import { alertIdentity } from './alert-identity';
import { log } from '../log';
import { emitUserEvent } from '../events';
import { notify } from '../notify';

export type TickMark = { price: number; ts: string; freshness: string };

/**
 * TWO CONDITION SHAPES LIVE IN THIS DATABASE and both are read here.
 *
 *   A. what `/alerts/draft` writes, from `AlertCondition`:
 *      {compose:'all'|'any', atoms:[{atom:'price_cross', symbol, operator:'above', value}]}
 *   B. what the paper tick writes for a position exit:
 *      {all:[{subject:'price', op:'lte', value, symbol}]}
 *
 * Normalising them in one place is the alternative to two evaluators that
 * quietly disagree about what "above" means.
 */
type Atom = {
  atom?: unknown;
  subject?: unknown;
  op?: unknown;
  operator?: unknown;
  value?: unknown;
  value_2?: unknown;
  symbol?: unknown;
  level?: unknown;
  price?: unknown;
};

const ABOVE = new Set(['gte', 'gt', 'above', 'crosses_up', 'crosses_above']);
const BELOW = new Set(['lte', 'lt', 'below', 'crosses_down', 'crosses_below']);

/** The comparison an atom asks for, or null when it is not a price condition. */
function priceTest(atom: Atom): { op: 'gte' | 'lte'; level: number } | null {
  const kind = String(atom.atom ?? atom.subject ?? '').toLowerCase();
  // Anything that is not about price is left to the engine that owns it. A
  // volume or catalyst condition is NOT "probably met" because price moved.
  if (kind && !/price|last|level|close/.test(kind)) return null;

  const raw = Number(atom.value ?? atom.level ?? atom.price);
  if (!Number.isFinite(raw)) return null;

  const op = String(atom.operator ?? atom.op ?? '').toLowerCase();
  if (ABOVE.has(op)) return { op: 'gte', level: raw };
  if (BELOW.has(op)) return { op: 'lte', level: raw };
  return null;
}

function atomsOf(condition: unknown): { atoms: Atom[]; mode: 'all' | 'any' } {
  const c = (condition ?? {}) as Record<string, unknown>;
  if (Array.isArray(c.atoms)) {
    return { atoms: c.atoms as Atom[], mode: c.compose === 'any' ? 'any' : 'all' };
  }
  if (Array.isArray(c.all)) return { atoms: c.all as Atom[], mode: 'all' };
  if (Array.isArray(c.any)) return { atoms: c.any as Atom[], mode: 'any' };
  return { atoms: [], mode: 'all' };
}

export type AlertEvalResult = { triggered: number; evaluated: number };

/**
 * `marks` is the tick's quote map, symbol → mark. Only symbols present in it
 * are evaluated; everything else is untouched, which is the honest behaviour
 * when a feed goes quiet.
 */
export async function evaluateArmedAlerts(opts: {
  marks: Map<string, TickMark>;
  userId?: string;
  requestId: string;
}): Promise<AlertEvalResult> {
  const db = serviceClient();
  let q = db
    .from('alerts')
    .select('id,user_id,status,natural_language,condition,data_dependency,refs,expires_at,created_at')
    .eq('status', 'active');
  if (opts.userId) q = q.eq('user_id', opts.userId);

  const { data, error } = await q.limit(500);
  if (error) {
    log('warn', opts.requestId, 'alert_eval.load_failed', { message: error.message });
    return { triggered: 0, evaluated: 0 };
  }

  let triggered = 0;
  let evaluated = 0;
  const now = new Date().toISOString();

  for (const row of ((data ?? []) as Record<string, unknown>[])) {
    const refs = (row.refs as Record<string, unknown>) ?? {};
    // Same source of truth as the feed: the parsed condition, not a client hint.
    const symbol =
      (typeof row.symbol === 'string' && row.symbol.trim() ? row.symbol.trim().toUpperCase() : null) ??
      alertIdentity({ condition: row.condition, dataDependency: row.data_dependency, refs: refs as never }).symbol;
    if (!symbol) continue;
    const mark = opts.marks.get(symbol);
    if (!mark) continue;

    const { atoms, mode } = atomsOf(row.condition);
    const tests = atoms
      .filter((a) => !a.symbol || String(a.symbol).toUpperCase() === symbol)
      .map(priceTest)
      .filter((t): t is { op: 'gte' | 'lte'; level: number } => t !== null);
    if (!tests.length) continue;

    evaluated += 1;
    const met = tests.map((t) => (t.op === 'gte' ? mark.price >= t.level : mark.price <= t.level));
    const fired = mode === 'any' ? met.some(Boolean) : met.every(Boolean);

    // Every evaluation is recorded, fired or not — "last evaluated" is what
    // makes "armed" a claim the app can actually stand behind.
    const round4 = {
      ...((refs.round4 as Record<string, unknown>) ?? {}),
      last_evaluated: { at: now, price: mark.price, freshness: mark.freshness, source_ts: mark.ts, met: fired },
    };

    if (!fired) {
      await db.from('alerts').update({ refs: { ...refs, round4 } }).eq('id', String(row.id));
      continue;
    }

    const level = tests[0].level;
    const plain = `${symbol} reached $${level}. Last print $${mark.price}, ${mark.freshness}.`;

    const { error: upErr } = await db
      .from('alerts')
      .update({
        status: 'triggered',
        refs: {
          ...refs,
          round4: { ...round4, triggered_at: now, trigger_price: mark.price, trigger_level: level },
        },
      })
      .eq('id', String(row.id))
      .eq('status', 'active');
    if (upErr) {
      log('warn', opts.requestId, 'alert_eval.trigger_failed', { alert_id: String(row.id), message: upErr.message });
      continue;
    }

    triggered += 1;
    await emitUserEvent(
      String(row.user_id),
      'alert_trigger',
      'alert',
      String(row.id),
      {
        symbol,
        level,
        price: mark.price,
        freshness: mark.freshness,
        source_ts: mark.ts,
        plain,
        condition_plain: (row.natural_language as string) ?? plain,
      },
      opts.requestId
    );
    await notify({
      userId: String(row.user_id),
      kind: 'alert_trigger',
      titlePlain: `${symbol} hit the level you were watching`,
      bodyPlain: `${plain} This is the moment you asked to be told about — nothing has been bought or sold.`,
      route: `/trade/${symbol}?alert=${String(row.id)}&ctx=alert`,
      payload: { alert_id: String(row.id), symbol, level, price: mark.price },
      requestId: opts.requestId,
    });
  }

  if (triggered || evaluated) {
    log('info', opts.requestId, 'alert_eval.done', { evaluated, triggered });
  }
  return { triggered, evaluated };
}

/** Symbols with an armed alert, so the tick fetches a quote for them too. */
export async function armedAlertSymbols(userId?: string): Promise<string[]> {
  const db = serviceClient();
  let q = db.from('alerts').select('condition,data_dependency,refs').eq('status', 'active');
  if (userId) q = q.eq('user_id', userId);
  const { data } = await q.limit(500);
  const out = new Set<string>();
  for (const r of ((data ?? []) as Record<string, unknown>[])) {
    const sym = alertIdentity({
      condition: r.condition,
      dataDependency: r.data_dependency,
      refs: (r.refs as { symbol?: string; level?: number } | null) ?? null,
    }).symbol;
    if (sym) out.add(sym);
  }
  return [...out];
}
