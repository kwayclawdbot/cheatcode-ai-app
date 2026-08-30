/**
 * Who owns the vertical axis (LIVE-8).
 *
 *   cd apps/mobile && node scripts/chart-gestures-test.mjs
 *
 * TWO THINGS HAVE TO BE TRUE AT ONCE and they contradict each other, which is
 * why this is a test and not a comment.
 *
 *   EMBEDDED, THE PAGE OWNS VERTICAL. The chart sits inside a ScrollView; if it
 *   took vertical drags the screen could not be scrolled past. It must NOT pan.
 *
 *   ON THE STAGE, THE CHART OWNS VERTICAL. It fills the screen, there is no page
 *   to scroll, and a chart you cannot drag up and down is the one the owner
 *   called trash. It MUST pan.
 *
 * AND `vertTouchDrag: true` ALONE DOES NOT DO IT. While the price scale is
 * auto-fitting it re-derives its range every frame and puts the drag straight
 * back — measured, the axis did not move by a pixel with the flag set. The pan
 * only sticks once the drag hands the scale to manual. That interaction between
 * two unrelated-looking options is exactly the kind of thing that silently
 * regresses, so it is asserted against a real browser and real touch events
 * rather than trusted to a flag.
 *
 * The comparison is clipped to the PRICE AXIS on purpose. Comparing whole
 * screenshots also catches horizontal scroll, kinetic settle and the crosshair,
 * and answers "something moved" when the question is "did the price scale move".
 */
import { chromium } from 'playwright';
import path from 'node:path';
const url = 'file://' + path.resolve('assets/chart/index.html');

const bars = [];
let t = Math.floor(Date.parse('2026-06-01T13:30:00Z') / 1000);
for (let i = 0; i < 120; i++) {
  const o = 210 + Math.sin(i / 11) * 6, c = o + 0.4;
  bars.push({ t, o: +o.toFixed(2), h: +(o + 1).toFixed(2), l: +(o - 1).toFixed(2), c: +c.toFixed(2), v: 1 });
  t += 86400;
}
const W = 844, H = 390;
/** Only the price axis. A vertical pan changes it; nothing else here does. */
const AXIS = { x: W - 74, y: 0, width: 74, height: H };

async function run(own) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await p.goto(url);
  await p.waitForTimeout(500);
  await p.evaluate((bars) => {
    window.postMessage({ type: 'setData', id: 1, payload: { candles: bars, timeframe: 'D' } }, '*');
  }, bars);
  await p.evaluate((own) => window.postMessage({ type: 'setGestures', id: 2, payload: { own } }, '*'), own);
  await p.waitForTimeout(900);

  const before = await p.screenshot({ clip: AXIS });
  const touch = (type, y) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x: 400, y, radiusX: 2, radiusY: 2, force: 1 }],
    });
  await touch('touchStart', 110);
  for (let y = 130; y <= 300; y += 17) { await touch('touchMove', y); await p.waitForTimeout(22); }
  await touch('touchEnd', 300);
  await p.waitForTimeout(700);
  const after = await p.screenshot({ clip: AXIS });
  await ctx.close();
  return Buffer.compare(before, after) !== 0;
}

const browser = await chromium.launch();
const embedded = await run(false);
const stage = await run(true);
await browser.close();

console.log(`embedded (own=false)  vertical drag moves the price axis: ${embedded ? 'YES' : 'no'}   <- must be "no", the page owns vertical`);
console.log(`stage    (own=true)   vertical drag moves the price axis: ${stage ? 'YES' : 'no'}   <- must be "YES"`);
process.exit(!embedded && stage ? 0 : 1);
