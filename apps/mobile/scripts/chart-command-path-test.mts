/**
 * Every chart command, from the server that emits it to the pixels it becomes.
 *
 *   cd apps/mobile && npx tsx scripts/chart-command-path-test.mts
 *
 * WHY THIS EXISTS. Twice now a command has been added to the server, resolved
 * correctly, persisted correctly, sent correctly — and then dropped on the floor
 * by the client with no error anywhere. First the five camera commands LIVE-1
 * added; then `mark_zone` and `mark_pattern`. Both times the chart sat still
 * while Kai said he had drawn something, which is the single worst failure this
 * product has, because it reads as the app lying rather than as a bug.
 *
 * Both times the cause was the same shape of thing: a list or a switch that had
 * to be edited in step with `ChartCommandName` and was not, in a file no test
 * could import. So this test does not check the two commands that broke. It
 * walks EVERY name in the union and fails on any that does not survive the whole
 * path — which is the only version of this test that cannot go stale the next
 * time somebody adds a command.
 *
 * THE PATH IS THE REAL ONE, END TO END, IN ONE PROCESS:
 *
 *   apps/api  executeChartCommand   the actual server resolver, real bars
 *      ↓      the frame, unmodified
 *   apps/mobile readCommand         the closed-list gate
 *      ↓      the command
 *   apps/mobile planCommand         the planner that turns it into screen state
 *      ↓      annotations
 *   chart page  annotations.set     the real page, in a real browser
 *      ↓
 *   canvas pixels                   which is the only place "it rendered" is true
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('../..');
for (const line of readFileSync(path.join(ROOT, 'apps/api/.env.local'), 'utf8').split('\n')) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}

const {
  executeChartCommand, availablePatterns, availableZones,
} = await import(path.join(ROOT, 'apps/api/src/lib/kai/chart-commands.ts')) as typeof import('../../api/src/lib/kai/chart-commands.ts');
const { computeFib, computeIntradayLevels, computeKeyLevels, findTrendlines } =
  await import(path.join(ROOT, 'apps/api/src/lib/market/key-levels.ts')) as typeof import('../../api/src/lib/market/key-levels.ts');
const { readCommand, planCommand } = await import('../src/features/portal/plan-command.ts');
const { CHART_COMMAND_NAMES } = await import('../src/features/portal/types.ts');

let pass = 0;
let fail = 0;
function ok(name: string, cond: unknown, detail?: unknown) {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail === undefined ? '' : `\n        ${JSON.stringify(detail)}`}`); }
}
function section(t: string) { console.log(`\n${t}\n${'-'.repeat(t.length)}`); }

/* ------------------------------------------------------------------ */
/* Bars with real structure: gaps to find, shelves to name             */
/* ------------------------------------------------------------------ */

type Bar = { ts: string; o: number; h: number; l: number; c: number; v: number };
const daily: Bar[] = [];
{
  let c = 100;
  const day = (i: number) => new Date(Date.UTC(2026, 0, 5 + i)).toISOString();
  for (let i = 0; i < 200; i++) {
    c += Math.sin(i / 8) * 2.4 + Math.cos(i / 19) * 1.3 + 0.18;
    // Every 23rd bar jumps, which is what leaves a three-candle gap behind.
    if (i % 23 === 7) c += 6.5;
    const o = c - 0.5;
    const h = c + Math.abs(Math.sin(i)) * 1.4 + 0.4;
    const l = c - Math.abs(Math.cos(i)) * 1.2 - 0.4;
    daily.push({ ts: day(i), o: +o.toFixed(2), h: +h.toFixed(2), l: +l.toFixed(2), c: +c.toFixed(2), v: 1_000_000 + i });
  }
}

const computed = computeKeyLevels(daily as never);
const ctx = {
  // A syntactically real uuid: the annotation reads go to the database and a
  // non-uuid makes them error rather than come back empty, which would be the
  // test failing about itself rather than about the path.
  userId: '00000000-0000-4000-8000-000000000000', symbol: 'PATH', timeframe: 'D',
  setup: null, alertId: null, planId: null,
  // A saved plan, so the plan-shaped commands have something real to resolve.
  plan: { entry: +daily[199].c.toFixed(2), stop: +(daily[199].c - 8).toFixed(2), targets: [{ price: +(daily[199].c + 12).toFixed(2), label: 'First target' }] },
  communityLevel: +(daily[190].c).toFixed(2),
  triggerTs: daily[180].ts,
  supports: (computed?.support ?? []).map((l) => l.price),
  resistances: (computed?.resistance ?? []).map((l) => l.price),
  priorSession: { from: daily[196].ts, to: daily[197].ts },
  bars: { firstTs: daily[0].ts, lastTs: daily[199].ts, lastPrice: daily[199].c },
  levelTimeframe: '1d',
  computed,
  intraday: computeIntradayLevels([]),
  trendlines: findTrendlines(daily as never),
  fib: computeFib(daily as never),
  dailyBars: daily,
} as never;

