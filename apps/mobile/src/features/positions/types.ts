/**
 * Positions (V3-P1) — lane MOBILE-B.
 *
 * A position is the only object on this surface that costs real (paper) money
 * while you are not looking at it, so every row carries three things: what it
 * is worth now, how close it is to its stop, and whether there is anything to
 * do. "Nothing to do" is a first-class answer.
 */
import type { Quote } from '../../lib/types';

/** Healthy / At risk are the artboard's two live states; closed is history. */
export type PositionHealth = 'healthy' | 'at_risk' | 'closed';

export type PositionRow = {
  id: string;
  symbol: string;
  name: string | null;
  side: 'long' | 'short';
  qty: number | null;
  avg_entry: number | null;
  /** Cost basis, so the card can say "Long · $650". */
  notional: number | null;
  mark_price: number | null;
  mark_ts: string | null;
  quote: Quote | null;
  unrealized_pnl: number | null;
  unrealized_pnl_pct: number | null;
  realized_pnl: number | null;
  /** Today's move on this position — what the {{ plMain }} headline sums. */
  day_pnl: number | null;
  /** "in 2h" / "1% from stop" — the small line beside the P/L. */
  pnl_detail: string | null;
  stop: number | null;
  target: number | null;
  health: PositionHealth;
  health_label: string;
  /** Kai's one line: "Thesis intact — nothing to do." */
  kai_line: string | null;
  /** True when there is genuinely nothing to do — no buttons are drawn. */
  nothing_to_do: boolean;
  status: 'open' | 'closed';
  opened_at: string | null;
  closed_at: string | null;
  origin_plan_id: string | null;
  origin_setup_id: string | null;
  exit_style: 'auto' | 'alert_assisted' | null;
  debrief_id: string | null;
  has_debrief: boolean;
  /** Dev-simulated trades are labeled, always. */
  simulated: boolean;
  paper: boolean;
};

export type PositionsPayload = {
  positions: PositionRow[];
  /** {{ plMain }} on the artboard: today's P/L across open positions. */
  today_pnl: number | null;
  open_count: number;
  daily_risk: { cap: number | null; used: number | null };
  empty_copy: string;
};

/** Position detail = the plan it came from, beside where it actually is. */
export type PositionDetail = PositionRow & {
  plan_entry: number | null;
  plan_stop: number | null;
  plan_target: number | null;
  plan_id: string | null;
  /** The server's own plan-vs-now table, when it sends one. */
  plan_vs_now: {
    label: string; planned: string; now: string;
    semantic: 'positive' | 'neutral' | 'risk';
  }[];
  /** The decision chain, as plain sentences. */
  history: { label: string; detail: string | null; at: string | null }[];
};
