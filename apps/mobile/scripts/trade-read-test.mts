/**
 * A CONJURED PLAN MUST NOT LOOK LIKE A GRADED ONE.
 *
 *   cd apps/mobile && npm test
 *
 * WHY THIS FILE EXISTS. `/api/v1/trade/portal/:symbol` computes its suggested
 * entry as `entry ?? quote.price` — so on a symbol with no setup at all, the
 * payload still arrives carrying an entry, and it is simply the last traded
 * price wearing the word "entry". Put that on a screen next to a stop of `null`
 * and a person cannot tell it from a plan somebody graded.
 *
 * `readPortal` is the one place that decision is made, so this is the one place
 * it can be pinned down. The rules under test:
 *
 *   1. graded means a real alert row with a letter on it, nothing else;
 *   2. an entry with no invalidation is NOT a plan and is NOT takeable;
 *   3. no price is ever produced that was not in the payload;
 *   4. the no-setup answer says so, in words, and offers what Kai can do.
 *
 * Plus the sizing, because "0 shares" and "1 share by default" are both ways of
 * printing a number nobody chose.
 */
import { readPortal, riskOf, rPlain, NO_SETUP_BLOCKED, NO_STOP_BLOCKED } from '../src/features/portal2/read';
import { sizeFor, ticketFor, receiptLine } from '../src/features/portal2/order-math';
import type { TradePortal } from '../src/features/portal/types';
import type { OrderRow } from '../src/features/orders/types';

let failures = 0;
function ok(name: string, cond: unknown, detail?: unknown): void {
  if (cond) { console.log(`  ok   ${name}`); return; }
  failures += 1;
  console.log(`  FAIL ${name}${detail === undefined ? '' : `\n       ${JSON.stringify(detail)}`}`);
}

const base = (over: Partial<TradePortal> = {}): TradePortal => ({
  symbol: 'META',
  name: 'Meta Platforms',
  instrument: 'Equity',
  mode: 'Day Trade',
  quote: { symbol: 'META', price: 504.62, change: 10, change_pct: 2.1, source_ts: null, freshness: 'delayed', delay_reason: null },
  market_state: 'Market open',
  paper: true,
  starred: false,
  chart: { timeframe: '15m', timeframes: ['5m', '15m', 'D'], focus_ts: null },
  annotations: [],
  kai: { conversation_id: null, opening_message: null },
  alert: null,
  plan: null,
  community: null,
  execution: { state: 'none', label: 'Nothing to do', action: null, detail_plain: null, order: null, position: null },
  drawers: { account: null, positions: [], open_orders: [], watchlist: [], recent: [] },
  is_fixture: true,
  notice: null,
  ...over,
}) as TradePortal;

const gradedAlert = {
  id: 'alert-meta', symbol: 'META', company: 'Meta Platforms', mode: 'Day Trade',
  direction: 'Long', instrument: 'Equity', grade_display: 'A−', score: 87,
  state: 'entry_reached', state_label: 'Triggered',
  headline: 'META reclaimed $504', what_changed: null, triggered_at: null,
  company_summary: null, condition: 'Holds above 504 with volume', condition_met: true,
  entry: 504, entry_high: 507, stop: 498, target: 520, rr: '2.7 : 1', hold: 'Intraday',
  expires_plain: null, score_components: [], kai_interpretation: 'The reclaim is confirmed by volume.',
  fit_plain: null, community_plain: null, events: [], primary_action: null,
};

console.log('\nA graded setup with a complete plan reads as takeable');
{
  const r = readPortal(base({ alert: gradedAlert as never }));
  ok('it is gradeable', r.gradeable === true);
  ok('the letter survives', r.grade_display === 'A−', r.grade_display);
  ok('it is takeable', r.takeable === true);
  ok('nothing blocks it', r.blocked_plain === null, r.blocked_plain);
  ok('entry, stop and target are the reasons', r.because.map((l) => l.key).join(',') === 'entry,stop,target', r.because);
  ok('every price came off the payload', r.because.every((l) => [504, 498, 520].includes(l.price)), r.because);
  ok('the entry zone keeps its far edge', r.because[0]?.price2 === 507, r.because[0]);
  ok('there is an invalidation sentence', typeof r.wrong_if === 'string' && r.wrong_if.includes('498'), r.wrong_if);
  ok('no offer is made — there is a real plan', r.offer_plain === null);
}

console.log('\nAN ENTRY WITH NO STOP IS NOT A PLAN — the route fills entry with the last price');
{
  // Exactly what `/trade/portal/:symbol` returns on a symbol with no setup:
  // suggested.entry = quote.price, stop = null, targets = [].
  const r = readPortal(base({
    plan: {
      id: null, entry: 504.62, stop: null, targets: [], rr: null, size_plain: null,
      risk_dollars: null, daily_cap: null, stop_attaches_plain: null, action: null, empty_plain: null,
    } as never,
  }));
  ok('it is not gradeable', r.gradeable === false);
  ok('it is NOT takeable', r.takeable === false);
  ok('and it says why', r.blocked_plain === NO_STOP_BLOCKED, r.blocked_plain);
  ok('no level is offered as a reason', r.because.length === 0, r.because);
  ok('no invalidation sentence is invented', r.wrong_if === null, r.wrong_if);
}