/**
 * What to ask for, per command, so that each one actually resolves. A command
 * that resolves to nothing is a legitimate server answer and tells us nothing
 * about the client path, so every entry here is chosen to come back with a frame.
 */
const ARGS: Record<string, Record<string, unknown>> = {
  mark_level: { level: 'prior_day_high' },
  mark_zone: { zone: 'prior_day' },
  mark_pattern: { pattern: 'fvg' },
  set_timeframe: { timeframe: '1h' },
  show_invalidation: {},
  mark_plan: {},
  zoom_trigger: { level: 'trigger' },
  compare_prior: {},
  highlight_community: {},
  annotation_remove: { annotation_id: 'nope' },
  annotation_explain: { annotation_id: 'nope' },
  alert_from_level: { level: 'prior_day_high' },
  prepare_trade: {},
  zoom_range: { from: daily[100].ts, to: daily[150].ts },
  scroll_bars: { bars: -40 },
  scroll_to_now: {},
  flash_annotation: { kind: 'support' },
  pointer_hint: { level: 'prior_day_high' },
};

/* ------------------------------------------------------------------ */
section('The server can build these on this chart');

ok('there are gaps to mark', availablePatterns(ctx).includes('fvg'), availablePatterns(ctx));
ok('and an area to shade', availableZones(ctx).includes('prior_day'), availableZones(ctx));

/* ------------------------------------------------------------------ */
section('Every command in the union survives the gate and the planner');

/**
 * Three commands act on an annotation that is ALREADY on the chart, so they
 * cannot resolve for a user with nothing stored. They are exercised through the
 * gate and the planner with a hand-built frame instead — which is the half that
 * has ever broken, and the half this test is about.
 */
const NEEDS_A_ROW = new Set(['annotation_remove', 'annotation_explain', 'flash_annotation']);

/** One mark already on the chart, for the commands that act on one. */
const ONSCREEN = {
  id: 'already-there', symbol: 'PATH', timeframe: null, kind: 'support',
  price: +daily[150].l.toFixed(2), price2: null, ts_from: null, ts_to: null,
  text: 'Support', reason: 'A shelf.', provenance: 'kai', status: 'valid',
  source_alert_id: null, source_setup_id: null, source_plan_id: null,
  created_at: null, updated_at: null,
} as never;

const frames: Record<string, { command: string; annotations: unknown[]; narration: string }> = {};

for (const name of CHART_COMMAND_NAMES) {
  const args = ARGS[name];
  if (!args) { ok(`${name}: the test knows how to ask for it`, false, 'add it to ARGS'); continue; }

  let frame: Record<string, unknown> | null = null;
  if (!NEEDS_A_ROW.has(name)) {
    frame = (await executeChartCommand(ctx, { command: name as never, args }, 'path-test')) as never;
    ok(`${name}: the server produces a frame`, frame !== null);
    if (!frame) continue;
  } else {
    // A frame shaped exactly as the server sends it for these three, against an
    // annotation the screen already has.
    frame = {
      type: 'chart_command', command: name,
      payload: { annotation_id: 'already-there', kind: 'support' },
      annotations: [], narration: 'Acting on a mark already on the chart.',
    };
  }

  // --- the gate ---
  const cmd = readCommand(frame);
  ok(`${name}: the client gate lets it through`, cmd !== null, CHART_COMMAND_NAMES.includes(name as never));
  if (!cmd) continue;
  ok(`${name}: with its command name intact`, cmd.command === name, cmd.command);

  // --- the planner ---
  const planned = planCommand(cmd, { symbol: 'PATH' } as never, [ONSCREEN]);
  ok(`${name}: the planner plans something rather than null`, planned !== null);
  if (!planned) continue;

  const served = (frame.annotations as unknown[] | undefined) ?? [];
  if (served.length) {
    ok(`${name}: every annotation the server persisted reaches the screen`, planned.upsert.length === served.length,
      { sent: served.length, planned: planned.upsert.length });
    frames[name] = { command: name, annotations: planned.upsert, narration: planned.narration };
  }
}

/* ------------------------------------------------------------------ */
section('And the two the report named actually draw');

