/**
 * THE ARITHMETIC BEHIND AN ORDER — pure, and in its own file so it has a test.
 *
 * `useTake.ts` reaches the network and React, which means anything living in it
 * cannot be run by a plain node process. Sizing and the receipt sentence are the
 * two things on the Take beat most worth pinning down — one decides how much
 * money is at risk, the other decides whether a person believes their order
 * filled — so they live here, where `scripts/trade-read-test.mts` can reach them.
 *
 * NOTHING HERE INVENTS A NUMBER. A size it cannot derive comes back null with a
 * sentence saying why, never as 1, and never as 0.
 */
import type { OrderSide, OrderTicket } from '../orders/types';
import { entrySideFor } from '../orders/types';
import type { TradePortal } from '../portal/types';
import type { OrderRow } from '../orders/types';
import type { TradeRead } from './read';

export type TakeSize = {
  shares: number | null;
  /** How the share count was arrived at, in words. Never a bare number. */
  plain: string;
  /** The dollars at risk if the stop executes, at this size. */
  risk_usd: number | null;
};

/**
 * How many shares, and why that many.
 *
 * The most the account can lose at the stop is the user's own risk budget, so
 * the size is that budget divided by the distance from entry to stop. Whole
 * shares, rounded DOWN — rounding up would put the loss above the cap the
 * number was derived from.
 *
 * Returns null shares when the budget is unknown. It does NOT fall back to "1",
 * which would be a size nobody chose.
 */
export function sizeFor(read: TradeRead, portal: TradePortal): TakeSize {
  const entry = read.because.find((l) => l.key === 'entry')?.price ?? null;
  const stop = read.because.find((l) => l.key === 'stop')?.price ?? null;
  const budget = portal.plan?.risk_dollars ?? null;
  const perShare = entry != null && stop != null ? Math.abs(entry - stop) : null;

  if (perShare == null || perShare <= 0) {
    return { shares: null, plain: 'I cannot size this without an entry and a stop.', risk_usd: null };
  }
  if (budget == null || budget <= 0) {
    return {
      shares: null,
      plain: portal.plan?.size_plain
        ?? 'I do not have your risk budget on this stack, so I am not going to pick a size for you.',
      risk_usd: null,
    };
  }
  const shares = Math.floor(budget / perShare);
  if (shares < 1) {
    return {
      shares: null,
      plain: `One share risks $${perShare.toFixed(2)}, which is already more than the $${budget.toFixed(0)} you allow on one idea.`,
      risk_usd: null,
    };
  }
  return {
    shares,
    plain: `${shares} share${shares === 1 ? '' : 's'} — the most that keeps the loss at the stop under $${budget.toFixed(0)}.`,
    risk_usd: shares * perShare,
  };
}

/** The ticket the preview is priced from. Paper account only — there is no broker. */
export function ticketFor(read: TradeRead, portal: TradePortal, shares: number | null): OrderTicket | null {
  if (shares == null || shares <= 0) return null;
  const side: OrderSide = entrySideFor(read.direction === 'short' ? 'short' : 'long');
  return {
    symbol: read.symbol,
    side,
    qty: shares,
    amount: null,
    // Market, because the entry is an area and a limit at its low edge simply
    // never fills on the day the setup works. The card prints the price the
    // preview came back with, so nothing is hidden by that choice.
    order_type: 'market',
    limit_price: null,
    stop_price: null,
    duration: 'day',
    plan_id: portal.plan?.id ?? null,
    // The setup the levels came off, when the annotations name one. It is what
    // lets the server tie the order back to the thing that was graded.
    setup_id: portal.annotations.find((a) => a.source_setup_id)?.source_setup_id ?? null,
  };
}

/** The sentence on the receipt. Reads the engine's own status, never ahead of it. */
export function receiptLine(o: OrderRow): string {
  const qty = o.filled_qty ?? o.qty;
  const size = qty == null ? '' : ` ${qty} ${qty === 1 ? 'share' : 'shares'} of`;
  if (o.status === 'filled') {
    return `Sent and filled${size} ${o.symbol}${o.avg_fill_price != null ? ` at $${o.avg_fill_price.toFixed(2)}` : ''}. It is a position now.`;
  }
  if (o.status === 'partially_filled') {
    return `Part of it filled${o.avg_fill_price != null ? ` at $${o.avg_fill_price.toFixed(2)}` : ''}. The rest is still working.`;
  }
  if (o.status === 'cancelled') return `That ${o.symbol} order was cancelled. Nothing was bought.`;
  if (o.status === 'rejected') return `That ${o.symbol} order was rejected. Nothing was bought.`;
  return `Sent.${size ? `${size} ${o.symbol} is` : ` ${o.symbol} is`} accepted and waiting to fill — accepted is not filled, and I will say so when it is.`;
}
