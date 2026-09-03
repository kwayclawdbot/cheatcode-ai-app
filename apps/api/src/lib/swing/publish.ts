/**
 * SWING-3 — a published setup reaches the people it matches.
 *
 * SWING-1 brought the Kai morning picks into `setups`, and there they stopped:
 * `setup_alert_prefs` existed in the schema since 0008 and was read by nothing,
 * so the app held every morning alert and told nobody. This is the connector.
 *
 * WHAT THIS FILE OWNS, AND WHAT IT DELIBERATELY DOES NOT.
 * The push layer already decides whether a person may be pushed AT ALL — quiet
 * hours, `push_enabled`, per-category switches, the daily budget, entitlements,
 * dead subscriptions. Re-implementing any of that here would give the product
 * two answers to the same question, so this file answers only the one the push
 * layer cannot: does THIS SETUP match what THIS USER asked to hear about.
 * Adding `setup_published` to `PROACTIVE_KINDS` is what buys the rest.
 *
 * THE SAFETY GATE IS THE POINT OF THE FILE.
 * An ingest run reads a 180-day window to compute percentiles, so on any given
 * morning the ingest is holding ~250 setups and creating three. Fanning out on
 * "what the ingest touched" would text the entire back catalogue to every user
 * the first time this ran. `publishable()` is therefore a whitelist of four
 * independent conditions, any one of which is sufficient to refuse, and the
 * caller additionally passes ONLY the ids the write actually inserted.
 *
 * IDEMPOTENCE IS CHECKED, NOT ASSUMED. `notifications` has no unique index on
 * (user, setup) — it cannot have one, the setup id lives inside a jsonb payload
 * — so the publisher reads back what it already sent for these setups and
 * subtracts. Re-running the ingest twice in a morning notifies nobody twice.
 */
import { serviceClient } from '../db';
import { log } from '../log';
import { notify } from '../notify';

/* ------------------------------------------------------------------ */
/* Shapes                                                               */
/* ------------------------------------------------------------------ */

/** The columns of a `setups` row this decision needs — nothing more. */
export type PublishableSetup = {
  id: string;
  symbol: string;
  mode: string | null;
  intent: string | null;
  state: string | null;
  grade_band: 'A' | 'B' | 'C' | null;
  grade_display: string | null;
  score: number | null;
  thesis_plain: string | null;
  thesis_technical: string | null;
  quote_snapshot: Record<string, unknown> | null;
};

/** One `setup_alert_prefs` row. Every field may be null — see `prefsOrDefaults`. */
export type SetupPrefs = {
  user_id: string;
  enabled: boolean | null;
  min_grade: 'A' | 'B' | 'C' | null;
  modes: string[] | null;
  intents: string[] | null;
  symbols_include: string[] | null;
  symbols_exclude: string[] | null;
};

/** Every way a setup can fail to reach someone, named. Never a silent drop. */
export type Refusal =
  | 'not_ready'
  | 'not_a_long'
  | 'not_swing'
  | 'ungraded'
  | 'not_todays_pick'
  | 'prefs_disabled'
  | 'below_min_grade'
  | 'mode_not_wanted'
  | 'intent_not_wanted'
  | 'symbol_excluded'
  | 'symbol_not_in_include_list'
  | 'already_notified';

export type Decision = { ok: true } | { ok: false; reason: Refusal };

const OK: Decision = { ok: true };
const no = (reason: Refusal): Decision => ({ ok: false, reason });

/* ------------------------------------------------------------------ */
/* The safety gate                                                      */
/* ------------------------------------------------------------------ */

/**
 * An ordering, not a preference: A is the best band, and `min_grade` means
 * "this good or better".
 */
export const GRADE_RANK: Record<'A' | 'B' | 'C', number> = { A: 3, B: 2, C: 1 };

/**
 * The floor a user who has never said anything gets. C — everything.
 *
 * 0008 shipped this as 'B' and 0013 creates the prefs row at signup with
 * nothing but a user id, so every account inherited that floor without anyone
 * choosing it. SWING-1 measured band C at 46% of every pick the scanner ships;
 * on 2026-08-31 and 09-01 it was 2 of the 3 morning picks. Nearly half the
 * product was invisible to everybody.
 *
 * A default floor is only defensible if the letter forecasts the outcome, and
 * it does not. The medallion is a trailing-180-day PERCENTILE of
 * `breakout_score`, and ENGINE-9 measured that score as no better than a coin
 * toss at ranking what a pick went on to do. The band says how CLEAN a setup
 * looked, which is worth showing; a default floor makes it read as how likely
 * the trade is to work, which is a claim nothing supports.
 *
 * It is still a real floor. Someone who wants only A and B can say so. This is
 * the answer when nobody has.
 *
 * 0028 sets the same value as the column default, so the code and the schema
 * agree; this constant is what applies to a profile with no prefs row at all.
 */
