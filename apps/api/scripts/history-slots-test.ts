/**
 * The History page's share-out rule.
 *
 * The tab is bounded — 25 cards — and the corpus behind it is 826 picks across
 * six families that fired in different months. Ordering by recency alone shows
 * only the families that still fire, which is the exact omission the tab exists
 * to prevent. These assertions pin the two properties that make the page a
 * record rather than a highlight reel: every family present gets at least one
 * place, and nobody gets more places than they have rows.
 */
import { proportionalSlots } from '../src/lib/round4/history-slots.ts';

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

console.log('\nproportional slots — every family visible, none over-served');
{
  // The real corpus, 2026-09-03: swing_long 213, swing_short 36,
  // intraday_long 258, intraday_short 59, legacy_long 227, legacy_short 33.
  const real = [213, 36, 258, 59, 227, 33];
  const slots = proportionalSlots(real, 25);
  eq('the page is exactly full', slots.reduce((a, b) => a + b, 0), 25);
  ok('every family gets a place', slots.every((n) => n >= 1));
  ok('no family gets more than it has', slots.every((n, i) => n <= real[i]));
  ok('the biggest family gets the most places', slots[2] === Math.max(...slots));
  ok('and the share tracks the corpus, not recency', slots[0] > slots[1] && slots[4] > slots[5]);

  eq('a corpus smaller than the page is shown whole', proportionalSlots([3, 3], 25), [3, 3]);
  eq('an empty corpus asks for nothing', proportionalSlots([0, 0, 0], 25), [0, 0, 0]);
  eq('an empty family takes no place', proportionalSlots([0, 25], 10), [0, 10]);

  // The floor is a floor, not a suggestion: one pick from February still shows.
  eq('a one-pick family survives a 800-pick neighbour', proportionalSlots([800, 1, 1, 1, 1, 1], 25), [20, 1, 1, 1, 1, 1]);

  // More families than places. The floor cannot hold for all of them, so the
  // largest take the page — the alternative is inventing a place.
  const crowded = proportionalSlots([1, 1, 1, 1, 1, 1, 1, 1, 1, 1], 3);
  eq('a page smaller than the family count is still exactly full', crowded.reduce((a, b) => a + b, 0), 3);
  ok('and never over-serves', crowded.every((n) => n <= 1));

  // Termination: caps that bind everywhere must not spin.
  const capped = proportionalSlots([2, 2, 2], 25);
  eq('caps that bind everywhere terminate', capped, [2, 2, 2]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
