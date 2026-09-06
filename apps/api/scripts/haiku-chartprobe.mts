import 'dotenv/config';
import { loadChartContext } from '../src/lib/round4/chart-context.ts';
import { availableLevels, availableDrawings, resolveLevel } from '../src/lib/kai/chart-commands.ts';
import { levelTableFor } from '../src/lib/kai/chart-answer.ts';
import { resolveQuote } from '../src/lib/market/polygon.ts';
const U = '080ae0db-5d7d-4c16-a785-3de192ada266';
for (const s of ['SPY','GTLB','NVDA','AAPL','ZZZZQ']) {
  const c = await loadChartContext(U, { symbol: s, timeframe: '1d' });
  if (!c) { console.log(s, 'NO CHART CONTEXT'); continue; }
  const lv = availableLevels(c);
  console.log('===', s, '| setup:', c.setup ? (c.setup as any).grade_display ?? 'yes' : 'none', '| lastPrice', c.bars.lastPrice, '| bars', (c.bars as Record<string, unknown> | null)?.daily ?? '?');
  console.log('  levels:', lv.join(', '));
  console.log('  drawings:', availableDrawings(c).join(', '));
  console.log('  answerLevels:', [...levelTableFor(c).keys()].join(', '));
  for (const k of lv) { const r = resolveLevel(c, k); if (r) console.log('    ', k, '=', r.price); }
}
console.log('--- quotes ---');
for (const s of ['SPY','AAPL','NVDA','GTLB','SLB','VRNS','ZZZZQ']) {
  try { const q = await resolveQuote(s, { timeframe: '1d' }); console.log(s, JSON.stringify(q.quote)); }
  catch (e:any) { console.log(s, 'ERR', e.message); }
}
