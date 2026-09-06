/**
 * The percent, the leg and the verdict — the table.
 *
 *   cd apps/api && npm test
 *
 * WHY A TABLE AND NOT A SPEC. Everything this social lane can get wrong lives
 * in four functions in `src/lib/social/outcomes.ts`, and every one of the four
 * is a sign or a comparison:
 *
 *  1. A SHORT THAT FELL IS A WIN, AND ITS PERCENT IS POSITIVE. Writing that as
 *     -10% would be reporting the instrument instead of the person, and it is
 *     one minus sign away from happening. It goes on somebody's public record
 *     and into their belt, so it is asserted from both sides.
 *  2. THE COMPARISON FLIPS WITH THE SIDE. A long hits its target ABOVE and
 *     stops BELOW; a short is the mirror in both places. A single wrong
 *     inequality resolves every short backwards and nothing throws.
 *  3. THE STOP IS CHECKED FIRST. We hold one price per pass, not a bar, so a
 *     print through both levels is a case we genuinely cannot order. Calling it
 *     a win would let every wide call resolve green on a gap.
 *  4. NOTHING WITHOUT LEVELS SCORES, and a flat exit is not a win. `>= 0` here
 *     would pay for a scratch, and a scratch is not being right.
 *
 * The functions are pure — no database, no network, no clock — so all of it
 * runs in microseconds with no stack around it. There is no excuse not to run
 * this.
 */
import {
  coherentLevels,
  hasLevels,
  legHit,
  outcomeLabel,
  resultPct,
  round2,
  wasWon,
} from '../src/lib/social/outcomes.ts';

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

/* ------------------------------------------------------------------ */

section('The percent is signed for the DIRECTION, not for the price');

ok('a long from 100 that ran to 110 made 10%', resultPct('long', 100, 110) === 10);
ok('a long from 100 that fell to 90 lost 10%', resultPct('long', 100, 90) === -10);
// The one that matters. The price went DOWN and the trader was RIGHT.
ok('A SHORT FROM 100 THAT FELL TO 90 MADE 10%, not minus 10', resultPct('short', 100, 90) === 10);
ok('and a short from 100 that ran to 110 lost 10%', resultPct('short', 100, 110) === -10);
ok('the two sides of the same move are exact opposites', resultPct('long', 231.4, 240) === -resultPct('short', 231.4, 240)!);
ok('an unchanged price is flat in both directions', resultPct('long', 100, 100) === 0 && resultPct('short', 100, 100) === 0);
ok('it is rounded to two places like every other price in this app', resultPct('long', 231.4, 240) === round2(((240 - 231.4) / 231.4) * 100));

section('A percent we cannot honestly compute is BLANK, never zero');

// A blank reads as "not resolved yet". A 0 reads as "flat". Those are different
// facts and only one of them is true here.
ok('no entry gives null', resultPct('long', null, 110) === null);
ok('no exit gives null', resultPct('long', 100, null) === null);
ok('an entry of zero gives null rather than dividing by it', resultPct('long', 0, 110) === null);
ok('a negative entry is not a price', resultPct('long', -5, 110) === null);
ok('NaN in gives null out', resultPct('long', Number.NaN, 110) === null);

section('Which leg fired — the comparison flips with the side');

ok('a long hits its target AT the target', legHit('long', 240, 220, 240) === 'target');
ok('a long hits its target above it', legHit('long', 241, 220, 240) === 'target');
ok('a long stops AT the stop', legHit('long', 220, 220, 240) === 'stop');
ok('a long stops below it', legHit('long', 219, 220, 240) === 'stop');
ok('a long between its levels has done neither', legHit('long', 231, 220, 240) === null);

ok('a SHORT hits its target BELOW it', legHit('short', 219, 240, 220) === 'target');
ok('a short hits its target at the target', legHit('short', 220, 240, 220) === 'target');
ok('a short stops ABOVE it', legHit('short', 241, 240, 220) === 'stop');
ok('a short stops at the stop', legHit('short', 240, 240, 220) === 'stop');
ok('a short between its levels has done neither', legHit('short', 231, 240, 220) === null);

section('One level is enough, and none is nothing');

ok('a long with only a target can still hit it', legHit('long', 240, null, 240) === 'target');
ok('a long with only a stop can still stop', legHit('long', 219, 220, null) === 'stop');
ok('with no levels at all nothing ever fires', legHit('long', 1_000_000, null, null) === null);
ok('a price that is not a number fires nothing', legHit('long', Number.NaN, 220, 240) === null);

section('THE STOP IS CHECKED FIRST — crossed levels resolve as a LOSS');

// With coherent levels one price can only ever satisfy one side, and 0038's
// trigger is what makes them coherent. This order therefore only decides the
// case where a row somehow holds CROSSED levels — and it decides it the way
// round that cannot pay somebody for a call the database should have refused.
ok(
  'a long whose crossed levels are both satisfied is a stop, not a win',
  legHit('long', 210, 220, 205) === 'stop',
  legHit('long', 210, 220, 205)
);
ok(
  'and the same for a short',
  legHit('short', 250, 240, 260) === 'stop',
  legHit('short', 250, 240, 260)
);
// The whole ladder of a coherent pair, both sides, in one place. A single
// flipped inequality shows up here and nowhere else.
const LADDER: [number, 'stop' | 'target' | null, 'stop' | 'target' | null][] = [
  //  price  long(220/240)  short(240/220)
  [200, 'stop', 'target'],
  [219, 'stop', 'target'],
  [220, 'stop', 'target'],
  [231, null, null],
  [240, 'target', 'stop'],
  [241, 'target', 'stop'],
  [300, 'target', 'stop'],
];
ok(
  'the same price ladder reads exactly opposite for a long and a short',
  LADDER.every(([price, long, short]) => legHit('long', price, 220, 240) === long && legHit('short', price, 240, 220) === short),
  LADDER.map(([price]) => [price, legHit('long', price, 220, 240), legHit('short', price, 240, 220)])
);

