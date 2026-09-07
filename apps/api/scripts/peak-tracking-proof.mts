/**
 * The peak tracker, against the REAL database and the REAL Polygon account.
 *
 *   cd apps/api && ENV_FILE=.env.prod npx tsx scripts/peak-tracking-proof.mts
 *
 * `peak-tracking-test.ts` proves the arithmetic with no network and no
 * database. This proves the other half — that the sweep finds the rows it is
 * supposed to find, seeds them from unadjusted daily bars, writes extremes that
 * the generated columns then turn into a direction-correct peak, and grades the
 * option contracts the day-trade replays named.
 *
 * IT WRITES TO WHATEVER DATABASE `ENV_FILE` POINTS AT. That is the point — a
 * tracker proven against a mock is a mock that works — but it is also why the
 * file says so twice.
 *
 * WHAT IT ASKS, in order:
 *   1. how many rows are active, and what did the pass do with them;
 *   2. did every active row come out with a peak, a basis and a look-time;
 *   3. is the peak the RIGHT END for the direction — the thing a generated
 *      column exists to guarantee, checked against the raw extremes;
 *   4. did the named contracts get identified and graded, and does the peak
 *      multiple match the cost the ingest recorded;
 *   5. is the pass idempotent — run it twice and no peak may move.
 *
 * A pass run outside market hours writes no 'session' extremes, because there
 * is no session. That is correct and the script says so rather than failing:
 * the seeding path is the one that has history to reconstruct, and it is the
 * one that matters on a closed day.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

function safeRead(p: string): string {
  try {
    return readFileSync(p, 'utf8');
  } catch {
    return '';
  }
}
for (const line of safeRead(process.env.ENV_FILE ?? resolve(HERE, '../.env.local')).split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const { runPeakTracking } = await import('../src/lib/tracking/peaks.ts');
const { polygonCalls, resetPolygonCalls } = await import('../src/lib/market/polygon.ts');

const URL_BASE = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

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
function section(t: string): void {
  console.log(`\n${t}`);
}

async function rows<T>(path: string): Promise<T[]> {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`);
  return (await res.json()) as T[];
}

type Tracked = {
  id: string;
  symbol: string;
  intent: string;
  call_price: number | null;
  high_price: number | null;
  high_at: string | null;
  high_basis: string | null;
  low_price: number | null;
  low_basis: string | null;
  peak_price: number | null;
  peak_gain_pct: number | null;
  last_tracked_at: string | null;
  tracking_seeded_at: string | null;
  resolution_kind: string | null;
};

const TRACK_COLS =
  'id,symbol,intent,call_price,high_price,high_at,high_basis,low_price,low_basis,peak_price,peak_gain_pct,last_tracked_at,tracking_seeded_at,resolution_kind';

console.log(`Database: ${URL_BASE}`);
if (!URL_BASE || !KEY) {
  console.log('No SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Set ENV_FILE=.env.prod.');
  process.exit(1);
}

/* ------------------------------------------------------------------ */

section('1. The pass');

const before = await rows<Tracked>(`setups?state=eq.ready&resolution_kind=is.null&select=${TRACK_COLS}`);
console.log(`  ${before.length} active house alert(s) before the pass.`);

resetPolygonCalls();
const t0 = Date.now();
const report = await runPeakTracking({ requestId: 'proof', at: new Date().toISOString() });
const elapsed = Date.now() - t0;
const calls1 = polygonCalls();

console.log(`  ${JSON.stringify(report, null, 2).replace(/\n/g, '\n  ')}`);
console.log(`  Polygon calls: ${calls1.total} ${JSON.stringify(calls1.by_path)}`);
console.log(`  Took ${elapsed}ms.`);

ok('the pass completed and reported on the rows it found', report.tracked_setups === before.length, {
  reported: report.tracked_setups,
  expected: before.length,
});

/* ------------------------------------------------------------------ */

section('2. Every active row was looked at, and says how it knows');

const after = await rows<Tracked>(`setups?state=eq.ready&select=${TRACK_COLS}`);

ok('every active row has a look-time', after.every((r) => !!r.last_tracked_at), after.filter((r) => !r.last_tracked_at).map((r) => r.symbol));
ok('every active row has been considered for seeding', after.every((r) => !!r.tracking_seeded_at), after.filter((r) => !r.tracking_seeded_at).map((r) => r.symbol));

const withPeak = after.filter((r) => r.peak_price !== null);
console.log(`  ${withPeak.length} of ${after.length} carry a peak price.`);
ok('at least one active row came out with a real peak price', withPeak.length > 0);

// A peak with no basis is the failure this whole design exists to prevent: a
// daily-bar number that nothing marks as one.
ok(
  'no row carries a price without saying how it was measured',
  after.every((r) => (r.high_price === null || !!r.high_basis) && (r.low_price === null || !!r.low_basis)),
  after.filter((r) => (r.high_price !== null && !r.high_basis) || (r.low_price !== null && !r.low_basis)).map((r) => r.symbol),
);

for (const r of withPeak.slice(0, 6)) {
  console.log(
    `  ${r.symbol.padEnd(6)} called ${String(r.call_price).padEnd(8)} high ${String(r.high_price).padEnd(8)} low ${String(r.low_price).padEnd(8)} peak ${String(r.peak_price).padEnd(8)} ${r.peak_gain_pct === null ? '' : `${r.peak_gain_pct > 0 ? '+' : ''}${r.peak_gain_pct}%`} (${r.high_basis})`,
  );
}

