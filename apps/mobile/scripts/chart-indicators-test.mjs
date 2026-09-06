/**
 * An average is a curve, and a chart is not a wall of lines.
 *
 *   cd apps/mobile && node scripts/chart-indicators-test.mjs
 *
 * THE COMPLAINT THIS EXISTS TO KEEP FIXED, verbatim: "Kai marks out levels like
 * ema etc as horizontal levels not actual ema so the entire chart is nothing but
 * multiple horizontal levels."
 *
 * Both halves of that are asserted, and the second half is why this is a browser
 * test rather than a unit test. "Is the 21-day average drawn as a curve" cannot
 * be answered by inspecting a data structure — the failure mode is a correct
 * annotation drawn with the wrong primitive, which only exists as pixels. So the
 * real page is loaded, real bars are sent through the real bridge, and the
 * canvas is read back:
 *
 *   A CURVE'S PIXELS MOVE VERTICALLY ACROSS THE PLOT. A rule's do not. Scanning
 *   the muted colour column by column and measuring the spread of its y positions
 *   tells the two apart with no ambiguity at all, and it fails loudly if anybody
 *   ever routes an indicator back through the level path.
 *
 *   ELEVEN LEVELS DO NOT PRODUCE ELEVEN LINES. The dashed rules are counted off
 *   the same canvas and held to the budget in 03-annotations.js.
 *
 * The first section is arithmetic and runs with no browser: the EMA the page
 * computes has to be the same number the server put in the price tag, or the
 * line and the label disagree about where the average is.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

let pass = 0;
let fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail === undefined ? '' : `\n        ${JSON.stringify(detail)}`}`); }
}
function section(t) { console.log(`\n${t}\n${'-'.repeat(t.length)}`); }

/* ------------------------------------------------------------------ */
/* 1. The arithmetic, in the page's own code                           */
/* ------------------------------------------------------------------ */

const sandbox = {
  window: { performance: { now: () => 0 } },
  requestAnimationFrame: () => 0,
  console,
};
vm.createContext(sandbox);
for (const f of ['01-theme.js', '03-annotations.js']) {
  vm.runInContext(readFileSync(path.resolve('chart-web/src', f), 'utf8'), sandbox, { filename: f });
}
const { indicatorSeries, specOf, AnnotationLayer, kindColor } = sandbox;

section('The series is computed on the page, from the bars the page already has');

/** Closes 1..60 on consecutive days, so every average has a hand-checkable answer. */
const bars = [];
let t0 = Math.floor(Date.parse('2026-01-05T00:00:00Z') / 1000);
for (let i = 0; i < 60; i++) {
  const c = i + 1;
  bars.push({ time: t0 + i * 86400, open: c, high: c + 0.5, low: c - 0.5, close: c });
}
const vols = bars.map(() => 1000);

const sma5 = indicatorSeries(bars, vols, { indicator: 'sma', period: 5 }, null);
ok('a 5-bar simple average starts on the 5th bar, not the 1st', sma5.length === 56, sma5.length);
ok('and its first value is the mean of the first five closes (3)', Math.abs(sma5[0].value - 3) < 1e-9, sma5[0]);
ok('and its last is the mean of the last five (58)', Math.abs(sma5[sma5.length - 1].value - 58) < 1e-9, sma5[sma5.length - 1]);

/** The server's `emaLast`, transcribed. The page must agree with it exactly. */
function emaLast(values, period) {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let v = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) v = values[i] * k + v * (1 - k);
  return v;
}
const closes = bars.map((b) => b.close);
const ema21 = indicatorSeries(bars, vols, { indicator: 'ema', period: 21 }, null);
ok(
  'the page\'s EMA lands on the same number the server prices, to the cent',
  Math.abs(ema21[ema21.length - 1].value - emaLast(closes, 21)) < 1e-9,
  { page: ema21[ema21.length - 1].value, server: emaLast(closes, 21) },
);
ok('a 200-bar average over 60 bars is absent, not approximated', indicatorSeries(bars, vols, { indicator: 'ema', period: 200 }, null) === null);

section('VWAP is anchored, and refuses to be invented');

/** One session of five-minute bars, so a running VWAP means something. */
const intraday = [];
let t1 = Math.floor(Date.parse('2026-06-02T13:30:00Z') / 1000);
for (let i = 0; i < 40; i++) {
  const c = 100 + i * 0.1;
  intraday.push({ time: t1 + i * 300, open: c, high: c + 0.2, low: c - 0.2, close: c });
}
const ivols = intraday.map(() => 5000);
const anchored = indicatorSeries(intraday, ivols, { indicator: 'vwap', period: null }, intraday[0].time);
ok('an anchored VWAP starts at the anchor bar', anchored[0].time === intraday[0].time);
ok('and its first value is that bar\'s typical price', Math.abs(anchored[0].value - (intraday[0].high + intraday[0].low + intraday[0].close) / 3) < 1e-9);
ok('and it MOVES — a running average is not one number', Math.abs(anchored[anchored.length - 1].value - anchored[0].value) > 0.1);
ok(
  'a session VWAP over DAILY bars is refused rather than drawn over nothing',
  indicatorSeries(bars, vols, { indicator: 'vwap', period: null }, null) === null,
);