section('Won or lost');

ok('the target leg is a win with no argument', wasWon('target', -99));
ok('the stop leg is a loss with no argument', wasWon('stop', 99) === false);
ok('an expired call is neither, and neither is not a win', wasWon('expired', 5) === false);
ok('a manual close in profit is a win', wasWon('closed', 3.2));
ok('a manual close at a loss is not', wasWon('closed', -3.2) === false);
// A scratch is not being right.
ok('A FLAT MANUAL CLOSE IS NOT A WIN', wasWon('closed', 0) === false);
ok('and a manual close with no percent at all is not a win', wasWon('closed', null) === false);

section('Nothing without levels can ever score');

ok('an entry and a target is scoreable', hasLevels(231.4, null, 240));
ok('an entry and a stop is scoreable', hasLevels(231.4, 220, null));
ok('an entry and both is scoreable', hasLevels(231.4, 220, 240));
ok('an entry alone is NOT — there is nothing to check it against', hasLevels(231.4, null, null) === false);
ok('levels with no entry are NOT — there is nothing to measure from', hasLevels(null, 220, 240) === false);
ok('nothing at all is not', hasLevels(null, null, null) === false);

section('A level that contradicts the direction is dropped, not published');

// 0038's trigger refuses a backwards level outright, which is right for a call
// somebody typed and wrong for a fill in a fast market. The trade is still
// true; the level is the part that stopped being true.
{
  const slipped = coherentLevels('long', 230.8, 231.0, 240);
  ok('a long filled below its own stop keeps the trade and drops the stop', slipped.stop === null);
  ok('and keeps the target, which is still a target', slipped.target === 240);
}
{
  const fine = coherentLevels('long', 231.4, 220, 240);
  ok('a coherent long keeps both levels untouched', fine.stop === 220 && fine.target === 240);
}
{
  const shorted = coherentLevels('short', 231.4, 240, 220);
  ok('a coherent short keeps both levels untouched', shorted.stop === 240 && shorted.target === 220);
}
{
  const backwards = coherentLevels('short', 231.4, 220, 240);
  ok('a backwards short drops both rather than publishing a stop that is not one', backwards.stop === null && backwards.target === null);
}
{
  const equal = coherentLevels('long', 231.4, 231.4, 231.4);
  ok('a level AT the entry is dropped — 0038 refuses those too', equal.stop === null && equal.target === null);
}

section('Whatever comes out of coherentLevels would survive the database');

// The point of the guard: anything it returns satisfies
// `social_levels_coherent()` (0038 §5), so the insert cannot be refused for a
// reason the member did not cause.
const cases: { dir: 'long' | 'short'; entry: number; stop: number | null; target: number | null }[] = [
  { dir: 'long', entry: 100, stop: 101, target: 99 },
  { dir: 'long', entry: 100, stop: 90, target: 110 },
  { dir: 'short', entry: 100, stop: 90, target: 110 },
  { dir: 'short', entry: 100, stop: 110, target: 90 },
  { dir: 'long', entry: 100, stop: null, target: null },
  { dir: 'short', entry: 100, stop: 100, target: 100 },
];
ok(
  'every case comes back coherent',
  cases.every(({ dir, entry, stop, target }) => {
    const out = coherentLevels(dir, entry, stop, target);
    if (dir === 'long') {
      return (out.stop === null || out.stop < entry) && (out.target === null || out.target > entry);
    }
    return (out.stop === null || out.stop > entry) && (out.target === null || out.target < entry);
  })
);

section('The label a card prints');

ok('target reads as a win in words', outcomeLabel('target') === 'Hit target');
ok('stop reads as a stop', outcomeLabel('stop') === 'Stopped');
ok('open reads as still running', outcomeLabel('open') === 'Still open');
ok('expired says it was never resolved', outcomeLabel('expired') === 'Expired unresolved');
ok('an unknown status prints nothing rather than the raw word', outcomeLabel('banana') === null);

section('The functions are PURE');

const before = { dir: 'long' as const, entry: 100, stop: 90, target: 110, price: 105 };
const a = JSON.stringify([
  resultPct(before.dir, before.entry, before.price),
  legHit(before.dir, before.price, before.stop, before.target),
  coherentLevels(before.dir, before.entry, before.stop, before.target),
]);
const b = JSON.stringify([
  resultPct(before.dir, before.entry, before.price),
  legHit(before.dir, before.price, before.stop, before.target),
  coherentLevels(before.dir, before.entry, before.stop, before.target),
]);
ok('the same input gives the same answer', a === b);
ok(
  'and nothing was mutated on the way through',
  JSON.stringify(before) === JSON.stringify({ dir: 'long', entry: 100, stop: 90, target: 110, price: 105 })
);

/* ------------------------------------------------------------------ */

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
