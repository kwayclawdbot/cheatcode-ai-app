import { displayGrade } from '../grade';
import type { AlertCard, AlertCardState, Candle } from '../../lib/types';
import type { TradeIdea, TradeStatus, LevelKind } from '../../ui/trade';

/**
 * ALERT CARD → TRADE IDEA. THE SECOND SEAM, BUILT LIKE THE FIRST.
 *
 * `features/community/trade-adapter.ts` is the twin of this file and its header
 * carries the full argument; this one only records where the alert wire differs
 * from the room wire, because everything they share was settled there.
 *
 * Three differences, and all three are about honesty rather than plumbing.
 *
 * ── THE LEVELS ARE DISPLAY STRINGS, AND SOME OF THEM ARE ZONES ─────────────
 * The room sends `"178.40"`. The alert wire sends whatever reads well on a
 * card — `"$178.40"`, `"> 504"`, `"504–507"` — because until today those
 * strings were printed and never measured. The kit measures them: it lays out
 * a chart and computes a risk/reward from them. `priceNum` and `zoneNum` below
 * carry the full argument for how that is done without inventing anything; the
 * short version is that one number is a price, two is a zone, and neither is
 * ever assembled out of the digits of the other.
 *
 * ── NINE STATES COLLAPSE ONTO SIX, AND THE LABEL DOES NOT ──────────────────
 * `AlertCardState` has nine values; the kit has six. The collapse below is
 * about POSITION — where this trade sits on its lifecycle — and it is lossy on
 * purpose: `ready`, `planned` and `order_pending` are three ways of standing at
 * the moment of entry, and the strip has one dot there. What is NOT lossy is
 * the word: every caller passes `alert.state_label` to the strip, so a member
 * with a resting order reads "Order pending" and never "Entry reached". The
 * server names the state; the kit places it.
 *
 * ── THERE ARE NO CANDLES ON THIS WIRE ──────────────────────────────────────
 * The alert payload carries no bars at all. They come from `/market/candles`,
 * a different lane, which is why they arrive here as an argument rather than
 * being read off the alert. When the caller has none, `candles` is `[]` and
 * the kit draws the levels against an honest empty history — the same refusal
 * `PinnedSetup` documents. Nothing here invents a shape.
 */

/**
 * THE NUMBERS INSIDE A DISPLAYED LEVEL.
 *
 * Every number in the string, in order, with currency and thousands
 * separators removed. Nothing is welded together and nothing is guessed: the
 * caller decides what a string with two numbers in it means.
 */
const numbersIn = (v: string | null | undefined): number[] =>
  v == null
    ? []
    : (String(v).match(/-?\d[\d,]*(?:\.\d+)?/g) ?? [])
        .map((n) => Number(n.replace(/,/g, '')))
        .filter((n) => Number.isFinite(n));

/**
 * ONE NUMBER MEANS ONE NUMBER. TWO MEANS A ZONE. THIS IS NOT A DETAIL.
 *
 * The first version of this stripped every character that was not a digit and
 * parsed what was left, which is the kind of code that looks defensive and is
 * the opposite. The wire sends entries as ZONES — `'504–507'` is a real value
 * on a real fixture — and stripping the en-dash turned it into `504507.00`: a
 * confidently wrong price, printed in the entry cell, drawn as a line a
 * thousand times above the stop, and silently rescaling the whole chart.
 *
 * So: exactly one number is a price. Two numbers is a zone, and `zoneNum`
 * answers for it separately. Anything else is `null` and draws nothing.
 * `'> 504'` still reads as 504 — one number, with a word about it.
 */
export const priceNum = (v: string | null | undefined): number | null => {
  const ns = numbersIn(v);
  return ns.length === 1 ? ns[0] : null;
};

/**
 * A two-number level is an entry ZONE, and its NEAR edge is the geometry.
 *
 * The kit draws one line per level, so a zone has to become a number
 * somewhere. The near edge is the honest choice for where the line goes — it
 * is where the zone begins — but it is emphatically NOT what the card prints:
 * `levelText` puts the wire's own `'504–507'` in the cell, so a member reads
 * the zone they were given and the chart draws the edge of it.
 *
 * What this deliberately does NOT do is compute a risk/reward from it. A ratio
 * measured off one edge of a zone is a best case dressed as the case, so a
 * card with a zone shows the server's own ratio instead. See `zoned` in
 * AlertCard.
 */
export const zoneNum = (v: string | null | undefined): number | null => {
  const ns = numbersIn(v);
  return ns.length === 2 ? ns[0] : null;
};

export const isZone = (v: string | null | undefined): boolean =>
  numbersIn(v).length === 2;

/** The number the chart draws for a level, whether it was a price or a zone. */
export const levelNum = (v: string | null | undefined): number | null =>
  priceNum(v) ?? zoneNum(v);

