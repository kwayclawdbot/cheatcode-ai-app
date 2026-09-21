/**
 * REGRADE THE DAY-TRADE CONTRACTS on Unusual Whales minute bars, after the
 * alert only. DRY BY DEFAULT: it reads, grades and prints before/after, and
 * writes nothing unless `--write` is passed.
 *
 *   cd apps/api && ENV_FILE=../../../cheatcode-ai-sdk57/apps/api/.env.prod npx tsx scripts/regrade-contracts.mts
 *   … --write     (only after migration 0048 is applied, and only on purpose)
 *
 * WHY. Contracts were graded on Polygon option DAILY bars from the alert's
 * date, so a high printed before the alert counted. NET 2026-09-09 read 2.05x
 * on an $8.80 print from eighteen minutes before the alert.
 *
 * WHAT IT READS: every setup with a contract ticker whose expiry has passed
 * (graded or not). WHAT IT WOULD WRITE per row: contract_peak,
 * contract_peak_at, contract_expiry_value, contract_basis='minute',
 * contract_graded_at. It never touches resolution_kind or any stock column.
 *
 * UW token: UNUSUAL_WHALES_TOKEN, else ~/.openclaw/secrets/unusual_whales.
 * Requests go through the shared client's throttle; a handful per row.
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WRITE = process.argv.includes('--write');

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
if (!process.env.UNUSUAL_WHALES_TOKEN) {
  const line = safeRead(resolve(homedir(), '.openclaw/secrets/unusual_whales'))
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('#'));
  if (line) process.env.UNUSUAL_WHALES_TOKEN = (line.includes('=') ? line.split('=').slice(1).join('=') : line).replace(/["'\s]/g, '');
}

const { fireTimeOf, gradeContract, liveContractGradeDeps } = await import('../src/lib/tracking/peaks.ts');
const { uwCalls } = await import('../src/lib/market/uw.ts');

const URL_BASE = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!URL_BASE || !KEY) {
  console.log('No SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Point ENV_FILE at an env file.');
  process.exit(1);
}
console.log(`Database: ${new URL(URL_BASE).host}   Mode: ${WRITE ? 'WRITE' : 'DRY (nothing is written)'}\n`);

type Row = {
  id: string;
  symbol: string;
  created_at: string;
  contract_ticker: string;
  contract_expiry: string;
  contract_cost: number | null;
  contract_peak: number | null;
  contract_peak_at: string | null;
  contract_peak_multiple: number | null;
  contract_expiry_value: number | null;
  contract_basis: string | null;
  fired_at: string | null;
  snap_ts: string | null;
};

const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const q =
  'setups?select=id,symbol,created_at,contract_ticker,contract_expiry,contract_cost,contract_peak,contract_peak_at,' +
  'contract_peak_multiple,contract_expiry_value,contract_basis,' +
  'fired_at:score_components->timing->>fired_at_utc,snap_ts:quote_snapshot->>source_ts' +
  `&contract_ticker=not.is.null&contract_expiry=lt.${today}&order=contract_expiry.desc`;
const res = await fetch(`${URL_BASE}/rest/v1/${q}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
if (!res.ok) {
  console.log(`Read failed: HTTP ${res.status}`);
  process.exit(1);
}
const rows = (await res.json()) as Row[];
console.log(`${rows.length} contract row(s) past expiry.\n`);

const deps = liveContractGradeDeps(today);
const money = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `$${Number(n).toFixed(2)}`);
const mult = (peak: number | null, cost: number | null) =>
  peak === null || cost === null || cost <= 0 ? '—' : `${(Math.round((peak / cost) * 100) / 100).toFixed(2)}x`;

let changed = 0;
let failed = 0;
let written = 0;
for (const r of rows) {
  const firedAt = fireTimeOf(r);
  const g = await gradeContract({ ...r, fired_at: firedAt }, deps);
  const head = `${r.symbol.padEnd(5)} ${r.contract_ticker}  cost ${money(r.contract_cost)}  fired ${firedAt}`;
  if (!g.ok) {
    failed += 1;
    console.log(`${head}\n   COULD NOT GRADE: ${g.reason}\n`);
    continue;
  }
  const a = g.grade;
  const differs =
    a.peak !== (r.contract_peak === null ? null : Number(r.contract_peak)) ||
    a.expiry_value !== (r.contract_expiry_value === null ? null : Number(r.contract_expiry_value)) ||
    r.contract_basis !== 'minute';
  if (differs) changed += 1;
  console.log(head);
  console.log(
    `   before  peak ${money(r.contract_peak)} (${mult(r.contract_peak, r.contract_cost)}) at ${r.contract_peak_at ?? '—'}` +
      `  expiry value ${money(r.contract_expiry_value)}  basis ${r.contract_basis ?? '—'}`,
  );
  console.log(
    `   after   peak ${money(a.peak)} (${mult(a.peak, r.contract_cost)}) at ${a.peak_at ?? '—'}` +
      `  expiry value ${money(a.expiry_value)} [${a.expiry_value_from ?? 'unknown'}]  basis minute` +
      `  (${a.minutes_after_fire} minute bars after the alert, ${a.minutes_before_fire_ignored} before it ignored)`,
  );
  console.log(`   ${differs ? 'WOULD CHANGE' : 'unchanged'}\n`);

  if (WRITE && differs) {
    const w = await fetch(`${URL_BASE}/rest/v1/setups?id=eq.${r.id}`, {
      method: 'PATCH',
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        contract_peak: a.peak,
        contract_peak_at: a.peak_at,
        contract_expiry_value: a.expiry_value,
        contract_basis: 'minute',
        contract_graded_at: new Date().toISOString(),
      }),
    });
    if (w.ok) written += 1;
    else console.log(`   WRITE FAILED: HTTP ${w.status}\n`);
  }
}

console.log(
  `${rows.length} row(s): ${changed} would change, ${rows.length - changed - failed} unchanged, ${failed} could not be graded. ` +
    `${uwCalls()} Unusual Whales request(s). ${WRITE ? `${written} written.` : 'Nothing written (dry run).'}`,
);
