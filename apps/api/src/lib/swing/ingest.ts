/**
 * SWING-1 — the Kai SMS scanner's picks, translated into `setups` rows.
 *
 * Everything in this file is PURE. It takes rows exactly as `sent_alerts` and
 * `alert_performance` hold them and returns the rows the app's own database
 * gets. No network, no clock beyond what is passed in, so the whole mapping is
 * testable without either database.
 *
 * THREE RULES, AND THEY ARE MEASURED, NOT PREFERRED
 * (docs/BUILD-BRIEF-swing-1-sms-alerts-as-swing-setups.md)
 *
 * 1. LIVE IS LONG ONLY — `kai_long`, and nothing else, may be graded or
 *    actionable. The morning short family closed 46 of 128 live picks (35.9%)
 *    and the opening-range families claim a horizon this lane does not manage.
 *    Every one of them is still IMPORTED, as a resolved RECORD: expired,
 *    ungraded, carrying what it actually did. Owner ruling 2026-09-03 — the
 *    app holds every alert the product has ever sent, and exactly one family
 *    of them is tradeable today. See `ALERT_TYPE_FAMILY`.
 *
 * 2. THE MEDALLION SCORE IS A PERCENTILE. `setups.score` is the rank of this
 *    pick's `breakout_score` inside a trailing 180-day window of long picks,
 *    x100. The raw scanner score runs 31..190; fed straight into the app's
 *    90/85/80/70/60 bands it makes 52.4% of this family an A. A percentile
 *    self-calibrates: the top decile is the top decile whatever the scanner
 *    drifts to. `grade.ts` and `features/grade/bands.ts` are NOT touched.
 *
 * 3. THE MEDALLION NEVER IMPLIES A WIN RATE. It is a setup-quality mark. How
 *    the family has actually done is a SEPARATE factual line with its n
 *    attached (`familyPerformance` below), and it never enters the score.
 *
 * ONE UNIT OF TRUTH FOR A PICK. `pickKey` is a port of `pick_key` in
 * ~/breakout-alert-system/alert_outcomes.py — (ticker, ET date, alert_type) —
 * and `dedupePicks` is `dedupe_alerts`, lowest id wins so a re-run picks the
 * same canonical row. A second definition of "a pick" is how two systems start
 * disagreeing about how many there were.
 */
import { createHash } from 'node:crypto';

/* ------------------------------------------------------------------ */
/* The source row                                                       */
/* ------------------------------------------------------------------ */

/** One `sent_alerts` row, in the shape PostgREST hands it back. */
export type ScannerAlert = {
  id: number;
  ticker: string;
  alert_type: string | null;
  alert_price: number | string;
  breakout_score: number;
  quality_score: number | null;
  catalyst_score: number | null;
  flow_score: number | null;
  volume_ratio: number | string | null;
  rsi_at_alert: number | string | null;
  setup_label: string | null;
  detected_pattern: string | null;
  humanized_message: string | null;
  sector: string | null;
  sector_stance: string | null;
  catalyst_type: string | null;
  scan_metadata: unknown;
  stop_price: number | string | null;
  pattern_target: number | string | null;
  next_resistance: number | string | null;
  sent_at: string;
  market_session: string | null;
};

/** One `alert_performance` row, pick-level (`is_primary`). */
export type ScannerOutcome = {
  alert_id: number | null;
  direction: string | null;
  alert_type: string | null;
  anchor_date: string | null;
  win_5d: boolean | null;
  gain_5d_pct: number | string | null;
  is_primary: boolean | null;
};

/* ------------------------------------------------------------------ */
/* Which families exist, and what each one is allowed to be             */
/* ------------------------------------------------------------------ */

/**
 * THE SOURCE STREAM IS NOT ONE FAMILY, AND `kai_long%` IS NOT A SWING FILTER.
 *
 * Sixteen `alert_type` values have gone out over SMS since February. Three of
 * them match a `kai_long%` prefix and only ONE is swing-shaped. Read the
 * messages:
 *
 *   kai_long                     "RSI 64 has room to run and volume confirms
 *                                 conviction at 1.3x average… on a 2-5 day
 *                                 window"                       → swing
 *   kai_long_or_break            "OR-HIGH BREAK: 5min close $137.16 > OR-high
 *                                 $135.32 · vol 1.6x · VWAP $136.02"  → INTRADAY
 *   kai_long_pullback_or_break   "BOH AFTER PULLBACK: 5min close $204.21 >
 *                                 OR-high $203.18 · VWAP $202.65"     → INTRADAY
 *
 * TWO SEPARATE QUESTIONS, AND THEY USED TO BE ANSWERED BY ONE ANSWER.
 *
 *   1. May this family be LIVE — a graded, actionable object a user can trade
 *      off today?
 *   2. Does this family EXIST in the app at all — as the record of an alert
 *      that really went out?
 *
 * SWING-1 answered both with `kai_long`, so 589 of the 838 picks this product
 * has ever sent were simply absent. Owner ruling (2026-09-03): "import past
 * alerts via sms into the app". So question 2 is now answered YES for every
 * family, and question 1 is still `kai_long` alone.
 *
 * A family that is `live: false` enters the app as a RECORD and nothing else:
 * `state: 'expired'`, no score, no band, no medallion, and — enforced by
 * `assertRecordOnly` on every row before it is written — no path by which it
 * can reach a live feed. It is written only once it has RESOLVED, so a card
 * that says nothing about what happened never appears.
 *
 * WHY THE OPENING-RANGE FAMILIES ARE STILL NOT LIVE. An OR break on a
 * five-minute close is docs/17 §3a's family, not §3b's. Writing one into
 * `setups` as `mode='swing'` with a five-SESSION `valid_until` mislabels it,
 * and a `day_trade` lifecycle — dies at the close, structural invalidation —
 * is not built. They carry `mode: 'day_trade'` and a same-session
 * `valid_until` so the record is at least labelled with the horizon it
 * claimed, and they stay out of Active until that lane exists.
 *
 * The map is keyed on `alert_type` EXACTLY. An unrecognised type is `other`
 * and is never read at all — adding a family has to be a decision someone
 * made, not a prefix that quietly matched.
 */
export type SourceFamily =
  | 'swing_long'      // kai_long — the ONLY live, graded family
  | 'swing_short'     // the morning short — record only, measured at 35.9%
  | 'intraday_long'   // opening-range / five-minute breaks — record only
  | 'intraday_short'  // opening-range breakdowns — record only
  | 'legacy_long'     // the pre-April scanner's long families — record only
  | 'legacy_short'    // the pre-April scanner's short families — record only
  | 'other';          // unknown. Never read, never written.

