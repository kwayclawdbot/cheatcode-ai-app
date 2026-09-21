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
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  contractFromComponents,
  extremesFromBars,
  fireTimeOf,
  gradeContract,
  gradeFromMinuteBars,
  intrinsicValue,
  mergeExtremes,
  optionTicker,
  weekdaysBetween,
} from '../src/lib/tracking/peaks.ts';
import type { UwMinuteBar } from '../src/lib/market/uw.ts';

const FIX = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/uw');
/** Recorded Unusual Whales minute bars for the NET 297.5 put, 2026-09-21. */
const netBars = (day: string): UwMinuteBar[] =>
  (JSON.parse(readFileSync(resolve(FIX, `intraday-NET260911P00297500-${day}.json`), 'utf8')) as { data: UwMinuteBar[] }).data;

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

// CommonJS here, so the async part runs inside one function and the tally waits for it.
async function contractGrades(): Promise<void> {
section('The contract grade counts only what happened AFTER the alert (UW minute bars)');

// The real NET row: alert fired 2026-09-09 13:58:45Z at $4.30 on the Sep 11
// 297.5 put. Polygon daily bars graded it 2.05x off an $8.80 print at 13:40Z.
const NET = {
  symbol: 'NET',
  contract_ticker: 'O:NET260911P00297500',
  contract_expiry: '2026-09-11',
  created_at: '2026-09-09T13:58:45.00283+00:00',
  fired_at: '2026-09-09T13:58:45.002830+00:00',
};
{
  ok(
    'the fire time is the engine\'s own stamp',
    fireTimeOf({ fired_at: NET.fired_at, snap_ts: '2026-09-09T14:30:00Z', created_at: '2026-09-09T15:00:00Z' }) === '2026-09-09T13:58:45.002Z',
  );
  ok('then the snapshot\'s', fireTimeOf({ fired_at: null, snap_ts: '2026-09-09T14:30:00Z', created_at: '2026-09-09T15:00:00Z' }) === '2026-09-09T14:30:00.000Z');
  ok('then the row\'s', fireTimeOf({ fired_at: 'nonsense', snap_ts: null, created_at: '2026-09-09T15:00:00Z' }) === '2026-09-09T15:00:00.000Z');
  ok('a Friday-to-Monday life is two sessions', weekdaysBetween('2026-09-11', '2026-09-14').join() === '2026-09-11,2026-09-14');

  const sessions = new Map([
    ['2026-09-09', netBars('2026-09-09')],
    ['2026-09-10', netBars('2026-09-10')],
    ['2026-09-11', netBars('2026-09-11')],
  ]);
  const g = gradeFromMinuteBars({ firedAt: fireTimeOf(NET), expiry: NET.contract_expiry, sessions, ticker: NET.contract_ticker, underlyingCloseOnExpiry: null });
  ok('the $8.80 print from 13:40Z, before the alert, is NOT the peak', g.peak !== 8.8, g);
  ok('the peak is the best price after the alert: $4.75', g.peak === 4.75, g.peak);
  ok('stamped to its minute, 14:21Z', g.peak_at === '2026-09-09T14:21:00.000Z', g.peak_at);
  ok('so the multiple on a $4.30 cost is 1.10x, not 2.05x', Math.round((g.peak! / 4.3) * 100) / 100 === 1.1);
  ok('the minute the alert fired in is dropped (13:58 bar starts before 13:58:45)', g.minutes_before_fire_ignored >= 1, g.minutes_before_fire_ignored);
  ok('the expiry value is its last trade on Sep 11, $0.13', g.expiry_value === 0.13 && g.expiry_value_from === 'last_trade', g);

  // The same grade through the fetching path, with the recorded answers as UW.
  const asked: string[] = [];
  const res = await gradeContract(
    { ...NET, fired_at: fireTimeOf(NET) },
    {
      today: '2026-09-21',
      intraday: async (sym, day) => {
        asked.push(`${sym}@${day}`);
        return { ok: true, data: sessions.get(day) ?? [] };
      },
      underlyingClose: async () => {
        throw new Error('not needed: the contract traded on its expiry day');
      },
    },
  );
  ok('the fetching path gives the same grade', res.ok && res.grade.peak === 4.75 && res.grade.expiry_value === 0.13, res);
  ok('UW is asked with the bare OCC symbol, once per session, three in all', asked.join() === 'NET260911P00297500@2026-09-09,NET260911P00297500@2026-09-10,NET260911P00297500@2026-09-11', asked);

  const failed = await gradeContract(
    { ...NET, fired_at: fireTimeOf(NET) },
    { today: '2026-09-21', intraday: async (_s, day) => (day === '2026-09-10' ? { ok: false, reason: 'rate_limited' } : { ok: true, data: [] }), underlyingClose: async () => null },
  );
  ok('a session UW could not answer leaves the row ungraded, not half-graded', !failed.ok && /2026-09-10: rate_limited/.test(failed.ok ? '' : failed.reason), failed);
}
{
  // The contract did not trade on its expiry day: it settles to intrinsic.
  const g = gradeFromMinuteBars({
    firedAt: '2026-09-09T13:58:45Z',
    expiry: '2026-09-11',
    sessions: new Map([['2026-09-09', netBars('2026-09-09')], ['2026-09-11', []]]),
    ticker: 'O:NET260911P00297500',
    underlyingCloseOnExpiry: 290.1,
  });
  ok('no trade on expiry: the put is worth strike minus close, $7.40', g.expiry_value === 7.4 && g.expiry_value_from === 'intrinsic', g);
  ok('an out-of-the-money contract settles to zero, which is a real value', intrinsicValue('O:NET260911P00297500', 310) === 0);
  ok('a call is close minus strike', intrinsicValue('MRNA260821C00120000', 125.5) === 5.5);
  const none = gradeFromMinuteBars({ firedAt: '2026-09-09T13:58:45Z', expiry: '2026-09-11', sessions: new Map([['2026-09-11', []]]), ticker: 'O:NET260911P00297500', underlyingCloseOnExpiry: null });
  ok('never traded after the alert and no close: peak and value are null, not zero', none.peak === null && none.expiry_value === null && none.expiry_value_from === null);
}
{
  const fired = '2026-09-09T14:00:00Z';
  const bar = (t: string, h: string): UwMinuteBar => ({ start_time: t, open: h, high: h, low: h, close: h });
  const g = gradeFromMinuteBars({
    firedAt: fired,
    expiry: '2026-09-09',
    sessions: new Map([['2026-09-09', [bar('2026-09-09T13:59:00Z', '9.99'), bar('2026-09-09T14:00:00Z', '3.10'), bar('2026-09-09T15:00:00Z', '3.40')]]]),
    ticker: 'O:NET260909P00297500',
    underlyingCloseOnExpiry: null,
  });
  ok('a bar starting exactly at the fire time counts; one a minute earlier does not', g.peak === 3.4 && g.minutes_after_fire === 2 && g.minutes_before_fire_ignored === 1, g);
}

}

/* ------------------------------------------------------------------ */

contractGrades().then(
  () => {
    console.log(`\n${pass} passed, ${fail} failed`);
    if (fail) process.exit(1);
  },
  (e) => {
    console.log(`  FAIL  the contract grade section threw: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  },
);
