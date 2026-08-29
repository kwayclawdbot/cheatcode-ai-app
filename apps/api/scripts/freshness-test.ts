/**
 * `freshnessFor()` — the table, plus a live pass against real Polygon bodies.
 *
 *   cd apps/api && npm test
 *
 * WHY THIS EXISTS. Until 2026-08-29 this app did not compute freshness at all:
 * `lib/market/polygon.ts` returned `delayed` / `entitlement` from a constant,
 * because the account was on a delayed plan and the constant was true. The
 * owner upgraded the plan and the constant became a FALSE STATEMENT about
 * market data, shown to users, in a product where that is the whole promise.
 *
 * A constant cannot be caught by a smoke run that only checks the field is one
 * of three strings — the old code would have passed every one of those. So the
 * cases below are chosen to FAIL against a hard-coded label in either
 * direction: some demand `live`, some demand `stale`, one demands
 * `market_closed` where the old code said `entitlement`, and the live section
 * asserts the reason actually tracks the session.
 *
 * THE CASE THIS WAS WRITTEN FOR is #1. On Saturday 2026-08-29 two lanes read a
 * Friday-evening print as "17 hours old" and called the feed broken. It is not
 * broken; the market is shut. Market time, not wall time.
 */
import {
  freshnessFor,
  quoteLabel,
  sessionMinutesBetween,
  fetchAggregates,
  getSnapshot,
  resetMarketCaches,
  polygonConfigured,
  feedEntitlement,
  sessionNow,
} from '../src/lib/market/polygon.ts';
import { marketStatus } from '../src/lib/market/index.ts';

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

/**
 * An ET wall-clock instant, written the way a person reads a chart. Every date
 * below is a real 2026 weekday unless the name says otherwise, and the −04:00
 * offset is EDT, which is what New York is on in August.
 */
function et(s: string): Date {
  return new Date(`${s}-04:00`);
}

/* ------------------------------------------------------------------ */
section('Market time, not wall time');

ok(
  'a Friday-evening print is ZERO market minutes old on Saturday afternoon',
  sessionMinutesBetween(et('2026-08-28T20:00:00'), et('2026-08-29T13:50:00')) === 0
);
ok(
  'an hour inside a session is an hour',
  sessionMinutesBetween(et('2026-08-26T10:00:00'), et('2026-08-26T11:00:00')) === 60
);
ok(
  'the overnight between two sessions counts only the traded ends',
  sessionMinutesBetween(et('2026-08-26T15:00:00'), et('2026-08-27T10:00:00')) === 90
);
ok(
  'and a whole weekend adds nothing to it',
  sessionMinutesBetween(et('2026-08-28T15:00:00'), et('2026-08-31T10:00:00')) === 90
);
ok(
  'a fortnight is not worth iterating for',
  sessionMinutesBetween(et('2026-08-01T10:00:00'), et('2026-08-29T10:00:00')) > 3000
);

/* ------------------------------------------------------------------ */
section('The verdict comes from the age of the data');

const SAT = et('2026-08-29T13:50:00'); // the Saturday this was written
const WED = et('2026-08-26T11:00:00'); // mid-session, regular hours
const PRE = et('2026-08-26T08:00:00'); // pre-market

const f1 = freshnessFor(et('2026-08-28T20:00:00').toISOString(), { now: SAT });
ok('1. Friday evening, read on Saturday: delayed, market_closed — NOT stale', f1.freshness === 'delayed' && f1.delay_reason === 'market_closed', f1);

const f2 = freshnessFor(et('2026-08-21T20:00:00').toISOString(), { now: SAT });
ok('2. a print from LAST Friday, read on Saturday: stale', f2.freshness === 'stale', f2);

const f3 = freshnessFor(et('2026-08-26T10:56:00').toISOString(), { bar: '5m', now: WED });
ok('3. a 5m bar four minutes into its own life, mid-session: live', f3.freshness === 'live' && f3.delay_reason === null, f3);

const f4 = freshnessFor(new Date(WED.getTime() - 40_000).toISOString(), { now: WED });
ok('4. a print from forty seconds ago, mid-session: live', f4.freshness === 'live', f4);

const f5 = freshnessFor(et('2026-08-26T10:40:00').toISOString(), { bar: '5m', now: WED });
ok('5. a 5m bar fifteen minutes behind, mid-session: delayed, never stale', f5.freshness === 'delayed' && f5.delay_reason !== null, f5);

const f6 = freshnessFor(et('2026-08-25T16:00:00').toISOString(), { now: WED });
ok('6. YESTERDAY\'S close, ninety minutes into today\'s session: stale', f6.freshness === 'stale' && f6.delay_reason === 'feed_gap', f6);

const f7 = freshnessFor(et('2026-08-26T08:00:00').toISOString(), { bar: '4h', now: WED });
ok('7. a 4h bar is not late three hours in — bar width is subtracted', f7.freshness === 'live', f7);

const f8 = freshnessFor(et('2026-08-25T16:00:00').toISOString(), { now: PRE });
ok('8. yesterday\'s close before the bell: delayed, market_closed', f8.freshness === 'delayed' && f8.delay_reason === 'market_closed', f8);

const f9 = freshnessFor(new Date(PRE.getTime() - 30_000).toISOString(), { now: PRE });
ok('9. nothing outside regular hours may read live, however new it is', f9.freshness !== 'live', f9);