console.log('\nNo setup at all — Kai says so and offers what he can actually do');
{
  const r = readPortal(base());
  ok('not gradeable', r.gradeable === false);
  ok('no grade letter', r.grade_display === null);
  ok('the headline names the absence', r.headline.includes('no graded setup on META'), r.headline);
  ok('it is not takeable', r.takeable === false);
  ok('the block explains it', r.blocked_plain === NO_SETUP_BLOCKED, r.blocked_plain);
  ok('an honest offer is made', typeof r.offer_plain === 'string' && r.offer_plain.includes('VWAP'), r.offer_plain);
  ok('no level was manufactured', r.because.length === 0);
}

console.log('\nA grade with no complete plan is graded but not takeable');
{
  const r = readPortal(base({ alert: { ...gradedAlert, stop: null } as never }));
  ok('still gradeable', r.gradeable === true);
  ok('but not takeable', r.takeable === false);
  ok('and the headline admits it', r.headline.includes('no complete plan'), r.headline);
}

console.log('\nA saved plan outranks the alert suggestion');
{
  const r = readPortal(base({
    alert: gradedAlert as never,
    plan: {
      id: 'plan-1', entry: 505.5, stop: 499, targets: [521], rr: '2.6 : 1', size_plain: null,
      risk_dollars: 60, daily_cap: null, stop_attaches_plain: null, action: null, empty_plain: null,
    } as never,
  }));
  ok('the plan entry wins', r.because[0]?.price === 505.5, r.because[0]);
  ok('the plan stop wins', r.because[1]?.price === 499, r.because[1]);
}

console.log('\nA short reads as a short');
{
  const r = readPortal(base({ alert: { ...gradedAlert, direction: 'Short', entry: 100, entry_high: null, stop: 105, target: 90 } as never }));
  ok('direction is short', r.direction === 'short', r.direction);
  ok('the invalidation is ABOVE the stop', r.wrong_if?.startsWith('Above'), r.wrong_if);
  const t = ticketFor(r, base(), 3);
  ok('and the ticket sells short', t?.side === 'sell_short', t?.side);
}

console.log('\nRisk and R come out of the levels, or come out null');
{
  const r = riskOf(504, 498, 520, 9);
  ok('risk per share is the distance to the stop', r.per_share === 6, r.per_share);
  ok('dollars at risk multiply by size', r.risk_usd === 54, r.risk_usd);
  ok('R is reward over risk', rPlain(r.r_multiple) === '2.7R', rPlain(r.r_multiple));
  const none = riskOf(504, null, 520, 9);
  ok('a missing stop gives null, never zero', none.per_share === null && none.risk_usd === null, none);
}

console.log('\nSizing comes from the risk budget, and refuses rather than guessing');
{
  const portal = base({
    alert: gradedAlert as never,
    plan: {
      id: 'plan-1', entry: 504, stop: 498, targets: [520], rr: null, size_plain: null,
      risk_dollars: 58, daily_cap: null, stop_attaches_plain: null, action: null, empty_plain: null,
    } as never,
  });
  const r = readPortal(portal);
  const s = sizeFor(r, portal);
  ok('9 shares — 58 dollars over 6 of risk, rounded down', s.shares === 9, s);
  ok('the loss stays under the budget', (s.risk_usd ?? 0) <= 58, s.risk_usd);
  ok('and it says how it got there', s.plain.includes('$58'), s.plain);

  const noBudget = sizeFor(r, base({ alert: gradedAlert as never }));
  ok('no budget means no size, not one share', noBudget.shares === null, noBudget);
  ok('and no ticket at all', ticketFor(r, portal, noBudget.shares) === null);

  const tooRich = sizeFor(
    readPortal(base({ alert: { ...gradedAlert, entry: 500, stop: 400, entry_high: null } as never })),
    base({ plan: { id: null, entry: 500, stop: 400, targets: [], rr: null, size_plain: null, risk_dollars: 58, daily_cap: null, stop_attaches_plain: null, action: null, empty_plain: null } as never }),
  );
  ok('one share over the cap sizes to nothing', tooRich.shares === null, tooRich);
}

console.log('\nThe receipt never says filled before the engine does');
{
  const accepted = { id: 'o1', symbol: 'META', side: 'buy_to_open', side_label: 'Buy', qty: 9, filled_qty: 0, order_type: 'market', limit_price: null, stop_price: null, duration: 'day', status: 'accepted', status_label: 'Accepted — waiting to fill', status_detail: null, avg_fill_price: null, submitted_at: null, filled_at: null, position_id: null, paper: true } as OrderRow;
  ok('accepted reads as accepted', receiptLine(accepted).includes('accepted and waiting to fill'), receiptLine(accepted));
  ok('and never as filled', !receiptLine(accepted).includes('and filled'), receiptLine(accepted));
  const filled = { ...accepted, status: 'filled', filled_qty: 9, avg_fill_price: 504.62 } as OrderRow;
  ok('a fill names the price', receiptLine(filled).includes('$504.62'), receiptLine(filled));
  const rejected = { ...accepted, status: 'rejected' } as OrderRow;
  ok('a rejection says nothing was bought', receiptLine(rejected).includes('Nothing was bought'), receiptLine(rejected));
}

console.log(failures ? `\n${failures} failed\n` : '\nall passed\n');
process.exit(failures ? 1 : 0);
