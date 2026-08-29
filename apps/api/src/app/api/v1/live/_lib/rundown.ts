/**
 * The rundown: everything the show could talk about, ranked, with the numbers
 * already derived.
 *
 * The SOURCE ROUTER lives in the worker (`workers/kai-live/src/sources.ts`) and
 * makes the decisions — priority, no-repeat, cooldown. This module is the
 * DERIVATION half: it reads the rows and turns them into candidates using the
 * app's own helpers (`lib/setups.ts`, `lib/kai/context.ts`, `lib/market/*`), so
 * a level the show marks is byte-for-byte the level the app's Trade Portal
 * marks for the same setup.
 *
 * NOTHING IN HERE INVENTS A NUMBER. Every price on a candidate comes from a
 * `setups` row, an `alerts` row or a stored quote. Where a value is absent it is
 * null and the show says less about that name — which is the correct failure,
 * because the alternative is a number nobody can account for being read aloud on
 * YouTube where it cannot be taken back.
 */
import { serviceClient, isMissingObject } from '@/lib/db';
import { log } from '@/lib/log';
import {
  buildConfirmations,
  levels as setupLevels,
  narration as setupNarration,
  scenarios as setupScenarios,
  sizeSuggestion,
  toEvidence,
  whyPlain,
} from '@/lib/setups';
import type { SetupRow } from '@/lib/kai/context';
import { getCandles, CANDLE_TIMEFRAMES, type CandleTimeframe } from '@/lib/market/polygon';
import { computeTechnicals } from '@/lib/market/technicals';
import { quoteFromSnapshot } from '@/lib/market';

export type RundownCandidate = {
  source: 'setup' | 'request' | 'winner' | 'watchlist';
  symbol: string;
  headline: string;
  rank: number;
  setup_id: string | null;
  alert_id: string | null;
  request_id: string | null;
  intent: string | null;
  long: boolean;
  state: string | null;
  grade_band: string | null;
  grade_display: string | null;
  thesis_plain: string | null;
  narration: string | null;
  why_plain: string | null;
  levels: {
    entry: number | null;
    stop: number | null;
    targets: { price: number; label?: string | null }[];
    perShare: number | null;
    rr: number | null;
  };
  evidence: { label: string; ok: boolean; detail_plain: string | null }[];
  scenarios: { name: string; plain: string; outcome_usd: number | null; semantic: string }[];
  support: { price: number; plain: string }[];
  resistance: { price: number; plain: string }[];
  outcome: { gain_pct: number | null; plain: string } | null;
  quote: { price: number | null; freshness: string } | null;
  valid_until: string | null;
};

const SETUP_COLUMNS =
  'id,symbol,mode,intent,state,score,grade_band,grade_display,score_components,thesis_plain,thesis_technical,entry_condition,invalidation,stop,targets,catalyst,quote_snapshot,valid_until,scanner_run_id,created_at';

/**
 * A closed alert is only a "winner" once its hold window has passed.
 *
 * Talking up a name the audience might still be holding — or that Kai's own
 * alert is still live on — turns a review show into a pump. Three days is the
 * day-trade hold window; the deprecated show used seven and had the same
 * reason written next to it.
 */
const WINNER_HOLD_WINDOW_DAYS = Number(process.env.LIVE_WINNER_HOLD_DAYS ?? 3);
const WINNER_LOOKBACK_DAYS = 21;

const EMPTY_LEVELS = { entry: null, stop: null, targets: [], perShare: null, rr: null };

function longFrom(intent: string | null): boolean {
  return intent === 'buy_to_open' || intent === 'buy_to_cover';
}

/* ------------------------------------------------------------------ */
/* 1. Ready setups                                                     */
/* ------------------------------------------------------------------ */

/**
 * A/B ready setups from today, best grade first.
 *
 * `ready` outranks `forming` because the whole premise of the show is Kai
 * analyzing setups that have actually met their conditions. A `forming` setup is
 * included only to keep the rundown from being empty, at a lower rank, and it is
 * NEVER promoted to sounding ready — `narration()` carries the state's own
 * sentence, so a forming setup narrates as forming.
 */
