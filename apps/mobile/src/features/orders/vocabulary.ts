/**
 * ONE EXECUTION VOCABULARY — audit F08 (P1).
 *
 * The audit's evidence: the portal's confirmation card said "Send it" while the
 * dedicated review screen said "Place paper order". Two names for the one act
 * that spends something. A friendly phrase is not enough when it changes an
 * order, so this file is the single list of the words, and every entry point
 * imports them rather than typing its own.
 *
 * F08 names the set exactly:
 *
 *     Track setup · Activate alert · Review paper order · Place paper order ·
 *     View order · Review position
 *
 * Two of those (`track_setup`, `activate_alert`) belong to surfaces this lane
 * does not own — the alert card and the setup list. They are declared here
 * anyway, because the point of the list is that it is one list; when those
 * screens are next touched there is a name waiting for them rather than a
 * fresh invention.
 *
 * THE OTHER HALF OF F08 is the object-state table. An idea, a watched alert, a
 * drafted plan, a submitted order and a position are five different things and
 * a member has to be able to tell which one they are looking at. `STATE` below
 * is that table, verbatim from the audit: where the object is now, what the
 * member should understand, and ONE next action. Not three. One.
 *
 * NOTHING HERE RENDERS OR FETCHES. It is words and a small amount of arithmetic
 * on statuses, so the lifecycle can be asserted in `paper-lifecycle-test.mts`
 * without a React tree.
 */
import type { OrderRow, OrderStatus } from './types';

/* ------------------------------------------------------------------ */
/* The actions                                                          */
/* ------------------------------------------------------------------ */

export type ExecutionAction =
  | 'track_setup'
  | 'activate_alert'
  | 'review_paper_order'
  | 'place_paper_order'
  | 'view_order'
  | 'review_position';

/** The label. The SAME label, at every entry point that offers the action. */
export const ACTION_LABEL: Record<ExecutionAction, string> = {
  track_setup: 'Track setup',
  activate_alert: 'Activate alert',
  review_paper_order: 'Review paper order',
  place_paper_order: 'Place paper order',
  view_order: 'View order',
  review_position: 'Review position',
};

/**
 * Closing a position is an ORDER, and it goes through the same review screen as
 * every other order — so it is the same two-step verb, said about the exit.
 * The board's own words, and the reason "Exit now" is gone: "now" promised an
 * immediacy the flow does not have and never had.
 */
export const EXIT_REVIEW_LABEL = 'Exit paper position';
export const EXIT_PLACE_LABEL = 'Place paper exit';

/**
 * What the button says when it is doing the thing rather than offering it.
 * Present participle, same verb — a member who read "Place paper order" should
 * not have to work out whether "Sending…" belongs to the button they pressed.
 */
export const PLACING_LABEL = 'Placing…';

/* ------------------------------------------------------------------ */
/* The object states                                                    */
/* ------------------------------------------------------------------ */

export type ObjectState =
  | 'idea'
  | 'planned'
  | 'order_pending'
  | 'position_active'
  | 'closed';

export type StateCopy = {
  /** Where this object is now, in two or three words. */
  label: string;
  /** What the member should understand, in one sentence. */
  plain: string;
  /** ONE next action, or none when the object is finished. */
  next: ExecutionAction | null;
};

/**
 * The audit's table, in code. The `plain` sentences are deliberately about the
 * OBJECT and not about the screen: the strip is reused on the receipt, on the
 * order and on the position, and it has to read correctly on all three.
 */
export const STATE: Record<ObjectState, StateCopy> = {
  idea: {
    label: 'Idea · watching',
    plain: 'No order exists. Kai is watching the level and will tell you if it comes.',
    next: 'track_setup',
  },
  planned: {
    label: 'Planned · ready',
    plain: 'A plan is saved. Check the latest quote and the risk before you confirm anything.',
    next: 'review_paper_order',
  },
  order_pending: {
    label: 'Order working',
    plain: 'The paper order was submitted and has not filled. A position appears after it fills.',
    next: 'view_order',
  },
  position_active: {
    label: 'Position active',
    plain: 'You are in. The planned stop and target are what you decided; the P/L is where price is now.',
    next: 'review_position',
  },
  closed: {
    label: 'Closed',
    plain: 'This one is finished. What happened, and what it cost, is on the debrief.',
    next: null,
  },
};

/** Order status → where the object is. `partially_filled` is still working. */
export function stateForOrderStatus(status: OrderStatus): ObjectState {
  switch (status) {
    case 'draft':
    case 'previewed':
      return 'planned';
    case 'submitted':
    case 'accepted':
    case 'partially_filled':
      return 'order_pending';
    case 'filled':
      return 'position_active';
    case 'cancelled':
    case 'rejected':
      return 'closed';
  }
}

/* ------------------------------------------------------------------ */
/* The receipt's two steps                                              */
/* ------------------------------------------------------------------ */

/**
 * SUBMITTED → FILLED, and nothing in between that pretends to be a fill.
 *
 * The board draws two dots with a line between them: the first filled and
 * captioned "Waiting to fill", the second open and captioned with an em-dash
 * because there is genuinely nothing yet to say. That em-dash is the whole
 * design — an average fill price of "—" is honest; a zero, or the limit price
 * repeated, is not.
 *
 * WHY THIS IS NOT `TradeStatusStrip`. The kit's strip walks the IDEA's life
 * (watching → entry reached → active → closed) and takes no per-step detail.
 * An order's life is a different, shorter thing with a quantity in it, and
 * bending one onto the other would have made "Entry reached" the word for
 * "your order is sitting on the book". The kit's strip is used where the kit's
 * states are true — see `trade-idea.ts` and the position screen.
 */
export type OrderStep = {
  key: 'submitted' | 'filled';
  label: string;
  /** The line under the dot. `null` renders as an em-dash, on purpose. */
  detail: string | null;
  /** Reached: the dot is filled. */
  done: boolean;
  /** The step the object is sitting on right now. */
  current: boolean;
};

const shares = (n: number | null | undefined): string =>
  n == null ? '—' : `${n} ${Math.abs(n) === 1 ? 'share' : 'shares'}`;

/**
 * The two steps for one order, read off the AUTHORITATIVE status — never off
 * what the app hoped happened when it pressed the button. F08's acceptance
 * criterion is that order status resolves uncertainty, so a re-read that says
 * "accepted" walks the tracker back to step one and says so.
 */
export function orderSteps(order: OrderRow): OrderStep[] {
  const filled = order.status === 'filled';
  const dead = order.status === 'cancelled' || order.status === 'rejected';
  const partial = order.status === 'partially_filled'
    || (!filled && (order.filled_qty ?? 0) > 0);

  return [
    {
      key: 'submitted',
      label: 'Submitted',
      detail: dead
        ? order.status_label
        : filled
          ? 'Sent and accepted'
          : partial
            ? `Filled ${shares(order.filled_qty)} of ${shares(order.qty)}`
            : 'Waiting to fill',
      done: true,
      current: !filled && !dead,
    },
    {
      key: 'filled',
      label: dead ? 'Not filled' : 'Filled',
      detail: filled
        ? (order.avg_fill_price != null
          ? `${shares(order.filled_qty ?? order.qty)} at $${order.avg_fill_price.toFixed(2)}`
          : shares(order.filled_qty ?? order.qty))
        : dead
          ? (order.status_detail ?? 'Nothing was placed.')
          : null,
      done: filled,
      current: filled,
    },
  ];
}
