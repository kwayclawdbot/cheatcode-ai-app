/**
 * Trade landing in the audit's brokerage hierarchy (09 §7) — lane MOBILE-B.
 *
 *   1 account value · day change · buying power · PAPER
 *   2 positions · open orders · needs action
 *   3 watchlist · recent
 *   4 search · discovery
 *   5 Kai opportunities (a labelled section, never the page)
 *
 * `src/lib/types.ts` (lane MOBILE-A) keeps the round-2 `TradeLanding`; this is
 * the restructured payload and is adapted from EITHER shape by trade-api.ts, so
 * the screen renders real data against today's API and richer data once API-3
 * lands the new `/trade/landing`.
 */
import type { GradedSetup, Instrument, Mover, Quote } from '../../lib/types';
import type { OrderRow } from '../orders/types';
import type { PositionRow } from '../positions/types';

export type TradeAccount = {
  value: number | null;
  day_change: number | null;
  day_change_pct: number | null;
  buying_power: number | null;
  kind: 'paper' | 'broker';
  /** "PAPER" — the label the strip prints. Never "portfolio". */
  label: string;
  plain: string | null;
};

/** Anything that is waiting on the user: a triggered alert, a plan, an order. */
export type NeedsActionItem = {
  id: string;
  kind: 'order' | 'position' | 'plan' | 'alert' | 'setup';
  symbol: string | null;
  title: string;
  detail: string | null;
  /** Plain-language action, per the audit's language table. */
  action_label: string;
  route: string;
  tone: 'gold' | 'volt' | 'live';
};

export type TradeLandingV2 = {
  account: TradeAccount | null;
  positions: PositionRow[];
  open_orders: OrderRow[];
  needs_action: NeedsActionItem[];
  watchlist: Instrument[];
  recent: Instrument[];
  discovery: { movers: Mover[]; catalysts: { label: string; when: string }[] };
  kai_opportunities: GradedSetup[];
  /** What is honestly not live yet on this stack. */
  notices: string[];
  market_quote: Quote | null;
};