export const DEFAULT_MIN_GRADE: 'A' | 'B' | 'C' = 'C';

/**
 * May this setup be announced to anyone at all, today?
 *
 * Each clause stands alone on purpose. `state` already excludes a short — the
 * ingest forces every short to `expired` — but `not_a_long` is checked anyway,
 * because "a short can never be live" is a property two files apart and this
 * one should not depend on remembering it.
 */
export function publishable(
  s: PublishableSetup,
  opts: { todayEt: string }
): Decision {
  if (s.state !== 'ready') return no('not_ready');
  if (s.intent !== 'buy_to_open') return no('not_a_long');
  if (s.mode !== 'swing') return no('not_swing');
  // No band means the percentile could not rank it. There is no medallion to
  // show, so there is nothing to announce.
  if (!s.grade_band) return no('ungraded');
  if (etDateOf(s) !== opts.todayEt) return no('not_todays_pick');
  return OK;
}

/** The pick's own ET session, stamped by the ingest into `quote_snapshot`. */
export function etDateOf(s: PublishableSetup): string | null {
  const v = (s.quote_snapshot ?? {})['et_date'];
  return typeof v === 'string' && v ? v : null;
}

/**
 * Does this user want to hear about this setup?
 *
 * A user with NO prefs row is not represented here at all — see
 * `recipientsFor`, which treats an absent row as the schema defaults rather
 * than as silence. A row that exists and says `enabled: false` is a decision.
 */
export function matchesPrefs(s: PublishableSetup, p: SetupPrefs): Decision {
  if (p.enabled === false) return no('prefs_disabled');

  const min = p.min_grade ?? DEFAULT_MIN_GRADE;
  if (s.grade_band && GRADE_RANK[s.grade_band] < GRADE_RANK[min]) {
    return no('below_min_grade');
  }

  // A null array is "not narrowed", never "nothing". An EMPTY array is the
  // same: 0008 gives these columns real defaults, and a user who cleared the
  // list has narrowed nothing rather than muted everything — muting is what
  // `enabled` is for.
  if (nonEmpty(p.modes) && !p.modes!.includes(s.mode ?? '')) return no('mode_not_wanted');
  if (nonEmpty(p.intents) && !p.intents!.includes(s.intent ?? '')) return no('intent_not_wanted');

  const symbol = s.symbol.toUpperCase();
  if (nonEmpty(p.symbols_exclude) && upper(p.symbols_exclude!).includes(symbol)) {
    return no('symbol_excluded');
  }
  if (nonEmpty(p.symbols_include) && !upper(p.symbols_include!).includes(symbol)) {
    return no('symbol_not_in_include_list');
  }
  return OK;
}

function nonEmpty(a: string[] | null | undefined): boolean {
  return Array.isArray(a) && a.length > 0;
}
function upper(a: string[]): string[] {
  return a.map((x) => String(x).toUpperCase());
}

/* ------------------------------------------------------------------ */
/* The copy                                                             */
/* ------------------------------------------------------------------ */

/** Push bodies get truncated by the OS; say the useful thing first. */
export const BODY_MAX = 160;

/**
 * The grade is NOT in this copy, and that is deliberate. `bands.ts` states the
 * rule the whole medallion rests on — "Gold never means profit" — and a push
 * that leads with a letter is exactly where that rule gets read as a forecast.
 * The letter is on the card, next to the words that qualify it.
 */
export function notificationFor(s: PublishableSetup): {
  titlePlain: string;
  bodyPlain: string;
  route: string;
  payload: Record<string, unknown>;
} {
  const thesis = (s.thesis_plain ?? s.thesis_technical ?? '').trim();
  const body = thesis
    ? truncate(thesis, BODY_MAX)
    : 'Kai published this one on the morning scan. Nothing has been bought or sold.';
  return {
    titlePlain: `${s.symbol} — today's swing setup`,
    bodyPlain: body,
    route: `/setup/${s.id}`,
    payload: {
      setup_id: s.id,
      symbol: s.symbol,
      grade_display: s.grade_display,
      grade_band: s.grade_band,
      score: s.score,
      source: 'kai_sms_scanner',
    },
  };
}

