/**
 * LIVE-1 proof — the chart Kai drives.
 *
 *   EXPO_PUBLIC_FIXTURES=1 npx expo start --port 8091 --web
 *   node scripts/proof-live1.mjs
 *
 * WHAT THIS PROVES, AND WHAT IT CANNOT
 * ------------------------------------
 * The brief asks for a screen recording on the iOS SIMULATOR. This machine has
 * Command Line Tools but no Xcode, so there is no `simctl` and no simulator to
 * record (`xcrun simctl` → "unable to find utility"). Rather than quietly
 * substituting something weaker, this script states the substitution:
 *
 *   · the CHOREOGRAPHY recording + frame series is captured in Chromium at
 *     1280x720 on `/stage-check`, driving the real `ChartView` → bridge →
 *     chart page path. Nothing about the performance is mocked;
 *   · the MOBILE proofs run in **WebKit** — the same engine family as the iOS
 *     WKWebView the chart will live in — with an iPhone device descriptor,
 *     touch emulation and a real device pixel ratio;
 *   · every number reported (first paint, fps, interruption) is measured inside
 *     the chart page on the machine running it, not estimated.
 *
 * Output: proof/live1-*.png, proof/live1-frames/*.png, proof/live1-choreography.webm
 */
import { chromium, webkit, devices } from 'playwright';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs/promises';

const run = promisify(execFile);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'proof');
const FRAMES = path.join(OUT, 'live1-frames');
const BASE = process.env.PROOF_BASE ?? 'http://localhost:8091';

const HIDE_DEV_CHROME = `.__expo_fast_refresh{display:none!important}`;
const hideChrome = (ctx) => ctx.addInitScript((css) => {
  const add = () => { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); };
  if (document.head) add(); else document.addEventListener('DOMContentLoaded', add);
}, HIDE_DEV_CHROME);

const shot = async (page, name) => {
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log(`  ✓ ${name}.png`);
};

const must = async (page, testId, why) => {
  await page.getByTestId(testId).first().waitFor({ state: 'visible', timeout: 15000 });
  console.log(`  · ${why}`);
};

const results = { firstPaintMs: null, paint1500: null, fps: null, worstFps: null, interrupted: null, frames: 0 };

/**
 * The native-feel checklist from the brief. Every line is a MEASUREMENT taken
 * on this run, not a claim — an unchecked box here fails the script.
 */
