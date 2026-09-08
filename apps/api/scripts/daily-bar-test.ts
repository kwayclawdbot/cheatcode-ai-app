/**
 * ONE SESSION, ONE CANDLE — and one stamp it may be stored under.
 *
 *   cd apps/api && npm test
 *
 * WHAT WAS ON THE WIRE. `GET /api/v1/market/candles?symbol=AAPL&tf=1d`, read on
 * 2026-09-06, ended like this:
 *
 *     2026-09-03T04:00:00.000Z  o 324.87   c 328.21
 *     2026-09-04T04:00:00.000Z  o 328.305  c 319.97
 *     2026-09-04T20:00:00.000Z  o 328.305  c 319.97   <- Friday, again
 *
 * Two rows for Friday, identical to the cent. TSLA had one, so it was not a
 * feed-wide fault — it was per-symbol, and the symbols it hit were the ones
 * whose quote had fallen through to the grouped-daily endpoint.
 *
 * WHY. Polygon hands the same session out under two timestamps, and this is
 * measured, not assumed — both were fetched live while writing this file:
 *
 *     /v2/aggs/ticker/AAPL/range/1/day/…  →  t = 1788494400000  (04:00Z, 00:00 ET)
 *     /v2/aggs/grouped/…/2026-09-04       →  t = 1788552000000  (20:00Z, 16:00 ET)
 *
 * `candles` is keyed on (symbol, timeframe, ts), so those are two rows, and the
 * grouped fallback wrote its one without restamping. The damage was not only
 * the phantom candle on the chart: `readLastDailyBars` takes the two newest
 * rows as "last" and "previous", so for a duplicated symbol the previous close
 * was the SAME session — a change % computed against itself. It also hid the
 * ticker-strip timezone bug for exactly those symbols, because a 20:00Z stamp
 * happens to land on the right ET date in a US-Pacific browser and a 04:00Z one
 * does not.
 *
 * THE RULE THIS FILE PINS: a daily bar is stored at MIDNIGHT ET on the session
 * it covers — the range-aggregate stamp, because that is what draws the chart
 * and what `basisCloseFromDaily` already reads. The 16:00 restamp still exists
 * as `closeStampOf`, and it is about how a PRICE IS LABELLED, never about a key.
 *
 * Nothing here deletes a row. The write path stops making duplicates and the
 * read path collapses the ones already stored.
 */
import type { Candle } from '@shared/api';
import {
  basisCloseFromDaily,
  collapseDailySessions,
  dailyBarStamp,
} from '../src/lib/market/polygon.ts';

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

const bar = (ts: string, o: number, h: number, l: number, c: number, v: number): Candle =>
  ({ ts, o, h, l, c, v } as Candle);

/* ------------------------------------------------------------------ */
/* The fixture — AAPL exactly as the endpoint returned it              */
/* ------------------------------------------------------------------ */

const AAPL_WITH_DUPLICATE: Candle[] = [
  bar('2026-09-02T04:00:00.000Z', 326.865, 329.15, 324.4, 324.96, 33_776_370),
  bar('2026-09-03T04:00:00.000Z', 324.87, 329.6, 324.05, 328.21, 37_225_838),
  bar('2026-09-04T04:00:00.000Z', 328.305, 330.09, 318.36, 319.97, 39_606_884),
  bar('2026-09-04T20:00:00.000Z', 328.305, 330.09, 318.36, 319.97, 39_606_884),
];

console.log('\nThe duplicated Friday\n---------------------');

const collapsed = collapseDailySessions(AAPL_WITH_DUPLICATE);

ok('four rows for three sessions come back as three candles', collapsed.length === 3, collapsed.map((c) => c.ts));
ok(
  'the survivor is stamped at midnight ET, like every other daily bar',
  collapsed[2].ts === '2026-09-04T04:00:00.000Z',
  collapsed[2].ts
);
ok('and it still carries Friday\'s numbers', collapsed[2].o === 328.305 && collapsed[2].c === 319.97, collapsed[2]);
ok('the sessions before it are untouched', collapsed[0].c === 324.96 && collapsed[1].c === 328.21);
ok('the series stays in order, oldest first', collapsed.map((c) => c.ts).join() === [...collapsed].map((c) => c.ts).sort().join());

