/**
 * LIVE PRICES — the two rules, and the bill.
 *
 *   cd apps/api && npx tsx scripts/live-quote-test.ts
 *   (with real market data:  npx tsx --env-file=.env.local scripts/live-quote-test.ts)
 *
 * WHAT THIS GUARDS. Until 2026-09-06 every price taken off a `setups` row was
 * the number a scanner froze into `quote_snapshot`, shown with the freshness
 * word that had ALSO been frozen into it. A snapshot written last Tuesday said
 * "delayed" this morning, in a product whose entire promise is that the number
 * on the screen is the number in the market.
 *
 * Three things can go wrong and none of them raises an error:
 *
 *   1. an old price is shown as if it were current — the original bug;
 *   2. a real old price is thrown away to avoid labelling it, leaving a blank
 *      where a fact was;
 *   3. the fix quietly costs one Polygon request per row, and a twenty-row
 *      list fires twenty calls that nobody sees until the bill or the 429.
 *
 * So the cases below assert the price, the label AND the request count.
 *
 * The pure section runs anywhere. The live section needs POLYGON_API_KEY and
 * says so rather than passing silently.
 */
import { quoteFor, attachLiveQuotes, liveMarketBlock, SEED_RUN_ID, type QuotableRow } from '../src/lib/market/live.ts';
import {
  polygonCalls,
  resetPolygonCalls,
  resetMarketCaches,
  polygonConfigured,
  sessionNow,
  buildQuote,
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

/** How long ago, in real time. Market time is what the code measures. */
function agoISO(days: number, hours = 0): string {
  return new Date(Date.now() - days * 86_400_000 - hours * 3_600_000).toISOString();
}

/* ------------------------------------------------------------------ */
section('A frozen freshness word is not evidence');

/**
 * The exact shape the old code trusted: a row whose snapshot SAYS it is live.
 * Nine days of calendar guarantees several whole sessions of market time have
 * passed however this test is run, so the verdict cannot be `live` or
 * `delayed` under any clock.
 */
const stale = quoteFor({
  symbol: 'NVDA',
  quote_snapshot: { price: 123.45, source_ts: agoISO(9), received_ts: agoISO(9), freshness: 'live' },
});
ok('a snapshot that CLAIMS "live" from nine days ago is not live', stale.freshness === 'stale', stale);
ok('and the real price survives the demotion — a blank is not more honest', stale.price === 123.45, stale);
ok('the label names when it was last seen rather than asserting a price now',
  /last seen/i.test(stale.label_plain), stale.label_plain);

/* ------------------------------------------------------------------ */
section('The last real price, with the time it happened');

const noPrice = quoteFor({ symbol: 'ABCD', quote_snapshot: {} });
ok('nothing to show is null, never a zero and never a placeholder', noPrice.price === null, noPrice);
ok('and it does not claim a time it does not have', noPrice.label_plain.includes('time unknown'), noPrice.label_plain);

const seeded = quoteFor({
  symbol: 'META',
  scanner_run_id: SEED_RUN_ID,
  quote_snapshot: { price: 576.14, source_ts: agoISO(3) },
});
ok('a seeded fixture reads as sample data, not as market data',
  seeded.label_plain.startsWith('Sample data'), seeded.label_plain);

/* ------------------------------------------------------------------ */
section('Live wins, but only when it is actually a price');

const live = buildQuote({ symbol: 'NVDA', price: 229.49, prevClose: 228.45, sourceTs: new Date().toISOString(), kind: 'print' });
const both = quoteFor({
  symbol: 'NVDA',
  quote_snapshot: { price: 123.45, source_ts: agoISO(9) },
  live_quote: live,
});
ok('a live quote replaces the stored one', both.price === 229.49, both.price);

const emptyLive = buildQuote({ symbol: 'NVDA', price: null, prevClose: null, sourceTs: null });
const fellBack = quoteFor({
  symbol: 'NVDA',
  quote_snapshot: { price: 123.45, source_ts: agoISO(9) },
  live_quote: emptyLive,
});
ok('a live answer with NO price never displaces a real stored one', fellBack.price === 123.45, fellBack.price);

/* ------------------------------------------------------------------ */
/* The live section                                                     */
/* ------------------------------------------------------------------ */

const TWENTY = [
  'SPY', 'QQQ', 'NVDA', 'AAPL', 'MSFT', 'AMZN', 'META', 'GOOGL', 'TSLA', 'AMD',
  'AVGO', 'NFLX', 'CRM', 'ORCL', 'COST', 'JPM', 'XOM', 'UNH', 'WMT', 'PLTR',
];

async function live_(): Promise<void> {
  if (!polygonConfigured()) {
    section('Live pass SKIPPED — no POLYGON_API_KEY in this environment');
    console.log('  (run with: npx tsx --env-file=.env.local scripts/live-quote-test.ts)');
    return;
  }

  section(`Twenty rows, one request  ·  the market is ${sessionNow()}`);

  resetMarketCaches();
  resetPolygonCalls();
  const rows: QuotableRow[] = TWENTY.map((symbol) => ({
    symbol,
    quote_snapshot: { price: 1, source_ts: agoISO(30) },
  }));
  const result = await attachLiveQuotes(rows);
  const calls = polygonCalls();
  const snapshotCalls = Object.entries(calls.by_path)
    .filter(([p]) => p.includes('/snapshot/'))
    .reduce((a, [, n]) => a + n, 0);

  ok('twenty symbols cost exactly ONE snapshot request', snapshotCalls === 1, calls);
  ok('and the whole screen costs at most two requests in total (the second is the session)',
    calls.total <= 2, calls);

  const priced = rows.filter((r) => r.live_quote && r.live_quote.price !== null);
  ok('every liquid name came back with a price', priced.length === rows.length,
    rows.filter((r) => !r.live_quote?.price).map((r) => r.symbol));
  ok('nothing is degraded when every symbol answered', result.degraded === false, result);

  const quotes = rows.map((r) => quoteFor(r));
  ok('every price carries a timestamp it can be judged by',
    quotes.every((q) => Boolean(q.source_ts)), quotes.map((q) => [q.symbol, q.source_ts]));
  ok('every label names the time in New York', quotes.every((q) => q.label_plain.includes('ET')),
    quotes.slice(0, 3).map((q) => q.label_plain));

  const open = sessionNow() === 'open';
  if (open) {
    ok('with the market open nothing reads as market_closed',
      quotes.every((q) => q.delay_reason !== 'market_closed'),
      quotes.map((q) => [q.symbol, q.freshness, q.delay_reason]));
  } else {
    ok('with the market shut every price says so — never "live", never "stale"',
      quotes.every((q) => q.freshness === 'delayed' && q.delay_reason === 'market_closed'),
      quotes.map((q) => [q.symbol, q.freshness, q.delay_reason]));
    ok('and the label says which close it is, in words',
      quotes.every((q) => q.label_plain.startsWith('Market closed')), quotes[0].label_plain);
  }

  section('The second render is free');
  resetPolygonCalls();
  const again: QuotableRow[] = TWENTY.map((symbol) => ({ symbol, quote_snapshot: {} }));
  await attachLiveQuotes(again);
  ok('a repeat inside the cache window costs nothing', polygonCalls().total === 0, polygonCalls());

  section('The session comes from the exchange, not the wall clock');
  const block = await liveMarketBlock();
  ok('holidays are known when Polygon answered', block.holidays_known === true, block);
  ok('and the session it reports agrees with the one the quotes were built under',
    block.status === sessionNow(), [block.status, sessionNow()]);
}

live_().then(() => {
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
});