/* ------------------------------------------------------------------ */

section('3. The peak is the right end for the direction');

// The generated column's whole job. Checked against the raw extremes rather
// than re-deriving it the same way the database did.
const wrongEnd = after.filter((r) => {
  if (r.peak_price === null) return false;
  const short = r.intent === 'sell_short' || r.intent === 'buy_to_cover';
  return short ? r.peak_price !== r.low_price : r.peak_price !== r.high_price;
});
ok('a long peaks at its high and a short at its low', wrongEnd.length === 0, wrongEnd.map((r) => ({ s: r.symbol, i: r.intent, p: r.peak_price })));

// The percentage has to be the arithmetic on the row, recomputed here rather
// than trusted. This is what catches an inverted frame — NOT the sign.
//
// A NEGATIVE PEAK GAIN IS A REAL OUTCOME AND NOT A BUG. GAP was called at 23.39
// and never traded above 23.25: the best it ever got was still below the price
// it was called at, so the best it ever got is worth -0.6%. An assertion that
// peaks are always positive would be asserting that no call is ever wrong from
// the first minute, and it would have to be "fixed" by clamping a true number
// to zero.
const mismatched = after.filter((r) => {
  if (r.peak_gain_pct === null || r.call_price === null || r.peak_price === null) return false;
  const short = r.intent === 'sell_short' || r.intent === 'buy_to_cover';
  const expected = short
    ? ((r.call_price - r.peak_price) / r.call_price) * 100
    : ((r.peak_price - r.call_price) / r.call_price) * 100;
  return Math.abs(expected - r.peak_gain_pct) > 0.011;
});
ok(
  'the stored percentage is the arithmetic on the row, in the right direction',
  mismatched.length === 0,
  mismatched.map((r) => ({ s: r.symbol, i: r.intent, c: r.call_price, p: r.peak_price, g: r.peak_gain_pct })),
);

/* ------------------------------------------------------------------ */

section('4. The contracts the day trades named');

type Contract = {
  symbol: string;
  contract_ticker: string | null;
  contract_cost: number | null;
  contract_expiry: string | null;
  contract_peak: number | null;
  contract_peak_multiple: number | null;
  contract_expiry_value: number | null;
  contract_basis: string | null;
  resolution_kind: string | null;
};
const contracts = await rows<Contract>(
  'setups?contract_ticker=not.is.null&select=symbol,contract_ticker,contract_cost,contract_expiry,contract_peak,contract_peak_multiple,contract_expiry_value,contract_basis,resolution_kind&order=contract_expiry.desc',
);
console.log(`  ${contracts.length} row(s) carry an identified contract.`);
for (const c of contracts) {
  console.log(
    `  ${c.symbol.padEnd(6)} ${c.contract_ticker} cost ${c.contract_cost} peak ${c.contract_peak} (${c.contract_peak_multiple}x) expired ${c.contract_expiry_value} [${c.resolution_kind}]`,
  );
}
ok('every day-trade replay that named a contract has it identified', contracts.length >= 4, contracts.length);

const graded = contracts.filter((c) => c.contract_peak !== null);
ok('the identified contracts were graded from their own bars', graded.length > 0, graded.length);
ok('a graded contract records that it came from daily bars', graded.every((c) => c.contract_basis === 'daily_bar'));
ok(
  'the peak multiple agrees with the cost the ingest recorded',
  graded.every((c) => {
    if (c.contract_cost === null || c.contract_peak === null || c.contract_peak_multiple === null) return true;
    return Math.abs(c.contract_peak / c.contract_cost - c.contract_peak_multiple) < 0.01;
  }),
);
ok(
  'an expired contract ends the row, and says that is how it ended',
  graded.every((c) => c.resolution_kind !== null),
  graded.filter((c) => !c.resolution_kind).map((c) => c.symbol),
);

/* ------------------------------------------------------------------ */

section('5. Running it again changes nothing');

resetPolygonCalls();
const second = await runPeakTracking({ requestId: 'proof-2', at: new Date().toISOString() });
const calls2 = polygonCalls();
console.log(`  Second pass Polygon calls: ${calls2.total} ${JSON.stringify(calls2.by_path)}`);

const afterTwo = await rows<Tracked>(`setups?state=eq.ready&select=${TRACK_COLS}`);
const moved = afterTwo.filter((r) => {
  const was = after.find((a) => a.id === r.id);
  return was && (was.peak_price !== r.peak_price || was.high_price !== r.high_price || was.low_price !== r.low_price);
});
ok('no peak moved on a second pass', moved.length === 0, moved.map((r) => r.symbol));
ok('nothing was seeded twice', second.seeded === 0, second.seeded);
ok('no contract was graded twice', second.contracts_graded === 0, second.contracts_graded);
// The whole cost argument. Once the rows are seeded, a pass is one snapshot
// request — and outside market hours, with nothing to seed, it is that one call
// and nothing else.
ok('a settled pass costs at most one Polygon call per symbol batch', calls2.total <= 1, calls2);

/* ------------------------------------------------------------------ */

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