/**
 * Where each alert state sits on the kit's four-step lifecycle.
 *
 * `ready`, `planned` and `order_pending` all land on `entry_reached` because
 * each of them means the deciding is done and the entry is the live question.
 * Only `position_active` is `active`: that is the one state where a member's
 * money is actually in the trade, and it is not a distinction to be generous
 * with. Anything unrecognised falls to `watching`, the state that claims least.
 */
const STATE: Record<AlertCardState, TradeStatus> = {
  watching: 'watching',
  forming: 'watching',
  ready: 'entry_reached',
  entry_reached: 'entry_reached',
  planned: 'entry_reached',
  order_pending: 'entry_reached',
  position_active: 'active',
  closed: 'closed',
  invalidated: 'invalidated',
};

export const statusFromAlertState = (state: AlertCardState): TradeStatus =>
  STATE[state] ?? 'watching';

/** The kit's bar shape from the app's. Chronology and validity are the kit's job. */
export const candlesForKit = (candles: readonly Candle[]) =>
  candles.map((c) => ({
    time: Date.parse(c.t),
    open: c.o,
    high: c.h,
    low: c.l,
    close: c.c,
    volume: c.v ?? undefined,
  }));

/**
 * DIRECTION IS READ, THEN DERIVED, THEN LEFT ALONE.
 *
 * The wire usually says so outright, and it says it in the member's words —
 * "Long", "Short", "Call", "Put". A put is a short and a call is a long for
 * the purpose the kit uses direction for, which is deciding which side of the
 * entry the risk is on. Where the wire says nothing the arithmetic answers
 * (a target below the entry is a short), and where there is nothing to compute
 * it falls to long, which is inert for a card that draws no ruler.
 */
function directionOf(alert: AlertCard, entry: number | null, target: number | null) {
  const said = `${alert.trade.direction ?? ''} ${alert.direction_label ?? ''}`.toLowerCase();
  if (/\b(short|put|sell)\b/.test(said)) return 'short' as const;
  if (/\b(long|call|buy|accumulate)\b/.test(said)) return 'long' as const;
  if (entry != null && target != null && target < entry) return 'short' as const;
  return 'long' as const;
}

/**
 * Kai's sentences, attached to the levels they are about.
 *
 * REAL TEXT OR NOTHING. `kai_interpretation` is Kai's read of the idea, so it
 * belongs to the entry — the level a member is deciding about. `trade.note` is
 * the server's own explanation of a level that has no number, which is exactly
 * what should be said about a missing stop. Neither is duplicated onto the
 * other two levels to fill the frame: a level with nothing said about it draws
 * no annotation, and that is the honest result.
 */
export function notesFromAlert(alert: AlertCard): Partial<Record<LevelKind, string>> {
  const notes: Partial<Record<LevelKind, string>> = {};
  if (alert.kai_interpretation) notes.entry = alert.kai_interpretation;
  if (alert.trade.note) notes.stop = alert.trade.note;
  return notes;
}

export function ideaFromAlertCard(
  alert: AlertCard,
  opts?: { candles?: readonly Candle[] },
): TradeIdea {
  const entry = levelNum(alert.trade.entry);
  const stop = levelNum(alert.trade.stop);
  const target = levelNum(alert.trade.target);
  return {
    id: alert.alert_id ?? alert.id,
    symbol: alert.symbol,
    company: alert.company ?? '',
    title: alert.headline,
    summary: alert.what_changed ?? '',
    direction: directionOf(alert, entry, target),
    /*
     * AN UNGRADED CARD STAYS UNGRADED, and "ungraded" has one definition.
     *
     * The unusual-options family is honestly ungraded — nothing behind it ever
     * scored a stock setup — and the wire says so by sending an em-dash rather
     * than an empty string. A truthiness check therefore is not enough: `"—"`
     * is a perfectly true string, and passing it through produced a gold badge
     * reading "— setup", which is worse than either a grade or nothing.
     *
     * `displayGrade` is the app's existing answer to "is this a grade", and it
     * is the one `GradeMedallion` has always used. Asking it rather than
     * writing a second test here is what keeps the badge and the medallion
     * from ever disagreeing about whether a card was scored.
     */
    grade: displayGrade(alert.grade) === '—' ? null : alert.grade,
    entry,
    stop,
    target,
    status: statusFromAlertState(alert.state),
    candles: candlesForKit(opts?.candles ?? []),
    /*
     * The source line the card already showed, kept in the slot the kit
     * reserves for it. Where the server sends none, the fallback names the
     * lane rather than claiming a time nobody measured.
     */
    dataLabel: alert.freshness_line ?? "Levels from Kai's plan",
  };
}
