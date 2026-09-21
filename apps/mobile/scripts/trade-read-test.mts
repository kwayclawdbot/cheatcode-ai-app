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
import { sizeFor, ticketFor, receiptLine, confirmNumbers } from '../src/features/portal2/order-math';
import { checklistOf, currentR, plannedR, signedR } from '../src/features/portal2/detail-model';
import type { OrderPreview } from '../src/features/orders/types';
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

console.log('\nThe server already sized it — the Take beat uses that size (owner audit 21 Sept)');
{
  // The real AMD wire: `suggested.size = { shares: 1, max_loss_usd: 44.65,
  // plain: '1 share keeps the loss near $44.65 …' }` and no `risk_dollars`.
  // Before the fix this came back unsized and the card said NOT PRICED.
  const portal = base({
    alert: { ...gradedAlert, entry: 578.75, entry_high: null, stop: 534.1, target: 712.71 } as never,
    plan: {
      id: null, entry: 578.75, stop: 534.1, targets: [712.71], rr: null,
      size_plain: '1 share keeps the loss near $44.65 if the level fails — inside your rules.',
      risk_dollars: null, shares: 1, within_policy: true,
      daily_cap: null, stop_attaches_plain: null, action: null, empty_plain: null,
    } as never,
  });
  const r = readPortal(portal);
  const s = sizeFor(r, portal);
  ok('the served share count is used', s.shares === 1, s);
  ok('with a sentence that names no second dollar figure', s.plain.startsWith('1 share —') && !/\$/.test(s.plain), s.plain);
  ok('and the risk is the distance to the stop', s.risk_usd === 44.65, s.risk_usd);
  ok('so an order can be built and priced', ticketFor(r, portal, s.shares)?.qty === 1);

  const fraction = sizeFor(r, base({ ...portal, plan: { ...portal.plan, shares: 1.5 } as never }));
  ok('a fractional served count is not trusted', fraction.shares === null, fraction);
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

console.log('\nThe confirmation card and its own warning agree (one source)');
{
  const read = readPortal(base());
  const size = { shares: 9, plain: '', risk_usd: 54 };
  const preview = {
    preview_id: 'p1', symbol: 'META', name: null, exchange: null, side: 'buy_to_open', side_label: 'Buy',
    qty: 9, fractional: false, order_type: 'market', limit_price: null, stop_price: null, duration: 'day',
    est_cost: null, est_fees: 0, buying_power: null, buying_power_after: null, quote: null, quote_clock: null,
    risk: { verdict: 'advisory', headline: '', advisories: [{ code: 'x', message: 'This pays 1.35 to 1 and your own minimum is 2 to 1.' }], blockers: [] },
    stop_attached: 498, first_target: 520, max_loss: 91.8, max_loss_pct: null, expires_at: null,
    account_label: '', account_kind: 'paper', connected: true, confirm_label: null, disclosures: [],
    hard_stop_plain: null, footer_plain: null, rr: 1.35, fill_price: 508.2,
  } as unknown as OrderPreview;
  const c = confirmNumbers(read, preview, size);
  ok('the card prints the server rr, not the planned one', c.rr_plain === '1.35 to 1', c);
  ok('and it is the same words the warning uses', preview.risk.advisories[0].message.includes(c.rr_plain!), c.rr_plain);
  ok('risk is measured from the fill', c.fill === 508.2 && c.risk_usd === 91.8, c);
  const silent = confirmNumbers(read, { ...preview, rr: null, max_loss: null } as OrderPreview, size);
  ok('with no server rr it is measured from the fill, like the server', silent.rr === Math.round((11.8 / 10.2) * 100) / 100, silent);
  ok('a silent preview still sizes risk from the fill', silent.risk_usd === Math.round(10.2 * 9 * 100) / 100, silent);
}

console.log('\nThe checklist is the grade, never decoration');
{
  const comps = [
    { key: 'trend', label: 'Trend', status: 'Strong', strength: 5, explanation: 'up' },
    { key: 'volume', label: 'Volume', status: 'Forming', strength: 3, explanation: 'meh' },
    { key: 'rr', label: 'Risk / Reward', status: 'Favorable', strength: 4, explanation: 'ok' },
    { key: 'market', label: 'Market', status: 'Unknown', strength: 0, explanation: null },
  ];
  const list = checklistOf(comps, true);
  const by = (k: string) => list.find((x) => x.key === k)!;
  ok('four lines in the spec order', list.map((x) => x.label).join(',') === 'Trend,Catalyst,Volume,Risk', list);
  ok('a top-word leg is met', by('trend').state === 'met');
  ok('a middling leg is not met', by('volume').state === 'not_met' && by('volume').status === 'Forming');
  ok('the rr leg answers Risk', by('risk').state === 'met');
  ok('a leg the mode does not grade is unknown, not ticked', by('catalyst').state === 'unknown');
  const unknownLeg = checklistOf([{ key: 'catalyst', label: 'Catalyst risk', status: 'Unknown', strength: 0, explanation: 'no read' }], true);
  ok('an Unknown leg stays unknown', unknownLeg.find((x) => x.key === 'catalyst')!.state === 'unknown');
  ok('ungraded means every line unknown', checklistOf(comps, false).every((x) => x.state === 'unknown'));
}

console.log('\nThe R in the corner is where the trade is now');
{
  const read = readPortal(base({ alert: gradedAlert as never }));
  ok('long, above entry reads positive', signedR(currentR(read, 507)!) === '+0.5R', currentR(read, 507));
  ok('long, below entry reads negative', signedR(currentR(read, 501)!) === '−0.5R', currentR(read, 501));
  ok('no price, no R', currentR(read, null) === null);
  ok('planned R is target over stop distance', Math.abs(plannedR(read)! - 16 / 6) < 1e-9, plannedR(read));
  const bare = readPortal(base({ alert: null, plan: null }));
  ok('no plan, no R', currentR(bare, 504) === null && plannedR(bare) === null);
}

console.log(failures ? `\n${failures} failed\n` : '\nall passed\n');
process.exit(failures ? 1 : 0);
