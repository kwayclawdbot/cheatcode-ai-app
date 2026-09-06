/**
 * THE UNUSUAL-OPTIONS-ACTIVITY DAY-TRADE FEED → one `setups` row.
 *
 * WHERE IT COMES FROM. `~/breakout-alert-system/uw_alerts/live_stream.py` runs
 * the day-trade filter forward through the session and POSTs every alert it
 * fires to `/api/v1/internal/uoa-alerts`. This file is the only place that
 * record is turned into something the app draws.
 *
 * WHY THERE IS NO MIGRATION BEHIND IT. `setups` already holds a `day_trade`
 * mode, a nullable grade, a free-form `score_components`, and a `stop` and
 * `targets` that are allowed to be empty. Every one of those is exactly what
 * this family needs, so it writes into the table every other alert card is
 * drawn from rather than into a private one — which is also what makes the
 * card work: the board, the grade, the community block and the history tab all
 * already know how to read a `setups` row.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THIS FORMULA MEASURES, AND — MORE IMPORTANTLY — WHAT IT DOES NOT
 *
 * It reads one thing: option flow. Sweeps and blocks paid on the ask, in
 * contracts expiring inside two days, in a name that clears the universe gate.
 * That is the whole of it.
 *
 * It does not look at price trend. It does not look at chart structure. It
 * does not look at share volume. It does not produce a stop or a target, so it
 * cannot produce a reward-to-risk. It does not look at the broad market.
 *
 * So of the five day-trade scorecard components, this family fills in NONE of
 * them, and they all render "I have no read on this for this one, so I am not
 * counting it either way." That is not a gap to be papered over — it is the
 * accurate description of a single-signal engine, and the alternative (mapping
 * option volume onto a bar whose own words are "enough SHARES changed hands")
 * would be a lie told in a place a person cannot check.
 *
 * The one bar it does fill is `scores.options_activity`, which is the bar the
 * card already has for exactly this. See `optionsActivityScore` for what the
 * number is and why it is a measurement rather than a composite.
 *
 * NO GRADE. The engine issues no letter and no 0-100 quality score, so the row
 * carries `score`, `grade_band` and `grade_display` all null. The medallion
 * then draws its ungraded form — a dotted ring, no fill arc, the words "No
 * grade" — and `ungradedReason` says why in this family's own terms. An
 * invented letter would be the single most misleading thing this file could do.
 *
 * NO EXIT ADVICE, ANYWHERE. The producing engine's standing instruction is
 * verbatim: "we just need the alerts to go solid in the right direction, users
 * can do their own thing. no exit signals." So `stop` is null, `targets` is
 * empty and `invalidation` is null — absent, never a dash and never derived.
 * Nothing in the copy this file writes suggests when to close anything.
 */
import { createHash } from 'node:crypto';

/** Fixed namespace for the UOA day-trade family. Never change it: ids depend on it. */
export const UOA_NAMESPACE = 'b1d7e3a2-5c48-4f19-8e6d-3a92f4c07b58';

