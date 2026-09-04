/**
 * TAKE IT — the third beat, and the only one that spends anything.
 *
 * War Room UX §5 is the contract: an Order Confirmation Card materialises with
 * entry, stop, target, size, risk and R-multiple on it, two buttons, and then —
 * the line that governs this whole file — "No tap-to-send is ever silent. Every
 * order has a voice confirmation + visual receipt."
 *
 * So this hook has exactly three states a person can see: the card they are
 * being asked to confirm, the moment it is going, and a receipt that says what
 * happened. There is no fourth state where something was sent and the screen
 * looks the same as before.
 *
 * IT DOES NOT REIMPLEMENT PAPER EXECUTION. `tradeApi.preview` → `tradeApi.submit`
 * → `tradeApi.order` is the same path `/order/new` → `/order/review` →
 * `/order/confirmed` has always walked, and those screens still work untouched.
 * This is that path with the three screens collapsed into one card, because the
 * decision was already made in beat two and walking to another screen to repeat
 * it is how a person loses the thread.
 *
 * ACCEPTED IS NOT FILLED. The receipt reads the order back and reports whatever
 * the engine says, including "waiting to fill". Saying "filled" early would be
 * the one lie that costs real money to discover.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { tradeApi } from '../../lib/trade-api';
import type { OrderPreview, OrderRow } from '../orders/types';
import type { TradePortal } from '../portal/types';
import type { TradeRead } from './read';
import { receiptLine, sizeFor, ticketFor, type TakeSize } from './order-math';

/** Re-exported so the Take beat has one import, and the test has a pure one. */
export { receiptLine, sizeFor, ticketFor } from './order-math';
export type { TakeSize } from './order-math';

export type TakePhase = 'idle' | 'preparing' | 'confirm' | 'sending' | 'receipt' | 'failed';

export type TakeState = {
  phase: TakePhase;
  preview: OrderPreview | null;
  order: OrderRow | null;
  size: TakeSize | null;
  /** The sentence the receipt says out loud. Never empty once an order exists. */
  receipt_plain: string | null;
  error: string | null;
};

const FILL_POLLS = 4;
const FILL_EVERY_MS = 1400;

export function useTake(read: TradeRead | null, portal: TradePortal | null) {
  const [state, setState] = useState<TakeState>({
    phase: 'idle', preview: null, order: null, size: null, receipt_plain: null, error: null,
  });
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const reset = useCallback(() => {
    setState({ phase: 'idle', preview: null, order: null, size: null, receipt_plain: null, error: null });
  }, []);

  /** Build the confirmation card. Nothing is sent by this. */
  const prepare = useCallback(async () => {
    if (!read || !portal || !read.takeable) return;
    const size = sizeFor(read, portal);
    const ticket = ticketFor(read, portal, size.shares);
    if (!ticket) {
      setState({ phase: 'failed', preview: null, order: null, size, receipt_plain: null, error: size.plain });
      return;
    }
    setState((s) => ({ ...s, phase: 'preparing', size, error: null }));
    try {
      const preview = await tradeApi.preview(ticket);
      if (!alive.current) return;
      setState({ phase: 'confirm', preview, order: null, size, receipt_plain: null, error: null });
    } catch (e) {
      if (!alive.current) return;
      setState({
        phase: 'failed', preview: null, order: null, size, receipt_plain: null,
        error: e instanceof Error ? e.message : 'I could not price that order just now.',
      });
    }
  }, [read, portal]);

  /**
   * Send it, then say what happened.
   *
   * The receipt is written the moment the engine answers, and then re-written
   * every time the order is read back, so "Accepted — waiting to fill" becomes
   * "Filled at 504.62" on its own without the user having to go looking.
   */
  const send = useCallback(async () => {
    const preview = state.preview;
    if (!preview) return;
    setState((s) => ({ ...s, phase: 'sending', error: null }));
    let placed: OrderRow;
    try {
      placed = await tradeApi.submit(preview.preview_id);
    } catch (e) {
      if (!alive.current) return;
      setState((s) => ({
        ...s, phase: 'confirm',
        error: e instanceof Error ? e.message : 'That order was not sent. Nothing has left your account.',
      }));
      return;
    }
    if (!alive.current) return;
    setState((s) => ({ ...s, phase: 'receipt', order: placed, receipt_plain: receiptLine(placed) }));

    // Read it back until it settles. The paper engine fills against a delayed
    // price, so a market order is usually accepted first and filled a beat later.
    for (let i = 0; i < FILL_POLLS; i += 1) {
      await new Promise((r) => setTimeout(r, FILL_EVERY_MS));
      if (!alive.current) return;
      try {
        const fresh = await tradeApi.order(placed.id);
        if (!alive.current) return;
        setState((s) => (s.order && s.order.id === fresh.id
          ? { ...s, order: fresh, receipt_plain: receiptLine(fresh) }
          : s));
        if (fresh.status === 'filled' || fresh.status === 'cancelled' || fresh.status === 'rejected') return;
      } catch {
        // The order exists; only the re-read failed. The receipt keeps saying
        // what we last knew rather than pretending the order vanished.
        return;
      }
    }
  }, [state.preview]);

  return { ...state, prepare, send, reset };
}
