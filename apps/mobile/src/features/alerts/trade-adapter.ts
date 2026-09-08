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
 * ── THE LEVELS ARE MONEY-FORMATTED STRINGS ─────────────────────────────────
 * The room sends `"178.40"`. The alert wire sends whatever reads well on a
 * card — `"$178.40"`, `"1,204.50"` — because until today those strings were
 * printed, never measured. The kit measures them: it lays out a chart and
 * computes a risk/reward from them. So `num` strips currency and separators
 * before parsing, and still refuses to produce NaN or a silent zero. A level
 * it cannot read becomes `null`, which the kit draws as no level at all —
 * never as a line at 0, which would put a stop at the bottom of every chart.
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
 * A displayed price becomes a number, or nothing.
 *
 * `$1,204.50` → 1204.5. `—` → null. `` → null. Note the guard against a bare
 * sign or separator parsing as something: `Number('')` is 0 and `Number('$')`
 * is NaN, and only one of those is caught by `Number.isFinite`.
 */
export const priceNum = (v: string | null | undefined): number | null => {
  if (v == null) return null;
  const cleaned = String(v).replace(/[$,\s]/g, '').replace(/[^\d.\-+eE]/g, '');
  if (!/\d/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

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
  const entry = priceNum(alert.trade.entry);
  const stop = priceNum(alert.trade.stop);
  const target = priceNum(alert.trade.target);
  return {
    id: alert.alert_id ?? alert.id,
    symbol: alert.symbol,
    company: alert.company ?? '',
    title: alert.headline,
    summary: alert.what_changed ?? '',
    direction: directionOf(alert, entry, target),
    /*
     * An empty grade stays empty. The unusual-options family is honestly
     * ungraded — nothing behind it ever scored a stock setup — and `GradeBadge`
     * has a state for that. Substituting a letter here would be the adapter
     * inventing the one fact the whole card is judged on.
     */
    grade: alert.grade || null,
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