export type FamilySpec = {
  /** The horizon the alert actually claimed. Drives `setups.mode`. */
  mode: 'swing' | 'day_trade';
  direction: 'long' | 'short';
  /** May a pick in this family be graded and actionable? `kai_long` only. */
  live: boolean;
  /** How the family names itself on a performance line. */
  label: string;
};

export const FAMILY_SPEC: Record<SourceFamily, FamilySpec> = {
  swing_long: { mode: 'swing', direction: 'long', live: true, label: 'Swing · long · Kai scanner' },
  swing_short: { mode: 'swing', direction: 'short', live: false, label: 'Swing · short · Kai scanner' },
  intraday_long: { mode: 'day_trade', direction: 'long', live: false, label: 'Intraday · long · Kai scanner' },
  intraday_short: { mode: 'day_trade', direction: 'short', live: false, label: 'Intraday · short · Kai scanner' },
  legacy_long: { mode: 'swing', direction: 'long', live: false, label: 'Swing · long · early scanner' },
  legacy_short: { mode: 'swing', direction: 'short', live: false, label: 'Swing · short · early scanner' },
  other: { mode: 'swing', direction: 'long', live: false, label: 'Unclaimed' },
};

export const ALERT_TYPE_FAMILY: Record<string, SourceFamily> = {
  // ---- LIVE ---------------------------------------------------------------
  // Swing-shaped longs from `kai_morning_alerts.py`. The only family that may
  // hold a grade or a live state.
  kai_long: 'swing_long',

  // ---- RECORD: the other half of the morning send -------------------------
  // 46 of 128 closed green — 35.9% over a measured 128 picks, not a thin
  // sample. Never live, never graded; in the app so the record is whole.
  kai_short: 'swing_short',

  // ---- RECORD: opening-range / five-minute families -----------------------
  // Correct shape, wrong lane. `kai_intraday_alerts.py` and the ORB engine.
  kai_long_or_break: 'intraday_long',
  kai_long_pullback_or_break: 'intraday_long',
  kai_orb_bullish: 'intraday_long',
  intraday: 'intraday_long',
  orb: 'intraday_long',
  kai_orb_bearish: 'intraday_short',

  // ---- RECORD: the pre-April scanner --------------------------------------
  // These stopped firing when the morning family took over on 2026-04-02.
  // docs/17 §1 measured BREAKOUT at 34.5% on its own backtest; the live record
  // says 51.9%, which is exactly why the record belongs in the app and the
  // backtest does not.
  breakout: 'legacy_long',
  pattern: 'legacy_long',
  watchlist_swing: 'legacy_long',
  long_idea: 'legacy_long',
  premarket: 'legacy_long',
  breakdown: 'legacy_short',
  short_idea: 'legacy_short',
};

/**
 * SWING-5 — A PICK NOBODY RECEIVED IS NOT HISTORY.
 *
 * `kai_short_shadow` is written by `record_shadow_shorts()` in
 * `kai_morning_alerts.py`: the shorts the picker WOULD have broadcast, recorded
 * so the tracker can measure them and DELIBERATELY never sent to anybody. Every
 * one of the 15 rows carries an empty `humanized_message`, a null `stop_price`
 * and a null `pattern_target`, because no SMS was ever composed for them. Ten of
 * them reached production as History cards with no stop, no target and a blank
 * description, and they are unfillable by construction — there is nothing to
 * recover, since nothing was published.
 *
 * So the family is named here rather than merely dropped from the map above,
 * because "we do not ingest this" and "we have never heard of this" are
 * different statements and only one of them is true. `retireForeignFamilies`
 * removes the ten rows an earlier run wrote. If the owner decides a shadow
 * model belongs in the app it needs its own surface that says what it is, not a
 * History card that reads like something a subscriber was told.
 */
export const EXCLUDED_TYPES = ['kai_short_shadow'] as const;

export function familyOf(alertType: string | null | undefined): SourceFamily {
  return ALERT_TYPE_FAMILY[(alertType ?? '').trim().toLowerCase()] ?? 'other';
}

export function specOf(alertType: string | null | undefined): FamilySpec {
  return FAMILY_SPEC[familyOf(alertType)];
}

/** The `alert_type` values in one family. */
export const typesFor = (family: SourceFamily): string[] =>
  Object.entries(ALERT_TYPE_FAMILY).filter(([, f]) => f === family).map(([t]) => t);

/** Graded, and allowed to be live. */
export const SWING_LONG_TYPES = typesFor('swing_long');
/** The morning short. Ingested for the record only. */
export const SWING_SHORT_TYPES = typesFor('swing_short');
/** Every type that enters the app at all — live and record together. */
export const INGESTED_TYPES = Object.keys(ALERT_TYPE_FAMILY);

/** In the feed as a live, graded object. `kai_long` only. */
export function isIngestibleType(alertType: string | null | undefined): boolean {
  return specOf(alertType).live && familyOf(alertType) !== 'other';
}

/**
 * In the database as a resolved record, and nowhere else. Every family the
 * product has sent except `kai_long`.
 */
export function isHistoryOnlyType(alertType: string | null | undefined): boolean {
  const family = familyOf(alertType);
  return family !== 'other' && !FAMILY_SPEC[family].live;
}

export function isReadableType(alertType: string | null | undefined): boolean {
  return familyOf(alertType) !== 'other';
}

export function directionOf(alertType: string | null | undefined): 'long' | 'short' {
  return specOf(alertType).direction;
}

/** `setups.mode` for a pick — the horizon the alert itself claimed. */
export function modeOf(alertType: string | null | undefined): 'swing' | 'day_trade' {
  return specOf(alertType).mode;
}

/* ------------------------------------------------------------------ */
/* Identity — the port of alert_outcomes.py                             */
/* ------------------------------------------------------------------ */

const ET = 'America/New_York';

/** ET wall-clock parts of a timestamptz string. */
export function etParts(sentAt: string): { date: string; hour: number; minute: number } {
  const d = new Date(String(sentAt).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) throw new Error(`unparseable sent_at: ${sentAt}`);
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: ET,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(d)) if (part.type !== 'literal') p[part.type] = part.value;
  // en-CA renders midnight as "24" in some ICU builds; normalise it.
  const hour = Number(p.hour) % 24;
  return { date: `${p.year}-${p.month}-${p.day}`, hour, minute: Number(p.minute) };
}

