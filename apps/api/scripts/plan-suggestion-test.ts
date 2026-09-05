/**
 * THE ROUTE MUST NOT OFFER A PRICE NOBODY DECIDED.
 *
 *   cd apps/api && npm test
 *
 * `/api/v1/symbols/:symbol` used to compute its suggestion as
 * `entry ?? quote.price`. On a symbol with no graded setup that returns the
 * LAST TRADED PRICE under the key `entry`, and the plan screen printed it into
 * an Entry tile beside an empty stop. Nobody decided that number. It looked
 * exactly like one the grading engine produced.
 *
 * `planSuggestion` is the one place that decision is made now, so this is the
 * one place it can be pinned down. The rule is the Trade section's rule: a plan
 * is a plan only when there is an entry AND a level that says it was wrong.
 */
import { planSuggestion, planSize, planScenarios, rrFor } from '../src/lib/execution/plans.ts';
import type { SetupTarget } from '@shared/api';

let failures = 0;
function ok(name: string, cond: unknown, detail?: unknown): void {
  if (cond) { console.log(`  ok   ${name}`); return; }
  failures += 1;
  console.log(`  FAIL ${name}${detail === undefined ? '' : `\n       ${JSON.stringify(detail)}`}`);
}

const LAST_TRADED = 178.42;
const T = (price: number): SetupTarget => ({ price, label: 'T1' } as SetupTarget);

console.log('\nno graded setup on the symbol');
{
  const s = planSuggestion('NVDA', { entry: null, stop: null, targets: [] }, false);
  ok('there is no plan', s.has_plan === false);
  ok('and no entry', s.entry === null, s.entry);
  ok('and no stop', s.stop === null);
  ok('and no targets', s.targets.length === 0);
  ok('the reason is written out', (s.no_plan_plain ?? '').length > 40, s.no_plan_plain);
  ok('and it says a last price is not an entry',
    (s.no_plan_plain ?? '').includes('not an entry'), s.no_plan_plain);

  // The bug itself, stated as a test: the function is not given the quote and
  // therefore cannot leak it, whatever anyone does later.
  ok('the quote is nowhere in the answer',
    JSON.stringify(s).indexOf(String(LAST_TRADED)) === -1, s);
}

console.log('\na graded setup whose levels never arrived');
{
  const s = planSuggestion('NVDA', { entry: null, stop: null, targets: [] }, true);
  ok('a grade on its own does not make a plan', s.has_plan === false);
  ok('and still no entry', s.entry === null);
  ok('the reason names the grade so it does not read as a missing symbol',
    (s.no_plan_plain ?? '').includes('graded setup'), s.no_plan_plain);
}

console.log('\nan entry with no level that says it was wrong');
{
  const s = planSuggestion('NVDA', { entry: 182.5, stop: null, targets: [T(201)] }, true);
  ok('is not a plan', s.has_plan === false);
  // Half a plan on a screen is read as a plan, so the entry goes with the stop.
  ok('and the entry is withdrawn with the stop', s.entry === null, s.entry);
  ok('and so is the target', s.targets.length === 0);
  ok('the reason is about the missing invalidation',
    (s.no_plan_plain ?? '').includes('failed'), s.no_plan_plain);
}

console.log('\na complete, graded plan');
{
  const s = planSuggestion('META', { entry: 504.6, stop: 486.2, targets: [T(548.1)] }, true);
  ok('is a plan', s.has_plan === true);
  ok('the entry is untouched', s.entry === 504.6);
  ok('the stop is untouched', s.stop === 486.2);
  ok('the target is untouched', s.targets.length === 1 && s.targets[0].price === 548.1);
  ok('and there is nothing to explain', s.no_plan_plain === null);
}

console.log('\nwhat the rest of the route does with an empty suggestion');
{
  const s = planSuggestion('NVDA', { entry: null, stop: null, targets: [] }, false);
  const size = planSize(s.entry, s.stop, s.targets, null, 25_000, null);

  ok('nothing is sized', size.shares === null && size.notional === null, size);
  ok('no maximum loss is claimed', size.max_loss_usd === null);
  ok('and the size explains itself in the same terms',
    size.plain.includes('entry') && size.plain.includes('wrong'), size.plain);

  ok('reward to risk is not computed out of thin air',
    rrFor(s.entry, s.stop, s.targets) === null);

  const sc = planScenarios(s.entry, s.stop, s.targets, size.shares, true);
  ok('no scenario carries a dollar figure',
    sc.every((x) => x.outcome_usd === null), sc);
  ok('and none of them prints a price',
    !JSON.stringify(sc).includes(String(LAST_TRADED)), sc);
  // "$0 risked" on a screen reads as a free trade. It is the single most
  // dangerous number this route could return, so it must be absent, not zero.
  ok('nothing reads as a zero-risk trade',
    !sc.some((x) => x.outcome_usd === 0), sc);
}

console.log(failures ? `\n${failures} failed\n` : '\nall passed\n');
process.exit(failures ? 1 : 0);