section('Which curve a row names — including rows written before overlays existed');

ok('the wire fields are read first', JSON.stringify(specOf({ indicator: 'ema', period: 21 })) === '{"indicator":"ema","period":21}');
ok('an old row labelled "Ema21" is still readable', JSON.stringify(specOf({ text: 'Ema21' })) === '{"indicator":"ema","period":21}');
ok('so is "50-day moving average"', JSON.stringify(specOf({ text: '50-day moving average' })) === '{"indicator":"ema","period":50}');
ok('so is "21 EMA"', JSON.stringify(specOf({ text: '21 EMA' })) === '{"indicator":"ema","period":21}');
ok('and "Session VWAP"', JSON.stringify(specOf({ text: 'Session VWAP' })) === '{"indicator":"vwap","period":null}');
ok('a support is not an indicator', specOf({ text: 'Support' }) === null);
ok('and neither is a prior day high', specOf({ text: 'Prior day high' }) === null);

section('An overlay is never coloured or shaped like a level');

ok('it gets the muted family, not cyan', kindColor('indicator') === sandbox.TOKENS.muted);
ok('and support keeps cyan', kindColor('support') === sandbox.TOKENS.cyan);

section('The horizontal-line budget');

const layer = new AnnotationLayer();
layer.setBars(bars, vols, 40);
const lv = (id, kind, price) => ({ id, kind, price, price2: null, text: null, status: 'valid' });
const many = [
  lv('a', 'trigger', 40), lv('b', 'entry', 40.02), lv('c', 'stop', 37), lv('d', 'invalidation', 37),
  lv('e', 'target', 45), lv('f', 'target', 48), lv('g', 'support', 39), lv('h', 'resistance', 41),
  lv('i', 'support', 30), lv('j', 'support', 25), lv('k', 'resistance', 60), lv('l', 'resistance', 70),
  lv('m', 'support', 20), lv('n', 'resistance', 80),
];
const budgeted = layer._budget(many);
ok('fourteen marks do not become fourteen lines', budgeted.rules.length <= 8, budgeted.rules.length);
ok('and the ones that did not fit are counted, not lost', budgeted.hidden === 14 - budgeted.rules.length - 2, {
  hidden: budgeted.hidden, drawn: budgeted.rules.length,
});

const drawnKinds = budgeted.rules.map((r) => r.lead.kind);
ok('the stop is always drawn', drawnKinds.includes('stop'), drawnKinds);
ok('the trigger is always drawn', drawnKinds.includes('trigger') || drawnKinds.includes('entry'), drawnKinds);
ok('both targets are drawn', drawnKinds.filter((k) => k === 'target').length === 2, drawnKinds);
ok(
  'a trigger and an entry a tenth of a percent apart are ONE line that says so',
  budgeted.rules.some((r) => r.extra === 1),
  budgeted.rules.map((r) => [r.lead.kind, r.extra]),
);
ok(
  'the level twenty points away loses to the one two points away',
  !drawnKinds.includes('note') && !budgeted.rules.some((r) => r.lead.id === 'm'),
  drawnKinds,
);

const withCurve = many.concat([{ id: 'x', kind: 'indicator', indicator: 'ema', period: 21, price: 41, text: 'EMA 21', status: 'valid' }]);
const b2 = layer._budget(withCurve);
ok('a curve is never counted against the line budget', b2.rules.length === budgeted.rules.length && b2.others.length === 1);

ok('showing everything is one tap away', layer.toggleOverflow() === true && layer._budget(many).hidden === 0);
layer.toggleOverflow();

/* ------------------------------------------------------------------ */
/* 2. The pixels                                                       */
/* ------------------------------------------------------------------ */

section('On the real page, in a real browser');

const url = 'file://' + path.resolve('assets/chart/index.html');
const W = 900, H = 460;

/** 180 daily bars with a genuine bend in them, so an average has to curve. */
const wire = [];
let tw = Math.floor(Date.parse('2025-09-01T00:00:00Z') / 1000);
for (let i = 0; i < 180; i++) {
  const c = 200 + Math.sin(i / 14) * 26 + i * 0.22;
  wire.push({ t: tw, o: +c.toFixed(2), h: +(c + 1.6).toFixed(2), l: +(c - 1.6).toFixed(2), c: +c.toFixed(2), v: 900000 + i * 1000 });
  tw += 86400;
}
const last = wire[wire.length - 1].c;

const browser = await chromium.launch();
const bctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const page = await bctx.newPage();
await page.goto(url);
await page.waitForTimeout(600);