/** ET calendar date (ISO) an alert was sent on — the dedup date. */
export function etDateFor(sentAt: string): string {
  return etParts(sentAt).date;
}

/** The dedup key: (ticker, ET-date, alert_type). One pick = one key. */
export function pickKey(a: Pick<ScannerAlert, 'ticker' | 'sent_at' | 'alert_type'>): string {
  return [
    (a.ticker ?? '').toUpperCase(),
    etDateFor(a.sent_at),
    (a.alert_type ?? '').toLowerCase(),
  ].join('|');
}

/**
 * Collapse recipient-duplicated rows to one canonical alert per pick. The
 * canonical row is the LOWEST id in the group, which makes the choice
 * deterministic — a re-run picks the same primary instead of flapping.
 */
export function dedupePicks(alerts: ScannerAlert[]): Map<string, ScannerAlert> {
  const picks = new Map<string, ScannerAlert>();
  for (const a of alerts) {
    if (!a.ticker || !a.sent_at) continue;
    const key = pickKey(a);
    const cur = picks.get(key);
    if (!cur || (a.id ?? 0) < (cur.id ?? 0)) picks.set(key, a);
  }
  return picks;
}

/* ------------------------------------------------------------------ */
/* Deterministic ids — idempotency is a property of the key, not a flag */
/* ------------------------------------------------------------------ */

/** Fixed namespace for SWING-1. Never change it: the setup ids depend on it. */
export const SWING_NAMESPACE = '6f2a9c14-0d3b-4f8e-9a71-5c0e2b8d47a3';

