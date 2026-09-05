/**
 * INDEPENDENT CHECK. Ask Polygon directly, with a DIFFERENT key from a
 * different project, and compare against what the app's own tools return.
 * If these two disagree, no verdict about either model means anything.
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolveQuote } from '../src/lib/market/polygon.ts';
import { loadChartContext } from '../src/lib/round4/chart-context.ts';
import { levelTableFor } from '../src/lib/kai/chart-answer.ts';

const brainEnv = readFileSync('/Users/kwaysclawd/projects/kai-brain/.env', 'utf8');
const key = /^POLYGON_API_KEY=(.+)$/m.exec(brainEnv)?.[1]?.trim();
if (!key) throw new Error('no polygon key found');

const OWNER = '080ae0db-5d7d-4c16-a785-3de192ada266';
const syms = ['SPY', 'AAPL', 'NVDA', 'GTLB', 'SLB', 'VRNS', 'ZZZZQ'];

for (const s of syms) {
  const app = await resolveQuote(s, { timeframe: '1d' });
  const r = await fetch(`https://api.polygon.io/v2/aggs/ticker/${s}/prev?adjusted=true&apiKey=${key}`);
  const j = (await r.json()) as { results?: { c: number; h: number; l: number; o: number; t: number }[]; status?: string };
  const poly = j.results?.[0];
  console.log(
    s.padEnd(6),
    'app_price=', String(app.quote.price).padEnd(8),
    'polygon_prev_close=', String(poly?.c ?? j.status),
    poly && app.quote.price !== null ? (Math.abs(poly.c - app.quote.price) < 0.02 ? 'MATCH' : `DIFF ${(poly.c - (app.quote.price ?? 0)).toFixed(2)}`) : ''
  );
}

// Levels: recompute the 200-day and previous-day high/low straight from Polygon bars.
for (const s of ['NVDA', 'SPY', 'GTLB']) {
  const ctx = await loadChartContext(OWNER, { symbol: s, timeframe: '1d' });
  if (!ctx) continue;
  const t = levelTableFor(ctx);
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 400 * 86400000).toISOString().slice(0, 10);
  const r = await fetch(`https://api.polygon.io/v2/aggs/ticker/${s}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=50000&apiKey=${key}`);
  const j = (await r.json()) as { results?: { c: number; h: number; l: number; t: number }[] };
  const bars = j.results ?? [];
  const last = bars[bars.length - 1];
  const prev = bars[bars.length - 2];
  const closes = bars.map((b) => b.c);
  const ema = (n: number) => {
    const k = 2 / (n + 1);
    let e = closes.slice(0, n).reduce((a, b) => a + b, 0) / n;
    for (const c of closes.slice(n)) e = c * k + e * (1 - k);
    return e;
  };
  const yearBars = bars.slice(-252);
  console.log(`\n${s} — app level vs recomputed from Polygon bars`);
  const rows: [string, number | undefined, number][] = [
    ['prior_day_close', t.get('prior_day_close')?.price, prev?.c],
    ['prior_day_high', t.get('prior_day_high')?.price, prev?.h],
    ['prior_day_low', t.get('prior_day_low')?.price, prev?.l],
    ['year_high', t.get('year_high')?.price, Math.max(...yearBars.map((b) => b.h))],
    ['year_low', t.get('year_low')?.price, Math.min(...yearBars.map((b) => b.l))],
    ['ema200', t.get('ema200')?.price, bars.length >= 200 ? ema(200) : NaN],
    ['ema50', t.get('ema50')?.price, ema(50)],
  ];
  for (const [name, appV, polyV] of rows) {
    const ok = appV !== undefined && Number.isFinite(polyV) ? (Math.abs(appV - polyV) / polyV < 0.01 ? 'within 1%' : 'DIFF') : appV === undefined ? 'app: not available' : 'polygon: n/a';
    console.log('  ', name.padEnd(16), 'app=', String(appV ?? '—').padEnd(10), 'polygon=', Number.isFinite(polyV) ? polyV.toFixed(2) : '—', ok);
  }
  console.log('   app last bar close =', last?.c, '| app lastPrice =', ctx.bars.lastPrice, '| polygon bars =', bars.length);
}
