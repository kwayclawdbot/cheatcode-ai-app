/**
 * The peak, the basis and the contract ticker — the table.
 *
 *   cd apps/api && npm test
 *
 * WHY A TABLE AND NOT A SPEC. Everything the tracker can get wrong that a type
 * will not catch lives in three pure functions in `src/lib/tracking/peaks.ts`,
 * and each one is a comparison or a string:
 *
 *  1. A PEAK MUST NEVER GO BACKWARDS. `mergeExtremes` is the only thing
 *     standing between "the best it ever got" and "the best it got in the last
 *     five minutes". One flipped inequality and every quiet afternoon erases
 *     the morning's high, silently, with no error anywhere. It is asserted from
 *     both ends and in the middle.
 *  2. THE BASIS TRAVELS WITH THE VALUE. A high replaced by a live pass has to
 *     become 'session'; a high NOT replaced has to keep the basis it had. If
 *     the basis were written unconditionally, a daily-bar peak would start
 *     claiming it was seen tick by tick, which is the exact thing the owner
 *     asked to be able to tell apart.
 *  3. AN OPTION TICKER IS EXACT OR IT IS USELESS. `O:MRNA260821C00120000` —
 *     six date digits, one letter, eight strike digits in thousandths. One
 *     character wrong is not a wrong price, it is a 404, and the contract lane
 *     would quietly grade nothing for ever.
 *  4. TWO EXPIRIES MEANS WE DO NOT KNOW WHICH CONTRACT. Guessing there would
 *     put a real price against the wrong contract, which is worse than the
 *     blank it replaces.
 *
 * The functions are pure — no database, no network, no clock — so all of it
 * runs in microseconds. There is no excuse not to run this.
 */
import {
  contractFromComponents,
  extremesFromBars,
  mergeExtremes,
  optionTicker,
} from '../src/lib/tracking/peaks.ts';

let pass = 0;
let fail = 0;

function ok(name: string, cond: unknown, detail?: unknown): void {
  if (cond) {
    pass += 1;
    console.log(`  PASS  ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${name}${detail === undefined ? '' : `\n        ${JSON.stringify(detail)}`}`);
  }
}

function section(title: string): void {
  console.log(`\n${title}`);
}

const SESSION = { basis: 'session' as const };
const BARS = { basis: 'daily_bar' as const };

/* ------------------------------------------------------------------ */

section('A peak never goes backwards');

// The first observation of a fresh row sets both ends.
{
  const p = mergeExtremes({ high_price: null, low_price: null }, {
    high: 110, highAt: 'T1', low: 90, lowAt: 'T1', ...SESSION,
  });
  ok('a fresh row takes the first high it sees', p?.high_price === 110, p);
  ok('a fresh row takes the first low it sees', p?.low_price === 90, p);
}

// THE ONE THAT MATTERS. A quiet session cannot erase a loud morning.
{
  const p = mergeExtremes({ high_price: 110, low_price: 90 }, {
    high: 104, highAt: 'T2', low: 99, lowAt: 'T2', ...SESSION,
  });
  ok('a lower high does not replace a higher one', p === null || p.high_price === undefined, p);
  ok('a higher low does not replace a lower one', p === null || p.low_price === undefined, p);
  ok('a session inside the existing range writes nothing at all', p === null, p);
}

// A genuinely new extreme does replace, and only the end that moved.
{
  const p = mergeExtremes({ high_price: 110, low_price: 90 }, {
    high: 118, highAt: 'T3', low: 99, lowAt: 'T3', ...SESSION,
  });
  ok('a higher high replaces the old one', p?.high_price === 118, p);
  ok('its timestamp moves with it', p?.high_at === 'T3', p);
  ok('the untouched low is left entirely alone', p?.low_price === undefined, p);
}

{
  const p = mergeExtremes({ high_price: 110, low_price: 90 }, {
    high: 100, highAt: 'T4', low: 84, lowAt: 'T4', ...SESSION,
  });
  ok('a lower low replaces the old one', p?.low_price === 84, p);
  ok('the untouched high is left entirely alone', p?.high_price === undefined, p);
}

section('The basis travels with the value, and only with the value');