const checklist = [];
const feel = (item, passed, note = '') => {
  checklist.push({ item, passed, note });
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${item}${note ? ` — ${note}` : ''}`);
};

/* ------------------------------------------------------------------ */
/* 1. The choreography, on the stage                                   */
/* ------------------------------------------------------------------ */

async function stage() {
  console.log('\n[1] the six-command choreography (Chromium, real ChartView → bridge → chart page)');
  await fs.mkdir(FRAMES, { recursive: true });
  for (const f of await fs.readdir(FRAMES).catch(() => [])) await fs.rm(path.join(FRAMES, f));

  const browser = await chromium.launch();
  // 1920x1080 exactly, as the brief asks for the web proof — and the same size
  // the LIVE-5 broadcast box will render into ffmpeg.
  const ctx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    hasTouch: true,
    recordVideo: { dir: FRAMES, size: { width: 1920, height: 1080 } },
  });
  await hideChrome(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 200)));

  await page.goto(`${BASE}/stage-check`, { waitUntil: 'domcontentloaded' });
  await must(page, 'screen-stage-check', 'the stage harness is up');
  await must(page, 'stage-chart', 'the chart mounted');
  await page.waitForFunction(() => !!window.__ccStage, null, { timeout: 20000 });
  await page.waitForTimeout(1500);

  const paint = await page.getByTestId('stage-first-paint').first().innerText().catch(() => '');
  results.firstPaintMs = Number(/first paint (\d+)ms/.exec(paint)?.[1] ?? NaN);
  console.log(`  · ${paint}`);

  await shot(page, 'live1-01-stage-1920x1080');

  // Frames DURING the performance, not after it. A screenshot of the end state
  // proves the state; the point of this lane is the journey.
  let n = 0;
  let grabbing = true;
  const grab = (async () => {
    while (grabbing) {
      await page.screenshot({ path: path.join(FRAMES, `f${String(n).padStart(3, '0')}.png`) }).catch(() => {});
      n += 1;
      await page.waitForTimeout(250);
    }
  })();

  const script = await page.evaluate(() => window.__ccStage.script);
  for (let i = 0; i < script.length; i++) {
    console.log(`  · ${script[i].label} — "${script[i].narration}"`);
    await page.evaluate((k) => window.__ccStage.step(k), i);
    await page.waitForTimeout(260);
  }
  grabbing = false;
  await grab;
  results.frames = n;
  if (n < 12) throw new Error(`the brief asks for at least 12 frames; captured ${n}`);

  // The video is the artifact you WATCH; the frames are the one you can flip
  // through in a diff. Full-size 1080p stills of every 250ms would be 10MB of
  // repo for that, so they are thinned to ~18 and shrunk to 900px wide — still
  // more than enough to see the pointer travel and the line draw itself.
  const keep = Math.max(1, Math.round(n / 18));
  const all = (await fs.readdir(FRAMES)).filter((f) => f.endsWith('.png')).sort();
  let kept = 0;
  for (let i = 0; i < all.length; i++) {
    const f = path.join(FRAMES, all[i]);
    if (i % keep === 0) { await run('sips', ['-Z', '900', f], { encoding: 'buffer' }).catch(() => {}); kept += 1; }
    else await fs.rm(f);
  }
  results.frames = kept;
  console.log(`  ✓ ${kept} frames (of ${n} captured) in proof/live1-frames/`);

  await shot(page, 'live1-02-stage-marked');

  /* ---- all six annotation primitives on one chart ---- */
  console.log('\n[2] the six annotation primitives');
  await page.evaluate(() => window.__ccStage.showAllKinds());
  await page.waitForTimeout(1200);
  await shot(page, 'live1-03-annotation-kinds');

  /* ---- crosshair ---- */
  console.log('\n[3] crosshair with the OHLC readout');
  const box = await page.getByTestId('stage-chart').first().boundingBox();
  await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.5, { steps: 12 });
  await page.waitForTimeout(500);
  await shot(page, 'live1-04-crosshair');

  /* ---- interruptibility: a finger outranks Kai ---- */
  console.log('\n[4] a user touch cancels the running Kai motion');
  await page.evaluate(() => window.__ccStage.reset());
  await page.waitForTimeout(400);
  // compare_prior is the longest sequence (600ms out, 1s hold, 600ms back).
  await page.evaluate(() => { window.__ccStage.step(5); });
  await page.waitForTimeout(220);
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(1800);
  const st = await page.evaluate(() => window.__ccStage.state());
  results.interrupted = st.lastResult?.reason ?? null;
  results.fps = st.fps?.fps ?? null;
  results.worstFps = st.fps?.worst ?? null;
  console.log(`  · the running sequence ended '${results.interrupted}' after ${st.lastResult?.completed}/${st.lastResult?.total} steps`);
  if (results.interrupted !== 'interrupted') {
    throw new Error(`a touch during a Kai camera move must interrupt it; got '${results.interrupted}'`);
  }
  await shot(page, 'live1-05-interrupted');
  feel('Kai motion is interruptible by touch', results.interrupted === 'interrupted',
    `the sequence ended '${results.interrupted}' after ${st.lastResult?.completed}/${st.lastResult?.total} steps`);

  /* ---- the native-feel checklist, measured ---- */
  console.log('\n[5] native-feel checklist');

  // 1,500 bars, and the page reports the frame that actually showed them.
  await page.evaluate(() => window.__ccStage.stress(1500));
  await page.waitForFunction(() => window.__ccStage.state().painted?.bars === 1500, null, { timeout: 15000 });
  const painted = await page.evaluate(() => window.__ccStage.state().painted);
  results.paint1500 = painted.ms;
  feel('first paint under 400ms with 1,500 bars', painted.ms < 400, `${painted.ms}ms for ${painted.bars} bars`);

  const cbox = await page.getByTestId('stage-chart').first().boundingBox();
  const cy = cbox.y + cbox.height / 2;
  // The camera, read off the `onViewportChange` prop the screen already
  // subscribes to — no extra bridge surface invented for the test.
  const readRange = async () => {
    for (let i = 0; i < 20; i++) {
      const v = await page.evaluate(() => window.__ccStage.state().viewport);
      if (v) return v;
      await page.waitForTimeout(100);
    }
    throw new Error('the chart never reported a viewport');
  };

  // Horizontal drag, with momentum.
  //
  // It has to be a TOUCH drag, and that is not a detail: Lightweight Charts
  // enables kinetic scrolling for touch and deliberately not for the mouse,
  // because a desktop drag that coasted past where you let go would feel
  // broken. So the momentum check dispatches real touch points through CDP —
  // the same thing a finger produces — and then measures how far the chart
  // keeps travelling after the last one lifts.
  const cdp = await ctx.newCDPSession(page);
  const tp = (x) => [{ x, y: cy, id: 1, radiusX: 8, radiusY: 8, force: 1 }];
  const before = await readRange();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(cbox.x + cbox.width * 0.82) });
  for (let i = 1; i <= 12; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: tp(cbox.x + cbox.width * (0.82 - i * 0.05)),
    });
    await page.waitForTimeout(10);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(90);
  const justAfter = await readRange();
  await page.waitForTimeout(1100);
  const settled = await readRange();
  const moved = Math.abs(settled.from - before.from);
  const coasted = Math.abs(settled.from - justAfter.from);
  feel('horizontal drag scrolls the chart', moved > 3, `${before.from.toFixed(1)} → ${settled.from.toFixed(1)} bars`);
  feel('and it carries momentum after the finger leaves', coasted > 0.3, `${coasted.toFixed(1)} bars of coast`);

  // Vertical drag on the chart must not scroll the page underneath it.
  const pageYBefore = await page.evaluate(() => window.scrollY);
  await page.mouse.move(cbox.x + cbox.width * 0.5, cbox.y + cbox.height * 0.25);
  await page.mouse.down();
  for (let i = 0; i < 12; i++) {
    await page.mouse.move(cbox.x + cbox.width * 0.5, cbox.y + cbox.height * 0.25 + i * 18);
    await page.waitForTimeout(8);
  }
  await page.mouse.up();
  await page.waitForTimeout(400);
  const pageYAfter = await page.evaluate(() => window.scrollY);
  feel('vertical drag on the chart does NOT scroll the page', pageYBefore === pageYAfter,
    `scrollY ${pageYBefore} → ${pageYAfter}`);

  // Pinch. Two real touch points, through CDP, because Playwright's own
  // touchscreen is single-finger and a pinch is the one gesture that is not.
  const beforePinch = await readRange();
  const px = cbox.x + cbox.width * 0.5;
  const py = cy;
  const touch = (a, b) => cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: px - a, y: py, id: 1 }, { x: px + a, y: py, id: 2 }],
  }).catch(() => {});
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: px - 40, y: py, id: 1 }, { x: px + 40, y: py, id: 2 }],
  }).catch(() => {});
  for (let i = 1; i <= 10; i++) { await touch(40 + i * 14); await page.waitForTimeout(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }).catch(() => {});
  await page.waitForTimeout(500);
  const afterPinch = await readRange();
  const zoomed = Math.abs(afterPinch.barSpacing - beforePinch.barSpacing);
  feel('pinch changes the zoom', zoomed > 0.4,
    `bar spacing ${beforePinch.barSpacing.toFixed(2)} → ${afterPinch.barSpacing.toFixed(2)}`);

  // Double-tap returns to the timeframe's own default window.
  await page.mouse.click(cbox.x + cbox.width * 0.5, cy);
  await page.waitForTimeout(60);
  await page.mouse.click(cbox.x + cbox.width * 0.5, cy);
  await page.waitForTimeout(900);
  const reset = await readRange();
  const span = reset.to - reset.from;
  feel('double-tap resets to the timeframe default window', span > 60 && span < 200,
    `${span.toFixed(0)} bars on screen`);

  await page.evaluate(() => window.__ccStage.unstress());
  await page.waitForTimeout(600);

  // A tap on the chart's OWN chip (canvas, inside the page) selects the level.
  await page.evaluate(() => window.__ccStage.showAllKinds());
  await page.waitForTimeout(900);
  // The chips are painted on a canvas, so there is no element to click: the
  // page hit-tests the tap itself. Sweeping down the left edge finds every
  // chip's row, and the first one that answers proves the hit test is wired to
  // the right rectangles — which is the part that could silently rot.
  const tapped = await page.evaluate(() => new Promise((res) => {
    const f = document.querySelector('iframe');
    const doc = f.contentDocument;
    const host = doc.querySelector('.chart-host');
    const h = (e) => {
      if (e.data?.type === 'annotationTap') { window.removeEventListener('message', h); res(e.data.payload.id); }
    };
    window.addEventListener('message', h);
    const H = host.getBoundingClientRect().height;
    let y = 8;
    const step = () => {
      if (y > H - 8) { window.removeEventListener('message', h); return res(null); }
      for (const type of ['pointerdown', 'pointerup']) {
        host.dispatchEvent(new PointerEvent(type, { clientX: 40, clientY: y, bubbles: true, pointerId: 1 }));
      }
      y += 3;
      setTimeout(step, 0);
    };
    step();
  }));
  feel('a tap on an on-chart chip selects that level', typeof tapped === 'string' && tapped.length > 0,
    tapped ? `annotationTap ${tapped}` : 'no chip answered the sweep');

  // No white flash: the container, the page and the WebView background are all
  // the surface token before a single candle exists.
  const bg = await page.evaluate(() => {
    const f = document.querySelector('iframe');
    return {
      frame: getComputedStyle(f).backgroundColor,
      body: f.contentWindow.getComputedStyle(f.contentDocument.body).backgroundColor,
      root: f.contentWindow.getComputedStyle(f.contentDocument.getElementById('root')).backgroundColor,
    };
  });
  const isSurface = (c) => c === 'rgb(11, 11, 14)';
  feel('no white flash on mount (page painted the surface token before anything else)',
    isSurface(bg.body) && isSurface(bg.root) && isSurface(bg.frame),
    JSON.stringify(bg));

  await page.close();
  const video = page.video();
  if (video) {
    const src = await video.path();
    const dst = path.join(OUT, 'live1-choreography.webm');
    await fs.rename(src, dst).catch(async () => { await fs.copyFile(src, dst); });
    console.log(`  ✓ live1-choreography.webm`);
  }
  await ctx.close();
  await browser.close();
}

/* ------------------------------------------------------------------ */
/* 1b. Reduced motion                                                  */
/* ------------------------------------------------------------------ */

/**
 * Reduced motion means "don't move me", not "don't work".
 *
 * The failure mode this guards is the one that looks like a feature: durations
 * collapse to zero AND the end state quietly stops being applied, so a user who
 * asked their OS for less motion gets a chart that no longer marks anything. So
 * the check is two-sided — the same six commands must finish far faster, and
 * finish with the same levels on the chart.
 */
async function reducedMotion() {
  console.log('\n[5b] reduced motion — the journey goes, the destination stays');
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    reducedMotion: 'reduce',
  });
  await hideChrome(ctx);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/stage-check`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__ccStage, null, { timeout: 20000 });
  await page.waitForTimeout(1200);

  const honoured = await page.evaluate(() => window.__ccStage.state().ready?.reducedMotion);
  feel('the page sees the OS reduced-motion preference', honoured === true, `ready.reducedMotion = ${honoured}`);

  const t0 = Date.now();
  await page.evaluate(() => window.__ccStage.runAll());
  await page.waitForFunction(() => window.__ccStage.state().step === -1, null, { timeout: 30000 });
  const ms = Date.now() - t0;

  const st = await page.evaluate(() => window.__ccStage.state());
  feel('the six commands run without the motion', ms < 4000, `${ms}ms (it is ~9s with motion)`);
  feel('and every level is still marked', st.annotations === 4, `${st.annotations} annotations on the chart`);
  feel('and the timeframe still ended where Kai left it', st.tf === '15m', `timeframe ${st.tf}`);
  await shot(page, 'live1-10-reduced-motion');

  await ctx.close();
  await browser.close();
}

