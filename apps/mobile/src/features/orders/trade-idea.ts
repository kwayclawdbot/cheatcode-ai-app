/**
 * ORDER PREVIEW / POSITION → `TradeIdea`. THE SEAM, AND ONLY THE SEAM.
 *
 * `ui/trade` already knows how to draw the chart with its entry, stop and
 * target bands (`TradeMap`) and the 1R → 2.6R meter with its accessibility
 * label (`RiskRewardRuler`). Both read one type — `TradeIdea` from
 * `packages/trade-ui/model`. The paper-execution lane speaks `OrderPreview` and
 * `PositionDetail`. So this file is the translation and nothing else, exactly
 * like `features/community/trade-adapter.ts` is for the room. Mechanical on
 * purpose: when the wire changes, this is the file to read.
 *
 * THE THREE JUDGEMENTS IN HERE, NAMED SO NOBODY HAS TO GUESS:
 *
 * 1. WHAT "ENTRY" IS ON AN ORDER. A limit order's entry is its limit — that is
 *    the price the member chose. A market order has no chosen price, so the
 *    entry is the quote it would fill against, and it is only used because the
 *    ruler cannot compute an R without one. It is never invented: if there is
 *    no limit and no quote, entry is null, the ruler says "Risk/reward
 *    unavailable" and the map draws the levels it does have.
 *
 * 2. DIRECTION IS READ, NOT ASSUMED. `OrderSide` already carries it. Defaulting
 *    to long would flip the sign of every short's risk/reward and turn a good
 *    trade into a red bar.
 *
 * 3. CANDLES ARE THE CALLER'S. This file does no I/O AT ALL — `useIdeaCandles`
 *    in `useCandles.ts` fetches them and hands them in. An empty array is a
 *    legitimate answer: `TradeMap` draws honest levels over an empty history and
 *    says "Price history unavailable" rather than drawing a shape nobody
 *    measured.
 *
 * EVERY IMPORT BELOW IS A TYPE. That is deliberate and it is what makes this
 * file assertable: `paper-lifecycle-test.mts` runs under plain node, and a
 * single runtime import of `lib/trade-api` or `ui/trade` would drag React
 * Native's entry point in and the mapping would go untested. The kit's type is
 * taken from `packages/trade-ui/model` directly for the same reason.
 */
import type { Candle as WireCandle } from '../../lib/types';
import type { PositionDetail } from '../positions/types';
import type { TradeIdea } from '../../../../../packages/trade-ui/model';
import { isBuySide, type OrderPreview, type OrderRow } from './types';

type KitCandle = TradeIdea['candles'][number];

const finite = (v: number | null | undefined): v is number =>
  typeof v === 'number' && Number.isFinite(v);

/**
 * The wire's bars are `{t: ISO, o, h, l, c}`; the kit's are `{time: epoch
 * seconds, open, …}` because it does geometry with them. A bar whose timestamp
 * does not parse is dropped rather than placed at the epoch.
 */
export function kitCandles(bars: readonly WireCandle[]): KitCandle[] {
  const out: KitCandle[] = [];
  for (const b of bars) {
    const t = Date.parse(b.t);
    if (!Number.isFinite(t)) continue;
    if (![b.o, b.h, b.l, b.c].every((n) => typeof n === 'number' && Number.isFinite(n))) continue;
    out.push({
      time: Math.round(t / 1000),
      open: b.o,
      high: b.h,
      low: b.l,
      close: b.c,
      volume: b.v ?? undefined,
    });
  }
  return out;
}

/** What the map should say about where its numbers came from. */
const previewDataLabel = (p: OrderPreview): string => {
  const source = p.quote_clock ? `Quote ${p.quote_clock}` : 'Levels from your plan';
  return `${source} · paper account`;
};

/**
 * An order preview, as the kit sees it.
 *
 * `status` is `entry_reached` and not `active`: the member is standing on a
 * ticket, so the entry is the thing in play and nothing is open yet. Calling it
 * `active` here would light the kit's third dot for a trade that does not exist.
 */
export function ideaFromPreview(
  preview: OrderPreview,
  candles: readonly WireCandle[] = [],
): TradeIdea {
  const entry = finite(preview.limit_price)
    ? preview.limit_price
    : finite(preview.quote?.price ?? null)
      ? (preview.quote as { price: number }).price
      : null;
  return {
    id: preview.preview_id,
    symbol: preview.symbol,
    company: preview.name ?? '',
    title: `${preview.side_label} ${preview.symbol}`,
    summary: '',
    direction: isBuySide(preview.side) ? 'long' : 'short',
    grade: null,
    entry,
    stop: preview.stop_attached,
    target: preview.first_target,
    status: 'entry_reached',
    candles: kitCandles(candles),
    dataLabel: previewDataLabel(preview),
  };
}

/**
 * A live position, as the kit sees it.
 *
 * `entry` is what the member ACTUALLY got in at, not what the plan said — this
 * chart is about the trade they are in. The plan's entry stays on the rows
 * below it, beside the fill, which is the "plan vs now" the screen already had.
 */
export function ideaFromPosition(
  position: PositionDetail,
  candles: readonly WireCandle[] = [],
): TradeIdea {
  return {
    id: position.id,
    symbol: position.symbol,
    company: position.name ?? '',
    title: `${position.side === 'short' ? 'Short' : 'Long'} ${position.symbol}`,
    summary: '',
    direction: position.side,
    grade: null,
    entry: position.avg_entry ?? position.plan_entry,
    stop: position.plan_stop ?? position.stop,
    target: position.plan_target ?? position.target,
    status: position.status === 'closed' ? 'closed' : 'active',
    candles: kitCandles(candles),
    dataLabel: position.mark_ts
      ? `Marked ${new Date(position.mark_ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} · paper account`
      : 'Paper account',
  };
}
