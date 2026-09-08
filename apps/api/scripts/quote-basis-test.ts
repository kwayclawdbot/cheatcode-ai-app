/**
 * THE THREE THINGS THAT WERE LYING ON LABOR DAY 2026 (Mon 2026-09-07).
 *
 *   cd apps/api && npm test
 *
 * All three were verified against live Polygon data on the day, and all three
 * are the same class of fault: a label or a number that does not match what the
 * market actually did. None of them could be caught by a smoke run that checks
 * a field is present and of the right type, so every case below is written to
 * FAIL against the old code specifically.
 *
 *  1. A FABRICATED CHANGE %. The ticker header showed TSLA at 352.89 — Friday's
 *     19:55 ET after-hours print — against a prev_close of 376.365, which is
 *     WEDNESDAY's close. Two sessions in one pair, rendered as a red −6.24%
 *     day that never happened. (Friday's close was 354.08; the honest number is
 *     −0.34%.) NVDA showed +0.46% where the truth was −0.38%. AAPL was right,
 *     which is the tell: the old rule compared the bar's date against the date
 *     of whichever session the per-symbol snapshot fallback happened to land
 *     on, so it was correct or fabricated at random, per symbol.
 *
 *  2. AN EMPTY 1-MINUTE CHART. The default lookback was in CALENDAR days —
 *     `1m: 3` — so on the holiday the window was Sep 5 → Sep 8: a Saturday, a
 *     Sunday and a closed Monday. Zero trading sessions, `resultsCount: 0`
 *     from Polygon, `source:"none"`, blank chart. Every Monday holiday.
 *
 *  3. "DATA UNAVAILABLE" ON A CLOSED MARKET. `sessionMinutesBetween` charged a
 *     full 390-minute session to the holiday because it only knew weekends, so
 *     Friday's last print read 385 market minutes late and every quote came
 *     back `stale` / `feed_gap` — the app telling a member the pipe was broken
 *     while the exchange was simply shut.
 */
