/**
 * DID HE SAY A NUMBER NOBODY GAVE HIM?
 *
 * For every answer, this rebuilds the exact set of numbers that were in front of
 * the model — the facts block the prompt carried, and every tool result handed
 * back during that answer — then pulls every number out of what he said and
 * reports the ones that are in neither. An unmatched number is not automatically
 * an invention (a share count, a percentage or a subtraction is arithmetic on
 * numbers he was given), so every one is printed for a human to read.
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { SETUP_CAPS, type AppMode } from '@shared/api';
import { assembleContext, renderContext, renderMarketLine } from '../src/lib/kai/context.ts';
import { loadChartContext } from '../src/lib/round4/chart-context.ts';
import { availableLevels } from '../src/lib/kai/chart-commands.ts';
import { loadSheetContext } from '../src/lib/kai/sheet-context.ts';

const OWNER = '080ae0db-5d7d-4c16-a785-3de192ada266';
const MODE: AppMode = 'swing';
const files = process.argv.slice(2).filter((a) => a.endsWith('.json'));

const nums = (s: string): number[] => {
  const out: number[] = [];
  for (const m of s.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const n = Number(m[0].replace(/,/g, ''));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
};

// Cache the facts block per chart symbol — it is the same for every question
// that opens the same chart.
const factsCache = new Map<string, number[]>();
async function factNumbers(chart: string | null): Promise<number[]> {
  const k = chart ?? '-';
  if (factsCache.has(k)) return factsCache.get(k)!;
  const chartCtx = chart ? await loadChartContext(OWNER, { symbol: chart, timeframe: '1d' }) : null;
  const kctx = await assembleContext({
    userId: OWNER, mode: MODE,
    pinnedSetupIds: chartCtx?.setup?.id ? [chartCtx.setup.id] : [], cap: SETUP_CAPS[MODE],
  });
  const sheet = await loadSheetContext(OWNER, chartCtx
    ? { kind: (chartCtx.setup ? 'alert' : 'symbol') as 'alert' | 'symbol',
        id: chartCtx.setup?.id ? `setup:${chartCtx.setup.id}` : chartCtx.symbol, symbol: chartCtx.symbol }
    : undefined);
  const text = renderContext(kctx, chartCtx ? { symbol: chartCtx.symbol, timeframe: chartCtx.timeframe, levels: availableLevels(chartCtx) } : null, { market: false })
    + '\n' + (sheet.prompt_block ?? '') + '\n' + renderMarketLine(kctx);
  const v = nums(text);
  factsCache.set(k, v);
  return v;
}

type Row = {
  model: string; rep: number; id: string; chart: string | null; bait: boolean;
  asks: { ask: string; narrative: string; tools_used: { name: string; input: unknown; result: unknown }[];
          chart_answer_prose: string[]; calls: unknown[] }[];
};

const near = (a: number, set: number[]) => set.some((b) => a === b || (b !== 0 && Math.abs(a - b) <= Math.max(0.011, Math.abs(b) * 0.0001)));

for (const f of files) {
  const rows = JSON.parse(readFileSync(f, 'utf8')) as Row[];
  console.log(`\n================ ${f} ================`);
  for (const r of rows) {
    const facts = await factNumbers(r.chart);
    for (const a of r.asks) {
      const given = [...facts];
      for (const t of a.tools_used) given.push(...nums(JSON.stringify(t.result)));
      const said = nums(a.narrative);
      const unmatched = [...new Set(said.filter((n) => !near(n, given)))];
      // Years, small counts and obvious non-prices are noise; keep them but mark.
      if (unmatched.length) {
        console.log(`\n[${r.model} rep${r.rep}] ${r.id}${r.bait ? ' (BAIT)' : ''}  "${a.ask.slice(0, 70)}"`);
        console.log('  unmatched numbers:', unmatched.join(', '));
        console.log('  tools:', a.tools_used.map((t) => `${t.name}(${JSON.stringify(t.input)})`).join(' ') || 'NONE');
        console.log('  said: ' + a.narrative.replace(/\s+/g, ' ').slice(0, 900));
      }
    }
  }
}
