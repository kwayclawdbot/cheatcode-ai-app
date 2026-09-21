/**
 * A History row's one muted line says what the contract did in words.
 *
 * "expired $0.00" read like a price tag on nothing (owner audit, 21 Sept).
 * A contract that closed at zero expired worthless; one that closed above zero
 * was worth that much at expiry. Both are the OPTION's price, never the stock's.
 */
import { outcomeOf } from '../src/lib/round4/alert-cards.ts';

let pass = 0;
let fail = 0;
function eq(name: string, got: unknown, want: unknown): void {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`        ${JSON.stringify({ got, want })}`);
  ok ? (pass += 1) : (fail += 1);
}
function ok(name: string, cond: boolean): void {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}`);
  cond ? (pass += 1) : (fail += 1);
}

const graded = { score_components: { outcome: { win_5d: true, gain_5d_pct: 4.7 } }, intent: 'buy_to_open' };

console.log('\nthe contract, in words');
{
  const o = outcomeOf({ ...graded, peak_price: 685.31, high_basis: 'session', contract_peak: 3.1, contract_peak_multiple: 2.1, contract_expiry_value: 0 }, 'closed');
  ok('a contract that closed at zero expired worthless', /contract expired worthless/.test(o?.basis ?? ''));
  ok('and "$0.00" is not printed at all', !/\$0\.00/.test(o?.basis ?? ''));
  ok('the peak keeps its multiple of cost', /contract peak \$3\.10 \(2\.1x cost\)/.test(o?.basis ?? ''));
}
{
  const o = outcomeOf({ ...graded, contract_peak: 3.1, contract_expiry_value: 1.25 }, 'closed');
  ok('a contract with value left says what it was worth at expiry', /contract worth \$1\.25 at expiry/.test(o?.basis ?? ''));
  ok('and never the bare word "expired $"', !/expired \$/.test(o?.basis ?? ''));
}
{
  const o = outcomeOf({ ...graded }, 'closed');
  eq('no contract, no contract words', o?.basis, 'Close to close · not a managed trade');
}
eq('a live card has no outcome line', outcomeOf({ ...graded }, 'ready'), null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
