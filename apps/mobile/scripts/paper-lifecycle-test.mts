/**
 * THE PAPER LIFECYCLE, PINNED DOWN.
 *
 *   cd apps/mobile && npx tsx scripts/paper-lifecycle-test.mts
 *
 * WHY THIS FILE EXISTS. Audit F08 is not a copy tweak — its acceptance criteria
 * are behavioural, and every one of them is the kind of thing that decays the
 * moment somebody adds a screen:
 *
 *   1. "The same action has the same name in every entry point." A single
 *      hard-coded "Send it" in a new component undoes it silently, so the check
 *      is a SOURCE SCAN over the screens that place, review and view orders.
 *   2. "Paper is visible at final confirmation and receipt."
 *   3. "Double-tap, timeout and reconnect cannot create ambiguous submissions."
 *      That is a property of the idempotency key, which is why the key lives in
 *      its own dependency-free module.
 *   4. "The state strip should show where this object is now and one next
 *      action." One, not three.
 *
 * Plus the two numeric surfaces the board adds, both of which are ways to print
 * a number nobody measured if they are got wrong: the daily risk budget (which
 * must state an absent cap rather than draw an empty bar) and the preview →
 * `TradeIdea` mapping that feeds the kit's chart and R meter.
 *
 * Everything under test is a pure module. The React screens are checked by
 * reading their source, the same way `no-fake-data-test.mts` checks a rule that
 * cannot be reached from node.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ACTION_LABEL, EXIT_PLACE_LABEL, EXIT_REVIEW_LABEL, PLACING_LABEL, STATE,
  orderSteps, stateForOrderStatus, type ExecutionAction, type ObjectState,
} from '../src/features/orders/vocabulary';
import { dailyBudget } from '../src/features/orders/daily-risk';
import { ideaFromPreview, ideaFromPosition, kitCandles } from '../src/features/orders/trade-idea';
import { submitKeyFor, forgetSubmitKeys } from '../src/features/orders/idempotency';
import type { OrderPreview, OrderRow, OrderStatus } from '../src/features/orders/types';
import type { PositionDetail } from '../src/features/positions/types';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

let failures = 0;
function ok(name: string, cond: unknown, detail?: unknown): void {
  if (cond) { console.log(`  ok   ${name}`); return; }
  failures += 1;
  console.log(`  FAIL ${name}${detail === undefined ? '' : `\n       ${JSON.stringify(detail)}`}`);
}

/* ------------------------------------------------------------------ */
/* Fixtures — the board's own numbers, so a failure reads like the board */
/* ------------------------------------------------------------------ */

const preview = (over: Partial<OrderPreview> = {}): OrderPreview => ({
  preview_id: 'prev-nvda-1',
  symbol: 'NVDA',
  name: 'Nvidia',
  exchange: 'NASDAQ',
  side: 'buy_to_open',
  side_label: 'Buy',
  qty: 4,
  fractional: false,
  order_type: 'limit',
  limit_price: 178.4,
  stop_price: null,
  duration: 'day',
  est_cost: 713.6,
  est_fees: 0,
  buying_power: 3000,
  buying_power_after: 2286.4,
  quote: {
    symbol: 'NVDA', price: 181.2, change: 1.1, change_pct: 0.6,
    freshness: 'delayed', delay_reason: 'entitlement', source_ts: null,
  },
  quote_clock: '9:41:02 AM ET',
  risk: { verdict: 'pass', headline: 'Fits your rules.', advisories: [], blockers: [] },
  stop_attached: 171.9,
  first_target: 195,
  max_loss: 26,
  max_loss_pct: 3.6,
  daily_risk: { cap: 100, used: 0, remaining: 100 },
  expires_at: new Date(Date.now() + 60_000).toISOString(),
  account_label: 'Paper practice',
  account_kind: 'paper',
  connected: true,
  confirm_label: null,
  disclosures: [],
  hard_stop_plain: 'You can lose up to $26.00 on this order if the stop executes.',
  footer_plain: null,
  ...over,
});

const order = (over: Partial<OrderRow> = {}): OrderRow => ({
  id: 'ord-1',
  symbol: 'NVDA',
  side: 'buy_to_open',
  side_label: 'Buy',
  qty: 4,
  filled_qty: 0,
  order_type: 'limit',
  limit_price: 178.4,
  stop_price: null,
  duration: 'day',
  status: 'accepted',
  status_label: 'Accepted — waiting to fill',
  status_detail: 'Your limit is $178.40. It fills when the price comes to it.',
  avg_fill_price: null,
  submitted_at: new Date().toISOString(),
  filled_at: null,
  position_id: null,
  paper: true,
  ...over,
});