/** RFC 4122 v5 (SHA-1) UUID. The same name always yields the same id. */
export function uuidv5(name: string, namespace: string = UOA_NAMESPACE): string {
  const ns = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  const hash = createHash('sha1').update(ns).update(Buffer.from(name, 'utf8')).digest();
  const b = Buffer.from(hash.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x50; // version 5
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * THE PROVENANCE MARK. Every row this file writes carries it in
 * `quote_snapshot.origin`, and the alerts feed selects on it. It is the
 * boundary between this family and the archived Kai SMS scanner
 * (`kai_sms_scanner`) that shares the table.
 */
export const UOA_ORIGIN = 'uw_uoa_daytrade';

/** The family key, in `score_components.family`. */
export const UOA_FAMILY = 'uoa_day_trade';

export type UoaSetupRow = {
  id: string;
  symbol: string;
  mode: 'day_trade';
  intent: 'buy_to_open' | 'sell_short';
  state: 'ready' | 'expired';
  score: null;
  grade_band: null;
  grade_display: null;
  score_components: Record<string, unknown>;
  thesis_plain: string;
  thesis_technical: string | null;
  entry_condition: Record<string, unknown>;
  invalidation: null;
  stop: null;
  targets: never[];
  catalyst: Record<string, unknown> | null;
  annotations: Record<string, unknown>;
  quote_snapshot: Record<string, unknown>;
  valid_until: string;
  scanner_run_id: string;
  created_at: string;
};

/** What came back is not a record this file knows how to read. */
export class UoaRejected extends Error {}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
};
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** "$196,070" — money the way a person writes it, never "196070.0". */
function money(v: number | null): string | null {
  if (v === null) return null;
  return `$${Math.round(v).toLocaleString('en-US')}`;
}

/** "Aug 21" — the expiry in the reader's own calendar, not "2026-08-21". */
function shortDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/**
 * THE ONE BAR THIS FAMILY FILLS, and it is a measurement rather than a score.
 *
 * `ask_side_share` is the fraction of the premium that was paid at the OFFER
 * rather than sold at the bid. It is the difference between somebody reaching
 * across the spread to get filled now and somebody being filled patiently, and
 * it is the closest thing this feed has to a conviction reading. It arrives
 * already on a 0-1 scale, so putting it on the card's 0-100 bar is a change of
 * units and nothing else — no weighting, no blend, no proprietary composite.
 *
 * That is said out loud in the evidence line the card shows, so nobody can
 * mistake it for a quality grade. It is emphatically NOT one: a name can have
 * 100% of its premium on the ask and still be a bad idea, and this bar says
 * nothing at all about that.
 */
export function optionsActivityScore(filters: Record<string, unknown>): number | null {
  const share = num(filters.ask_side_share);
  if (share === null) return null;
  return Math.max(0, Math.min(100, Math.round(share * 100)));
}

/**
 * The contract, if the engine named one.
 *
 * TWO DIFFERENT SOURCES, AND THEY MEAN DIFFERENT THINGS.
 *
 *   `suggested_contract.suggestion.base`  the engine picked this off the live
 *                                         chain. This is a suggestion.
 *   `flow_contract_check[]`               the contract the FLOW ITSELF bought,
 *                                         put through the same hard liquidity
 *                                         floor a suggestion has to clear.
 *
 * The second is not a suggestion and is never labelled as one — it is what the
 * money actually did, which for a past session is the only honest answer,
 * because Unusual Whales' chain endpoint has no date parameter and the chain
 * that existed that morning cannot be rebuilt. The label on the card says which
 * of the two it is, every time.
 *
 * A contract that FAILS the liquidity floor is still shown, marked `thin`,
 * because "the flow bought something you would struggle to get out of" is
 * information the reader wants and hiding it would flatter the alert.
 */
export function contractsFrom(record: Record<string, unknown>): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];

  const suggestion = obj(obj(obj(record.suggested_contract).suggestion).base);
  if (suggestion.option_symbol) {
    out.push({
      label: 'Named by the engine',
      type: String(suggestion.type ?? '').toLowerCase().startsWith('p') ? 'put' : 'call',
      strike: String(suggestion.strike ?? ''),
      expiry: shortDate(String(suggestion.expiry ?? '')) ?? String(suggestion.expiry ?? ''),
      dte: num(suggestion.days_to_expiry),
      cost: num(suggestion.ask) !== null ? num(suggestion.ask)!.toFixed(2) : null,
      liquidity: 'good',
    });
  }

  // The contract the flow bought. Only the first — a name that printed nine
  // times bought the SAME contract nine times, and nine identical cards is a
  // rendering of the loop, not of the trade.
  for (const raw of arr(record.flow_contract_check)) {
    const c = obj(raw);
    const sym = String(c.option_symbol ?? '');
    if (!sym) continue;
    const strike = num(c.strike);
    const expiry = String(c.expiry ?? '');
    if (strike === null || !expiry) continue;
    out.push({
      label: 'The contract the flow bought',
      type: sym.replace(/\d+$/, '').slice(-1).toUpperCase() === 'P' ? 'put' : 'call',
      strike: String(strike),
      expiry: shortDate(expiry) ?? expiry,
      dte: num(c.days_to_expiry),
      cost: num(c.ask_at_alert) !== null ? num(c.ask_at_alert)!.toFixed(2) : null,
      // The engine's own hard floor, passed through as it decided it. Never
      // re-judged here: this file does not get a second opinion on liquidity.
      liquidity: c.clears_the_liquidity_floor === true ? 'good' : 'thin',
    });
    break;
  }

  return out;
}

/**
 * The story, in plain words, with the full company name.
 *
 * It says what fired it and what the formula is, because a card that shows a
 * contract and a direction without saying which engine called it is asking to
 * be mistaken for the swing scanner sitting next to it in the same list.
 */