{
  const p = mergeExtremes({ high_price: 110, low_price: 90 }, {
    high: 118, highAt: 'T5', low: 95, lowAt: 'T5', ...SESSION,
  });
  ok('a high set by a live pass is marked session', p?.high_basis === 'session', p);
  // If this wrote a basis it would relabel a peak it did not set — the exact
  // way a daily-bar number starts claiming to be tick-level.
  ok('a low that did not move gets no new basis', p?.low_basis === undefined, p);
}

{
  const p = mergeExtremes({ high_price: null, low_price: null }, {
    high: 58, highAt: '2026-08-19', low: 4.35, lowAt: '2026-08-19', ...BARS,
  });
  ok('a seeded high says it came from daily bars', p?.high_basis === 'daily_bar', p);
  ok('a seeded high is dated to its session, not to the pass', p?.high_at === '2026-08-19', p);
}

section('Bars collapse to the extremes of the whole run, not of the last bar');

{
  const e = extremesFromBars([
    { ts: 'D1', h: 12, l: 9 },
    { ts: 'D2', h: 18, l: 11 },
    { ts: 'D3', h: 14, l: 7 },
  ]);
  ok('the high is the highest bar in the run', e?.high === 18, e);
  ok('the high is dated to the bar that made it', e?.highAt === 'D2', e);
  ok('the low is the lowest bar in the run', e?.low === 7, e);
  ok('the low is dated to the bar that made it', e?.lowAt === 'D3', e);
}

ok('no bars is null, not zero', extremesFromBars([]) === null);
// A zero high is a hole in the data, not a price. Treating it as one would put
// a low of $0.00 on the row and make every peak look infinite beside it.
ok(
  'bars with no usable prices are null',
  extremesFromBars([{ ts: 'D1', h: null, l: null }]) === null,
);

section('An option ticker is exact or it is useless');

ok(
  'a call is built to the letter',
  optionTicker('MRNA', '2026-08-21', 'call', 120) === 'O:MRNA260821C00120000',
  optionTicker('MRNA', '2026-08-21', 'call', 120),
);
ok(
  'a put differs only in the side letter',
  optionTicker('WDC', '2026-08-14', 'put', 490) === 'O:WDC260814P00490000',
  optionTicker('WDC', '2026-08-14', 'put', 490),
);
// Thousandths, so a half-dollar strike is not silently truncated to a whole one.
ok(
  'a fractional strike keeps its thousandths',
  optionTicker('F', '2026-09-18', 'call', 12.5) === 'O:F260918C00012500',
  optionTicker('F', '2026-09-18', 'call', 12.5),
);
ok('a display date is refused, not guessed at', optionTicker('MRNA', 'Aug 21', 'call', 120) === null);
ok('a zero strike is refused', optionTicker('MRNA', '2026-08-21', 'call', 0) === null);

section('A contract is read from the ingest, or not at all');

{
  const comps = {
    recommended_options: [{ type: 'call', strike: '120', cost: '5.60', expiry: 'Aug 21' }],
    uoa: { expiries: ['2026-08-21'], strikes: [120] },
  };
  const c = contractFromComponents('MRNA', comps);
  ok('the ISO expiry comes from uoa, never from the display label', c?.ticker === 'O:MRNA260821C00120000', c);
  ok('the cost comes across as a number', c?.cost === 5.6, c);
  ok('the expiry is carried for the grading lane', c?.expiry === '2026-08-21', c);
}

{
  // Two expiries and there is no honest way to say which contract the row
  // means. A guess here prices the wrong contract and looks entirely credible.
  const c = contractFromComponents('MRNA', {
    recommended_options: [{ type: 'call', strike: '120', cost: '5.60' }],
    uoa: { expiries: ['2026-08-21', '2026-09-18'] },
  });
  ok('two expiries is refused rather than guessed', c === null, c);
}

ok('no recommended contract is null', contractFromComponents('MRNA', { uoa: { expiries: ['2026-08-21'] } }) === null);
ok('no uoa expiries is null', contractFromComponents('MRNA', { recommended_options: [{ strike: 120 }] }) === null);
ok('an empty blob is null', contractFromComponents('MRNA', {}) === null);
ok('a null blob is null', contractFromComponents('MRNA', null) === null);

/* ------------------------------------------------------------------ */

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