/** Cut on a word boundary when there is one near the end, else hard. */
export function truncate(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[.,;:\s]+$/, '')}…`;
}

/* ------------------------------------------------------------------ */
/* The run                                                              */
/* ------------------------------------------------------------------ */

export type PublishReport = {
  considered: number;
  published: number;
  notified: number;
  refusals: Record<string, number>;
  perSetup: { id: string; symbol: string; recipients: number; refused?: Refusal }[];
  dry: boolean;
};

/**
 * Announce the setups the ingest just INSERTED.
 *
 * `ids` is the whitelist and it is not optional: the caller passes the rows its
 * write created, this function refuses everything else it is handed, and the
 * two together are why a back catalogue cannot escape.
 */
export async function publishSetups(opts: {
  ids: string[];
  todayEt: string;
  dryRun?: boolean;
  requestId?: string;
}): Promise<PublishReport> {
  const requestId = opts.requestId ?? 'swing-publish';
  const report: PublishReport = {
    considered: 0,
    published: 0,
    notified: 0,
    refusals: {},
    perSetup: [],
    dry: opts.dryRun === true,
  };
  if (opts.ids.length === 0) return report;

  const db = serviceClient();
  const { data: setupRows, error } = await db
    .from('setups')
    .select(
      'id,symbol,mode,intent,state,grade_band,grade_display,score,thesis_plain,thesis_technical,quote_snapshot'
    )
    .in('id', opts.ids);
  if (error) throw new Error(`publish: setups read failed — ${error.message}`);

  const setups = (setupRows ?? []) as unknown as PublishableSetup[];
  report.considered = setups.length;

  const live = setups.filter((s) => {
    const d = publishable(s, { todayEt: opts.todayEt });
    if (!d.ok) {
      bump(report.refusals, d.reason);
      report.perSetup.push({ id: s.id, symbol: s.symbol, recipients: 0, refused: d.reason });
    }
    return d.ok;
  });
  if (live.length === 0) return report;
  report.published = live.length;

  const prefs = await loadPrefs(db);
  const alreadySent = await loadAlreadyNotified(db, live.map((s) => s.id));

  for (const s of live) {
    const recipients: string[] = [];
    for (const p of prefs) {
      const d = matchesPrefs(s, p);
      if (!d.ok) {
        bump(report.refusals, d.reason);
        continue;
      }
      if (alreadySent.has(`${p.user_id}:${s.id}`)) {
        bump(report.refusals, 'already_notified');
        continue;
      }
      recipients.push(p.user_id);
    }
    report.perSetup.push({ id: s.id, symbol: s.symbol, recipients: recipients.length });

    if (opts.dryRun) {
      report.notified += recipients.length;
      continue;
    }
    const n = notificationFor(s);
    for (const userId of recipients) {
      const id = await notify({
        userId,
        kind: 'setup_published',
        titlePlain: n.titlePlain,
        bodyPlain: n.bodyPlain,
        route: n.route,
        payload: n.payload,
        requestId,
      });
      if (id) report.notified += 1;
      else log('warn', requestId, 'swing.publish.notify_failed', { userId, setupId: s.id });
    }
  }
  return report;
}

function bump(into: Record<string, number>, key: string): void {
  into[key] = (into[key] ?? 0) + 1;
}

/**
 * Every profile, with its prefs row when it has one.
 *
 * A profile with NO `setup_alert_prefs` row has never expressed a preference,
 * and the schema defaults (enabled, `DEFAULT_MIN_GRADE`, both modes, both
 * intents) are what the product promises such a user. Reading only the prefs
 * table would silently mean "opted out", which is the opposite.
 */
async function loadPrefs(db: ReturnType<typeof serviceClient>): Promise<SetupPrefs[]> {
  const [{ data: profileRows, error: pErr }, { data: prefRows, error: sErr }] = await Promise.all([
    db.from('profiles').select('user_id'),
    db
      .from('setup_alert_prefs')
      .select('user_id,enabled,min_grade,modes,intents,symbols_include,symbols_exclude'),
  ]);
  if (pErr) throw new Error(`publish: profiles read failed — ${pErr.message}`);
  if (sErr) throw new Error(`publish: setup_alert_prefs read failed — ${sErr.message}`);

  const byUser = new Map<string, SetupPrefs>();
  for (const r of (prefRows ?? []) as unknown as SetupPrefs[]) byUser.set(r.user_id, r);

  return ((profileRows ?? []) as { user_id: string }[]).map(
    (p) =>
      byUser.get(p.user_id) ?? {
        user_id: p.user_id,
        enabled: null,
        min_grade: null,
        modes: null,
        intents: null,
        symbols_include: null,
        symbols_exclude: null,
      }
  );
}

/** `user_id:setup_id` for every `setup_published` already written for these setups. */
async function loadAlreadyNotified(
  db: ReturnType<typeof serviceClient>,
  setupIds: string[]
): Promise<Set<string>> {
  const out = new Set<string>();
  const { data, error } = await db
    .from('notifications')
    .select('user_id,payload')
    .eq('kind', 'setup_published')
    .in('payload->>setup_id', setupIds);
  if (error) throw new Error(`publish: notifications read failed — ${error.message}`);
  for (const r of (data ?? []) as { user_id: string; payload: Record<string, unknown> }[]) {
    const sid = r.payload?.setup_id;
    if (typeof sid === 'string') out.add(`${r.user_id}:${sid}`);
  }
  return out;
}
