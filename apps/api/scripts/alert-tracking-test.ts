/**
 * The V2 alert card says its state as a verb, and every verb is a claim about
 * PRICE. This proves the server only hands the card measurements:
 *
 *   · "Target 1 hit" needs the tracker's favourable extreme at or past target 1;
 *   · "Stop hit" needs the ADVERSE extreme (low on a long, high on a short) past
 *     the stop — never the favourable one;
 *   · a row the tracker never touched carries no tracking block at all;
 *   · the analytics row is the scanner's own pattern label and measured volume
 *     ratio, or nothing.
 */
import { analyticsOf, trackingOf } from '../src/lib/round4/alert-cards.ts';
import type { SetupRow } from '../src/lib/kai/context.ts';

let pass = 0;
let fail = 0;
function eq(name: string, got: unknown, want: unknown): void {
  const good = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${good ? 'PASS' : 'FAIL'}  ${name}`);
  if (!good) console.log(`        ${JSON.stringify({ got, want })}`);
  good ? (pass += 1) : (fail += 1);
}

const base = (over: Partial<SetupRow> = {}): SetupRow => ({
  id: 's1', symbol: 'PURR', mode: 'swing', intent: 'buy_to_open', state: 'ready',
  score: 92, grade_band: 'a', grade_display: 'A', score_components: {},
  thesis_plain: null, thesis_technical: null,
  entry_condition: { price: 24.4 }, invalidation: null, stop: 22.37,
  targets: [{ price: 30.49 }, { price: 33 }], catalyst: null,
  quote_snapshot: {}, valid_until: null, scanner_run_id: null,
  ...over,
});

console.log('\ntargets are hit by the favourable extreme');
eq('no tracker columns → no block', trackingOf(base()), null);
eq('peak short of target 1 → 0 hit', trackingOf(base({ peak_price: 29.9 }))?.targets_hit, 0);
eq('peak at target 1 → 1 hit', trackingOf(base({ peak_price: 30.49 }))?.targets_hit, 1);
eq('peak past both → 2 hit', trackingOf(base({ peak_price: 34 }))?.targets_hit, 2);
eq('no targets → unknown, not zero', trackingOf(base({ targets: [], peak_price: 34 }))?.targets_hit, null);
eq('short: a LOWER peak reaches the target',
  trackingOf(base({ intent: 'sell_short', entry_condition: { price: 50 }, stop: 53, targets: [{ price: 45 }], peak_price: 44.8 }))?.targets_hit, 1);

console.log('\nthe stop reads the adverse extreme');
eq('long: low under the stop → hit', trackingOf(base({ low_price: 22.1, peak_price: 25 }))?.stop_hit, true);
eq('long: low above the stop → not hit', trackingOf(base({ low_price: 23, peak_price: 25 }))?.stop_hit, false);
eq('long: a HIGH above the stop is not a stop', trackingOf(base({ high_price: 99, peak_price: 25 }))?.stop_hit, null);
eq('short: high over the stop → hit',
  trackingOf(base({ intent: 'sell_short', entry_condition: { price: 50 }, stop: 53, targets: [{ price: 45 }], high_price: 53.2 }))?.stop_hit, true);
eq('no stop → unknown', trackingOf(base({ stop: null, low_price: 1, peak_price: 25 }))?.stop_hit, null);

console.log('\nthe day-trade contract');
{
  const t = trackingOf(base({ entry_condition: null, stop: null, targets: [], contract_cost: 5.6, contract_peak: 27.91, contract_peak_multiple: 4.98 }));
  eq('cost carried', t?.contract_cost, 5.6);
  eq('peak carried', t?.contract_peak, 27.91);
  eq('multiple carried', t?.contract_peak_multiple, 4.98);
  eq('zero is not a peak', trackingOf(base({ entry_condition: null, stop: null, targets: [], contract_peak: 0 })), null);
}

console.log('\nanalytics are the producer\'s own facts');
eq('nothing recorded → null', analyticsOf(base()), null);
eq('pattern label, humanised', analyticsOf(base({ annotations: { pattern: 'BULL_FLAG' } }))?.pattern, 'Bull flag');
eq('volume ratio read back from the technical line',
  analyticsOf(base({ thesis_technical: 'breakout · volume 2.4x its average · RSI 58 at the alert.' }))?.volume_ratio, 2.4);
eq('no volume words → no ratio', analyticsOf(base({ annotations: { pattern: 'breakout' }, thesis_technical: 'breakout.' }))?.volume_ratio, null);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