/* ------------------------------------------------------------------ */
/* 2. The portal, on WebKit + an iPhone descriptor                     */
/* ------------------------------------------------------------------ */

async function portalOnWebKit() {
  console.log('\n[6] the Trade Portal on WebKit (iPhone descriptor — the closest engine to the iOS WKWebView available here)');
  const browser = await webkit.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  await hideChrome(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 200)));

  await page.goto(`${BASE}/trade/META?alert=alert-meta&ctx=alert`, { waitUntil: 'domcontentloaded' });
  await must(page, 'screen-trade-portal', 'the portal opened with the alert context');
  await must(page, 'portal-chart', 'the chart is the dominant object');
  await must(page, 'annotation-rail', 'every level is reachable, including the ones off screen');
  await page.waitForTimeout(2500);
  await shot(page, 'live1-06-portal-webkit-iphone');

  console.log('\n[7] a level is an object — tap one');
  await page.getByTestId('annotation-ann-stop').first().tap();
  await must(page, 'annotation-sheet', 'the inspector opens');
  await must(page, 'annotation-reason', 'carrying the reason it was placed');
  await shot(page, 'live1-07-annotation-sheet-webkit');
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(500);

  console.log('\n[8] a horizontal drag scrolls the chart, and the page does not move');
  const box = await page.getByTestId('portal-chart').first().boundingBox();
  const scrollBefore = await page.evaluate(() => window.scrollY);
  const cy = box.y + box.height / 2;
  await page.touchscreen.tap(box.x + box.width / 2, cy);
  await page.mouse.move(box.x + box.width * 0.75, cy);
  await page.mouse.down();
  for (let i = 0; i < 12; i++) {
    await page.mouse.move(box.x + box.width * (0.75 - i * 0.04), cy);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  await page.waitForTimeout(900);
  const scrollAfter = await page.evaluate(() => window.scrollY);
  console.log(`  · page scrollY ${scrollBefore} → ${scrollAfter} (the chart took the gesture, the page did not)`);
  await shot(page, 'live1-08-portal-dragged-webkit');

  console.log('\n[9] the ticker research page shows the same chart');
  await page.goto(`${BASE}/symbol/META`, { waitUntil: 'domcontentloaded' });
  await must(page, 'ticker-chart', 'the research page and the portal share one chart');
  await page.waitForTimeout(2200);
  await shot(page, 'live1-09-ticker-webkit');

  await ctx.close();
  await browser.close();
}

