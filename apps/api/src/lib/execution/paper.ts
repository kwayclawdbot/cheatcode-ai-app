/**
 * The paper fill model. Pure functions — no database, no network.
 *
 * WHY IT IS THIS SIMPLE, HONESTLY
 * -------------------------------
 * 03 Unit 4 specifies fills "marketable at NBBO opposite ± slippage (1–3bps
 * scaled by spread + size vs displayed)". We have no NBBO: the Polygon plan on
 * this account is delayed aggregates only — no level 1, no book, no displayed
 * size. Inventing a bid/ask from a last trade would be a fabricated number in a
 * financial product, which is the one thing this codebase does not do.
 *
 * So the model is stated plainly and its assumptions are named in copy the user
 * actually sees ("Paper fills use delayed prices."):
 *   - Reference price = the last delayed print. That is the only real number.
 *   - Spread proxy = SPREAD_PROXY_BPS of price, a fixed stand-in for a book we
 *     cannot see. It is a proxy, not a measurement.
 *   - Slippage = SLIPPAGE_BPS × the spread proxy's half-width, applied against
 *     the taker: a buy pays up, a sell receives less.
 *   - Displayed-size proxy = DISPLAYED_SIZE_PROXY shares. An order larger than
 *     3× that partially fills (03 Unit 4's ">3× displayed" rule) — the first
 *     clip fills, the remainder rests and is worked on later ticks.
 *   - Shorts are always locatable. That is a simulation difference and it is
 *     labeled as one.
 *
 * Everything here is deterministic: same inputs, same fill, every time. That is
 * what makes the smoke test able to assert on an execution chain at all.
 */
import type { OrderType, PositionEffect } from '@shared/api';

export const SLIPPAGE_BPS = 2;
export const SPREAD_PROXY_BPS = 5;
export const DISPLAYED_SIZE_PROXY = 500;
export const PARTIAL_MULTIPLE = 3;

/** Tolerance between preview and submit before the preview must be redone. */
export const TOLERANCE_BPS: Record<string, number> = { day_trade: 25, swing: 50, invest: 50 };
/** How long a preview is good for (02 §4 / 03 Unit 4). */
export const PREVIEW_TTL_S: Record<string, number> = { day_trade: 60, swing: 600, invest: 600 };

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/* ------------------------------------------------------------------ */
/* Side semantics — position_effect is the authority, never bare buy/sell */
/* ------------------------------------------------------------------ */

export function isBuySide(side: PositionEffect): boolean {
  return side === 'buy_to_open' || side === 'buy_to_cover';
}

export function opensPosition(side: PositionEffect): boolean {
  return side === 'buy_to_open' || side === 'sell_short';
}

export function directionFor(side: PositionEffect): 'long' | 'short' {
  return side === 'buy_to_open' || side === 'sell_to_close' ? 'long' : 'short';
}

/** The side that closes a position of this direction. */
export function closingSide(direction: 'long' | 'short'): PositionEffect {
  return direction === 'long' ? 'sell_to_close' : 'buy_to_cover';
}

export const SIDE_LABEL: Record<PositionEffect, string> = {
  buy_to_open: 'Buy',
  sell_to_close: 'Sell',
  sell_short: 'Short',
  buy_to_cover: 'Cover',
};

/* ------------------------------------------------------------------ */
/* Fill evaluation                                                      */
/* ------------------------------------------------------------------ */

export type FillInput = {
  side: PositionEffect;
  type: OrderType;
  qty: number;
  /** Last delayed print. `null` means we cannot fill anything. */
  last: number | null;
  limitPrice?: number | null;
  stopPrice?: number | null;
};

export type FillDecision = {
  /** true when this order transacts against the current print. */
  fills: boolean;
  price: number | null;
  /** Shares that fill now. Less than `qty` means a partial (rest stays open). */
  qty: number;
  partial: boolean;
  /** Why it did or did not fill, in a sentence a beginner can read. */
  plain: string;
};

/** Half of the spread proxy, in dollars, at this price. */
function halfSpread(price: number): number {
  return (price * (SPREAD_PROXY_BPS / 10_000)) / 2;
}

/**
 * What a marketable order pays. A buyer pays the proxy offer plus slippage; a
 * seller receives the proxy bid minus slippage.
 */
export function marketablePrice(side: PositionEffect, last: number): number {
  const adj = halfSpread(last) + last * (SLIPPAGE_BPS / 10_000);
  return round2(isBuySide(side) ? last + adj : last - adj);
}

/** How many shares can fill on one print. */
export function fillableQty(qty: number): { now: number; partial: boolean } {
  const clip = DISPLAYED_SIZE_PROXY * PARTIAL_MULTIPLE;
  if (qty <= clip) return { now: qty, partial: false };
  return { now: clip, partial: true };
}

/**
 * `stop` / `stop_limit` legs trigger, they do not "fill" on their own: a stop
 * for a long triggers when price trades AT OR BELOW the stop; a stop for a
 * short triggers at or above it.
 */
