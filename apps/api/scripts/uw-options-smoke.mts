/**
 * LIVE SMOKE — one real call per Unusual Whales endpoint the options paths use.
 *
 *   cd apps/api && npx tsx scripts/uw-options-smoke.mts
 *
 * Read-only GETs, five requests, through the shared client (so its throttle
 * and cache are what is exercised). Token from UNUSUAL_WHALES_TOKEN, else
 * ~/.openclaw/secrets/unusual_whales. Prints trimmed answers; never the token.
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

if (!process.env.UNUSUAL_WHALES_TOKEN) {
  try {
    const line = readFileSync(resolve(homedir(), '.openclaw/secrets/unusual_whales'), 'utf8')
      .split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('#'));
    if (line) process.env.UNUSUAL_WHALES_TOKEN = (line.includes('=') ? line.split('=').slice(1).join('=') : line).replace(/["'\s]/g, '');
  } catch { /* reported below */ }
}

const uw = await import('../src/lib/market/uw.ts');
const { chainFromUw, expiriesFromUw, nextEarningsFromUw } = await import('../src/lib/market/panels.ts');
const { gradeContract, liveContractGradeDeps } = await import('../src/lib/tracking/peaks.ts');

const sym = (process.argv[2] ?? 'NVDA').toUpperCase();
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
let bad = 0;
const line = (name: string, ok: boolean, detail: unknown) => {
  if (!ok) bad += 1;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}\n     ${JSON.stringify(detail)}`);
};

const ex = await uw.optionExpiries(sym);
const expiries = ex.ok ? expiriesFromUw(ex.data).filter((e) => e >= today) : [];
line(`expiry-breakdown ${sym}`, ex.ok && expiries.length > 0, ex.ok ? { count: expiries.length, first: expiries.slice(0, 3) } : ex.reason);

const chain = expiries[0] ? await uw.optionChain(sym, expiries[0]) : null;
const rows = chain?.ok ? chainFromUw(chain.data) : [];
const priced = rows.filter((r) => r.bid !== null && r.ask !== null);
const sample = [...priced].sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))[0];
line(`option-contracts ${sym} expiry=${expiries[0]}`, !!chain?.ok && priced.length > 0, chain?.ok
  ? { contracts: rows.length, priced: priced.length, busiest: sample && { s: sample.option_symbol, bid: sample.bid, ask: sample.ask, last: sample.last, vol: sample.volume, oi: sample.open_interest, iv: sample.iv, at: sample.last_trade_at } }
  : chain?.reason ?? 'no expiry');

const earn = await uw.earnings(sym);
line(`earnings ${sym}`, earn.ok, earn.ok ? { next: nextEarningsFromUw(earn.data, today) } : earn.reason);

const intra = await uw.contractIntraday('O:NET260911P00297500', '2026-09-09', today);
line('option-contract NET260911P00297500 intraday date=2026-09-09', intra.ok && intra.data.length > 0,
  intra.ok ? { minute_bars: intra.data.length, first: intra.data.at(-1)?.start_time, last: intra.data[0]?.start_time } : intra.reason);

const g = await gradeContract(
  { symbol: 'NET', contract_ticker: 'O:NET260911P00297500', contract_expiry: '2026-09-11', fired_at: '2026-09-09T13:58:45.002Z' },
  liveContractGradeDeps(today),
);
line('grade NET 297.5P after the 13:58:45Z alert', g.ok && g.grade.peak === 4.75, g.ok ? g.grade : g.reason);

console.log(`\n${uw.uwCalls()} Unusual Whales request(s). ${bad ? `${bad} FAILED` : 'All answered.'}`);
process.exit(bad ? 1 : 0);
