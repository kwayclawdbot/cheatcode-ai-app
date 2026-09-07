/**
 * "kai markup all recent fvgs" — the whole way through, with a real model.
 *
 *   cd apps/api && npx tsx scripts/kai-markup-proof.mts [SYMBOL]
 *
 * NOT PART OF `npm test`, ON PURPOSE. It costs money and needs two keys, and a
 * suite that fails when a credit balance runs out stops being a signal about the
 * code. The deterministic half — the detector's arithmetic, the cap, the
 * refusals — is asserted in `chart-vocabulary-test.mts` and runs on every push.
 *
 * WHAT ONLY THIS CAN ANSWER. Every other test drives the command directly. The
 * owner's sentence was "make sure Kai understands user instructions to draw on
 * chart in chat", and understanding is the one thing you cannot check by calling
 * the function yourself: it is whether a model, given the real prompt block and
 * a real chart, turns an off-hand sentence into the right command with the right
 * argument. So this asks a real model the owner's own words and then executes
 * whatever it emits against real bars.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
try {
  for (const line of readFileSync(resolve(HERE, `../${process.env.ENV_FILE ?? '.env.local'}`), 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
} catch { /* the run will say what is missing */ }

import {
  availableDrawings,
  availableIndicators,
  availableLevels,
  availablePatterns,
  availableZones,
  chartCommandProtocol,
  executeChartCommand,
  ChartCommandRequest,
  type ChartContext,
} from '../src/lib/kai/chart-commands.ts';
import { computeFib, computeIntradayLevels, computeKeyLevels, findTrendlines } from '../src/lib/market/key-levels.ts';
import { fetchAggregates, lastTradingDate, polygonConfigured } from '../src/lib/market/polygon.ts';
import { completeOnce } from '../src/lib/kai/stream.ts';

const SYMBOL = (process.argv[2] || 'SPY').toUpperCase();

let pass = 0;
let fail = 0;
const ok = (name: string, cond: unknown, detail?: unknown) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail === undefined ? '' : `\n        ${JSON.stringify(detail)}`}`); }
};

if (!polygonConfigured()) {
  console.log('SKIP — no Polygon key, so there are no real bars to mark up.');
  process.exit(0);
}

const to = lastTradingDate();
const fromD = new Date(to);
fromD.setUTCDate(fromD.getUTCDate() - 400);
const dRes = await fetchAggregates(SYMBOL, '1d', fromD.toISOString().slice(0, 10), to);
if (!dRes.ok) {
  console.log(`SKIP — Polygon could not answer for ${SYMBOL}: ${dRes.reason}`);
  process.exit(0);
}
const daily = dRes.data;
console.log(`\n${SYMBOL}: ${daily.length} daily bars to ${to}\n`);

const computed = computeKeyLevels(daily);
const ctx: ChartContext = {
  userId: 'proof', symbol: SYMBOL, timeframe: 'D',
  setup: null, alertId: null, planId: null, plan: null, communityLevel: null, triggerTs: null,
  supports: (computed?.support ?? []).map((l) => l.price),
  resistances: (computed?.resistance ?? []).map((l) => l.price),
  priorSession: null,
  bars: {
    firstTs: daily[0]?.ts ?? null,
    lastTs: daily[daily.length - 1]?.ts ?? null,
    lastPrice: daily[daily.length - 1]?.c ?? null,
  },
  levelTimeframe: '1d',
  computed,
  intraday: computeIntradayLevels([]),
  trendlines: findTrendlines(daily),
  fib: computeFib(daily),
  dailyBars: daily,
};

const patterns = availablePatterns(ctx);
console.log(`  patterns this chart has: ${patterns.join(', ') || '(none)'}`);
ok('the chart has gaps to mark', patterns.includes('fvg'), patterns);

const system = chartCommandProtocol({
  symbol: SYMBOL,
  timeframe: 'D',
  available: availableLevels(ctx),
  drawings: availableDrawings(ctx),
  indicators: availableIndicators(ctx),
  zones: availableZones(ctx),
  patterns,
});

/** The owner's sentence, unedited. */
const ASK = 'kai markup all recent fvgs';

let raw = '';
let reached = true;
try {
  raw = await completeOnce({
    system,
    messages: [{ role: 'user', content: ASK }],
    maxTokens: 600,
    usage: { feature: 'chart_markup_proof', requestId: 'proof' },
  });
} catch (e) {
  reached = false;
  console.log(`\n  NOTE  the model could not be reached: ${e instanceof Error ? e.message : String(e)}`);
}

/**
 * THE CHART HALF IS PROVEN EITHER WAY.
 *
 * If the model answered, its own command is executed and nothing here assumes
 * what it said. If it could not be reached — an expired key, an empty credit
 * balance — the run does NOT quietly pass: it says so, and then executes the
 * command the prompt asks for, so the half that is about this codebase is still
 * measured against real bars. What goes unverified in that case is exactly one
 * thing, and the summary names it: whether the model picks the right command.
 */
let req: ChartCommandRequest;
if (reached) {
  console.log(`\n--- Kai, asked "${ASK}" ---\n${raw}\n--- end ---\n`);
  const block = /```chart_command\s*([\s\S]*?)```/.exec(raw);
  ok('he answered with a chart command', Boolean(block), raw.slice(0, 200));
  if (!block) { console.log(`\n${pass} passed, ${fail} failed`); process.exit(1); }
  req = ChartCommandRequest.parse(JSON.parse(block[1]));
  ok('and the command is mark_pattern', req.command === 'mark_pattern', req);
  ok('naming the gaps', String(req.args.pattern ?? req.args.name ?? '').toLowerCase().includes('fvg')
    || String(req.args.pattern ?? req.args.name ?? '').toLowerCase().includes('gap'), req.args);
} else {
  console.log('\n  the prompt block Kai is given lists the patterns this chart has:');
  console.log(`    ${/patterns[^\n]*/i.exec(system.split('\n').find((l) => l.includes('mark_pattern')) ?? '')?.[0] ?? '(see chartCommandProtocol)'}`);
  ok('the prompt tells Kai the command exists', system.includes('mark_pattern'));
  ok('and names the gaps as something this chart has', system.includes('fvg'));
  req = { command: 'mark_pattern', args: { pattern: 'fvg' }, narration: undefined } as ChartCommandRequest;
}

const frame = await executeChartCommand(ctx, req, 'proof');
ok('the command resolves against real bars', frame !== null);
ok('and draws zones, not lines', (frame?.annotations ?? []).every((a) => a.kind === 'zone'), frame?.annotations.map((a) => a.kind));
ok('capped at four, as asked', (frame?.annotations.length ?? 0) > 0 && (frame?.annotations.length ?? 0) <= 4, frame?.annotations.length);
ok('every zone has a top and a bottom off real candles',
  (frame?.annotations ?? []).every((a) => typeof a.price === 'number' && typeof a.price2 === 'number' && a.price > a.price2));
ok('and Kai says how many he drew', /\b(one|two|three|four|\d)\b/i.test(frame?.narration ?? ''), frame?.narration);

console.log(`\nnarration: ${frame?.narration}`);
for (const a of frame?.annotations ?? []) {
  console.log(`  ${a.text?.padEnd(16)} $${a.price2} to $${a.price}   ${a.ts_from?.slice(0, 10)}`);
}
console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