const position = (over: Partial<PositionDetail> = {}): PositionDetail => ({
  id: 'pos-1',
  symbol: 'NVDA',
  name: 'Nvidia',
  side: 'long',
  qty: 4,
  avg_entry: 178.4,
  notional: 713.6,
  mark_price: 181.2,
  mark_ts: null,
  quote: null,
  unrealized_pnl: 11.2,
  unrealized_pnl_pct: 1.57,
  realized_pnl: null,
  day_pnl: 11.2,
  pnl_detail: null,
  stop: 171.9,
  target: 195,
  health: 'healthy',
  health_label: 'Healthy',
  kai_line: 'Your stop and plan are still in place.',
  nothing_to_do: false,
  status: 'open',
  opened_at: null,
  closed_at: null,
  origin_plan_id: null,
  origin_setup_id: null,
  exit_style: 'auto',
  debrief_id: null,
  has_debrief: false,
  simulated: false,
  paper: true,
  plan_entry: 178.4,
  plan_stop: 171.9,
  plan_target: 195,
  plan_id: 'plan-1',
  plan_vs_now: [],
  history: [],
  ...over,
});

/* ------------------------------------------------------------------ */
console.log('\nF08 · one execution vocabulary');
/* ------------------------------------------------------------------ */
{
  const expected: Record<ExecutionAction, string> = {
    track_setup: 'Track setup',
    activate_alert: 'Activate alert',
    review_paper_order: 'Review paper order',
    place_paper_order: 'Place paper order',
    view_order: 'View order',
    review_position: 'Review position',
  };
  ok('the audit\'s six actions are the list, verbatim',
    JSON.stringify(ACTION_LABEL) === JSON.stringify(expected), ACTION_LABEL);

  const labels = Object.values(ACTION_LABEL);
  ok('no two actions share a name', new Set(labels).size === labels.length, labels);

  /* The exit is an order, so it says so — and it says paper, because it is. */
  ok('the exit is named as a paper order in both halves',
    /paper/i.test(EXIT_REVIEW_LABEL) && /paper/i.test(EXIT_PLACE_LABEL),
    [EXIT_REVIEW_LABEL, EXIT_PLACE_LABEL]);
  ok('the in-flight label is the same verb as the button',
    PLACING_LABEL.toLowerCase().startsWith('plac'), PLACING_LABEL);
}

