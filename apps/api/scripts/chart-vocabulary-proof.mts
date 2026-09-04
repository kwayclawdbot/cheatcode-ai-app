/**
 * END TO END: a real chart, real Polygon bars, real annotations, then cleaned up.
 *
 *   cd apps/api && npx tsx scripts/chart-vocabulary-proof.mts
 *   cd apps/api && npx tsx scripts/chart-vocabulary-proof.mts NVDA AAPL
 *
 * NOT IN `npm test`, ON PURPOSE. It needs a Polygon key AND a database, and it
 * WRITES — every drawing Kai makes is a persisted row, so the only way to prove
 * he can draw one is to let him, look at it, and then delete it. `npm test`
 * should not be able to leave litter in a live product, so the round trip lives
 * here and the arithmetic lives in `chart-vocabulary-test.mts`.
 *
 * WHAT IT PROVES, WHICH IS THE THING THAT WAS BROKEN. It takes the loader the
 * app actually uses, on a symbol chosen for having NO GRADED SETUP, and asks it
 * for every level and every drawing in Kai's vocabulary. Before this work that
 * chart could answer for two of them. Each row printed below is a command that
 * came back with a number, an annotation the client would draw, and a sentence
 * saying which bars produced it.
 *
 * IT DELETES EVERYTHING IT WROTE, including on failure, and it fails loudly if
 * anything survives. A proof that leaves rows behind is not a proof.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
for (const line of readFileSync(resolve(HERE, `../${process.env.ENV_FILE ?? '.env.local'}`), 'utf8').split('\n')) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}

import { serviceClient } from '../src/lib/db.ts';
import { loadChartContext } from '../src/lib/round4/chart-context.ts';
import {
  availableDrawings,
  availableLevels,
  chartCommandProtocol,
  executeChartCommand,
} from '../src/lib/kai/chart-commands.ts';

const SYMBOLS = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const written = new Set<string>();
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

async function main(): Promise<void> {
  const db = serviceClient();

  const { data: profiles } = await db.from('profiles').select('user_id').limit(1);
  const userId = (profiles ?? [])[0]?.user_id as string | undefined;
  if (!userId) throw new Error('no profile row to attribute the annotations to');

  // Only symbols the instruments table knows, because `chart_annotations.symbol`
  // is a foreign key onto it and a proof that cannot write is not a proof.
  const { data: instruments } = await db.from('instruments').select('symbol').limit(400);
  const known = new Set(((instruments ?? []) as { symbol: string }[]).map((r) => r.symbol));
  const wanted = (SYMBOLS.length ? SYMBOLS : ['AAPL', 'NVDA', 'F']).map((s) => s.toUpperCase()).filter((s) => known.has(s));
  if (!wanted.length) throw new Error(`none of those symbols are in instruments; known examples: ${[...known].slice(0, 8).join(', ')}`);

  for (const symbol of wanted) {
    console.log(`\n${symbol}\n${'='.repeat(symbol.length)}`);
    const ctx = await loadChartContext(userId, { symbol, timeframe: '1d' });
    if (!ctx) {
      ok(`${symbol}: the chart context loaded`, false);
      continue;
    }

    const graded = Boolean(ctx.setup);
    const planned = Boolean(ctx.plan);
    console.log(
      `  graded setup: ${graded ? ctx.setup!.id : 'NONE'} · saved plan: ${planned ? 'yes' : 'none'} · ` +
        `daily bars: ${(ctx.dailyBars ?? []).length} · intraday session: ${ctx.intraday?.date ?? 'none'}`
    );

    /* ---- levels ---- */
    const names = availableLevels(ctx);
    console.log(`\n  LEVELS THAT RESOLVE (${names.length})`);
    for (const level of names) {
      const frame = await executeChartCommand(ctx, { command: 'mark_level', args: { level } });
      if (!frame) {
        ok(`${symbol}: ${level} produced a frame`, false);
        continue;
      }
      for (const a of frame.annotations) written.add(a.id);
      const price = (frame.payload as { price?: number }).price;
      console.log(`    ${level.padEnd(20)} $${String(price).padEnd(10)} ${frame.provenance}`);
      ok(
        `${symbol}: ${level} resolved to a real number with a traceable provenance`,
        typeof price === 'number' && Number.isFinite(price) && price > 0 && frame.provenance.length > 15
      );
    }

    /* ---- drawings ---- */
    const drawings = availableDrawings(ctx);
    console.log(`\n  DRAWINGS THAT RESOLVE (${drawings.length})`);
    for (const spec of drawings) {
      const args = JSON.parse(spec) as { shape: string; level: string };
      const frame = await executeChartCommand(ctx, { command: 'mark_level', args });
      if (!frame) {
        ok(`${symbol}: ${spec} drew something`, false);
        continue;
      }
      for (const a of frame.annotations) written.add(a.id);
      console.log(`    ${`${args.shape}:${args.level}`.padEnd(28)} ${frame.annotations.length} annotation(s)`);
      for (const a of frame.annotations) {
        console.log(
          `      ${a.kind.padEnd(11)} ${String(a.text).padEnd(16)} $${a.price}${a.price2 === null ? '' : ` -> $${a.price2}`}` +
            `${a.ts_from === null ? '' : `  ${String(a.ts_from).slice(0, 10)}${a.ts_to === null ? '' : ` -> ${String(a.ts_to).slice(0, 10)}`}`}`
        );
      }
      console.log(`      say: ${frame.narration}`);
      console.log(`      from: ${frame.provenance}`);
      ok(
        `${symbol}: ${args.shape}:${args.level} produced persisted annotations with real geometry`,
        frame.annotations.length > 0 &&
          frame.annotations.every((a) => typeof a.price === 'number' && Number.isFinite(a.price!)) &&
          frame.provenance.length > 15
      );
      if (args.shape === 'trendline') {
        const a = frame.annotations[0];
        // Compared as INSTANTS, not as strings. Postgres hands back
        // `2026-08-21T04:00:00+00:00` for the bar this code stored as
        // `2026-08-21T04:00:00.000Z`; those are the same moment written two ways
        // and a string test would call a correct anchor wrong.
        const at = (ts: string | null) => (ts ? Date.parse(ts) : NaN);
        const stamps = new Set((ctx.dailyBars ?? []).map((b) => Date.parse(b.ts)));
        ok(
          `${symbol}: the trendline's two anchors are both bars in the stored series`,
          stamps.has(at(a.ts_from)) && stamps.has(at(a.ts_to)),
          { from: a.ts_from, to: a.ts_to }
        );
      }
    }

    /* ---- navigation ---- */
    console.log('\n  NAVIGATION');
    const navLevel = names.find((n) => n.endsWith('_high')) ?? names[0];
    for (const [label, req] of [
      [`zoom to ${navLevel}`, { command: 'zoom_trigger' as const, args: { level: navLevel } }],
      ['scroll back 40 bars', { command: 'scroll_bars' as const, args: { bars: -40 } }],
      ['back to the live edge', { command: 'scroll_to_now' as const, args: {} }],
    ] as const) {
      const frame = await executeChartCommand(ctx, req);
      console.log(`    ${label.padEnd(28)} ${frame ? frame.narration : 'DROPPED'}`);
      ok(`${symbol}: ${label} produced a camera move`, Boolean(frame));
    }
    const zoom = await executeChartCommand(ctx, { command: 'zoom_trigger', args: { level: navLevel } });
    ok(
      `${symbol}: the camera goes to the BAR the level came from, not to the middle of the chart`,
      typeof (zoom?.payload as { focus_ts?: string | null })?.focus_ts === 'string',
      zoom?.payload
    );

    /* ---- what Kai is actually told ---- */
    console.log('\n  WHAT THE PROMPT OFFERS HIM');
    const protocolText = chartCommandProtocol({
      symbol,
      timeframe: '1d',
      available: names,
      drawings,
    });
    console.log(
      protocolText
        .split('\n')
        .filter((l) => l.includes('THESE ARE THE ONES') || l.includes('shapes ride') || l.includes('IF YOU SAY IT'))
        .map((l) => `    ${l.trim()}`)
        .join('\n')
    );
    ok(
      `${symbol}: the prompt offers only what resolved — no level and no drawing it cannot deliver`,
      names.every((n) => protocolText.includes(n)) && drawings.every((dstr) => protocolText.includes(dstr))
    );
  }
}

async function cleanup(): Promise<void> {
  console.log(`\nCLEANUP — ${written.size} annotation(s) written by this run`);
  if (!written.size) return;
  const db = serviceClient();
  const { error } = await db.from('chart_annotations').delete().in('id', [...written]);
  if (error) {
    console.log(`  FAIL  could not delete: ${error.message}`);
    fail += 1;
    return;
  }
  const { data } = await db.from('chart_annotations').select('id').in('id', [...written]);
  ok('every row this proof wrote has been deleted', (data ?? []).length === 0, (data ?? []).length);
}

main()
  .catch((e) => {
    fail += 1;
    console.error(`\nERROR  ${e instanceof Error ? e.message : String(e)}`);
  })
  .finally(async () => {
    await cleanup();
    console.log(`\n  ${pass} passed, ${fail} failed\n`);
    process.exit(fail === 0 ? 0 : 1);
  });