function storyFor(o: {
  company: string;
  ticker: string;
  direction: string;
  filters: Record<string, unknown>;
}): string {
  const f = o.filters;
  const side = o.direction === 'bullish' ? 'calls' : 'puts';
  const bits: string[] = [];

  bits.push(
    `${money(num(f.total_premium))} of ${side} changed hands in ${o.company} today, in contracts `
    + `that expire within ${num(f.max_dte) ?? 2} day${(num(f.max_dte) ?? 2) === 1 ? '' : 's'}.`,
  );

  const share = num(f.ask_side_share);
  if (share !== null) {
    bits.push(
      `${Math.round(share * 100)}% of that money was paid at the offer rather than sold at the bid — `
      + `buyers reaching across the spread to get filled, not sellers being patient.`,
    );
  }

  const mult = num(f.max_volume_oi_multiple);
  const traded = num(f.total_contracts_traded);
  if (mult !== null && traded !== null) {
    bits.push(
      `${Math.round(traded).toLocaleString('en-US')} contracts traded, and the busiest strike did `
      + `${mult}x the open interest that already existed there — so most of this is new positions `
      + `being opened, not old ones being closed.`,
    );
  }

  const sweeps = num(f.n_sweeps) ?? 0;
  const blocks = num(f.n_blocks) ?? 0;
  if (sweeps || blocks) {
    const parts: string[] = [];
    if (sweeps) parts.push(`${sweeps} sweep${sweeps === 1 ? '' : 's'}`);
    if (blocks) parts.push(`${blocks} block${blocks === 1 ? '' : 's'}`);
    bits.push(
      `It came in as ${parts.join(' and ')}. A sweep is one order broken across several exchanges `
      + `at once to fill it immediately, which is what somebody in a hurry looks like.`,
    );
  }

  bits.push(
    `This is the unusual-options-activity day-trade formula. It reads options flow and nothing else — `
    + `not the price trend, not the chart, not the wider market — so it is one piece of evidence `
    + `pointing ${o.direction === 'bullish' ? 'up' : 'down'}, not a full picture.`,
  );

  return bits.join(' ');
}

/**
 * THE REPLAY LABEL, ON THE CARD ITSELF.
 *
 * A replay is the live loop re-run over cached tape from a past session. The
 * numbers in it are real and the alert really did qualify — but it was never
 * delivered to anybody at the time, and a card that does not say so is claiming
 * a history it does not have. `is_replay` in the row's jsonb is enough for a
 * query and nowhere near enough for a person, so the sentence goes at the FRONT
 * of the story, where it is read before the numbers rather than after them.
 */
const REPLAY_PREFIX =
  'This is a rehearsal, not an alert anyone was sent. The engine was re-run over stored tape '
  + 'from that session to check it behaves the same way forward as it did in the measurement. '
  + 'The numbers below are real; the delivery was not.';

/**
 * A `setups` row, or a refusal.
 *
 * The refusal is deliberate and it is loud: a malformed record is a producer
 * bug, and writing a half-row for it would put a card with missing numbers in
 * front of a person instead of putting an error in front of an engineer.
 */