ok('mark_zone planned annotations', (frames.mark_zone?.annotations.length ?? 0) > 0);
ok('mark_pattern planned annotations', (frames.mark_pattern?.annotations.length ?? 0) > 0);
ok('the pattern is capped', (frames.mark_pattern?.annotations.length ?? 0) <= 4, frames.mark_pattern?.annotations.length);
ok('and both are zones, not levels',
  [...(frames.mark_zone?.annotations ?? []), ...(frames.mark_pattern?.annotations ?? [])]
    .every((a) => (a as { kind: string }).kind === 'zone'),
  [...(frames.mark_zone?.annotations ?? []), ...(frames.mark_pattern?.annotations ?? [])].map((a) => (a as { kind: string }).kind));

/* ------------------------------------------------------------------ */
section('A refusal is still heard');

{
  const refused = await executeChartCommand(ctx, { command: 'mark_pattern' as never, args: { pattern: 'order block' } }, 'path-test');
  ok('the server answers a pattern it cannot find', refused !== null);
  const cmd = readCommand(refused);
  ok('the gate lets the refusal through', cmd !== null);
  const planned = cmd ? planCommand(cmd, { symbol: 'PATH' } as never, []) : null;
  ok('the planner does NOT drop it — this is what `default: return null` was eating', planned !== null);
  ok('and Kai still gets to say why', (planned?.narration.length ?? 0) > 20, planned?.narration);
  ok('while drawing nothing', (planned?.upsert.length ?? 1) === 0);
}

/* ------------------------------------------------------------------ */
section('In a real browser, the planned annotations become pixels');

{
  const url = 'file://' + path.resolve('assets/chart/index.html');
  const W = 940;
  const H = 500;
  const wire = daily.map((b) => ({ t: Math.floor(Date.parse(b.ts) / 1000), o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }));

  const browser = await chromium.launch();
  const bctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await bctx.newPage();
  await page.goto(url);
  await page.waitForTimeout(500);
  await page.evaluate(`window.postMessage({type:'setData',id:1,payload:{symbol:'PATH',timeframe:'D',candles:${JSON.stringify(wire)},lastPrice:${wire[wire.length - 1].c}}},'*')`);
  await page.waitForTimeout(350);

  const both = [...(frames.mark_zone?.annotations ?? []), ...(frames.mark_pattern?.annotations ?? [])];
  await page.evaluate(`window.postMessage({type:'annotations.set',id:2,payload:{annotations:${JSON.stringify(both)}}},'*')`);
  await page.waitForTimeout(900);

  /**
   * A shaded area is a TALL contiguous run of ink in a column with no candle in
   * it. A border alone would be one or two rows; a level would be a full-width
   * row starting at x = 0. Counting runs is what tells "it rendered as an area"
   * from "it rendered as another line" and from "it did not render".
   */
  const seen = (await page.evaluate(`(function(){
    var cs = document.querySelectorAll('canvas'), bands = 0, ruleRows = {};
    for (var i=0;i<cs.length;i++) {
      var cv=cs[i], w=cv.width, h=cv.height;
      if (w<200||h<100) continue;
      var d; try { d=cv.getContext('2d').getImageData(0,0,w,h).data; } catch(e){ continue; }
      var at=function(x,y){var o=(y*w+x)*4;return [d[o],d[o+1],d[o+2],d[o+3]];};
      for (var x=Math.floor(w*0.5); x<w-70; x++) {
        var runs=0, run=0;
        for (var y=2;y<h-2;y++){
          var p=at(x,y);
          if (Math.abs(p[0]-11)+Math.abs(p[1]-11)+Math.abs(p[2]-14)>=4) run++;
          else { if(run>=6) runs++; run=0; }
        }
        if (run>=6) runs++;
        if (runs>bands) bands=runs;
      }
      for (var y2=0;y2<h;y2++) {
        var n=0, minX=9999;
        for (var x2=0;x2<w;x2++) {
          var q=at(x2,y2);
          if (q[3]<90) continue;
          if (Math.abs(q[0]-50)<40 && Math.abs(q[1]-214)<40 && Math.abs(q[2]-255)<40) { n++; if(x2<minX) minX=x2; }
        }
        if (n > w*0.3 && minX < 12) ruleRows[y2]=1;
      }
    }
    var ks=Object.keys(ruleRows).map(Number).sort(function(a,b){return a-b;});
    return { bands: bands, fullWidthRules: ks.filter(function(y,i){return i===0||y-ks[i-1]>3;}).length };
  })()`)) as { bands: number; fullWidthRules: number };

  ok('the zones and the gaps are on the chart as shaded areas', seen.bands >= 2, seen);
  ok('and not one of them arrived as a horizontal line', seen.fullWidthRules === 0, seen);

  await page.screenshot({ path: 'proof/chart-command-path.png' });
  console.log('  screenshot → apps/mobile/proof/chart-command-path.png');
  await browser.close();
}

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