async function readySetups(limit: number): Promise<RundownCandidate[]> {
  const db = serviceClient();
  const { data, error } = await db
    .from('setups')
    .select(SETUP_COLUMNS)
    .in('state', ['ready', 'forming', 'watching'])
    .order('state', { ascending: true })
    .order('score', { ascending: false })
    .limit(limit * 2);

  if (error) {
    if (!isMissingObject(error)) log('warn', '-', 'live.rundown_setups_failed', { message: error.message });
    return [];
  }

  const out: RundownCandidate[] = [];
  for (const raw of (data ?? []) as unknown as (SetupRow & { created_at: string })[]) {
    const lv = setupLevels(raw);
    const q = quoteFromSnapshot(raw.symbol, raw.quote_snapshot);
    const confirmations = buildConfirmations(raw, q.price);
    // Size is needed only so `scenarios()` can say what a win and a loss are
    // worth. The show has no user and therefore no risk policy, so it is sized
    // against nothing and the dollar outcomes come back null — which is right:
    // a broadcast must not put a dollar figure on a stranger's trade.
    const size = sizeSuggestion(raw, null, null);
    const rank =
      (raw.state === 'ready' ? 300 : raw.state === 'forming' ? 200 : 100) +
      (raw.grade_band === 'A' ? 30 : raw.grade_band === 'B' ? 20 : 0) +
      Math.round(Number(raw.score ?? 0) / 10);

    out.push({
      source: 'setup',
      symbol: raw.symbol,
      headline:
        raw.state === 'ready'
          ? `${raw.symbol} — every condition met`
          : `${raw.symbol} — ${String(raw.state).replace('_', ' ')}`,
      rank,
      setup_id: raw.id,
      alert_id: null,
      request_id: null,
      intent: raw.intent,
      long: longFrom(raw.intent),
      state: raw.state,
      grade_band: raw.grade_band,
      grade_display: raw.grade_display,
      thesis_plain: raw.thesis_plain,
      narration: setupNarration(raw),
      why_plain: whyPlain(raw),
      levels: {
        entry: lv.entry,
        stop: lv.stop,
        targets: lv.targets,
        perShare: lv.perShare,
        rr: lv.rr,
      },
      evidence: toEvidence(confirmations),
      scenarios: setupScenarios(raw, size),
      // Filled in below from the stored daily bars. A setup carries a PLAN
      // (trigger, stop, targets) and says nothing about where the chart has
      // turned before, so without this the show can name a trigger and cannot
      // name a support — and the first run of the worker had Kai reaching for
      // "support" three times a segment and being refused, because the level
      // genuinely did not exist anywhere it could be traced to.
      support: [],
      resistance: [],
      outcome: null,
      quote: { price: q.price, freshness: q.freshness },
      valid_until: raw.valid_until,
    });
  }
  const ranked = out.sort((a, b) => b.rank - a.rank).slice(0, limit);
  await Promise.all(ranked.map(withSwingLevels));
  return ranked;
}

/**
 * Give a candidate the swing levels its chart actually has.
 *
 * Cache-first through `getCandles`, and deliberately best-effort: a symbol whose
 * bars are not stored keeps two empty arrays and the show simply does not name a
 * support on it. `computeTechnicals` is the same function the ticker page calls,
 * so a level the show names is a level the app would name.
 */
async function withSwingLevels(c: RundownCandidate): Promise<void> {
  try {
    const res = await getCandles(c.symbol, '1d', isoDaysAgo(400), today());
    const candles = res.candles.slice(-260);
    if (candles.length < 40) return;
    const last = candles[candles.length - 1];
    const t = computeTechnicals({ candles, price: last?.c ?? null, timeframe: '1d', freshness: 'delayed' });
    c.support = t.support ?? [];
    c.resistance = t.resistance ?? [];
  } catch {
    /* no bars, no levels, no invention */
  }
}

/* ------------------------------------------------------------------ */
/* 2. Subscriber requests                                              */
/* ------------------------------------------------------------------ */

/**
 * Queued `live_requests`, oldest first — the queue is a queue, and a viewer who
 * paid attention for twenty minutes should not be overtaken by one who arrived
 * a minute ago.
 *
 * `user_id` is not selected. The router needs the symbol and the order; who
 * asked is nobody's business on a broadcast.
 */