export function stopTriggered(side: PositionEffect, stopPrice: number, last: number): boolean {
  // A stop that closes a long is a sell → it triggers on the way down.
  return isBuySide(side) ? last >= stopPrice : last <= stopPrice;
}

export function targetReached(side: PositionEffect, targetPrice: number, last: number): boolean {
  // A target that closes a long is a sell → it is reached on the way up.
  return isBuySide(side) ? last <= targetPrice : last >= targetPrice;
}

export function evaluateFill(input: FillInput): FillDecision {
  const { side, type, qty, last } = input;
  if (last === null || !Number.isFinite(last) || last <= 0) {
    return {
      fills: false,
      price: null,
      qty: 0,
      partial: false,
      plain: 'I have no price for this one right now, so nothing can fill.',
    };
  }

  const buy = isBuySide(side);
  const clip = fillableQty(qty);
  const partialNote = clip.partial
    ? ` Only ${clip.now} of ${qty} fill on this print — the rest stays open and works on the next one.`
    : '';

  if (type === 'market') {
    const price = marketablePrice(side, last);
    return {
      fills: true,
      price,
      qty: clip.now,
      partial: clip.partial,
      plain: `Filled against the last delayed print of $${round2(last)} at $${price}.${partialNote}`,
    };
  }

  if (type === 'limit') {
    const limit = input.limitPrice ?? null;
    if (limit === null) {
      return { fills: false, price: null, qty: 0, partial: false, plain: 'A limit order needs a limit price.' };
    }
    // Buy limit fills when the print is at or below the limit; sell limit when
    // it is at or above. The fill never prints worse than the limit.
    const crossed = buy ? last <= limit : last >= limit;
    if (!crossed) {
      return {
        fills: false,
        price: null,
        qty: 0,
        partial: false,
        plain: buy
          ? `Resting. It fills if price trades down to $${round2(limit)} — the last print is $${round2(last)}.`
          : `Resting. It fills if price trades up to $${round2(limit)} — the last print is $${round2(last)}.`,
      };
    }
    const raw = marketablePrice(side, last);
    const price = round2(buy ? Math.min(raw, limit) : Math.max(raw, limit));
    return {
      fills: true,
      price,
      qty: clip.now,
      partial: clip.partial,
      plain: `Price crossed your limit of $${round2(limit)}, so it filled at $${price}.${partialNote}`,
    };
  }

  // stop / stop_limit
  const stop = input.stopPrice ?? null;
  if (stop === null) {
    return { fills: false, price: null, qty: 0, partial: false, plain: 'A stop order needs a stop price.' };
  }
  if (!stopTriggered(side, stop, last)) {
    return {
      fills: false,
      price: null,
      qty: 0,
      partial: false,
      plain: `Armed. It triggers if price reaches $${round2(stop)} — the last print is $${round2(last)}.`,
    };
  }
  if (type === 'stop_limit') {
    const limit = input.limitPrice ?? stop;
    const acceptable = buy ? last <= limit : last >= limit;
    if (!acceptable) {
      return {
        fills: false,
        price: null,
        qty: 0,
        partial: false,
        plain: `Your stop triggered at $${round2(stop)}, but price is already past your limit of $${round2(limit)} — nothing filled.`,
      };
    }
    const price = round2(buy ? Math.min(marketablePrice(side, last), limit) : Math.max(marketablePrice(side, last), limit));
    return {
      fills: true,
      price,
      qty: clip.now,
      partial: clip.partial,
      plain: `Stop triggered at $${round2(stop)} and filled at $${price}.${partialNote}`,
    };
  }
  const price = marketablePrice(side, last);
  return {
    fills: true,
    price,
    qty: clip.now,
    partial: clip.partial,
    plain: `Stop triggered at $${round2(stop)} and filled at $${price}. A stop is not a guaranteed price — it becomes a market order when it triggers.${partialNote}`,
  };
}

/* ------------------------------------------------------------------ */
/* P/L                                                                  */
/* ------------------------------------------------------------------ */

export function unrealized(direction: 'long' | 'short', qty: number, avgCost: number, mark: number | null): number | null {
  if (mark === null || !Number.isFinite(mark)) return null;
  const per = direction === 'long' ? mark - avgCost : avgCost - mark;
  return round2(per * qty);
}

export function realized(direction: 'long' | 'short', qty: number, avgCost: number, exit: number): number {
  const per = direction === 'long' ? exit - avgCost : avgCost - exit;
  return round2(per * qty);
}

/** Cash effect of a fill on a paper account. Shorts credit, covers debit. */
export function cashDelta(side: PositionEffect, qty: number, price: number): number {
  const notional = qty * price;
  return round2(isBuySide(side) ? -notional : notional);
}

export function toleranceBpsFor(mode: string): number {
  return TOLERANCE_BPS[mode] ?? 25;
}

export function previewTtlFor(mode: string): number {
  return PREVIEW_TTL_S[mode] ?? 60;
}

/** How far the price has moved since the preview, in basis points. */
export function driftBps(previewPrice: number, now: number): number {
  if (!previewPrice) return 0;
  return Math.abs((now - previewPrice) / previewPrice) * 10_000;
}