await page.evaluate((candles) => {
  window.postMessage({ type: 'setData', id: 1, payload: { symbol: 'TEST', timeframe: 'D', candles, lastPrice: candles[candles.length - 1].c } }, '*');
}, wire);
await page.waitForTimeout(400);

/**
 * The set a chart in the wild actually ends up carrying: the plan, the shelves
 * the bars produced, a handful of fib retracements — and the four averages that
 * used to arrive as four more horizontal rules.
 */
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
  { id: 'e200', kind: 'indicator', indicator: 'sma', period: 100, price: last, text: 'SMA 100', provenance: 'kai', status: 'valid' },
];
await page.evaluate((a) => window.postMessage({ type: 'annotations.set', id: 2, payload: { annotations: a } }, '*'), annotations);
await page.waitForTimeout(1200);

/**
 * Read the canvases back.
 *
 * Two shapes are being told apart and both are measured the same way: for each
 * colour, collect the y of every pixel, column by column. A CURVE has a
 * different y in different columns. A RULE has the same y in every column it
 * appears in — which is exactly what makes it a rule, and exactly what a moving
 * average must never look like.
 */
const seen = await page.evaluate(() => {
  const near = (r, g, b, hex) => {
    const n = parseInt(hex.slice(1), 16);
    return Math.abs(r - ((n >> 16) & 255)) < 26 && Math.abs(g - ((n >> 8) & 255)) < 26 && Math.abs(b - (n & 255)) < 26;
  };
  const MUTED = '#B9B0A8', CYAN = '#32D6FF', RED = '#FF5A5F', GREEN = '#35D07F';
  const out = { curveCols: {}, ruleRows: {}, width: 0 };
  for (const cv of document.querySelectorAll('canvas')) {
    const w = cv.width, h = cv.height;
    if (w < 200 || h < 100) continue;
    out.width = Math.max(out.width, w);
    let d;
    try { d = cv.getContext('2d').getImageData(0, 0, w, h).data; } catch (e) { continue; }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const r = d[i], g = d[i + 1], b = d[i + 2], al = d[i + 3];
        if (al < 90) continue;
        // The label chips are drawn on the plot in these colours too, and they
        // are BLOCKS. Only count a pixel whose neighbours above and below are
        // NOT the same colour — a line is thin, a chip is not.
        const above = ((y - 2) * w + x) * 4, below = ((y + 2) * w + x) * 4;
        const thin = y > 2 && y < h - 3 && !(d[above + 3] > 90 && Math.abs(d[above] - r) < 12) && !(d[below + 3] > 90 && Math.abs(d[below] - r) < 12);
        if (!thin) continue;
        if (near(r, g, b, MUTED)) { (out.curveCols[x] = out.curveCols[x] || []).push(y); }
        else if (near(r, g, b, CYAN) || near(r, g, b, RED) || near(r, g, b, GREEN)) {
          out.ruleRows[y] = (out.ruleRows[y] || 0) + 1;
        }
      }
    }
  }
  return out;
});

// --- the averages are curves ---
const cols = Object.keys(seen.curveCols).map(Number).sort((a, b) => a - b);
ok('the averages are drawn at all', cols.length > 100, { columnsWithCurvePixels: cols.length });
const ysAt = (x) => seen.curveCols[x] || [];
const leftY = ysAt(cols[Math.floor(cols.length * 0.15)]);
const midY = ysAt(cols[Math.floor(cols.length * 0.5)]);
const rightY = ysAt(cols[Math.floor(cols.length * 0.85)]);
const spread = (arr) => (arr.length ? Math.max(...arr) - Math.min(...arr) : 0);
const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : NaN);
ok(
  'and they are CURVES — the same average is at a different height in different columns',
  Math.abs(mean(leftY) - mean(rightY)) > 12 || Math.abs(mean(midY) - mean(rightY)) > 12,
  { left: mean(leftY), mid: mean(midY), right: mean(rightY) },
);
ok(
  'four averages occupy four different heights, not one shared rule',
  spread(rightY) > 20,
  { spreadAtRightEdge: spread(rightY) },
);

// --- and the plot is not a wall of rules ---
// A rule spans the plot, so it is a row with a long run of coloured pixels.
const ruleRows = Object.entries(seen.ruleRows)
  .filter(([, n]) => n > seen.width * 0.3)
  .map(([y]) => Number(y))
  .sort((a, b) => a - b);
// Neighbouring rows are the same 1px line landing on two device rows.
const distinct = ruleRows.filter((y, i) => i === 0 || y - ruleRows[i - 1] > 3);
ok(
  'twelve level marks do not become twelve horizontal lines',
  distinct.length > 0 && distinct.length <= 8,
  { horizontalRulesDrawn: distinct.length, rows: distinct },
);

const shot = 'proof/chart-indicators.png';
await page.screenshot({ path: shot });
console.log(`\n  screenshot → apps/mobile/${shot}`);
await browser.close();

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
