/**
 * LIVE SMOKE for Kai's market-intelligence tools — real upstreams, no model.
 *
 * NOT part of `npm test`: it spends real Polygon and Unusual Whales requests and
 * reads the app database (SELECTs only — every tool here is read-only, and the
 * proof script asserts that no non-GET request is ever sent).
 *
 * Needs POLYGON_API_KEY, UNUSUAL_WHALES_TOKEN, SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY in the environment. Nothing is printed that is a
 * secret; each answer is trimmed to what Kai would read.
 *
 *   set -a; . ./.env.prod; set +a
 *   UNUSUAL_WHALES_TOKEN=… npx tsx scripts/kai-intel-smoke.mts [SYMBOL]
 */
import { runKaiTool } from '../src/lib/kai/tools.ts';
import { polygonCalls } from '../src/lib/market/polygon.ts';
import { uwCalls } from '../src/lib/market/uw.ts';

const symbol = (process.argv[2] ?? 'NVDA').toUpperCase();
const ctx = { userId: '00000000-0000-0000-0000-000000000000', mode: 'swing' as const, requestId: 'smoke' };
const nulls = { direction: null, min_change_pct: null, min_price: null, min_volume: null };

const runs: [string, Record<string, unknown>][] = [
  ['scan_movers', nulls],
  ['read_market_context', {}],
  ['read_sectors', { sector: null }],
  ['read_sectors', { sector: 'energy' }],
  ['read_stock_today', { symbol }],
  ['read_options_flow', { symbol }],
  ['read_earnings', { symbols: [symbol, 'AAPL'] }],
  ['read_earnings', { symbols: null }],
  ['read_track_record', { symbol: null, mode: null, days: 30 }],
];

let bad = 0;
for (const [name, input] of runs) {
  const t0 = Date.now();
  const out = await runKaiTool(name, input, ctx);
  const ms = Date.now() - t0;
  const body = JSON.stringify(out);
  console.log(`\n=== ${name} ${JSON.stringify(input)}  found=${out.found}  ${ms}ms  ${body.length} chars`);
  console.log(body.slice(0, 900) + (body.length > 900 ? ' …' : ''));
  // An empty watchlist for the smoke user is the right answer, not a failure.
  if (!out.found && !(name === 'read_earnings' && input.symbols === null)) bad += 1;
}
console.log(`\nPolygon requests: ${JSON.stringify(polygonCalls())}   Unusual Whales requests: ${uwCalls()}`);
console.log(bad ? `${bad} tool(s) did not answer` : 'every tool answered from live data');
process.exit(bad ? 1 : 0);