import type { Candle } from '@shared/api';
import {
  basisCloseFromDaily,
  buildQuote,
  defaultSpanFrom,
  freshnessFor,
  isTradingDate,
  lastTradingDate,
  noteNonTradingDate,
  pastOwnSessionClose,
  prevTradingDate,
  quoteLabel,
  sessionMinutesBetween,
  tradingDaysBack,
  TF_DEFAULT_SPAN_SESSIONS,
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

function section(title: string): void {
  console.log(`\n${title}\n${'-'.repeat(title.length)}`);
}

/** An ET wall-clock instant. September 2026 is EDT, so −04:00. */
function et(s: string): Date {
  return new Date(`${s}-04:00`);
}

/** A daily bar, stamped where Polygon stamps them: 00:00 ET on the session. */
function daily(date: string, close: number): Candle {
  return { ts: `${date}T04:00:00.000Z`, o: null, h: null, l: null, c: close, v: null };
}

/* ------------------------------------------------------------------ */
/* 1. The comparison basis — the real TSLA numbers from the bug report  */
/* ------------------------------------------------------------------ */
section('A change % is a pair (TSLA, 2026-09-04)');

// Polygon daily aggregates, verified 2026-09-07.
const TSLA_SEP_2 = 329.36;
const TSLA_SEP_3 = 376.365;
const TSLA_SEP_4 = 354.08;
const tslaDaily = [daily('2026-09-02', TSLA_SEP_2), daily('2026-09-03', TSLA_SEP_3), daily('2026-09-04', TSLA_SEP_4)];

// The 5-minute bar the header was actually showing: Fri 2026-09-04 19:55 ET.
const AFTER_HOURS_BAR = '2026-09-04T23:55:00.000Z';
const AFTER_HOURS_PRICE = 352.89;

ok(
  "an after-hours print from a COMPLETED session is measured against THAT session's close",
  basisCloseFromDaily(AFTER_HOURS_BAR, tslaDaily) === TSLA_SEP_4,
  { got: basisCloseFromDaily(AFTER_HOURS_BAR, tslaDaily), want: TSLA_SEP_4 }
);
ok(
  'and never against the session before it — the 376.365 that printed −6.24%',
  basisCloseFromDaily(AFTER_HOURS_BAR, tslaDaily) !== TSLA_SEP_3
);

const honest = buildQuote({
  symbol: 'TSLA',
  price: AFTER_HOURS_PRICE,
  prevClose: basisCloseFromDaily(AFTER_HOURS_BAR, tslaDaily),
  sourceTs: AFTER_HOURS_BAR,
  bar: '5m',
});
ok('so the rendered move is −0.34%, the after-hours drift', honest.change_pct === -0.34, honest);
ok('and NOT the −6.24% day that never happened', honest.change_pct !== -6.24, honest);

// The same rule, walked across a whole session, in the order a day happens.
ok(
  'pre-market of an IN-PROGRESS session compares against the prior close',
  // Fri 08:00 ET. Friday has not closed, so it cannot be its own basis.
  basisCloseFromDaily('2026-09-04T12:00:00.000Z', tslaDaily) === TSLA_SEP_3
);
ok(
  'regular hours compares against the prior close',
  // Fri 11:00 ET.
  basisCloseFromDaily('2026-09-04T15:00:00.000Z', tslaDaily) === TSLA_SEP_3
);
ok(
  'the last bar INSIDE the session (15:55 ET) still compares against the prior close',
  basisCloseFromDaily('2026-09-04T19:55:00.000Z', tslaDaily) === TSLA_SEP_3
);
ok(
  "the first bar of after-hours (16:00 ET) flips to the session's own close",
  basisCloseFromDaily('2026-09-04T20:00:00.000Z', tslaDaily) === TSLA_SEP_4
);
ok(
  'and over a whole weekend the basis does not drift — still Friday',
  // The Monday-holiday read: the newest print is unchanged, so the basis is too.
  basisCloseFromDaily(AFTER_HOURS_BAR, tslaDaily) === TSLA_SEP_4
);

// NVDA, the second symbol that was fabricating a move.
const nvdaDaily = [daily('2026-09-03', 228.45), daily('2026-09-04', 230.36)];
const nvda = buildQuote({
  symbol: 'NVDA',
  price: 229.4873,
  prevClose: basisCloseFromDaily(AFTER_HOURS_BAR, nvdaDaily),
  sourceTs: AFTER_HOURS_BAR,
  bar: '5m',
});
ok('NVDA reads −0.38%, not the +0.46% the old pairing printed', nvda.change_pct === -0.38, nvda);

ok('a session that has not closed is not past its own close', pastOwnSessionClose('2026-09-04T15:00:00.000Z') === false);
ok('an evening print is past its own close', pastOwnSessionClose(AFTER_HOURS_BAR) === true);
ok(
  'no daily bar for the right session yields no basis, never a guess',
  basisCloseFromDaily(AFTER_HOURS_BAR, [daily('2026-08-20', 300)]) === 300 &&
    basisCloseFromDaily('2026-08-19T15:00:00.000Z', [daily('2026-08-20', 300)]) === null
);

/* ------------------------------------------------------------------ */
/* 3. A closed market is not a broken feed                              */
/*    (before the lookback, because it seeds the holiday calendar)      */
/* ------------------------------------------------------------------ */
section('A closed market is not a broken feed');

// Bare clock knowledge: the holiday looks like an ordinary Monday and costs a
// full session, which is what graded every quote `stale`.
ok(
  'without the exchange calendar a holiday still costs a full session',
  sessionMinutesBetween(et('2026-09-04T19:55:00'), et('2026-09-07T21:18:00')) === 390
);

// What `/v1/marketstatus/now` told us on the day: Monday was shut.
noteNonTradingDate('2026-09-07');

ok('the observed holiday is not a trading date', isTradingDate('2026-09-07') === false);
ok('the Friday before it still is', isTradingDate('2026-09-04') === true);
ok('and the session before the holiday is that Friday', prevTradingDate('2026-09-07') === '2026-09-04');
ok(
  'so a Friday print ages ZERO market minutes across the holiday weekend',
  sessionMinutesBetween(et('2026-09-04T19:55:00'), et('2026-09-07T21:18:00')) === 0
);

const closed = freshnessFor('2026-09-04T23:55:00.000Z', { bar: '5m', now: et('2026-09-07T21:18:00') });
ok('a quote over the holiday reads market_closed', closed.delay_reason === 'market_closed', closed);
ok('and is NEVER feed_gap — the market is shut, not broken', closed.delay_reason !== 'feed_gap', closed);
ok('it is delayed, which keeps the buttons enabled', closed.freshness === 'delayed', closed);
ok(
  'and it says so in words',
  quoteLabel(closed.freshness, closed.delay_reason, '2026-09-04T23:55:00.000Z', '5m').startsWith('Market closed'),
  quoteLabel(closed.freshness, closed.delay_reason, '2026-09-04T23:55:00.000Z', '5m')
);
ok(
  'the last trading date after 16:45 on a holiday is the Friday, not the holiday',
  lastTradingDate(et('2026-09-07T17:00:00')) === '2026-09-04'
);

// `feed_gap` still means what it means: the market is OPEN and nothing arrives.
const abandoned = freshnessFor('2026-09-08T13:35:00.000Z', { bar: '5m', now: et('2026-09-08T15:00:00') });
ok('a feed that quits mid-session is still stale / feed_gap', abandoned.delay_reason === 'feed_gap', abandoned);

/* ------------------------------------------------------------------ */
/* 2. The default lookback is in TRADING SESSIONS                       */
/* ------------------------------------------------------------------ */
section('A default window always contains sessions');

/** Sessions inside an inclusive [from, to] date range. */
function sessionsIn(from: string, to: string): number {
  let n = 0;
  let d = from;
  for (let i = 0; i < 400 && d <= to; i++) {
    if (isTradingDate(d)) n += 1;
    const dt = new Date(`${d}T12:00:00Z`);
    dt.setUTCDate(dt.getUTCDate() + 1);
    d = dt.toISOString().slice(0, 10);
  }
  return n;
}

// The exact request from the bug report: a 1m chart opened at 21:18 ET on
// Labor Day, which is 2026-09-08 in UTC — the date the route uses for `to`.
const TO = '2026-09-08';

ok(
  'the OLD calendar rule (3 days) put zero sessions in the window',
  // Sep 5 Sat, Sep 6 Sun, Sep 7 holiday. This is the empty chart, reproduced.
  sessionsIn('2026-09-05', '2026-09-07') === 0
);

const from1m = defaultSpanFrom('1m', TO);
ok('the 1m window now starts on a session', isTradingDate(from1m), from1m);
ok(
  'and holds the three sessions it promises',
  sessionsIn(from1m, TO) >= TF_DEFAULT_SPAN_SESSIONS['1m'],
  { from: from1m, to: TO, sessions: sessionsIn(from1m, TO) }
);

for (const tf of ['1m', '5m', '15m', '1h', '4h', '1d'] as const) {
  const from = defaultSpanFrom(tf, TO);
  ok(
    `${tf} covers its ${TF_DEFAULT_SPAN_SESSIONS[tf]} sessions over the holiday weekend`,
    sessionsIn(from, TO) >= TF_DEFAULT_SPAN_SESSIONS[tf],
    { tf, from, sessions: sessionsIn(from, TO) }
  );
}

// The ceiling `clampFrom` enforces is ~50 calendar days of one-minute bases.
// Widening past it is what truncated the 15-minute chart by nine days.
function calendarDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
for (const tf of ['1m', '5m', '15m', '1h'] as const) {
  const span = calendarDays(defaultSpanFrom(tf, TO), TO);
  ok(`${tf} stays inside the 50-day base-aggregate ceiling (${span} days)`, span <= 50, { tf, span });
}
ok(
  '4h is unchanged against its old 120-day span (clampFrom handles it as before)',
  calendarDays(defaultSpanFrom('4h', TO), TO) <= 120
);
ok(
  '1d is unchanged against its old 180-day span',
  calendarDays(defaultSpanFrom('1d', TO), TO) <= 180
);

ok('a one-session walk back from a Monday lands on the Friday', tradingDaysBack(1, '2026-09-08') === '2026-09-08');
ok('two sessions back from Tuesday skips the holiday weekend', tradingDaysBack(2, '2026-09-08') === '2026-09-04');
ok('the walk is bounded and always returns a date', /^\d{4}-\d{2}-\d{2}$/.test(tradingDaysBack(500, TO)));

/* ------------------------------------------------------------------ */
console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'}  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