/** RFC 4122 v5 (SHA-1) UUID. The same name always yields the same id. */
export function uuidv5(name: string, namespace: string = SWING_NAMESPACE): string {
  const ns = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  const hash = createHash('sha1').update(ns).update(Buffer.from(name, 'utf8')).digest();
  const b = Buffer.from(hash.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x50; // version 5
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** The setup id for a pick. Same pick, same row — re-running writes, never duplicates. */
export function setupIdFor(key: string): string {
  return uuidv5(`setup:${key}`);
}

/** One scanner run per ET date, so a day's picks share a run id. */
export function scannerRunIdFor(etDate: string): string {
  return uuidv5(`kai_sms_scan:${etDate}`);
}

/* ------------------------------------------------------------------ */
/* Sessions                                                             */
/* ------------------------------------------------------------------ */

/**
 * Day 0 for a pick — the session it is actionable in (alert_outcomes.py
 * `anchor_index`): at or after 16:00 ET, or on a weekend, it is the next
 * session. Market holidays are NOT known here, so a holiday anchor can be one
 * session early; the horizon it feeds is a 3-15 session hold, which absorbs it.
 */
export function anchorDateFor(sentAt: string): string {
  const { date, hour, minute } = etParts(sentAt);
  const afterClose = hour > 16 || (hour === 16 && minute >= 0);
  return afterClose ? nextSession(date) : rollToSession(date);
}

const DAY_MS = 86_400_000;

function isoToUTC(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function isWeekend(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

/** That date if it is a weekday, otherwise the next weekday. */
export function rollToSession(iso: string): string {
  let d = isoToUTC(iso);
  while (isWeekend(d)) d = new Date(d.getTime() + DAY_MS);
  return d.toISOString().slice(0, 10);
}

/** The next weekday strictly after `iso`. */
export function nextSession(iso: string): string {
  let d = new Date(isoToUTC(iso).getTime() + DAY_MS);
  while (isWeekend(d)) d = new Date(d.getTime() + DAY_MS);
  return d.toISOString().slice(0, 10);
}

/** `n` sessions after `iso`, weekends skipped. */
export function plusSessions(iso: string, n: number): string {
  let out = rollToSession(iso);
  for (let i = 0; i < n; i += 1) out = nextSession(out);
  return out;
}

/**
 * A swing hold is 3-15 sessions (docs/17 §3b). A pick nobody acts on expires at
 * +5 sessions from its anchor — the horizon everything in the brief is measured
 * at — so the Alerts tab does not fill with stale objects.
 */
export const EXPIRY_SESSIONS = 5;

export function validUntilFor(anchorDate: string, mode: 'swing' | 'day_trade' = 'swing'): string {
  // A day-trade alert dies at ITS OWN session's close. Giving an opening-range
  // break a five-session window would put the wrong horizon on the record — the
  // reason those families are not live in the first place.
  const sessions = mode === 'day_trade' ? 0 : EXPIRY_SESSIONS;
  // 20:00 UTC on the last session = 4pm ET (3pm on the winter side of DST).
  return `${plusSessions(anchorDate, sessions)}T20:00:00.000Z`;
}

/* ------------------------------------------------------------------ */
/* The percentile — §2 of the brief                                     */
/* ------------------------------------------------------------------ */

/** Trailing window the percentile is computed over. Calendar days, not sessions. */
export const PERCENTILE_WINDOW_DAYS = 180;

export type ScoredDate = { date: string; score: number };

/**
 * The percentile rank of `score` inside the trailing window ending at `date`,
 * as 0..100. Defined as the share of the window strictly BELOW this score, so
 * >=90 means "nine in ten of the last six months scored lower" — the top decile
 * — and ties all take the floor of their group rather than being split.
 *
 * `population` must be the LONG family only and must include the pick itself.
 * It is recomputed on every ingest; nothing here is a constant. Today's window
 * happens to sit at p50=91 / p90=137, which is a check on this function, not a
 * number to hardcode.
 */
export function percentileRank(score: number, date: string, population: ScoredDate[], windowDays = PERCENTILE_WINDOW_DAYS): number | null {
  const end = isoToUTC(date).getTime();
  const start = end - windowDays * DAY_MS;
  let n = 0;
  let below = 0;
  for (const p of population) {
    const t = isoToUTC(p.date).getTime();
    if (t > end || t <= start) continue;
    n += 1;
    if (p.score < score) below += 1;
  }
  if (n === 0) return null;
  return Math.round((1000 * below) / n) / 10;
}

/* ------------------------------------------------------------------ */
/* The percentile, rescaled into the band ladder                        */
/* ------------------------------------------------------------------ */

/**
 * THE PERCENTILE IS A RANK. `setups.score` HAS TO BE A POSITION ON A LADDER.
 *
 * Owner ruling: a raw 0-100 percentile put 56.3% of the corpus below 60, which
 * `bands.ts` draws as `unqualified` — grey, "Not qualified". Every one of these
 * picks had already cleared the scanner's own bar to be TEXTED TO PAYING
 * SUBSCRIBERS, so rendering most of them as unqualified is a claim the data does
 * not support; it reads as a system that does not believe its own alerts.
 *
 * So the rank is rescaled onto the graded part of the ladder, 60..100:
 *
 *     score = 60 + 0.4 x percentile        p0 -> 60   p50 -> 80   p90 -> 96
 *
 * One straight line, so RANK ORDER IS PRESERVED EXACTLY — this changes what the
 * bottom of the distribution is called, never which pick is above which. The
 * bands in `grade.ts` and `bands.ts` are untouched; the rescale happens on the
 * way in, which is the entire point of putting a percentile there.
 *
 * GREY STILL EXISTS AND STILL MEANS SOMETHING. Below 60 is now unreachable for
 * anything this engine grades, which is what makes it informative again: an
 * object with NO grade at all — a short, which is ingested for the record and
 * never scored — comes back with a null score and renders grey. Grey now says
 * "Kai has no view of its own on this one" instead of being the majority state
 * of alerts the product actually sent.
 */
export function scoreFromPercentile(pct: number | null): number | null {
  if (pct === null || !Number.isFinite(pct)) return null;
  return Math.round((60 + 0.4 * pct) * 10) / 10;
}

/**
 * `grade_band` is the FILTER value (0001: "band for logic/filters" — it is what
 * `setup_alert_prefs.min_grade` compares against), and it stays anchored to the
 * percentile: A at or above the 90th, B at or above the median, C below. That
 * split is unchanged by the rescale.
 *
 * `grade_display` is the LETTER ON THE MEDALLION, and it is derived from the
 * SCORE, using the same ladder `bands.ts` colours by. That is not a second
 * opinion — it is the only way the letter and the ring can agree. Derive the
 * letter from the percentile instead and you ship a card reading "Grade B" in a
 * gold ring whose own screen-reader text says "top quality", because
 * `gradeFamily` reads the score and the letter came from somewhere else.
 *
 * The minus is U+2212, per `displayGrade`.
 */
export function gradeBandFromPercentile(pct: number | null): 'A' | 'B' | 'C' | null {
  if (pct === null || !Number.isFinite(pct)) return null;
  if (pct >= 90) return 'A';
  if (pct >= 50) return 'B';
  return 'C';
}

export function gradeDisplayFromScore(score: number | null): string | null {
  if (score === null || !Number.isFinite(score)) return null;
  if (score >= 90) return 'A';
  if (score >= 85) return 'A\u2212';
  if (score >= 80) return 'B+';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  return 'C\u2212';
}

/* ------------------------------------------------------------------ */
/* The scorecard — §3 of the brief                                      */
/* ------------------------------------------------------------------ */

/**
 * The scanner's real components, mapped onto the SWING vocabulary in
 * `round4/grade.ts`. NO COMPONENT IS INVENTED, and a component the scanner had
 * no read on is left OUT of the map entirely so `grade.ts` reports it as
 * `Unknown` with strength 0 — a missing measurement is not a zero and not a pass.
 *
 * What the scanner actually publishes, and its real range:
 *   quality_score   0..20   its own read on the setup's technical quality
 *   catalyst_score  0..12   only meaningful next to a `catalyst_type`
 *   flow_score      0..20
 *   rsi_at_alert    0..100  (0 means "not computed", not "RSI zero")
 *   volume_ratio    0..25.6 x average
 *   sector_stance   bullish | neutral | bearish
 *
 * MAPPING, AND WHY EACH ONE
 *   trend         <- quality_score. The scanner's own composite read on whether
 *                    the bigger picture backs the trade.
 *   entry_quality <- RSI, INVERTED. docs/17 §1 measured longs by RSI at the
 *                    alert: <50 +2.09%, 50-59 +3.16%, 60-69 -1.15%, 70+ -4.64%,
 *                    monotone. High RSI is precisely "entering here means paying
 *                    up", which is this component's own low-end wording. The
 *                    inversion is the measurement, not an opinion about it.
 *   catalyst      <- catalyst_score, and only when a catalyst_type is named.
 *   market        <- sector_stance, falling back to flow_score.
 *   risk_reward   <- DELIBERATELY ABSENT. `grade.ts` derives it from the plan's
 *                    own entry/stop/target. See the note on levels below.
 *
 * `volume_ratio` and `detected_pattern` have no slot in the SWING five; they go
 * into `thesis_technical`, where they are read as prose rather than scored.
 */
export function scoreComponentsFor(a: ScannerAlert): Record<string, number> {
  const out: Record<string, number> = {};

  const quality = num(a.quality_score);
  if (quality !== null && quality > 0) out.trend = clamp(Math.round((quality / 20) * 100));

  const rsi = num(a.rsi_at_alert);
  if (rsi !== null && rsi > 0) out.entry_quality = entryQualityFromRsi(rsi);

  const catalystType = (a.catalyst_type ?? '').trim().toLowerCase();
  const catalyst = num(a.catalyst_score);
  if (catalystType && catalystType !== 'none' && catalyst !== null) {
    out.catalyst = clamp(Math.round((catalyst / 12) * 100));
  }

  const stance = (a.sector_stance ?? '').trim().toLowerCase();
  if (stance === 'bullish') out.market = 85;
  else if (stance === 'neutral') out.market = 55;
  else if (stance === 'bearish') out.market = 20;
  else {
    const flow = num(a.flow_score);
    if (flow !== null && flow > 0) out.market = clamp(Math.round((flow / 20) * 100));
  }

  return out;
}

/** docs/17 §1, longs only: the return by RSI band is monotone and inverted. */
export function entryQualityFromRsi(rsi: number): number {
  if (rsi < 50) return 88;
  if (rsi < 60) return 92;
  if (rsi < 70) return 55;
  if (rsi < 80) return 28;
  return 12;
}

/* ------------------------------------------------------------------ */
/* The honest performance line — §4 of the brief                        */
/* ------------------------------------------------------------------ */

export type FamilyPerformance = {
  family: string;
  n: number;
  wins: number;
  win_pct: number;
  horizon: string;
  as_of: string;
  plain: string;
};

/**
 * How this family has ACTUALLY done: long only, pick-level (`is_primary`),
 * win rate at +5 sessions, with the n attached. A record, never a forecast, and
 * never folded into the medallion or its colour.
 *
 * THE SAME FAMILY IT IS SHOWN ON. The line is computed over the picks of ONE
 * `SourceFamily`, so the number on a card is that card's own family's number —
 * a `breakout` record does not borrow the morning long family's 53.6%. Cross-
 * family averaging is how a 30.5% family ends up wearing a 50% headline.
 *
 * THE HORIZON IS NAMED WHEN IT IS NOT THE FAMILY'S OWN. The grader measures
 * every family at +5 sessions. For `swing_long` that IS the claimed horizon.
 * For an opening-range family it is NOT — the alert claimed one session — so
 * the copy says so out loud instead of quietly reporting the wrong horizon.
 *
 * WHAT THE NUMBER IS, EXACTLY. `alert_price` to the close five sessions on. It
 * is NOT the trade a subscriber managed: the scanner publishes a stop on 3 of
 * 1,307 long picks, so there was no stop to be taken out at and no target to be
 * paid at. It is a close-to-close hold, and the copy says so.
 *
 * Win rate only, never a mean. Five picks in the corpus carry impossible
 * returns (ELPW +2707%, ELAB +778%) from an `alert_price` captured against
 * unadjusted bars: a sign-only statistic survives that, a mean does not.
 */
export function familyPerformanceOfFamily(
  outcomes: ScannerOutcome[],
  family: SourceFamily,
): FamilyPerformance | null {
  if (family === 'other') return null;
  const spec = FAMILY_SPEC[family];
  const graded = outcomes.filter(
    (o) => o.is_primary === true
      && o.win_5d !== null
      && (o.direction ?? '').toLowerCase() === spec.direction
      && familyOf(o.alert_type) === family,
  );
  if (!graded.length) return null;
  const n = graded.length;
  const wins = graded.filter((o) => o.win_5d === true).length;
  const pct = Math.round((1000 * wins) / n) / 10;
  // `as_of` is the last pick that has actually RESOLVED, not the wall clock, so
  // the stamped line is stable across re-runs and says what it really covers.
  const asOf = graded.reduce((max, o) => (o.anchor_date && o.anchor_date > max ? o.anchor_date : max), '');
  const short = spec.direction === 'short';
  const shape = spec.mode === 'day_trade' ? 'intraday' : 'swing';
  // An intraday alert was never a five-session idea. Say which horizon the
  // number is, rather than letting it read as the family's own.
  const horizonNote = spec.mode === 'day_trade'
    ? ' These were intraday alerts; +5 sessions is the only horizon the grader has ever measured them at, and it is not the one they claimed.'
    : '';
  return {
    family: spec.label,
    n,
    wins,
    win_pct: pct,
    horizon: '5 sessions',
    as_of: asOf,
    plain:
      `Of the last ${n} ${spec.direction} ${shape} picks this scanner published, ${wins} ${short ? 'were lower' : 'were higher'} five sessions later — ${pct}%. `
      + 'Measured close to close, holding the whole way: the scanner published no stop and no target, so this is not the '
      + 'result of a trade anyone managed. It is what has happened, not what will, and the grade says nothing about it.'
      + horizonNote,
  };
}

/**
 * The live long family's line, by name. Kept because it is the one line that
 * appears on a tradeable card, and because callers read better for it.
 */
export function familyPerformance(outcomes: ScannerOutcome[], direction: 'long' | 'short' = 'long'): FamilyPerformance | null {
  return familyPerformanceOfFamily(outcomes, direction === 'short' ? 'swing_short' : 'swing_long');
}

/** Every family's own line, keyed by family. Computed in one pass. */
export function familyPerformanceIndex(outcomes: ScannerOutcome[]): Map<SourceFamily, FamilyPerformance> {
  const out = new Map<SourceFamily, FamilyPerformance>();
  for (const family of Object.keys(FAMILY_SPEC) as SourceFamily[]) {
    const line = familyPerformanceOfFamily(outcomes, family);
    if (line) out.set(family, line);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* The per-pick outcome — what this one actually did                    */
/* ------------------------------------------------------------------ */

export type PickOutcome = {
  /** true / false at +5 sessions; null when it has not resolved yet. */
  win_5d: boolean | null;
  /** Close-to-close percent from the published trigger. */
  gain_5d_pct: number | null;
  /** Best and worst it got to inside the window, where the grader recorded them. */
  mfe_5d_pct: number | null;
  mae_5d_pct: number | null;
  anchor_date: string | null;
  sessions_elapsed: number | null;
  resolved: boolean;
  method: string | null;
  /** One sentence, and it never claims a managed trade. */
  plain: string;
};

/**
 * The graded result for ONE pick, from `alert_performance`'s pick-level row.
 *
 * WHAT THIS NUMBER IS NOT. It is `alert_price` to the close five sessions on,
 * held the whole way. The scanner persisted a stop on 3 of 1,307 long picks and
 * a target on 3, so there was no level to be stopped out at and none to be paid
 * at: this is a close-to-close hold, not the trade a subscriber managed. The
 * copy says so, on every row, because the difference is the whole disclosure.
 *
 * An unresolved pick returns null — a pick still inside its window has no
 * outcome, and a missing measurement is not a zero (`grade.ts`).
 */
export function outcomeFor(row: ScannerOutcome & { mfe_5d_pct?: number | string | null; mae_5d_pct?: number | string | null; sessions_elapsed?: number | null; resolved?: boolean | null; outcome_method?: string | null } | undefined): PickOutcome | null {
  if (!row || row.win_5d === null || row.win_5d === undefined) return null;
  const gain = num(row.gain_5d_pct);
  const won = row.win_5d === true;
  const move = gain === null ? null : `${gain > 0 ? '+' : ''}${gain.toFixed(1)}%`;
  // `gain_5d_pct` is the POSITION's return: `alert_outcomes.py` multiplies the
  // raw move by `sign_for(direction)`, so a short that worked is positive here
  // while the stock fell. Verified against the source: for `kai_short`, every
  // win_5d=true row is positive (min +0.02) and every false one negative
  // (max -1.20). The number needs no correction; the SENTENCE does, because
  // "+6.8% from the price it was called at" is long-side framing and would be
  // read backwards on a short.
  const short = (row.direction ?? '').toLowerCase() === 'short';
  if (short) {
    const priceMove = gain === null ? null : `${Math.abs(gain).toFixed(1)}%`;
    return {
      win_5d: won,
      gain_5d_pct: gain,
      mfe_5d_pct: num(row.mfe_5d_pct),
      mae_5d_pct: num(row.mae_5d_pct),
      anchor_date: row.anchor_date ?? null,
      sessions_elapsed: row.sessions_elapsed ?? null,
      resolved: row.resolved === true,
      method: row.outcome_method ?? null,
      plain: priceMove === null
        ? `A short call. Five sessions on, the stock was ${won ? 'lower' : 'higher'} than where it was called \u2014 the short was ${won ? 'right' : 'wrong'}.`
        : `A short call. Five sessions on, the stock closed ${priceMove} ${won ? 'below' : 'above'} the price it was called at, so the short was ${won ? 'right' : 'wrong'} by ${priceMove}. Measured close to close, holding the whole way. No stop or target was published, so this is not the result of a managed trade.`,
    };
  }
  return {
    win_5d: won,
    gain_5d_pct: gain,
    mfe_5d_pct: num(row.mfe_5d_pct),
    mae_5d_pct: num(row.mae_5d_pct),
    anchor_date: row.anchor_date ?? null,
    sessions_elapsed: row.sessions_elapsed ?? null,
    resolved: row.resolved === true,
    method: row.outcome_method ?? null,
    plain: move === null
      ? `Five sessions on, this one closed ${won ? 'higher' : 'lower'} than the price it was called at.`
      : `Five sessions on, it closed ${move} from the price it was called at — measured close to close, holding the whole way. No stop or target was published, so this is not the result of a managed trade.`,
  };
}

/* ------------------------------------------------------------------ */
/* The setup row                                                        */
/* ------------------------------------------------------------------ */

export type SetupInsert = {
  id: string;
  symbol: string;
  /** The horizon the alert claimed. `day_trade` rows are records, never live. */
  mode: 'swing' | 'day_trade';
  intent: 'buy_to_open' | 'sell_short';
  state: 'ready' | 'expired';
  score: number | null;
  grade_band: 'A' | 'B' | 'C' | null;
  grade_display: string | null;
  score_components: Record<string, unknown>;
  thesis_plain: string | null;
  thesis_technical: string | null;
  entry_condition: Record<string, unknown>;
  invalidation: Record<string, unknown> | null;
  stop: number | null;
  targets: { price: number; label: string }[];
  catalyst: Record<string, unknown> | null;
  annotations: Record<string, unknown>;
  quote_snapshot: Record<string, unknown>;
  valid_until: string;
  scanner_run_id: string;
  created_at: string;
};

/**
 * One pick → one `setups` row.
 *
 * A NOTE ON LEVELS, BECAUSE THE BRIEF EXPECTS MORE THAN THE SOURCE HAS.
 * The field map says `stop_price` → `stop` and `pattern_target`/`next_resistance`
 * → `targets`. Across the whole `kai_long%` family those columns are populated
 * on 3, 3 and 2 rows out of 1,307. The trigger — `alert_price` — is the only
 * level this family actually publishes, and it is what the system is held to.
 * So the stop and the targets come through EMPTY here rather than derived: this
 * repo's own precedent (`scripts/refresh-seed-setups.mjs`) is that a level with
 * no detector behind it is invented analysis. Downstream that is visible and
 * honest — no stop means `grade.ts` reports Risk/Reward as `Unknown`, which is
 * exactly right, and it is reported as a finding rather than papered over.
 *
 * Re-confirmed against the live source after the alert-system lane said it had
 * persisted levels at send time: `kai_long` still carries `stop_price` on 3 of
 * 1,247 rows, `pattern_target` on 3, `next_resistance` on 2, and the twenty most
 * recent rows (through 2026-09-01) carry none of the three. Nothing changed
 * here, and nothing needs to when it does — the mapping already reads all three
 * columns, so those rows flow the moment they exist.
 *
 * DIRECTION. A long is graded and may be live. A short is ingested for the
 * record ONLY: no score, no band, no letter, state forced to `expired`. That is
 * enforced here rather than in a view, so no feed, filter or join can produce a
 * live short — the row simply cannot hold a live state.
 */
export function setupFor(opts: {
  alert: ScannerAlert;
  key: string;
  /** The rank inside the trailing window, 0..100. Null for anything ungraded. */
  percentile: number | null;
  now: Date;
}): SetupInsert {
  const { alert: a, key } = opts;
  // RECORD, not short. Every family except `kai_long` enters the app as the
  // resolved record of an alert that went out: ungraded, always expired. The
  // old name for this flag was `short`, which was true only while `kai_short`
  // was the sole non-live family.
  const spec = specOf(a.alert_type);
  const record = !spec.live;
  const short = spec.direction === 'short';
  const etDate = etDateFor(a.sent_at);
  const anchor = anchorDateFor(a.sent_at);
  const validUntil = validUntilFor(anchor, spec.mode);
  // Only a live family is graded (owner ruling: `kai_long` alone gets a
  // medallion), so a record carries a null score and renders as ungraded.
  const score = record ? null : scoreFromPercentile(opts.percentile);
  const band = record ? null : gradeBandFromPercentile(opts.percentile);
  const display = record ? null : gradeDisplayFromScore(score);
  const entry = num(a.alert_price);
  const stop = num(a.stop_price);
  const targets: { price: number; label: string }[] = [];
  const patternTarget = num(a.pattern_target);
  const resistance = num(a.next_resistance);
  if (patternTarget !== null) targets.push({ price: patternTarget, label: 'Pattern target' });
  if (resistance !== null) targets.push({ price: resistance, label: 'Next resistance' });

  const catalystType = (a.catalyst_type ?? '').trim();
  const pattern = (a.setup_label ?? a.detected_pattern ?? '').trim() || null;

  // What the card reads. The SMS a subscriber actually received wins outright;
  // only when there was none does the app compose one from the row's own
  // measurements, and it says which it is.
  const published = a.humanized_message?.trim() || null;
  const composed = published ? null : thesisComposed(a);

  return {
    id: setupIdFor(key),
    symbol: a.ticker.toUpperCase(),
    // The horizon the alert CLAIMED, not the one this lane happens to grade at.
    // An opening-range break is `day_trade` and dies at its own close.
    mode: spec.mode,
    intent: short ? 'sell_short' : 'buy_to_open',
    // A record's state is not computed, it is FIXED. `expired` is the only
    // state it may hold, and the ingest refuses to write one whose window has
    // not closed, so "History only" is a property of the row, not of a query.
    state: record || new Date(validUntil).getTime() <= opts.now.getTime() ? 'expired' : 'ready',
    score,
    grade_band: band,
    grade_display: display,
    score_components: {
      // The component mapping is calibrated on the live long family —
      // `entry_quality` is RSI inverted because docs/17 §1 measured extension
      // hurting LONGS. Applying it anywhere else would be a number with no
      // measurement behind it, so a record carries provenance and its outcome,
      // and no components at all.
      ...(record ? {} : scoreComponentsFor(a)),
      direction: spec.direction,
      source: 'kai_sms_scanner',
      family: familyOf(a.alert_type),
      horizon: spec.mode,
      live_family: spec.live,
      pick_key: key,
      raw_breakout_score: a.breakout_score,
      percentile_window_days: PERCENTILE_WINDOW_DAYS,
      // Which of the two the card is reading. Null when the source held no
      // message AND no measurement to compose one from.
      thesis_source: published ? 'published_sms' : (composed ? 'composed_from_measurements' : null),
    },
    thesis_plain: published ?? composed,
    thesis_technical: thesisTechnical(a),
    entry_condition: {
      price: entry,
      kind: 'published_trigger',
      plain: entry === null
        ? 'The scanner published this pick without a trigger price.'
        : `The scanner published this at $${entry} — the price it is held to.`,
    },
    invalidation: stop === null
      ? null
      : { price: stop, plain: `A daily close ${short ? 'above' : 'below'} $${stop} ends the idea.` },
    stop,
    targets,
    catalyst: catalystType
      ? { type: catalystType, score: num(a.catalyst_score), plain: catalystPlain(catalystType) }
      : null,
    annotations: pattern ? { pattern } : {},
    quote_snapshot: {
      symbol: a.ticker.toUpperCase(),
      price: entry,
      source_ts: a.sent_at,
      received_ts: a.sent_at,
      freshness: 'stale',
      delay_reason: 'feed_gap',
      // Provenance: this snapshot is the moment the SMS went out, not a live quote.
      origin: 'kai_sms_scanner',
      alert_type: (a.alert_type ?? '').toLowerCase(),
      source_alert_id: a.id,
      et_date: etDate,
      anchor_date: anchor,
      market_session: a.market_session ?? null,
      sector: a.sector ?? null,
      sector_stance: a.sector_stance ?? null,
      scan_metadata: a.scan_metadata ?? null,
    },
    valid_until: validUntil,
    scanner_run_id: scannerRunIdFor(etDate),
    created_at: new Date(a.sent_at).toISOString(),
  };
}

/** Volume and pattern have no slot in the SWING five, so they are read as prose. */
/**
 * SWING-5 — the card's description, composed from measurements when no model
 * wrote one.
 *
 * `thesis_plain` is what the card READS, and it comes from
 * `sent_alerts.humanized_message` — the Opus prose the SMS product wrote. 309
 * of 826 setups in production have none, because 309 alerts went out with an
 * empty narrative: the early scanners never wrote one, and since 2026-08-31 the
 * Anthropic balance has answered `400 credit balance is too low`, which
 * `generate_narrative` correctly degrades to an empty string rather than
 * failing the send. A blank card is the visible end of that.
 *
 * COMPOSED, NOT WRITTEN, AND NOT A MODEL. Every clause below names a column on
 * the alert row. Nothing is inferred, nothing is characterised, and there is no
 * adjective that the numbers do not license — `1.9x its average` is a
 * measurement, `heavy volume` would be an opinion.
 *
 * IT IS NEVER PRESENTED AS WHAT WAS SENT. `score_components.thesis_source` says
 * `published_sms` or `composed_from_measurements`, so a reader can always tell
 * a recovered description from a reconstructed one — the same discipline
 * `scan_metadata.levels` applies to a reconstructed stop.
 *
 * AND IT REFUSES. A row whose only measurement is its own price gets NULL, not
 * a sentence: `entry_condition` already says what the price was, and restating
 * it as a thesis would be a card that looks filled and says nothing. The count
 * of nulls after this is a real count of picks the source knows nothing about.
 *
 * ONE IMPLEMENTATION, ON PURPOSE. This composes for the back catalogue AND for
 * every pick that arrives from now on, so the app never depends on the producer
 * having had a model available. The Python side does not compose a second
 * version of the same sentence in a second language.
 */
export function thesisComposed(a: ScannerAlert): string | null {
  const spec = specOf(a.alert_type);
  const entry = num(a.alert_price);
  const vol = num(a.volume_ratio);
  const rsi = num(a.rsi_at_alert);
  const stop = num(a.stop_price);
  const target = num(a.pattern_target) ?? num(a.next_resistance);
  const setup = (a.setup_label ?? a.detected_pattern ?? '').trim().replace(/_/g, ' ').toLowerCase();
  const sector = (a.sector ?? '').trim();
  const stance = (a.sector_stance ?? '').trim().toLowerCase();
  const catalyst = (a.catalyst_type ?? '').trim().replace(/_/g, ' ').toLowerCase();

  // A price on its own is not a thesis — `entry_condition` already carries it.
  const measured = [vol && vol > 0, rsi && rsi > 0, stop, sector, setup].filter(Boolean).length;
  if (!measured) return null;

  const side = spec.direction === 'short' ? 'short' : 'long';
  const horizon = spec.mode === 'day_trade' ? 'intraday' : 'swing';
  const money = (n: number) => `$${n.toFixed(2)}`;

  const sentences: string[] = [];

  const article = /^[aeiou]/i.test(setup) ? 'an' : 'a';
  sentences.push(
    setup
      ? `A ${horizon} ${side} on ${article} ${setup} setup${entry ? `, published at ${money(entry)}` : ''}.`
      : `A ${horizon} ${side}${entry ? `, published at ${money(entry)}` : ''}.`,
  );

  const obs: string[] = [];
  if (vol !== null && vol > 0) obs.push(`volume ran ${vol.toFixed(1)}x its average`);
  if (rsi !== null && rsi > 0) obs.push(`RSI was ${rsi.toFixed(0)}`);
  if (obs.length) sentences.push(`At the alert ${obs.join(' and ')}.`);

  if (sector) {
    sentences.push(
      stance && stance !== 'neutral'
        ? `Sector ${sector}, reading ${stance} that session.`
        : `Sector ${sector}.`,
    );
  }

  if (stop !== null && entry !== null && entry > 0) {
    const risk = Math.abs(entry - stop);
    const rr = target !== null && risk > 0 ? Math.abs(target - entry) / risk : null;
    sentences.push(
      target !== null
        ? `The published stop was ${money(stop)} and the target ${money(target)}`
          + (rr !== null && Number.isFinite(rr) ? `, about ${rr.toFixed(1)} to 1.` : '.')
        : `The published stop was ${money(stop)}.`,
    );
  }

  if (catalyst && catalyst !== 'none') sentences.push(`Catalyst recorded as ${catalyst}.`);

  return sentences.join(' ');
}

export function thesisTechnical(a: ScannerAlert): string | null {
  const bits: string[] = [];
  const label = (a.setup_label ?? '').trim();
  const pattern = (a.detected_pattern ?? '').trim();
  if (label) bits.push(label.replace(/_/g, ' ').toLowerCase());
  if (pattern && pattern.toLowerCase() !== label.toLowerCase()) bits.push(`pattern ${pattern.replace(/_/g, ' ').toLowerCase()}`);
  const vol = num(a.volume_ratio);
  if (vol !== null && vol > 0) bits.push(`volume ${vol.toFixed(1)}x its average`);
  const rsi = num(a.rsi_at_alert);
  if (rsi !== null && rsi > 0) bits.push(`RSI ${rsi.toFixed(0)} at the alert`);
  if (a.sector) bits.push(`sector ${a.sector}${a.sector_stance ? ` (${a.sector_stance})` : ''}`);
  if (!bits.length) return null;
  return `${bits.join(' · ')}.`;
}

function catalystPlain(type: string): string {
  const t = type.toLowerCase();
  if (t.startsWith('earnings_pending')) return 'An earnings print lands inside a 3-15 session hold. That is a different trade from the one that was measured.';
  if (t.startsWith('earnings')) return 'Earnings are the reason this is moving.';
  if (t === 'news') return 'A news item is the reason this is moving.';
  if (t === 'analyst_action') return 'An analyst action is the reason this is moving.';
  return `Catalyst: ${type.replace(/_/g, ' ')}.`;
}

/**
 * The structural guarantee behind "History yes, Active no".
 *
 * Called on every row before it is written. A record row that is not `expired`,
 * or carries a grade, is a bug that would put an unmanaged family in front of a
 * user as actionable — a 30.5% ORB short, a five-minute break with a five-day
 * window — so it stops the run rather than being filtered downstream by a query
 * somebody later changes.
 *
 * It reads the row's OWN provenance (`score_components.live_family`), not the
 * caller's intent, so a row that lies about its family cannot slip past.
 */
export function assertRecordOnly(row: SetupInsert): void {
  const components = (row.score_components ?? {}) as Record<string, unknown>;
  const live = components.live_family === true;
  if (live) return;
  const family = String(components.family ?? 'unknown');
  if (row.state !== 'expired') {
    throw new Error(`${row.symbol}: a ${family} record may only ever be expired, got '${row.state}'`);
  }
  if (row.score !== null || row.grade_band !== null || row.grade_display !== null) {
    throw new Error(`${row.symbol}: a ${family} record is never graded, got score=${row.score} band=${row.grade_band}`);
  }
}

/** The name this guard shipped under when `kai_short` was the only record family. */
export const assertHistoryOnly = assertRecordOnly;

/* ------------------------------------------------------------------ */
/* Idempotency                                                          */
/* ------------------------------------------------------------------ */

/** The columns this ingest owns. Anything else on the row is someone else's. */
export const OWNED_COLUMNS = [
  'symbol', 'mode', 'intent', 'state', 'score', 'grade_band', 'grade_display',
  'score_components', 'thesis_plain', 'thesis_technical', 'entry_condition',
  'invalidation', 'stop', 'targets', 'catalyst', 'annotations', 'quote_snapshot',
  'valid_until', 'scanner_run_id',
] as const;

/**
 * A stable fingerprint of the columns this ingest writes, used to decide whether
 * a row needs writing at all. The second run of an unchanged window writes ZERO
 * rows — the brief asks for "the second run changes nothing", and skipping the
 * write is a stronger form of that than writing the same bytes back (which would
 * still move `updated_at`, the trigger in 0013 sees to that).
 *
 * Numbers are normalised because PostgREST hands `numeric` back as a string, so
 * `204.21` and `"204.21"` must not read as a difference.
 */
export function fingerprint(row: Record<string, unknown>): string {
  const canon = (v: unknown): unknown => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return Number(v.toFixed(6));
    if (typeof v === 'string') {
      // Postgres hands a timestamptz back as '...+00:00' where this file wrote
      // '...Z'. Same instant, different spelling — normalise before comparing.
      if (/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}|$)/.test(v)) {
        const d = new Date(v.length === 10 ? `${v}T00:00:00Z` : v.replace(' ', 'T'));
        if (!Number.isNaN(d.getTime())) return d.toISOString();
      }
      const n = Number(v);
      return v.trim() !== '' && Number.isFinite(n) ? Number(n.toFixed(6)) : v;
    }
    if (Array.isArray(v)) return v.map(canon);
    if (typeof v === 'object') {
      const o = v as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(o).sort()) out[k] = canon(o[k]);
      return out;
    }
    return v;
  };
  const picked: Record<string, unknown> = {};
  for (const c of OWNED_COLUMNS) picked[c] = canon(row[c]);
  return createHash('sha256').update(JSON.stringify(picked)).digest('hex').slice(0, 16);
}

/* ------------------------------------------------------------------ */
/* Band accounting — what the gate reads                                */
/* ------------------------------------------------------------------ */

export type BandSplit = {
  n: number;
  /** grade_band, the letter the percentile produces. */
  letters: Record<'A' | 'B' | 'C' | 'ungraded', number>;
  /** The medallion family `round4/grade.ts` will pick from the same score. */
  families: Record<string, number>;
};

/** The medallion families, copied from `grade.ts` so the gate reads what a user sees. */
export function medallionFamilyFor(score: number | null): string {
  if (score === null || !Number.isFinite(score)) return 'neutral';
  if (score >= 90) return 'gold';
  if (score >= 85) return 'gold_restrained';
  if (score >= 80) return 'violet';
  if (score >= 70) return 'violet_graphite';
  if (score >= 60) return 'amber';
  return 'neutral';
}

export function bandSplit(rows: { score: number | null; grade_band: 'A' | 'B' | 'C' | null }[]): BandSplit {
  const letters = { A: 0, B: 0, C: 0, ungraded: 0 };
  const families: Record<string, number> = {
    gold: 0, gold_restrained: 0, violet: 0, violet_graphite: 0, amber: 0, neutral: 0,
  };
  for (const r of rows) {
    letters[r.grade_band ?? 'ungraded'] += 1;
    families[medallionFamilyFor(r.score)] += 1;
  }
  return { n: rows.length, letters, families };
}

export function pct(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((1000 * part) / whole) / 10;
}

/* ------------------------------------------------------------------ */

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}
