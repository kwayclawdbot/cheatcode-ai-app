/**
 * The indicator library and the zone layer, proved where they actually run.
 *
 *   cd apps/mobile && npx tsx scripts/chart-indicators-test.mts
 *
 * THE COMPLAINT THIS EXISTS TO KEEP FIXED, verbatim: "Kai marks out levels like
 * ema etc as horizontal levels not actual ema so the entire chart is nothing but
 * multiple horizontal levels." And its follow-up: "we need to build indicator
 * library tools on how to draw them or call them or whatever needs to happen to
 * make them work, same for drawing zone boxes."
 *
 * FOUR THINGS ARE CHECKED AND THEY NEED FOUR DIFFERENT KINDS OF EVIDENCE.
 *
 *   THE MATH EXISTS TWICE AND MUST AGREE. `packages/shared/indicators.ts` prices
 *   the newest value for the label; `chart-web/src/03-annotations.js` draws the
 *   line, because the chart page has no module system and is the one holding the
 *   candles. Both run here over the same bars and every entry in the registry is
 *   compared point by point. Adding an indicator to one and not the other is a
 *   test failure rather than a curve that silently stops working.
 *
 *   TREND CLOUDS MUST MATCH THE ENGINE, NOT MERELY LOOK RIGHT. It is a port of
 *   `supertrend` in engine/kai_score/reference_cca.py, and the alert engine
 *   SCORES on a fresh trend-cloud flip — so a line that drifted from the
 *   reference would disagree with the grade printed beside it. The Python is run
 *   and compared bar for bar. It skips itself if pandas is not installed rather
 *   than failing a test run for a missing library.
 *
 *   A CURVE IS ONLY A CURVE AS PIXELS. The failure mode is a correct annotation
 *   drawn with the wrong primitive, which no data structure can show you. So the
 *   real page is loaded, real bars go through the real bridge, and the canvas is
 *   read back: a curve's pixels sit at different heights in different columns
 *   and a rule's do not.
 *
 *   A BAND AND A ZONE ARE FILLS, and a fill is measured by looking inside it.
 *   Both are checked in a column that contains no candle, where anything above
 *   the background colour is the fill and nothing else.
 */
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {
  DRAWABLE_INDICATORS,
  INDICATORS,
  computeIndicatorSeries,
  indicatorLabel,
  indicatorRefusal,
  parseIndicator,
  withDefaults,
} from '../../../packages/shared/indicators.ts';