/*
  THE SECOND VICTIM. Two rows for one session made a symbol its own previous
  close. This is the arithmetic that produced, and now cannot produce, a
  guaranteed 0.00% day.
*/
const newestTwo = (list: Candle[]) => [...list].reverse().slice(0, 2);
const rawPair = newestTwo(AAPL_WITH_DUPLICATE);
ok(
  'the raw rows really do read Friday as its own previous session (the bug)',
  rawPair[0].c === rawPair[1].c && rawPair[0].ts !== rawPair[1].ts,
  rawPair.map((c) => c.ts)
);
const fixedPair = newestTwo(collapsed);
ok(
  'collapsed, the previous close is Thursday\'s 328.21',
  fixedPair[1].c === 328.21,
  fixedPair.map((c) => [c.ts, c.c])
);

/* ------------------------------------------------------------------ */
/* The stamp                                                            */
/* ------------------------------------------------------------------ */

console.log('\nThe one stamp a daily bar may have\n---------------------------------');

ok(
  'the grouped 16:00 ET stamp becomes the session-start stamp',
  dailyBarStamp('2026-09-04T20:00:00.000Z') === '2026-09-04T04:00:00.000Z'
);
ok(
  'the range stamp is already canonical and does not move',
  dailyBarStamp('2026-09-04T04:00:00.000Z') === '2026-09-04T04:00:00.000Z'
);
ok(
  'restamping twice changes nothing',
  dailyBarStamp(dailyBarStamp('2026-09-04T20:00:00.000Z')) === '2026-09-04T04:00:00.000Z'
);
/*
  WINTER. Midnight ET is 05:00Z under EST, not 04:00Z — a hard-coded four hours
  would put every January bar on the previous session for five hours a day.
*/
ok(
  'in January midnight ET is 05:00Z',
  dailyBarStamp('2027-01-15T21:00:00.000Z') === '2027-01-15T05:00:00.000Z',
  dailyBarStamp('2027-01-15T21:00:00.000Z')
);
ok('an unparseable stamp is handed back untouched, not guessed at', dailyBarStamp('whenever') === 'whenever');

/* ------------------------------------------------------------------ */
/* The basis still reads the same session                               */
/* ------------------------------------------------------------------ */

console.log('\nWhat a change % is measured from\n--------------------------------');

/*
  `basisCloseFromDaily` walks the daily series for the newest session that had
  ALREADY CLOSED when the price printed. Restamping the bars from 20:00Z to
  04:00Z must not move that answer — the session a bar belongs to is what the
  function reads, not the hour inside it.
*/
const fridayAfterHours = '2026-09-04T23:55:00.000Z'; // 19:55 ET Friday
ok(
  'a Friday after-hours print is measured against Friday\'s own close',
  basisCloseFromDaily(fridayAfterHours, collapsed) === 319.97,
  basisCloseFromDaily(fridayAfterHours, collapsed)
);
const fridayMidSession = '2026-09-04T17:30:00.000Z'; // 13:30 ET Friday
ok(
  'a mid-session print still reaches back to Thursday',
  basisCloseFromDaily(fridayMidSession, collapsed) === 328.21,
  basisCloseFromDaily(fridayMidSession, collapsed)
);
ok(
  'and the duplicate never changed that answer either way',
  basisCloseFromDaily(fridayAfterHours, AAPL_WITH_DUPLICATE) ===
    basisCloseFromDaily(fridayAfterHours, collapsed)
);

/* ------------------------------------------------------------------ */
/* Edges                                                                */
/* ------------------------------------------------------------------ */

console.log('\nEdges\n-----');

ok('an empty series stays empty', collapseDailySessions([]).length === 0);
ok('a clean series is returned unchanged', collapseDailySessions(collapsed).length === 3);
/*
  A HALF-EMPTY ROW MUST NOT WIN. `readLastDailyBars` selects only `ts` and `c`,
  so a collapse that preferred the later stamp blindly would let a bar with no
  open, high, low or volume replace the full one on a merged list.
*/
const sparse = { ts: '2026-09-04T20:00:00.000Z', o: null, h: null, l: null, c: 319.97, v: null } as Candle;
const merged = collapseDailySessions([AAPL_WITH_DUPLICATE[2], sparse]);
ok('the fuller bar survives a collapse against a bare one', merged.length === 1 && merged[0].o === 328.305, merged[0]);

/* ------------------------------------------------------------------ */
console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