async function subscriberRequests(limit: number): Promise<RundownCandidate[]> {
  const db = serviceClient();
  const { data, error } = await db
    .from('live_requests')
    .select('id,symbol,note,created_at')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    if (!isMissingObject(error)) log('warn', '-', 'live.rundown_requests_failed', { message: error.message });
    return [];
  }

  return ((data ?? []) as { id: string; symbol: string; note: string | null; created_at: string }[]).map(
    (r, i) => ({
      source: 'request' as const,
      symbol: String(r.symbol).toUpperCase(),
      headline: `${String(r.symbol).toUpperCase()} — asked for by a subscriber`,
      rank: 1000 - i,
      setup_id: null,
      alert_id: null,
      request_id: r.id,
      intent: null,
      long: true,
      state: null,
      grade_band: null,
      grade_display: null,
      thesis_plain: r.note,
      narration: null,
      why_plain: null,
      levels: { ...EMPTY_LEVELS },
      evidence: [],
      scenarios: [],
      support: [],
      resistance: [],
      outcome: null,
      quote: null,
      valid_until: null,
    })
  );
}

/* ------------------------------------------------------------------ */
/* 3. Recent winners                                                   */
/* ------------------------------------------------------------------ */

/**
 * Alerts that played out, outside their hold window.
 *
 * "Played out" means the lifecycle reached `closed` or `expired` — an alert
 * still in `active` or `position_active` has not finished being right, and the
 * temptation to grade it early is exactly how a review show becomes a
 * highlight reel. `event`/`grade_snapshot` carry whatever the tick recorded;
 * nothing is computed here, so an alert with no recorded outcome simply does
 * not qualify as a winner.
 */
async function recentWinners(limit: number): Promise<RundownCandidate[]> {
  const db = serviceClient();
  const since = new Date(Date.now() - WINNER_LOOKBACK_DAYS * 86_400_000).toISOString();
  const holdCutoff = new Date(Date.now() - WINNER_HOLD_WINDOW_DAYS * 86_400_000).toISOString();

  const { data, error } = await db
    .from('alerts')
    .select('id,symbol,lifecycle_state,event,grade_snapshot,trade_plan,setup_id,direction,state_changed_at,created_at')
    .in('lifecycle_state', ['closed', 'expired'])
    .gte('created_at', since)
    .lte('state_changed_at', holdCutoff)
    .order('state_changed_at', { ascending: false })
    .limit(limit * 3);

  if (error) {
    if (!isMissingObject(error)) log('warn', '-', 'live.rundown_winners_failed', { message: error.message });
    return [];
  }

  const out: RundownCandidate[] = [];
  for (const raw of (data ?? []) as Record<string, unknown>[]) {
    const event = (raw.event ?? {}) as Record<string, unknown>;
    const gain = Number(event.gain_pct ?? event.max_gain_pct ?? event.pnl_pct);
    if (!Number.isFinite(gain) || gain <= 0) continue; // Not a winner. Not shown as one.
    const symbol = String(raw.symbol ?? '').toUpperCase();
    if (!symbol) continue;
    const plan = (raw.trade_plan ?? {}) as Record<string, unknown>;
    const entry = Number(plan.entry);
    const stop = Number(plan.stop);

    out.push({
      source: 'winner',
      symbol,
      headline: `${symbol} — how the call actually played out`,
      rank: 500 + Math.round(gain),
      setup_id: (raw.setup_id as string) ?? null,
      alert_id: String(raw.id),
      request_id: null,
      intent: null,
      long: String(raw.direction ?? 'long') !== 'short',
      state: String(raw.lifecycle_state ?? ''),
      grade_band: ((raw.grade_snapshot ?? {}) as Record<string, unknown>).band as string | null,
      grade_display: ((raw.grade_snapshot ?? {}) as Record<string, unknown>).display as string | null,
      thesis_plain: (event.thesis_plain as string) ?? null,
      narration: null,
      why_plain: null,
      levels: {
        entry: Number.isFinite(entry) ? entry : null,
        stop: Number.isFinite(stop) ? stop : null,
        targets: [],
        perShare: null,
        rr: null,
      },
      evidence: [],
      scenarios: [],
      support: [],
      resistance: [],
      outcome: {
        gain_pct: Math.round(gain * 100) / 100,
        plain: `The alert ran ${Math.round(gain * 100) / 100} percent before it was closed.`,
      },
      quote: null,
      valid_until: null,
    });
  }
  return out.sort((a, b) => b.rank - a.rank).slice(0, limit);
}

/* ------------------------------------------------------------------ */
/* 4. Watchlist / movers fallback                                      */
/* ------------------------------------------------------------------ */