export function setupFromUoaRecord(record: Record<string, unknown>): UoaSetupRow {
  const schema = String(record.schema ?? '');
  if (!schema.startsWith('uw_alerts.live_alert')) {
    throw new UoaRejected(`Unknown record schema '${schema || '(none)'}'.`);
  }

  const ticker = String(record.ticker ?? '').trim().toUpperCase();
  if (!ticker) throw new UoaRejected('The record has no ticker.');

  const direction = String(record.direction ?? '').toLowerCase();
  if (direction !== 'bullish' && direction !== 'bearish') {
    throw new UoaRejected(`Direction must be bullish or bearish, got '${direction}'.`);
  }

  const sessionDate = String(record.session_date ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
    throw new UoaRejected(`session_date must be YYYY-MM-DD, got '${record.session_date}'.`);
  }

  const firedAt = String(record.fired_at_utc ?? '');
  if (!firedAt || Number.isNaN(new Date(firedAt).getTime())) {
    throw new UoaRejected('fired_at_utc is missing or unreadable.');
  }

  const filters = obj(record.filters_at_fire);
  if (!Object.keys(filters).length) throw new UoaRejected('filters_at_fire is empty.');

  const company = String(record.company_name ?? '').trim() || ticker;
  const mode = String(record.mode ?? 'live').toLowerCase();
  // A replay is a rehearsal over cached tape. It is written down and it is
  // LABELLED, so it can never be mistaken on a screen for something that fired
  // against a live market — and it is never `ready`, so it cannot reach the
  // Active tab and sit among today's alerts.
  const isReplay = mode === 'replay';

  const underlying = num(filters.underlying_price);
  const contracts = contractsFrom(record);
  const optionsActivity = optionsActivityScore(filters);

  // The session's close, in UTC. A 0-2 day option found in the morning is a
  // same-day idea; it stops being live when the bell rings, and `valid_until`
  // is the only thing that says so.
  const validUntil = `${sessionDate}T20:00:00.000Z`;
  const expired = isReplay || new Date(validUntil).getTime() <= Date.now();

  const times = obj(record.print_times);

  return {
    id: uuidv5(`uoa:${ticker}|${sessionDate}|${direction}|${mode}`),
    symbol: ticker,
    mode: 'day_trade',
    intent: direction === 'bullish' ? 'buy_to_open' : 'sell_short',
    state: expired ? 'expired' : 'ready',
    // Not graded. The engine issues no letter and no quality score, and this
    // file will not invent one. See the header.
    score: null,
    grade_band: null,
    grade_display: null,

    score_components: {
      family: UOA_FAMILY,
      family_label: 'Intraday · unusual options activity',
      source: UOA_ORIGIN,
      horizon: 'day_trade',
      direction: direction === 'bullish' ? 'long' : 'short',
      // This family IS live — it fires during the session and is meant to be
      // read the same morning. `assertRecordOnly` in the swing lane keys off
      // this exact field, so it is set truthfully rather than defensively.
      live_family: !isReplay,
      thesis_source: 'unusual_options_activity',
      is_replay: isReplay,

      // The bar the card draws. Deliberately the only one: see the header for
      // why the other four are left for the scorecard to report as unmeasured.
      scores: optionsActivity === null ? {} : { options_activity: optionsActivity },
      options_activity_plain:
        optionsActivity === null
          ? null
          : `${optionsActivity} out of 100 is the share of today's premium in this name that was paid `
            + `at the offer rather than sold at the bid. It is that one measurement rescaled, not a `
            + `quality score, and it says nothing about whether this is a good idea.`,

      recommended_options: contracts,

      // Every filter number, verbatim, so the row can be audited against the
      // engine's own jsonl without going back to the laptop that wrote it.
      uoa: {
        total_premium: num(filters.total_premium),
        ask_side_premium: num(filters.ask_side_premium),
        ask_side_share: num(filters.ask_side_share),
        n_contract_alerts: num(filters.n_contract_alerts),
        n_sweeps: num(filters.n_sweeps),
        n_blocks: num(filters.n_blocks),
        total_contracts_traded: num(filters.total_contracts_traded),
        max_volume_oi_multiple: num(filters.max_volume_oi_multiple),
        best_volume_vs_own_adv: num(filters.best_volume_vs_own_adv),
        min_dte: num(filters.min_dte),
        max_dte: num(filters.max_dte),
        strikes: arr(filters.strikes),
        expiries: arr(filters.expiries),
        underlying_price: underlying,
        sector: filters.sector ?? null,
        next_earnings_date: filters.next_earnings_date ?? null,
        days_to_earnings: num(filters.days_to_earnings),
      },

      // The latency, which is the honest measure of a live engine. Kept because
      // it is the number that will say whether this was fast enough to matter.
      timing: {
        fired_at_utc: firedAt,
        fired_at_et: record.fired_at_et ?? null,
        deciding_print_created_at_utc: times.deciding_print_created_at_utc ?? null,
        deciding_trade_executed_at_utc: times.deciding_trade_executed_at_utc ?? null,
        seconds_from_published_print_to_fire: num(record.seconds_from_published_print_to_fire),
        seconds_from_trade_execution_to_fire: num(record.seconds_from_trade_execution_to_fire),
        qualifying_prints: num(times.qualifying_prints),
      },

      escalated_from_watchlist: record.escalated_from_watchlist === true,
    },

    thesis_plain: isReplay
      ? `${REPLAY_PREFIX} ${storyFor({ company, ticker, direction, filters })}`
      : storyFor({ company, ticker, direction, filters }),
    // The engine's own one-line summary, kept verbatim as the technical read.
    thesis_technical: typeof record.alert_text === 'string' ? record.alert_text : null,

    entry_condition: {
      kind: 'published_trigger',
      price: underlying,
      plain: underlying === null
        ? 'The alert fired on the options tape; no underlying price was recorded with it.'
        : `The flow printed with ${company} at $${underlying}. That is the price this alert is held to.`,
    },

    // No exit logic anywhere. The formula produces none, so none is written —
    // absent, not zero and not a dash.
    invalidation: null,
    stop: null,
    targets: [],

    catalyst: null,
    annotations: {},

    quote_snapshot: {
      symbol: ticker,
      price: underlying,
      origin: UOA_ORIGIN,
      et_date: sessionDate,
      anchor_date: sessionDate,
      source_ts: firedAt,
      received_ts: firedAt,
      freshness: 'stale',
      market_session: 'regular',
      alert_type: `uoa_${direction}`,
      sector: filters.sector ?? null,
      is_replay: isReplay,
      engine: 'uw_alerts/live_stream.py',
    },

    valid_until: validUntil,
    scanner_run_id: uuidv5(`uoa_run:${sessionDate}`),
    created_at: firedAt,
  };
}