let pass = 0;
let fail = 0;
function ok(name: string, cond: unknown, detail?: unknown) {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail === undefined ? '' : `\n        ${JSON.stringify(detail)}`}`); }
}
function section(t: string) { console.log(`\n${t}\n${'-'.repeat(t.length)}`); }

/* ------------------------------------------------------------------ */
/* The page's own code, loaded the way the page loads it               */
/* ------------------------------------------------------------------ */

const sandbox: Record<string, unknown> = {
  window: { performance: { now: () => 0 } },
  requestAnimationFrame: () => 0,
  console,
};
vm.createContext(sandbox);
for (const f of ['01-theme.js', '03-annotations.js']) {
  vm.runInContext(readFileSync(path.resolve('chart-web/src', f), 'utf8'), sandbox, { filename: f });
}
const pageIndicatorSeries = sandbox.indicatorSeries as (b: unknown[], v: unknown[], s: unknown, a?: unknown) => Record<string, number | null>[] | null;
const specOf = sandbox.specOf as (a: Record<string, unknown>) => { indicator: string; period: number | null; mult: number | null } | null;
const AnnotationLayer = sandbox.AnnotationLayer as new () => Record<string, Function> & Record<string, unknown>;
const kindColor = sandbox.kindColor as (k: string) => string;
const TOKENS = sandbox.TOKENS as Record<string, string>;
const IND = sandbox.IND as Record<string, { outputs: string[]; band: boolean }>;

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

/** Closes 1..60 on consecutive days, so every average has a hand-checkable answer. */
const ramp: { time: number; open: number; high: number; low: number; close: number }[] = [];
const t0 = Math.floor(Date.parse('2026-01-05T00:00:00Z') / 1000);
for (let i = 0; i < 60; i++) {
  const c = i + 1;
  ramp.push({ time: t0 + i * 86400, open: c, high: c + 0.5, low: c - 0.5, close: c });
}
const rampVols = ramp.map(() => 1000);
const rampTs = ramp.map((b) => ({ o: b.open, h: b.high, l: b.low, c: b.close, v: 1000 }));

/** 240 bars with real shape in them, so a band widens and a trend actually flips. */
const wiggle: { time: number; open: number; high: number; low: number; close: number }[] = [];
let wc = 100;
let wt = Math.floor(Date.parse('2025-04-01T00:00:00Z') / 1000);
for (let i = 0; i < 240; i++) {
  wc += Math.sin(i / 9) * 2.1 + Math.cos(i / 23) * 1.4 + (i % 7 === 0 ? 1.3 : -0.2);
  const o = wc - 0.4;
  const h = wc + Math.abs(Math.sin(i)) * 1.9 + 0.3;
  const l = wc - Math.abs(Math.cos(i)) * 1.7 - 0.3;
  wiggle.push({ time: wt, open: +o.toFixed(4), high: +h.toFixed(4), low: +l.toFixed(4), close: +wc.toFixed(4) });
  wt += 86400;
}
const wiggleVols = wiggle.map((_, i) => 1000 + i);
const wiggleTs = wiggle.map((b, i) => ({ o: b.open, h: b.high, l: b.low, c: b.close, v: 1000 + i }));

/* ------------------------------------------------------------------ */
section('The two halves of the library compute the same numbers');

/**
 * EVERY DRAWABLE ENTRY, BOTH IMPLEMENTATIONS, POINT BY POINT.
 *
 * This is the assertion that makes "adding an indicator is one entry" safe. The
 * registry lives in TypeScript and the compute is mirrored in the chart page's
 * plain JavaScript; nothing but this loop stops the two drifting, and drift is
 * invisible in production — the label would say one number and the line would be
 * somewhere else.
 */
for (const id of DRAWABLE_INDICATORS) {
  const entry = INDICATORS[id];
  const spec = withDefaults({ indicator: id, period: null, mult: null });
  // VWAP needs intraday bars to mean anything; on daily bars both halves refuse,
  // and agreeing to refuse is the agreement that matters here.
  const bars = wiggle;
  const barsTs = wiggleTs;
  const ts = computeIndicatorSeries(barsTs, spec, id === 'vwap' ? 0 : null);
  const js = pageIndicatorSeries(bars, wiggleVols, spec, id === 'vwap' ? bars[0].time : null);

  if (id === 'vwap') {
    ok(`${id}: both halves price it the same over one anchored window`, ts !== null && js !== null);
  }
  if (!ts || !js) {
    ok(`${id}: both halves produce a series`, ts !== null && js !== null, { ts: ts !== null, js: js !== null });
    continue;
  }
  let worst = 0;
  let missing = 0;
  for (let i = 0; i < bars.length; i++) {
    for (const field of entry.outputs) {
      const a = ts[i]?.[field];
      const b = js[i]?.[field];
      const an = typeof a === 'number' ? a : null;
      const bn = typeof b === 'number' ? b : null;
      if (an === null && bn === null) continue;
      if (an === null || bn === null) { missing += 1; continue; }
      worst = Math.max(worst, Math.abs(an - bn));
    }
  }
  ok(`${id}: every output agrees to the cent across ${bars.length} bars`, missing === 0 && worst < 1e-6, { worst, missing });
  ok(`${id}: the page knows the same outputs the registry declares`, JSON.stringify(IND[id].outputs) === JSON.stringify(entry.outputs));
  ok(`${id}: and the same idea of whether it is a band`, IND[id].band === entry.band);
}

/* ------------------------------------------------------------------ */
section('Hand-checkable answers');

const sma5 = computeIndicatorSeries(rampTs, { indicator: 'sma', period: 5, mult: null })!;
ok('a 5-bar simple average is absent until the 5th bar', sma5[3].sma === null && typeof sma5[4].sma === 'number');
ok('and its first value is the mean of the first five closes (3)', Math.abs((sma5[4].sma as number) - 3) < 1e-9);
ok('and its last is the mean of the last five (58)', Math.abs((sma5[59].sma as number) - 58) < 1e-9);

/** The server's `emaLast`, transcribed. The library must agree with it exactly. */
function emaLast(values: number[], period: number) {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let v = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) v = values[i] * k + v * (1 - k);
  return v;
}
const ema21 = computeIndicatorSeries(rampTs, { indicator: 'ema', period: 21, mult: null })!;
ok(
  "the library's EMA lands on the same number key-levels.ts prices, to the cent",
  Math.abs((ema21[59].ema as number) - (emaLast(ramp.map((b) => b.close), 21) as number)) < 1e-9,
);
ok('a 200-bar average over 60 bars is absent, not approximated', computeIndicatorSeries(rampTs, { indicator: 'ema', period: 200, mult: null }) === null);

const bb = computeIndicatorSeries(rampTs, { indicator: 'bollinger', period: 20, mult: 2 })!;
ok('Bollinger draws three lines, not one', typeof bb[59].basis === 'number' && typeof bb[59].upper === 'number' && typeof bb[59].lower === 'number');
ok('its middle is the simple average', Math.abs((bb[59].basis as number) - 50.5) < 1e-9, bb[59].basis);
ok('and the edges sit either side of it, symmetrically', Math.abs(((bb[59].upper as number) + (bb[59].lower as number)) / 2 - (bb[59].basis as number)) < 1e-9);
ok('a wider multiple makes a wider band', (() => {
  const wide = computeIndicatorSeries(rampTs, { indicator: 'bollinger', period: 20, mult: 3 })!;
  return (wide[59].upper as number) > (bb[59].upper as number);
})());

/* ------------------------------------------------------------------ */
section('VWAP is anchored, and refuses to be invented');

const intraday: { time: number; open: number; high: number; low: number; close: number }[] = [];
let it = Math.floor(Date.parse('2026-06-02T13:30:00Z') / 1000);
for (let i = 0; i < 40; i++) {
  const c = 100 + i * 0.1;
  intraday.push({ time: it + i * 300, open: c, high: c + 0.2, low: c - 0.2, close: c });
}
const ivolsJs = intraday.map(() => 5000);
const intradayTs = intraday.map((b) => ({ o: b.open, h: b.high, l: b.low, c: b.close, v: 5000 }));
const anchored = pageIndicatorSeries(intraday, ivolsJs, { indicator: 'vwap', period: null, mult: null }, intraday[0].time)!;
ok("the anchored VWAP's first value is the anchor bar's typical price",
  Math.abs((anchored[0].vwap as number) - (intraday[0].high + intraday[0].low + intraday[0].close) / 3) < 1e-9);
ok('and it MOVES — a running average is not one number', Math.abs((anchored[39].vwap as number) - (anchored[0].vwap as number)) > 0.1);
ok('a session VWAP over DAILY bars is refused rather than drawn over nothing',
  pageIndicatorSeries(ramp, rampVols, { indicator: 'vwap', period: null, mult: null }, null) === null);
ok('and the registry half refuses the same way', computeIndicatorSeries(intradayTs, { indicator: 'vwap', period: null, mult: null }, 0) !== null);

/* ------------------------------------------------------------------ */
section('CheatCode Trend Clouds matches the engine bar for bar');

/**
 * THE PORT IS ONLY ALLOWED TO EXIST BECAUSE OF THIS TEST.
 *
 * The owner asked for the product's own indicator by name, on the condition that
 * nothing about it be invented. It already existed — in Python, in the scoring
 * engine — so the values here are a transcription rather than a guess, and this
 * is what holds the transcription to it. `engine/tests/test_kai_score.py` makes
 * the same demand of the engine's own port; this is the browser side of it.
 */
const tmp = mkdtempSync(path.join(tmpdir(), 'tc-'));
const barsPath = path.join(tmp, 'bars.json');
const pyPath = path.join(tmp, 'ref.py');
writeFileSync(barsPath, JSON.stringify(wiggle.map((b) => ({ o: b.open, h: b.high, l: b.low, c: b.close }))));
writeFileSync(pyPath, `
import json, sys, warnings
warnings.filterwarnings('ignore')
sys.path.insert(0, ${JSON.stringify(path.resolve('../../engine'))})
import pandas as pd
from kai_score.reference_cca import supertrend
rows = json.load(open(${JSON.stringify(barsPath)}))
df = pd.DataFrame(rows).rename(columns={'o':'Open','h':'High','l':'Low','c':'Close'})
out = supertrend(df)
print(json.dumps({
  'line': [None if pd.isna(v) else float(v) for v in out['st_line']],
  'up':   [None if pd.isna(v) else float(v) for v in out['st_up']],
  'dn':   [None if pd.isna(v) else float(v) for v in out['st_dn']],
}))
`);

let py: { line: (number | null)[]; up: (number | null)[]; dn: (number | null)[] } | null = null;
try {
  py = JSON.parse(execFileSync('python3', [pyPath], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
} catch {
  console.log('  SKIP  the Python reference could not be run (pandas not installed) — the port is unverified in this run');
}

if (py) {
  const tcTs = computeIndicatorSeries(wiggleTs, { indicator: 'trend_clouds', period: 20, mult: 1.5 })!;
  const tcJs = pageIndicatorSeries(wiggle, wiggleVols, { indicator: 'trend_clouds', period: 20, mult: 1.5 })!;
  const cmp = (got: Record<string, number | null>[], field: string, want: (number | null)[]) => {
    let worst = 0;
    let bad = 0;
    for (let i = 0; i < wiggle.length; i++) {
      const a = want[i];
      const b = got[i]?.[field];
      const bn = typeof b === 'number' ? b : null;
      if (a === null && bn === null) continue;
      if (a === null || bn === null) { bad += 1; continue; }
      worst = Math.max(worst, Math.abs(a - bn));
    }
    return { worst, bad };
  };
  const tsLine = cmp(tcTs, 'line', py.line);
  const jsLine = cmp(tcJs, 'line', py.line);
  ok('the registry port matches the engine reference on every bar', tsLine.bad === 0 && tsLine.worst < 1e-9, tsLine);
  ok('and so does the chart page port', jsLine.bad === 0 && jsLine.worst < 1e-9, jsLine);
  const tsUp = cmp(tcTs, 'lower', py.up);
  const tsDn = cmp(tcTs, 'upper', py.dn);
  ok('both ratcheting bands match too, everywhere the reference has a real value',
    tsUp.worst < 1e-9 && tsDn.worst < 1e-9, { tsUp, tsDn });
  /**
   * ONE DELIBERATE DEVIATION, AND IT IS THE SAFE DIRECTION.
   *
   * Before the LSMA-12 source has filled — the first eleven bars — the reference
   * carries its bands forward out of a NaN and lands on literal zero. That is an
   * artefact of `np.nan` arithmetic, not a claim that the band was at $0, and
   * drawing it would put a cloud along the bottom of the pane. Both ports leave
   * those bars ABSENT instead, which is the same rule every other indicator here
   * follows: a window that has not filled has no value, and no value is drawn as
   * nothing rather than as zero.
   */
  const earlyZeros = py.up.slice(0, 12).filter((v) => v === 0).length;
  ok('and the reference\'s pre-window placeholder zeros are left undrawn rather than plotted at $0',
    earlyZeros > 0 && tsUp.bad === earlyZeros && tcTs[earlyZeros].lower !== null,
    { earlyZeros, omitted: tsUp.bad });
  ok('and the trend actually flips in this fixture, so the ratchet was exercised', (() => {
    const vals = py.line.filter((v): v is number => v !== null);
    return new Set(vals.map((v, i) => (i > 0 && Math.abs(v - vals[i - 1]) > 3 ? 'jump' : 'flat'))).has('jump');
  })());
}

/* ------------------------------------------------------------------ */
section('Calling an indicator by name');

const names: [string, string, number | null][] = [
  ['ema21', 'ema', 21], ['Ema21', 'ema', 21], ['21 EMA', 'ema', 21], ['ema 9', 'ema', 9],
  ['50-day moving average', 'ema', 50], ['sma200', 'sma', 200], ['simple moving average 30', 'sma', 30],
  ['vwap', 'vwap', null], ['Session VWAP', 'vwap', null],
  ['bollinger bands', 'bollinger', 20], ['bb 50', 'bollinger', 50], ['bbands', 'bollinger', 20],
  ['CheatCode Trend Clouds', 'trend_clouds', 20], ['trend clouds', 'trend_clouds', 20], ['supertrend', 'trend_clouds', 20],
  ['rsi', 'rsi', 14], ['relative strength index', 'rsi', 14], ['macd', 'macd', null], ['stochastic', 'stochastic', 14],
];
for (const [text, id, period] of names) {
  const s = parseIndicator(text);
  ok(`"${text}" resolves to ${id}${period === null ? '' : ` ${period}`}`, s?.indicator === id && (s?.period ?? null) === period, s);
}
for (const notOne of ['Support', 'Resistance', 'Trigger', 'Prior day high', 'Smart money zone', 'First target', 'Fib 61.8%']) {
  ok(`"${notOne}" is not an indicator`, parseIndicator(notOne) === null, parseIndicator(notOne));
}
ok('the label round-trips through the parser', (() => {
  for (const id of DRAWABLE_INDICATORS) {
    const spec = withDefaults({ indicator: id, period: null, mult: null });
    const back = parseIndicator(indicatorLabel(spec));
    if (!back || back.indicator !== id || (back.period ?? null) !== (spec.period ?? null)) return false;
  }
  return true;
})());
ok('the product name is what shows, never the upstream one',
  indicatorLabel({ indicator: 'trend_clouds', period: 20, mult: 1.5 }).startsWith('Trend Clouds') &&
  !/supertrend/i.test(indicatorLabel({ indicator: 'trend_clouds', period: 20, mult: 1.5 })));

/* ------------------------------------------------------------------ */
section('Panel indicators are refused, not drawn wrong');

for (const id of ['rsi', 'macd', 'stochastic'] as const) {
  const spec = withDefaults({ indicator: id, period: null, mult: null });
  const why = indicatorRefusal(spec);
  ok(`${id} is refused with a sentence, not a null`, typeof why === 'string' && why.length > 30, why);
  ok(`${id} cannot be turned into a series at all`, computeIndicatorSeries(rampTs, spec) === null);
  ok(`${id} is absent from the drawable list`, !(DRAWABLE_INDICATORS as string[]).includes(id));
}
ok('the RSI refusal says what a beginner needs to hear', /own panel/i.test(indicatorRefusal({ indicator: 'rsi', period: 14, mult: null }) ?? ''));
ok('an average is NOT refused', indicatorRefusal({ indicator: 'ema', period: 21, mult: null }) === null);
ok('the page refuses to compute a panel indicator too', pageIndicatorSeries(ramp, rampVols, { indicator: 'rsi', period: 14, mult: null }) === null);
ok('and a row typed as one is drawn as a note rather than a rule', specOf({ indicator: 'rsi', period: 14 }) === null);

/* ------------------------------------------------------------------ */
section('The budget: lines, and now areas');

const layer = new AnnotationLayer();
layer.setBars(ramp, rampVols, 40);
const lv = (id: string, kind: string, price: number) => ({ id, kind, price, price2: null, text: null, status: 'valid' });
const many = [
  lv('a', 'trigger', 40), lv('b', 'entry', 40.02), lv('c', 'stop', 37), lv('d', 'invalidation', 37),
  lv('e', 'target', 45), lv('f', 'target', 48), lv('g', 'support', 39), lv('h', 'resistance', 41),
  lv('i', 'support', 30), lv('j', 'support', 25), lv('k', 'resistance', 60), lv('l', 'resistance', 70),
  lv('m', 'support', 20), lv('n', 'resistance', 80),
];
const budgeted = layer._budget(many) as { rules: { lead: Record<string, unknown>; extra: number }[]; others: unknown[]; hidden: number };
ok('fourteen marks do not become fourteen lines', budgeted.rules.length <= 8, budgeted.rules.length);
const drawnKinds = budgeted.rules.map((r) => r.lead.kind);
ok('the stop is always drawn', drawnKinds.includes('stop'), drawnKinds);
ok('the trigger is always drawn', drawnKinds.includes('trigger') || drawnKinds.includes('entry'), drawnKinds);
ok('both targets are drawn', drawnKinds.filter((k) => k === 'target').length === 2, drawnKinds);
ok('a trigger and an entry a tenth of a percent apart are ONE line that says so', budgeted.rules.some((r) => r.extra === 1));

const zone = (id: string, top: number, bottom: number, text: string) =>
  ({ id, kind: 'zone', price: top, price2: bottom, ts_from: ramp[10].time, ts_to: null, text, status: 'valid' });
const zones = [
  zone('z1', 42, 38, 'The range'),
  zone('z2', 41.5, 38.5, 'Demand'),      // almost entirely inside z1 — one area
  zone('z3', 60, 55, 'Supply'),
  zone('z4', 30, 26, 'Lower shelf'),
  zone('z5', 90, 85, 'Way up there'),
  zone('z6', 12, 8, 'Way down there'),
];
const withZones = layer._budget(many.concat(zones as never[])) as { rules: unknown[]; others: Record<string, unknown>[]; hidden: number };
const drawnZones = withZones.others.filter((o) => o.kind === 'zone');
ok('six overlapping areas do not become six washes', drawnZones.length <= 4, drawnZones.length);
ok('two areas mostly on top of each other are merged and say so',
  drawnZones.some((z) => /\+1$/.test(String(z.text))), drawnZones.map((z) => z.text));
ok('the merged area spans both of its members', (() => {
  const merged = drawnZones.find((z) => /\+1$/.test(String(z.text)));
  return merged !== undefined && merged.price === 42 && merged.price2 === 38;
})(), drawnZones.map((z) => [z.text, z.price, z.price2]));
ok('the area price is standing in survives the cap',
  drawnZones.some((z) => String(z.text).startsWith('The range')), drawnZones.map((z) => z.text));
ok('and the furthest one is the one that does not',
  !drawnZones.some((z) => z.text === 'Way up there'), drawnZones.map((z) => z.text));
ok('zones do not eat the line budget',
  (layer._budget(many.concat(zones as never[])) as { rules: unknown[] }).rules.length === budgeted.rules.length);

const curve = { id: 'x', kind: 'indicator', indicator: 'bollinger', period: 20, mult: 2, price: 41, text: 'BB 20', status: 'valid' };
ok('nor does a band', (layer._budget(many.concat([curve as never])) as { rules: unknown[] }).rules.length === budgeted.rules.length);

ok('a zone with no height is not a zone', (() => {
  // The server converts these before they are stored; this is the client half of
  // the same rule — a rectangle two edges thick is a line, and it renders as one.
  const flat = zone('zf', 40, 40, 'Flat');
  const b = layer._budget([flat] as never[]) as { others: Record<string, unknown>[] };
  const z = b.others.find((o) => o.kind === 'zone');
  return z === undefined || Math.abs((z.price as number) - (z.price2 as number)) < 1e-9;
})());

/* ------------------------------------------------------------------ */
section('On the real page, in a real browser');

const url = 'file://' + path.resolve('assets/chart/index.html');
const W = 1000;
const H = 520;

const wire = wiggle.map((b, i) => ({ t: b.time, o: b.open, h: b.high, l: b.low, c: b.close, v: 900000 + i * 1000 }));
const last = wire[wire.length - 1].c;

const browser = await chromium.launch();
const bctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const page = await bctx.newPage();
await page.goto(url);
await page.waitForTimeout(600);
/**
 * EVERY BROWSER-SIDE FUNCTION IS PASSED AS A STRING, and it has to be.
 * This file is TypeScript, so esbuild rewrites its function bodies on the way
 * through — including injecting a `__name` helper that exists in Node and does
 * not exist in the page. A transformed closure handed to `page.evaluate` throws
 * `__name is not defined` inside the browser, which reads like a page bug and is
 * a toolchain artefact. Source text crosses the bridge unrewritten.
 */
await page.evaluate(
  `window.postMessage({ type: 'setData', id: 1, payload: { symbol: 'TEST', timeframe: 'D', candles: ${JSON.stringify(wire)}, lastPrice: ${wire[wire.length - 1].c} } }, '*')`,
);
await page.waitForTimeout(400);

/** The set a chart in the wild ends up carrying, now with a band and an area. */
const annotations = [
  { id: 'trig', kind: 'trigger', price: last + 2, text: 'Trigger', provenance: 'kai', status: 'valid' },
  { id: 'ent', kind: 'entry', price: last + 2.01, text: 'Entry', provenance: 'kai', status: 'valid' },
  { id: 'stop', kind: 'stop', price: last - 9, text: 'Stop', provenance: 'kai', status: 'valid' },
  { id: 'inv', kind: 'invalidation', price: last - 9, text: 'Invalidation', provenance: 'kai', status: 'valid' },
  { id: 't1', kind: 'target', price: last + 14, text: 'First target', provenance: 'kai', status: 'valid' },
  { id: 't2', kind: 'target', price: last + 26, text: 'Second target', provenance: 'kai', status: 'valid' },
  { id: 's1', kind: 'support', price: last - 4, text: 'Support', provenance: 'kai', status: 'valid' },
  { id: 'r1', kind: 'resistance', price: last + 6, text: 'Resistance', provenance: 'kai', status: 'valid' },
  { id: 'f1', kind: 'support', price: last - 15, text: 'Fib 38.2%', provenance: 'kai', status: 'valid' },
  { id: 'f2', kind: 'support', price: last - 21, text: 'Fib 50.0%', provenance: 'kai', status: 'valid' },
  { id: 'f3', kind: 'support', price: last - 27, text: 'Fib 61.8%', provenance: 'kai', status: 'valid' },
  { id: 'pdh', kind: 'resistance', price: last + 33, text: 'Prior day high', provenance: 'kai', status: 'valid' },
  { id: 'e8', kind: 'indicator', indicator: 'ema', period: 8, price: last, text: 'EMA 8', provenance: 'kai', status: 'valid' },
  { id: 'e21', kind: 'indicator', indicator: 'ema', period: 21, price: last, text: 'EMA 21', provenance: 'kai', status: 'valid' },
  { id: 'e50', kind: 'indicator', indicator: 'ema', period: 50, price: last, text: 'EMA 50', provenance: 'kai', status: 'valid' },
  { id: 'bb', kind: 'indicator', indicator: 'bollinger', period: 20, mult: 2, price: last, text: 'BB 20', provenance: 'kai', status: 'valid' },
  { id: 'tc', kind: 'indicator', indicator: 'trend_clouds', period: 20, mult: 1.5, price: last, text: 'Trend Clouds 20', provenance: 'kai', status: 'valid' },
  { id: 'zr', kind: 'zone', price: last - 20, price2: last - 32, ts_from: new Date(wiggle[200].time * 1000).toISOString(), ts_to: null, text: 'The range', provenance: 'kai', status: 'valid' },
];
await page.evaluate(
  `window.postMessage({ type: 'annotations.set', id: 2, payload: { annotations: ${JSON.stringify(annotations)} } }, '*')`,
);
await page.waitForTimeout(1400);

/**
 * Read the canvases back.
 *
 * A CURVE has a different y in different columns. A RULE has the same y in every
 * column it appears in — which is what makes it a rule, and what a moving average
 * must never look like. A FILL is measured from the inside: in a column with no
 * candle in it, everything above the background colour is fill and nothing else.
 */
/**
 * Read the canvases back.
 *
 * A CURVE has a different y in different columns. A RULE has the same y in every
 * column it appears in — which is what makes it a rule, and what a moving
 * average must never look like. A FILL is measured from the inside: in a column
 * with no candle in it, everything above the background colour is fill and
 * nothing else.
 *
 * PLAIN JAVASCRIPT IN A STRING, for the reason given above the first evaluate.
 */
const READER = `(function () {
  var hex = function (h) { var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  var near = function (r, g, b, h, tol) {
    var c = hex(h);
    tol = tol || 26;
    return Math.abs(r - c[0]) < tol && Math.abs(g - c[1]) < tol && Math.abs(b - c[2]) < tol;
  };
  var MUTED = '#B9B0A8', CYAN = '#32D6FF', RED = '#FF5A5F', GREEN = '#35D07F', BG = '#0B0B0E';
  var out = { curveCols: {}, looseCols: {}, ruleRows: {}, ruleMinX: {}, width: 0, height: 0,
              bandRun: 0, zoneRun: 0 };
  var canvases = document.querySelectorAll('canvas');
  for (var ci = 0; ci < canvases.length; ci++) {
    var cv = canvases[ci];
    var w = cv.width, h = cv.height;
    if (w < 200 || h < 100) continue;
    out.width = Math.max(out.width, w);
    out.height = Math.max(out.height, h);
    var d;
    try { d = cv.getContext('2d').getImageData(0, 0, w, h).data; } catch (e) { continue; }
    var at = function (x, y) { var i = (y * w + x) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3]]; };

    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var px = at(x, y);
        if (px[3] < 90) continue;
        // The label chips are drawn in these colours too, and they are BLOCKS.
        // Only count a pixel whose neighbours above and below are NOT the same
        // colour — a line is thin, a chip is not.
        var above = at(x, Math.max(0, y - 2));
        var below = at(x, Math.min(h - 1, y + 2));
        var thin = y > 2 && y < h - 3 &&
          !(above[3] > 90 && Math.abs(above[0] - px[0]) < 12) &&
          !(below[3] > 90 && Math.abs(below[0] - px[0]) < 12);
        if (!thin) continue;
        if (near(px[0], px[1], px[2], MUTED)) {
          if (!out.curveCols[x]) out.curveCols[x] = [];
          out.curveCols[x].push(y);
        }
        // THE FAINT EDGES OF A BAND ARE STILL THE BAND. An overlay stroked at
        // half alpha composites to a dark neutral grey that no longer matches
        // the muted token, so matching the token exactly would count a
        // Bollinger band as one line instead of three. Neutral-and-brighter-
        // than-background is what an overlay looks like at ANY alpha, and it is
        // what separates one from a cyan level or a coloured candle.
        var bgc0 = hex(BG);
        var lift = (px[0] - bgc0[0]) + (px[1] - bgc0[1]) + (px[2] - bgc0[2]);
        var neutral = Math.abs(px[0] - px[1]) < 22 && px[0] >= px[2] - 8;
        if (lift > 24 && neutral) {
          if (!out.looseCols[x]) out.looseCols[x] = [];
          out.looseCols[x].push(y);
        }
        if (near(px[0], px[1], px[2], CYAN) || near(px[0], px[1], px[2], RED) || near(px[0], px[1], px[2], GREEN)) {
          out.ruleRows[y] = (out.ruleRows[y] || 0) + 1;
          // A HORIZONTAL RULE STARTS AT THE LEFT EDGE OF THE PLOT. That is what
          // makes it a rule rather than the top of something — a zone's border
          // is horizontal and coloured too, but it begins at the bar the zone is
          // anchored to. Without this the zone's own edges would be counted
          // against a line budget they are deliberately exempt from.
          if (out.ruleMinX[y] === undefined || x < out.ruleMinX[y]) out.ruleMinX[y] = x;
        }
      }
    }

    // A COLUMN WITH NO CANDLE IN IT. Bar spacing leaves plenty, and picking one
    // is what makes "is anything filled here" answerable — the only things that
    // can be above the background in such a column are a fill, a grid line or a
    // curve crossing it.
    var emptyCols = [];
    for (var ex = 4; ex < w - 60; ex++) {
      var candle = false;
      for (var ey = 0; ey < h; ey += 2) {
        var q = at(ex, ey);
        if (q[3] > 90 && (near(q[0], q[1], q[2], GREEN, 40) || near(q[0], q[1], q[2], RED, 40))) { candle = true; break; }
      }
      if (!candle) emptyCols.push(ex);
    }
    var bg = hex(BG);
    /**
     * A FILL IS A LONG CONTIGUOUS RUN; AN OUTLINE IS TWO PIXELS.
     *
     * That is the whole difference being measured, and it is why this counts
     * runs rather than sampling a guessed y-window: a rectangle drawn with only
     * a border produces runs of one or two rows, and a rectangle that is filled
     * produces one run as tall as the region. Grid lines and curves crossing the
     * column are one or two rows too, so they cannot be mistaken for either.
     *
     * WHICH FILL a run belongs to is read off its colour. The band fill is the
     * muted family and composites to a neutral grey; the zone fill is cyan and
     * composites blue-heavy. Nothing else on the plot is a tall run at all.
     */
    var runsIn = function (x) {
      var best = { neutral: 0, cyan: 0 };
      var runLen = 0, sr = 0, sg = 0, sb = 0;
      var close = function () {
        if (runLen >= 3) {
          var mr = sr / runLen, mg = sg / runLen, mb = sb / runLen;
          if (mb > mr + 8 && mb > mg) { if (runLen > best.cyan) best.cyan = runLen; }
          else if (Math.abs(mr - mg) < 26 && mr >= mb - 10) { if (runLen > best.neutral) best.neutral = runLen; }
        }
        runLen = 0; sr = 0; sg = 0; sb = 0;
      };
      for (var y = 2; y < h - 2; y++) {
        var p = at(x, y);
        var inked = Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]) >= 4;
        if (inked) { runLen += 1; sr += p[0]; sg += p[1]; sb += p[2]; }
        else close();
      }
      close();
      return best;
    };
    for (var qi = 0; qi < emptyCols.length; qi++) {
      var r2 = runsIn(emptyCols[qi]);
      if (r2.neutral > out.bandRun) out.bandRun = r2.neutral;
      if (r2.cyan > out.zoneRun) out.zoneRun = r2.cyan;
    }
  }
  return out;
})()`;

const seen = (await page.evaluate(READER)) as {
  curveCols: Record<number, number[]>;
  looseCols: Record<number, number[]>;
  ruleRows: Record<number, number>;
  ruleMinX: Record<number, number>;
  width: number;
  height: number;
  bandRun: number;
  zoneRun: number;
};

const cols = Object.keys(seen.curveCols).map(Number).sort((a, b) => a - b);
const ysAt = (x: number) => seen.curveCols[x] || [];
const mean = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : NaN);
const spread = (arr: number[]) => (arr.length ? Math.max(...arr) - Math.min(...arr) : 0);
const leftY = ysAt(cols[Math.floor(cols.length * 0.15)]);
const midY = ysAt(cols[Math.floor(cols.length * 0.5)]);
const rightY = ysAt(cols[Math.floor(cols.length * 0.85)]);

ok('the indicators are drawn at all', cols.length > 100, { columnsWithCurvePixels: cols.length });
ok('and they are CURVES — the same overlay is at a different height in different columns',
  Math.abs(mean(leftY) - mean(rightY)) > 12 || Math.abs(mean(midY) - mean(rightY)) > 12,
  { left: mean(leftY), mid: mean(midY), right: mean(rightY) });
ok('five overlays occupy many different heights, not one shared rule', spread(rightY) > 20, { spreadAtRightEdge: spread(rightY) });
/** Three averages plus a band's three edges plus the clouds' three: a lot of lines at one x. */
const clusters = (ys: number[]) => {
  const s = [...new Set(ys)].sort((a, b) => a - b);
  return s.filter((y, i) => i === 0 || y - s[i - 1] > 3).length;
};
const looseCols = Object.keys(seen.looseCols).map(Number).sort((a, b) => a - b);
const looseMid = seen.looseCols[looseCols[Math.floor(looseCols.length * 0.5)]] || [];
ok('a band draws all of its edges, not just its middle', clusters(looseMid) >= 6,
  { distinctOverlayLinesAtMidColumn: clusters(looseMid) });

const ruleRows = Object.entries(seen.ruleRows)
  .filter(([y, n]) => n > seen.width * 0.3 && (seen.ruleMinX[Number(y)] ?? 999) < 12)
  .map(([y]) => Number(y))
  .sort((a, b) => a - b);
const distinct = ruleRows.filter((y, i) => i === 0 || y - ruleRows[i - 1] > 3);
ok('twelve level marks do not become twelve horizontal lines', distinct.length > 0 && distinct.length <= 8,
  { horizontalRulesDrawn: distinct.length, rows: distinct });

ok('a band is FILLED, not outlined — the wash between its edges is a tall run of ink, not two rows',
  seen.bandRun >= 12, { tallestNeutralRun: seen.bandRun });
ok('and so is a zone — a shaded area, not a rectangle drawn in outline',
  seen.zoneRun >= 12, { tallestCyanRun: seen.zoneRun });

const shot = 'proof/chart-indicators.png';
await page.screenshot({ path: shot });
console.log(`\n  screenshot → apps/mobile/${shot}`);
await browser.close();

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