/**
 * The floor. Liquid names from `instruments`, each with its OWN levels derived
 * from the daily bars by the same swing detector the ticker page uses.
 *
 * This tier is what stops the show going quiet, and it is also the tier most
 * able to lie, because there is no setup object behind it. The compensating
 * rule: a watchlist segment gets support and resistance levels ONLY — they come
 * from `computeTechnicals`, which reads real pivots off real bars — and never an
 * entry, a stop or a target, because those are a plan and nobody made one.
 */
async function watchlistFallback(limit: number, exclude: Set<string>): Promise<RundownCandidate[]> {
  const db = serviceClient();
  const { data, error } = await db.from('instruments').select('symbol,name').limit(40);
  if (error) {
    if (!isMissingObject(error)) log('warn', '-', 'live.rundown_watchlist_failed', { message: error.message });
    return [];
  }

  const rows = ((data ?? []) as { symbol: string; name: string | null }[]).filter(
    (r) => !exclude.has(r.symbol.toUpperCase())
  );

  const out: RundownCandidate[] = [];
  for (const r of rows) {
    if (out.length >= limit) break;
    const symbol = r.symbol.toUpperCase();
    const res = await getCandles(symbol, '1d', isoDaysAgo(400), today());
    const candles = res.candles.slice(-260);
    if (candles.length < 40) continue; // Too little history to say anything true.

    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    const t = computeTechnicals({ candles, price: last?.c ?? null, timeframe: '1d', freshness: 'delayed' });
    const changePct =
      last?.c && prev?.c ? Math.round(((last.c - prev.c) / prev.c) * 10000) / 100 : null;

    out.push({
      source: 'watchlist',
      symbol,
      headline: `${symbol} — what the chart is doing into tomorrow`,
      // Movers first: the biggest absolute move is the one a viewer noticed.
      rank: 10 + Math.abs(changePct ?? 0),
      setup_id: null,
      alert_id: null,
      request_id: null,
      intent: null,
      long: (changePct ?? 0) >= 0,
      state: null,
      grade_band: null,
      grade_display: null,
      thesis_plain: r.name ? `${r.name} on the watchlist.` : null,
      narration: null,
      why_plain: null,
      levels: { ...EMPTY_LEVELS },
      evidence: [],
      scenarios: [],
      support: t.support ?? [],
      resistance: t.resistance ?? [],
      outcome: null,
      quote: { price: last?.c ?? null, freshness: t.computed_from?.freshness ?? 'stale' },
      valid_until: null,
    });
  }
  return out.sort((a, b) => b.rank - a.rank).slice(0, limit);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */

export async function buildRundown(opts: {
  limit: number;
  exclude: string[];
}): Promise<{ candidates: RundownCandidate[]; degraded: boolean; degraded_reason: string | null }> {
  const exclude = new Set(opts.exclude.map((s) => s.toUpperCase()));
  const take = Math.max(2, opts.limit);

  const [requests, setups, winners] = await Promise.all([
    subscriberRequests(take),
    readySetups(take),
    recentWinners(take),
  ]);

  const seen = new Set<string>(exclude);
  const merged: RundownCandidate[] = [];
  // Tier order is the product decision; within a tier, rank decides. A symbol
  // that appears in two tiers is kept at its HIGHEST tier only — a requested
  // name that also has a ready setup is still a request, and the segment gets
  // the setup's levels because the worker asks for them by symbol.
  for (const tier of [requests, setups, winners]) {
    for (const c of tier) {
      const key = c.symbol.toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(c);
    }
  }

  if (merged.length < take) {
    const fill = await watchlistFallback(take - merged.length, seen);
    for (const c of fill) {
      if (seen.has(c.symbol)) continue;
      seen.add(c.symbol);
      merged.push(c);
    }
  }

  return {
    candidates: merged.slice(0, take),
    degraded: merged.length === 0,
    degraded_reason: merged.length === 0 ? 'There is nothing to build a show out of right now.' : null,
  };
}

/* ------------------------------------------------------------------ */
/* Levels for a symbol that has no setup                               */
/* ------------------------------------------------------------------ */

export const LIVE_TIMEFRAMES: CandleTimeframe[] = ['1d', '4h', '1h', '15m'];

export function isCandleTimeframe(tf: string): tf is CandleTimeframe {
  return (CANDLE_TIMEFRAMES as readonly string[]).includes(tf);
}
