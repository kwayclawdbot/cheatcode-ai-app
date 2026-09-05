/**
 * Fixtures for the paper-execution arc (EXPO_PUBLIC_FIXTURES=1).
 *
 * The numbers are the artboard's own — V4-TR3 (META, 1.29 shares, limit 504,
 * $650.16, buying power after $2,769.84, max planned loss $58.00 / 8.9%) and
 * V3-T1 (entry 504 · target 540 · stop 460, +$46 / −$58, cap $58 of $60) — so
 * a fixtures screenshot can be laid over the board and compared.
 *
 * These are SAMPLES. They only ever render when there is no live stack; on a
 * real account an unshipped endpoint says so instead (see trade-api.ts).
 */
import type { Quote } from '../../lib/types';
import type { OrderPreview, OrderRow, Plan, RiskCheck } from './types';

const now = () => new Date();
const iso = (msFromNow: number) => new Date(Date.now() + msFromNow).toISOString();

export const fixtureQuote: Quote = {
  symbol: 'META',
  price: 504.18,
  change: 10.56,
  change_pct: 2.14,
  freshness: 'delayed',
  delay_reason: 'entitlement',
  source_ts: new Date(Date.now() - 15 * 60_000).toISOString(),
};

/** "9:41:02 AM ET" in the artboard; here it is the real clock, honestly. */
export function clockLabel(d: Date = now()): string {
  return `${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })} ET`;
}

const PASS: RiskCheck = {
  verdict: 'pass',
  headline: 'Fits your $60 daily-risk rule and your position-size limit.',
  advisories: [],
  blockers: [],
};

/**
 * The artboard's own sentence, rendered honestly: a jump to 58% tech exposure
 * is an advisory, so the header says "1 thing to know" in gold — not "Passes"
 * in green. This is the round-3 correction, and it is the default fixture.
 */
const ADVISORY: RiskCheck = {
  verdict: 'advisory',
  headline: 'Fits your $60 daily-risk rule.',
  advisories: [
    { code: 'CONCENTRATION', message: 'Tech becomes 58% of this account.' },
  ],
  blockers: [],
};

const BLOCKER: RiskCheck = {
  verdict: 'blocker',
  headline: "You have used your daily loss cap. I can't place this one.",
  advisories: [
    { code: 'CONCENTRATION', message: 'Tech becomes 58% of this account.' },
  ],
  blockers: [
    { code: 'RISK_LIMIT_DAILY_LOSS', message: 'Today’s losses already reach your $60 cap. This resets tomorrow.' },
  ],
};

function preview(risk: RiskCheck, id: string): OrderPreview {
  return {
    preview_id: id,
    symbol: 'META',
    name: 'Meta Platforms, Inc.',
    exchange: 'NASDAQ',
    side: 'buy_to_open',
    side_label: 'Buy',
    qty: 1.29,
    fractional: true,
    order_type: 'limit',
    limit_price: 504,
    stop_price: null,
    duration: 'day',
    est_cost: 650.16,
    est_fees: 0,
    buying_power: 3420,
    buying_power_after: 2769.84,
    quote: fixtureQuote,
    quote_clock: clockLabel(),
    risk,
    stop_attached: 460,
    first_target: 540,
    max_loss: 58,
    max_loss_pct: 8.9,
    expires_at: iso(60_000),
    account_label: 'Practice · Individual',
    account_kind: 'paper',
    connected: true,
    confirm_label: null,
    hard_stop_plain: 'You can lose up to $58.00 on this order if the stop executes.',
    footer_plain: null,
    disclosures: [
      'Paper fills use delayed prices, so your fill can differ from a real one.',
      'Nothing is sent until you confirm.',
    ],
  };
}

export const fixturePreviewPass = () => preview(PASS, 'prev-pass');
export const fixturePreviewAdvisory = () => preview(ADVISORY, 'prev-advisory');
export const fixturePreviewBlocker = () => preview(BLOCKER, 'prev-blocker');

/** Default: the artboard's own case, told honestly. */
export const fixturePreview = fixturePreviewAdvisory;

/** Accepted is a real, distinct state — the order exists and has not filled. */
export const fixtureAcceptedOrder = (): OrderRow => ({
  id: 'ord-fixture-1',
  symbol: 'META',
  side: 'buy_to_open',
  side_label: 'Buy',
  qty: 1.29,
  filled_qty: 0,
  order_type: 'limit',
  limit_price: 504,
  stop_price: null,
  duration: 'day',
  status: 'accepted',
  status_label: 'Accepted — waiting to fill',
  status_detail: 'Your limit is $504.00. It fills when the price comes to it.',
  avg_fill_price: null,
  submitted_at: new Date().toISOString(),
  filled_at: null,
  position_id: null,
  paper: true,
});

export const fixtureFilledOrder = (): OrderRow => ({
  ...fixtureAcceptedOrder(),
  filled_qty: 1.29,
  status: 'filled',
  status_label: 'Filled',
  status_detail: 'Filled 1.29 shares at $504.00 on a delayed price.',
  avg_fill_price: 504,
  filled_at: new Date().toISOString(),
  position_id: 'pos-meta',
});

export const fixtureOpenOrders = (): OrderRow[] => [fixtureAcceptedOrder()];

export const fixturePlan = (symbol = 'META'): Plan => ({
  id: 'plan-fixture-1',
  // A complete plan: an entry AND a level that says it was wrong, so there is
  // nothing to explain away. `fixtureUngradedPlan` below is the other case.
  no_plan_plain: null,
  symbol,
  name: symbol === 'META' ? 'Meta Platforms, Inc.' : null,
  side: 'long',
  entry: 504,
  stop: 460,
  targets: [540],
  size_shares: 1.29,
  size_notional: 650,
  size_plain: 'Sized to risk $58 — inside your daily cap and your position limit.',
  rr: 0.82,
  if_target: 46,
  if_stopped: -58,
  daily_cap: { cap: 60, used: 58 },
  exit_style: 'auto',
  status: 'draft',
  quote: { ...fixtureQuote, price: 508.4 },
  setup_id: 'setup-meta-1',
  order_state: 'No order yet — nothing is placed until you review it.',
});

/**
 * A symbol with NO GRADED SETUP, which is the ordinary case and the one the
 * screen used to get wrong.
 *
 * The route used to answer this shape with `entry: 178.42` — the last traded
 * price with the word "entry" over it — and the plan screen printed it into an
 * Entry tile. Here there is no entry, no stop, no target, no size, and the
 * reason is carried in words so the screen can print it where the price was.
 *
 * The quote is still real and still shown, because what a stock last traded at
 * is a fact. It just is not an entry.
 */
export const fixtureUngradedPlan = (symbol: string): Plan => ({
  id: null,
  no_plan_plain:
    `I have no graded setup on ${symbol}, so I have no entry and no stop to give you. `
    + 'What it last traded at is not an entry — putting that number here would make a '
    + 'guess look like a plan. Set the levels yourself if you want to build one anyway.',
  symbol,
  name: null,
  side: 'long',
  entry: null,
  stop: null,
  targets: [],
  size_shares: null,
  size_notional: null,
  size_plain:
    'Without both an entry and a level that says you were wrong, there is no risk to '
    + 'size against — so I will not put a number on it.',
  rr: null,
  if_target: null,
  if_stopped: null,
  daily_cap: { cap: 60, used: 0 },
  exit_style: 'auto',
  status: 'draft',
  quote: { ...fixtureQuote, symbol, price: 178.42 },
  setup_id: null,
  order_state: `Nothing working on ${symbol} right now.`,
});
