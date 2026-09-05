/**
 * Order ticket · preview · submitted order · trade plan (lane MOBILE-B).
 *
 * Shapes follow docs/BUILD-BRIEF-round-3.md §"Paper execution" and the API-3
 * endpoint list. Everything is optional-tolerant on the wire: API-3 is landing
 * these routes in parallel, and a missing field must render as "not known"
 * rather than as a confident zero.
 *
 * PAPER ONLY. There is no broker, so nothing here may say "Submit to broker".
 */
import type { Quote } from '../../lib/types';

/** The four position effects the paper engine matches on. */
export type OrderSide = 'buy_to_open' | 'sell_to_close' | 'sell_short' | 'buy_to_cover';
export type OrderType = 'market' | 'limit' | 'stop';
export type OrderDuration = 'day' | 'gtc';

/** 03 Unit 4 status flow. `accepted` is NOT `filled`, anywhere, ever. */
export type OrderStatus =
  | 'draft' | 'previewed' | 'submitted' | 'accepted'
  | 'partially_filled' | 'filled' | 'cancelled' | 'rejected';

export const SIDE_LABEL: Record<OrderSide, string> = {
  buy_to_open: 'Buy',
  sell_to_close: 'Sell',
  sell_short: 'Short',
  buy_to_cover: 'Cover',
};

/** Which way the money moves — drives volt/red and the "cost" vs "proceeds" word. */
export const isBuySide = (s: OrderSide) => s === 'buy_to_open' || s === 'buy_to_cover';

/**
 * Kai's answer on an order.
 *
 * `advisory` exists precisely so a 58% sector concentration cannot be painted
 * green as "Passes" (round-3 brief). Three states, three colours, no rounding
 * an advisory up to a pass.
 */
export type RiskVerdict = 'pass' | 'advisory' | 'blocker';
export type RiskFinding = { code: string; message: string };
export type RiskCheck = {
  verdict: RiskVerdict;
  /** One sentence, plain language. */
  headline: string;
  advisories: RiskFinding[];
  blockers: RiskFinding[];
};

export type OrderTicket = {
  symbol: string;
  side: OrderSide;
  /** Exactly one of qty / amount is used; `amount` allows fractional shares. */
  qty: number | null;
  amount: number | null;
  order_type: OrderType;
  limit_price: number | null;
  stop_price: number | null;
  duration: OrderDuration;
  plan_id: string | null;
  setup_id: string | null;
};

export type OrderPreview = {
  preview_id: string;
  symbol: string;
  name: string | null;
  exchange: string | null;
  side: OrderSide;
  side_label: string;
  qty: number | null;
  /** True when the size was expressed in dollars — the ticket said "$650". */
  fractional: boolean;
  order_type: OrderType;
  limit_price: number | null;
  stop_price: number | null;
  duration: OrderDuration;
  est_cost: number | null;
  est_fees: number | null;
  buying_power: number | null;
  buying_power_after: number | null;
  quote: Quote | null;
  /** "9:41:02 AM ET" — the artboard footer prints the quote clock verbatim. */
  quote_clock: string | null;
  risk: RiskCheck;
  /** The bracket the plan attaches. */
  stop_attached: number | null;
  first_target: number | null;
  max_loss: number | null;
  max_loss_pct: number | null;
  /** ISO. Past it the preview must be taken again before anything is sent. */
  expires_at: string | null;
  account_label: string;
  account_kind: 'paper' | 'broker';
  connected: boolean;
  /** The server's own primary label, kept only when it is not broker wording. */
  confirm_label: string | null;
  disclosures: string[];
  /** "You can lose up to $X on this order if the stop executes." */
  hard_stop_plain: string | null;
  /** "Nothing is sent until you confirm · quote 9:41:02 AM ET · delayed" */
  footer_plain: string | null;
};

export type OrderRow = {
  id: string;
  symbol: string;
  side: OrderSide;
  side_label: string;
  qty: number | null;
  filled_qty: number | null;
  order_type: OrderType;
  limit_price: number | null;
  stop_price: number | null;
  duration: OrderDuration;
  status: OrderStatus;
  /** "Accepted — waiting to fill" / "Filled" — never the raw enum. */
  status_label: string;
  status_detail: string | null;
  avg_fill_price: number | null;
  submitted_at: string | null;
  filled_at: string | null;
  position_id: string | null;
  /** Paper fills use delayed prices — the copy says so on the order itself. */
  paper: boolean;
};

/* ------------------------------------------------------------------ */
/* Trade plan (V3-T1)                                                   */
/* ------------------------------------------------------------------ */

export type PlanStatus = 'draft' | 'active' | 'cancelled' | 'filled';
/** `auto` attaches real exit legs; `alert_assisted` pushes and lets you tap. */
export type ExitStyle = 'auto' | 'alert_assisted';

export type Plan = {
  id: string | null;
  symbol: string;
  name: string | null;
  side: 'long' | 'short';
  entry: number | null;
  stop: number | null;
  targets: number[];
  size_shares: number | null;
  size_notional: number | null;
  /** The server's sentence about the size — including why it is zero. */
  size_plain: string | null;
  rr: number | null;
  /** Scenario tiles: what this makes, what it costs. Dollars, not R. */
  if_target: number | null;
  if_stopped: number | null;
  daily_cap: { cap: number | null; used: number | null };
  exit_style: ExitStyle;
  status: PlanStatus;
  quote: Quote | null;
  setup_id: string | null;
  /** "No order yet" / "Order accepted" — the decision chain, in one line. */
  order_state: string | null;
  /**
   * Why there is no plan here, in words, when there is not one.
   *
   * A plan needs an entry AND a level that says it was wrong. When either is
   * missing the screen prints this instead of leaving the reader to work out
   * what three dashes mean. See `plan-read.ts` for the rule and for the fake
   * entry it exists to stop.
   */
  no_plan_plain: string | null;
};

export type PlanActionName = 'activate' | 'cancel' | 'adjust_stop' | 'adjust_target' | 'set_exit_style';

/** Which order side a plan's entry becomes. */
export const entrySideFor = (side: 'long' | 'short'): OrderSide =>
  side === 'short' ? 'sell_short' : 'buy_to_open';