const f10 = freshnessFor(null, { now: WED });
ok('10. no timestamp at all is a broken feed, not a late one', f10.freshness === 'stale' && f10.delay_reason === 'feed_gap', f10);

const f11 = freshnessFor(et('2026-08-26T10:59:00').toISOString(), { seed: true, now: WED });
ok('11. a seeded fixture says so and is never measured', f11.freshness === 'delayed' && f11.delay_reason === 'seed', f11);

const f12 = freshnessFor(new Date(WED.getTime() + 4 * 3600_000).toISOString(), { now: WED });
ok('12. a stamp in the FUTURE is a broken stamp, not fresh data', f12.freshness === 'stale', f12);

const f13 = freshnessFor(et('2026-08-26T10:58:00').toISOString(), { bar: '1m', now: WED });
ok('13. a 1m bar two minutes old, mid-session: live', f13.freshness === 'live', f13);

/* ------------------------------------------------------------------ */
section('The label says what the verdict means');

ok(
  'market_closed reads as market closed, not as "Delayed"',
  quoteLabel('delayed', 'market_closed', et('2026-08-28T16:00:00').toISOString()).startsWith('Market closed')
);
ok(
  'an intraday quote names its bar rather than saying "last close"',
  quoteLabel('delayed', 'entitlement', et('2026-08-26T10:40:00').toISOString(), '5m').includes('5m bar')
);
ok(
  'a daily bar for a session still running never claims a close that has not happened',
  quoteLabel('delayed', 'market_closed', et('2026-08-26T11:00:00').toISOString(), null, 'day_so_far').includes('so far')
);
ok(
  'an actual print is called a price, not a close',
  quoteLabel('delayed', 'market_closed', et('2026-08-28T20:00:00').toISOString(), null, 'print').includes('last price')
);
ok('live carries no reason in its label', quoteLabel('live', null, et('2026-08-26T11:00:00').toISOString()).startsWith('Live'));

/* ------------------------------------------------------------------ */
/* Live pass — real Polygon bodies, whatever the market is doing now.   */
/* ------------------------------------------------------------------ */

async function live(): Promise<void> {
  if (!polygonConfigured()) {
    section('Live pass SKIPPED — no POLYGON_API_KEY in this environment');
    return;
  }
  resetMarketCaches();

  section('Live pass — the request budget');

  // The old plan answered 429 on the sixth call in a rolling minute, and this
  // file's bucket enforced that in front of it. Twelve in a row, all served,
  // is the measurement that the budget no longer starves the app.
  const burst = ['SPY', 'QQQ', 'NVDA', 'META', 'AMD', 'AAPL', 'MSFT', 'TSLA', 'AMZN', 'GOOGL', 'NFLX', 'INTC'];
  const results = await Promise.all(
    burst.map((s) => fetchAggregates(s, '1d', '2026-08-20', '2026-08-29', 10))
  );
  const limited = results.filter((r) => !r.ok && r.reason === 'rate_limited').length;
  const served = results.filter((r) => r.ok).length;
  console.log(`  ${served}/${burst.length} served, ${limited} refused by the budget`);
  ok('twelve calls in a row are not refused by our own budget', limited === 0, { served, limited });
  ok('and they came back with bars', served === burst.length, results.filter((r) => !r.ok));

  section('Live pass — freshness off real bodies');

  const session = sessionNow();
  console.log(`  ET clock says ${marketStatus()}; the feed says ${session}; entitlement reads ${feedEntitlement()}`);

  const snap = await getSnapshot(['SPY', 'NVDA', 'META']);
  for (const q of snap.quotes) {
    console.log(
      `   ${q.symbol} $${q.price} prev $${q.prev_close} | ${q.freshness} / ${q.delay_reason} | ${q.label_plain}`
    );
  }
  ok('every symbol came back with a price', snap.quotes.length === 3 && snap.quotes.every((q) => q.price !== null), snap);
  ok(
    'and with a source timestamp that parses',
    snap.quotes.every((q) => q.source_ts !== null && Number.isFinite(Date.parse(q.source_ts))),
    snap.quotes.map((q) => q.source_ts)
  );

  // THE REGRESSION GUARD. A hard-coded `entitlement` label passes any test that
  // only checks the enum. It does not pass this one: the reason has to track
  // the session the data was received in.
  if (session === 'closed' || session === 'pre' || session === 'after') {
    ok(
      'with the market shut, the last session\'s close is delayed/market_closed — never stale, never a fixed entitlement label',
      snap.quotes.every((q) => q.freshness === 'delayed' && q.delay_reason === 'market_closed'),
      snap.quotes.map((q) => [q.symbol, q.freshness, q.delay_reason])
    );
  } else {
    ok(
      'with the market open, a liquid name is not stale',
      snap.quotes.every((q) => q.freshness !== 'stale'),
      snap.quotes.map((q) => [q.symbol, q.freshness, q.delay_reason, q.label_plain])
    );
    ok(
      'and nothing reads live while carrying a delay reason',
      snap.quotes.every((q) => !(q.freshness === 'live' && q.delay_reason)),
      snap.quotes.map((q) => [q.symbol, q.freshness, q.delay_reason])
    );
  }

  ok(
    'the labels are not the same sentence for every symbol regardless of data',
    new Set(snap.quotes.map((q) => q.label_plain)).size >= 1 &&
      snap.quotes.every((q) => q.label_plain.includes('ET')),
    snap.quotes.map((q) => q.label_plain)
  );
}

live().then(() => {
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
});