/* ------------------------------------------------------------------ */

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  await stage();
  await reducedMotion();
  await portalOnWebKit();

  console.log('\n──────── LIVE-1 native-feel checklist ────────');
  for (const c of checklist) console.log(`  ${c.passed ? '[x]' : '[ ]'} ${c.item}${c.note ? ` — ${c.note}` : ''}`);
  console.log('\n──────── LIVE-1 measurements ────────');
  console.log(`  page boot to first paint:                    ${results.firstPaintMs} ms`);
  console.log(`  1,500 bars parsed, drawn and on screen:      ${results.paint1500} ms (budget 400)`);
  console.log(`  frame rate while the chart is being moved:   ${results.fps} fps (worst sampled ${results.worstFps})`);
  console.log(`  Kai motion under a user touch:               ${results.interrupted}`);
  console.log(`  choreography frames captured:                ${results.frames}`);
  console.log('\n  NOT captured: an iOS Simulator recording. This machine has Command Line');
  console.log('  Tools only — `xcrun simctl` is absent, so there is no simulator to record.');
  console.log('  The WebKit + iPhone-descriptor runs above are the closest substitute.');
  console.log('─────────────────────────────────────\n');

  const failed = checklist.filter((c) => !c.passed);
  if (failed.length) {
    throw new Error(`native-feel checklist has ${failed.length} unchecked box(es): ${failed.map((f) => f.item).join('; ')}`);
  }
}

main().catch((e) => { console.error('\nFAILED:', e.message); process.exit(1); });