/**
 * THE SCAN. Every screen that offers one of these actions must take its label
 * from the list rather than typing it. The old divergence — the portal's
 * "Send it" against the review screen's "Place paper order" — is exactly a
 * literal that was never going to be found by reading one file.
 */
{
  const SURFACES = [
    'src/app/order/review.tsx',
    'src/app/order/confirmed.tsx',
    'src/app/order/new.tsx',
    'src/app/order/[id].tsx',
    'src/app/position/[id].tsx',
    'src/app/position/index.tsx',
    'src/features/orders/PlanView.tsx',
    'src/features/portal2/Take.tsx',
    'src/features/portal2/TradePortalV2.tsx',
  ];
  /** Phrases that mean one of the six actions but are not one of the six. */
  const BANNED = [
    /label=\{?['"`]Send it/,
    /label=\{?['"`]Take it/,
    /label=\{?['"`]Review order/,
    /label=\{?['"`]Exit now/,
    /label=\{?['"`]View position/,
    /label=\{?['"`]View pending order/,
    /label=\{?['"`]Open the (order|position)/,
    /Submit to broker/i,
  ];
  /* Prose is allowed to name the wording it forbids — that is how a file
     header explains itself. Only code lines are scanned. */
  const isComment = (line: string) => /^\s*(\*|\/\/|\/\*)/.test(line);
  const offenders: string[] = [];
  for (const rel of SURFACES) {
    const lines = read(rel).split('\n');
    for (const rx of BANNED) {
      const hit = lines.findIndex((l) => !isComment(l) && rx.test(l));
      if (hit >= 0) offenders.push(`${rel}:${hit + 1} ${rx}`);
    }
  }
  ok('no screen types an execution label of its own', offenders.length === 0, offenders);

  const usesList = SURFACES.filter((rel) => /vocabulary'/.test(read(rel)));
  ok('every execution surface imports the one list',
    usesList.length === SURFACES.length,
    SURFACES.filter((r) => !usesList.includes(r)));
}

/** "Paper is visible at final confirmation AND on the receipt." */
{
  const review = read('src/app/order/review.tsx');
  const confirmed = read('src/app/order/confirmed.tsx');
  ok('the final confirmation says paper on the primary itself',
    /ACTION_LABEL\.place_paper_order/.test(review) && /paper/i.test(ACTION_LABEL.place_paper_order));
  ok('the receipt headline contains the word Paper, not only a chip',
    /Paper order submitted\./.test(confirmed) && /Paper order filled\./.test(confirmed));
  ok('the receipt still carries the paper chip as well',
    /confirmed-paper-chip/.test(confirmed));
}

/* ------------------------------------------------------------------ */
console.log('\nF08 · the object-state table');
/* ------------------------------------------------------------------ */
{
  const states: ObjectState[] = ['idea', 'planned', 'order_pending', 'position_active', 'closed'];
  ok('the audit\'s five states are the table',
    JSON.stringify(Object.keys(STATE)) === JSON.stringify(states), Object.keys(STATE));

  const many = states.filter((s) => Array.isArray(STATE[s].next));
  ok('each state offers at most ONE next action', many.length === 0, many);
  ok('every live state offers one; only a closed object offers none',
    states.every((s) => (s === 'closed' ? STATE[s].next === null : STATE[s].next !== null)),
    states.map((s) => [s, STATE[s].next]));
  ok('every state says what the member should understand',
    states.every((s) => STATE[s].plain.length > 20 && STATE[s].label.length > 0));

  const all: OrderStatus[] = [
    'draft', 'previewed', 'submitted', 'accepted', 'partially_filled', 'filled', 'cancelled', 'rejected',
  ];
  ok('every order status maps to a state',
    all.every((s) => states.includes(stateForOrderStatus(s))),
    all.map((s) => [s, stateForOrderStatus(s)]));
  ok('accepted is NOT a position — it is an order still working',
    stateForOrderStatus('accepted') === 'order_pending');
  ok('partially filled is still working, not active',
    stateForOrderStatus('partially_filled') === 'order_pending');
  ok('only a fill makes a position', stateForOrderStatus('filled') === 'position_active');
}

/* ------------------------------------------------------------------ */
console.log('\nThe receipt: Submitted → Filled, and no invented fill');
/* ------------------------------------------------------------------ */
{
  const working = orderSteps(order());
  ok('there are exactly two steps', working.length === 2, working.map((s) => s.key));
  ok('submitted is reached and is where the order is', working[0].done && working[0].current);
  ok('submitted says it is waiting', working[0].detail === 'Waiting to fill', working[0].detail);
  ok('filled is NOT reached', working[1].done === false && working[1].current === false);
  ok('and it says nothing at all — the em-dash is the screen\'s job',
    working[1].detail === null, working[1].detail);

  const partial = orderSteps(order({ status: 'partially_filled', filled_qty: 2 }));
  ok('a partial fill reports the quantity on the first step',
    partial[0].detail === 'Filled 2 shares of 4 shares', partial[0].detail);
  ok('a partial fill is still not "filled"', partial[1].done === false);

  const done = orderSteps(order({
    status: 'filled', filled_qty: 4, avg_fill_price: 178.4, position_id: 'pos-1',
  }));
  ok('a fill reaches both steps', done[0].done && done[1].done && done[1].current);
  ok('and prints the average fill it actually got',
    done[1].detail === '4 shares at $178.40', done[1].detail);

  const dead = orderSteps(order({ status: 'rejected', status_label: 'Rejected' }));
  ok('a rejected order never says "Filled"', dead[1].label === 'Not filled', dead[1].label);
  ok('and the reason is carried, not swallowed',
    typeof dead[1].detail === 'string' && dead[1].detail.length > 0, dead[1].detail);

  /**
   * The screen re-reads `GET /orders/:id`. If the engine walks a status back —
   * an optimistic fill that was not one — the tracker must walk back with it.
   */
  const back = orderSteps(order({ status: 'accepted', filled_qty: 0, avg_fill_price: null }));
  ok('authoritative status wins: an accepted re-read reopens the second step',
    back[1].done === false && back[1].detail === null);
}

/* ------------------------------------------------------------------ */
console.log('\nThe daily risk budget states an absence rather than inventing a cap');
/* ------------------------------------------------------------------ */
{
  const b = dailyBudget(preview());
  ok('a known cap draws a bar', b.kind === 'bar');
  if (b.kind === 'bar') {
    ok('the board\'s own headline', b.headline === '$26 of $100 planned', b.headline);
    ok('and the board\'s own percentage', b.percent === '26%', b.percent);
    ok('the fraction is the fill', Math.abs(b.fraction - 0.26) < 1e-9, b.fraction);
    ok('nothing is used yet, so the darker segment is empty', b.usedFraction === 0);
    ok('it is not over the cap', b.over === false && b.remaining === 74);
  }

  const carried = dailyBudget(preview({ daily_risk: { cap: 100, used: 40, remaining: 60 } }));
  ok('today\'s committed risk counts toward the same cap',
    carried.kind === 'bar' && carried.headline === '$66 of $100 planned',
    carried.kind === 'bar' ? carried.headline : carried.kind);
  ok('and the committed part is drawn separately',
    carried.kind === 'bar' && Math.abs(carried.usedFraction - 0.4) < 1e-9);

  const over = dailyBudget(preview({ max_loss: 50, daily_risk: { cap: 100, used: 80, remaining: 20 } }));
  ok('going past the cap is said, and the bar clamps rather than overflowing',
    over.kind === 'bar' && over.over === true && over.fraction === 1,
    over.kind === 'bar' ? [over.over, over.fraction] : over.kind);

  const none = dailyBudget(preview({ daily_risk: { cap: null, used: 0, remaining: null } }));
  ok('NO CAP SET is a stated absence, not a bar', none.kind === 'no_cap', none.kind);
  ok('and it says so in words the member can act on',
    none.kind === 'no_cap' && /no daily risk cap/i.test(none.plain),
    none.kind === 'no_cap' ? none.plain : null);
  ok('it still tells them what this order plans',
    none.kind === 'no_cap' && /\$26/.test(none.plain));

  const silent = dailyBudget(preview({ daily_risk: undefined }));
  ok('a build that did not report the budget is a THIRD state, not "no cap"',
    silent.kind === 'unknown', silent.kind);
  ok('and it says it does not know, rather than that there is nothing to know',
    silent.kind === 'unknown' && /not reported/i.test(silent.plain),
    silent.kind === 'unknown' ? silent.plain : null);

  const zero = dailyBudget(preview({ daily_risk: { cap: 0, used: 0, remaining: 0 } }));
  ok('a cap of zero is treated as no cap, not as a divide by zero', zero.kind === 'no_cap');

  const noStop = dailyBudget(preview({ max_loss: null }));
  ok('an order with no planned risk does not contribute a phantom dollar',
    noStop.kind === 'bar' && noStop.after === 0 && noStop.planned === null,
    noStop.kind === 'bar' ? [noStop.after, noStop.planned] : noStop.kind);
}

/* ------------------------------------------------------------------ */
console.log('\nPreview → TradeIdea: the kit draws what the order says, nothing else');
/* ------------------------------------------------------------------ */
{
  const idea = ideaFromPreview(preview());
  ok('the limit is the entry — the price the member chose', idea.entry === 178.4);
  ok('the stop and target come off the bracket', idea.stop === 171.9 && idea.target === 195);
  ok('a buy is a long', idea.direction === 'long');
  ok('a short reads as a short',
    ideaFromPreview(preview({ side: 'sell_short', side_label: 'Short' })).direction === 'short');
  ok('nothing is open yet, so the kit status is entry_reached', idea.status === 'entry_reached');
  ok('the data label says where the numbers came from',
    idea.dataLabel.includes('9:41:02 AM ET') && /paper/i.test(idea.dataLabel), idea.dataLabel);

  const market = ideaFromPreview(preview({ order_type: 'market', limit_price: null }));
  ok('a market order falls back to the quote it would fill against', market.entry === 181.2);

  const blind = ideaFromPreview(preview({ order_type: 'market', limit_price: null, quote: null }));
  ok('with no limit and no quote there is NO entry — none is invented', blind.entry === null);

  /* riskReward() in the kit returns null on an incomplete idea, which is what
     makes the ruler say "unavailable" instead of drawing a meaningless split. */
  const noTarget = ideaFromPreview(preview({ first_target: null }));
  ok('a missing target stays missing', noTarget.target === null);

  const pos = ideaFromPosition(position());
  ok('a position charts what you ACTUALLY got in at, not the plan', pos.entry === 178.4);
  ok('an open position is active in the kit\'s words', pos.status === 'active');
  ok('a closed one is closed', ideaFromPosition(position({ status: 'closed' })).status === 'closed');
  ok('the planned stop and target are the bands', pos.stop === 171.9 && pos.target === 195);
}

/* ------------------------------------------------------------------ */
console.log('\nCandles: real bars only');
/* ------------------------------------------------------------------ */
{
  const bars = kitCandles([
    { t: '2026-05-08T00:00:00Z', o: 1, h: 2, l: 0.5, c: 1.5 },
    { t: 'not a date', o: 1, h: 2, l: 0.5, c: 1.5 },
    { t: '2026-05-09T00:00:00Z', o: 1, h: 2, l: 0.5, c: Number.NaN },
    { t: '2026-05-10T00:00:00Z', o: 2, h: 3, l: 1.5, c: 2.5, v: 100 },
  ]);
  ok('an unparseable timestamp is dropped, not placed at the epoch', bars.length === 2, bars);
  ok('a bar with a NaN price is dropped too', bars.every((b) => Number.isFinite(b.close)));
  ok('times become epoch seconds', bars[0].time === Math.round(Date.parse('2026-05-08T00:00:00Z') / 1000));
  ok('volume survives when it exists', bars[1].volume === 100);
  ok('an empty history is a legitimate answer', kitCandles([]).length === 0);
}

/* ------------------------------------------------------------------ */
console.log('\nDouble-tap, timeout and reconnect cannot make two orders');
/* ------------------------------------------------------------------ */
{
  forgetSubmitKeys();
  const a = submitKeyFor('prev-1');
  const b = submitKeyFor('prev-1');
  ok('the same priced order always sends the same idempotency key', a === b, [a, b]);
  ok('a different preview gets a different key', submitKeyFor('prev-2') !== a);
  ok('the key is long enough for the route to accept it (min 8)', a.length >= 8 && a.length <= 200, a.length);
  ok('and it names the preview it belongs to', a.includes('prev-1'), a);

  /* A re-price is a NEW order and must be allowed to exist beside the first. */
  ok('re-pricing produces a new key, because it is a new order',
    submitKeyFor('prev-1-repriced') !== a);

  const submitSrc = read('src/features/orders/useOrders.ts');
  ok('the submit hook holds ONE in-flight promise rather than trusting state',
    /inFlight\.current/.test(submitSrc) && /if \(inFlight\.current\) return inFlight\.current;/.test(submitSrc));
  ok('and it sends the remembered key, never a fresh one per press',
    /tradeApi\.submit\(previewId, submitKeyFor\(previewId\)\)/.test(submitSrc));

  const takeSrc = read('src/features/portal2/useTake.ts');
  ok('the portal\'s collapsed path has the same two guards',
    /if \(sending\.current\) return;/.test(takeSrc) && /submitKeyFor\(preview\.preview_id\)/.test(takeSrc));
}

/* ------------------------------------------------------------------ */
console.log('\nThe kit draws the chart and the R meter — not a fourth private one');
/* ------------------------------------------------------------------ */
{
  const review = read('src/app/order/review.tsx');
  ok('review uses the kit\'s TradeMap and RiskRewardRuler',
    /from '\.\.\/\.\.\/ui\/trade'/.test(review) && /<TradeMap/.test(review) && /<RiskRewardRuler/.test(review));
  ok('and it draws the daily budget above the primary',
    review.indexOf('<DailyRiskBudget') > 0
    && review.indexOf('<DailyRiskBudget') < review.indexOf('testID="cta-place"'));

  const pos = read('src/app/position/[id].tsx');
  ok('the position screen uses the kit\'s map and status strip',
    /<TradeMap/.test(pos) && /<TradeStatusStrip/.test(pos));

  const confirmed = read('src/app/order/confirmed.tsx');
  ok('the receipt draws the two-step tracker', /<OrderProgress/.test(confirmed));
  ok('the portal receipt draws the same one', /<OrderProgress/.test(read('src/features/portal2/Take.tsx')));
}

console.log(failures ? `\npaper lifecycle FAILED (${failures})` : '\npaper lifecycle OK');
process.exit(failures ? 1 : 0);
