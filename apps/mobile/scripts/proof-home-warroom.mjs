/**
 * HOME IN THE WAR ROOM STYLE — photographed (docs/HOME-WAR-ROOM-2026-09-21.md).
 *
 *   cd apps/mobile
 *   EXPO_PUBLIC_FIXTURES=1 npx expo start --web --port 8093
 *   PROOF_BASE=http://localhost:8093 node scripts/proof-home-warroom.mjs
 *
 * Shots go to docs/home-warroom-proof/ (a lane's evidence, not signed-off
 * pixels, so not proof/). Three sizes, as the lane brief asks:
 *   390×844 at 100% text, 390×844 at 130% text, 360×780.
 *
 * FIXTURES MODE: Kai's side is the canned turn that carries a workspace action
 * through the same path a live one takes. `?stage=` and `?credits=` are
 * fixtures-only previews and do nothing on a real stack.
 *
 * The mic cannot be exercised here (no microphone in headless Chromium, and the
 * voice service reports itself unavailable in fixtures), so the rings following
 * the member's voice is a real-phone check.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.PROOF_BASE ?? 'http://localhost:8093';
const OUT = process.env.PROOF_OUT ?? path.resolve(HERE, '../../../docs/home-warroom-proof');
mkdirSync(OUT, { recursive: true });

const failures = [];
const note = (ok, what) => { console.log(`  ${ok ? '✓' : '✗'} ${what}`); if (!ok) failures.push(what); };

const browser = await chromium.launch();

async function session({ width, height, scale = 1, reduced = false }) {
  const ctx = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: 2, colorScheme: 'dark',
    reducedMotion: reduced ? 'reduce' : 'no-preference',
  });
  await ctx.addInitScript(({ scale, reduced }) => {
    try { localStorage.setItem('ccai.a11y.v1', JSON.stringify({ textScale: scale, reducedMotion: reduced })); } catch {}
    const add = () => { const s = document.createElement('style'); s.textContent = '.__expo_fast_refresh{display:none!important}'; document.head.appendChild(s); };
    if (document.head) add(); else document.addEventListener('DOMContentLoaded', add);
  }, { scale, reduced });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => failures.push(`page error: ${e.message}`));
  return { ctx, page };
}

const tid = (page, id) => page.locator(`[data-testid="${id}"]`).first();
const has = async (page, id) => (await page.locator(`[data-testid="${id}"]`).count()) > 0;
const shot = async (page, name) => {
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log(`  · ${name}.png`);
};
const open = async (page, route) => {
  await page.goto(`${BASE}${route}`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForSelector('[data-testid="screen-home"]', { timeout: 90_000 });
  await page.waitForTimeout(2600);
};
const noSideScroll = async (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const litNow = async (page) => (await page.locator('[data-testid^="kai-brain-lit-"]').evaluateAll(
  (els) => els.map((e) => e.getAttribute('data-testid').replace('kai-brain-lit-', '')),
));

/* ─────────────────────────────── 390 × 844, 100% ─────────────────────────── */
console.log('\n390×844 at 100% — trade ready, at rest');
{
  const { ctx, page } = await session({ width: 390, height: 844 });
  await open(page, '/home?stage=trade_ready');
  note(await has(page, 'warroom-brain'), 'the brain is drawn at rest');
  note((await tid(page, 'warroom-title').innerText()).includes('WAR ROOM'), 'the bar says KAI · WAR ROOM');
  note((await tid(page, 'kai-status-word').innerText()) === 'READY', 'the status light reads Ready');
  note((await tid(page, 'warroom-stage').innerText()).includes('TRADE READY'), 'the stage is in the bar');
  const lit = await litNow(page);
  note(lit.join() === 'technicals,alerts,options', `trade ready lights setups, alerts and options (${lit.join()})`);
  for (const id of ['home-threads-open', 'home-panels-open', 'home-thread-new']) note(await has(page, id), `${id} is still there`);
  note(!(await has(page, 'home-thread-title')), 'no thread title on today');
  note(await noSideScroll(page), 'no sideways scroll');
  await shot(page, '01-390-trade-ready-rest');

  console.log('\nKai opens a chart, then a second panel');
  await tid(page, 'composer-input').fill('Show me the NVDA chart');
  await tid(page, 'composer-send').click();
  await page.waitForSelector('[data-testid="workspace-host"]', { timeout: 20_000 });
  // Mid-reply: Kai is still writing, so the light says so and his line is over
  // the chart. The canned reply streams for about a second, so this polls.
  let word = '';
  let lower = '';
  for (let i = 0; i < 40 && !(word === 'THINKING' && lower.split(' ').length >= 6); i++) {
    word = await tid(page, 'kai-status-word').innerText();
    lower = (await has(page, 'warroom-chart-caption')) ? (await tid(page, 'warroom-chart-caption').innerText()).trim() : '';
    await page.waitForTimeout(50);
  }
  await page.screenshot({ path: path.join(OUT, '02a-390-chart-kai-speaking.png') });
  console.log('  · 02a-390-chart-kai-speaking.png');
  note(word === 'THINKING', `the light says Thinking while he writes (${word})`);
  note(lower.length > 0, `Kai's latest line is over the chart ("${lower}")`);
  await page.waitForTimeout(2600);
  note(!(await has(page, 'warroom-chart-caption')), 'and the caption is gone once he has finished');
  note(!(await has(page, 'warroom-brain')), 'the brain gives way to the panel');
  note(await has(page, 'warroom-orb'), 'and shrinks to the orb in the bar');
  note(await has(page, 'workspace-chip-chart'), 'the chart is a tab');
  await shot(page, '02-390-chart-open');

  await tid(page, 'composer-input').fill('What does the NVDA option chain look like');
  await tid(page, 'composer-send').click();
  await page.waitForSelector('[data-testid="panel-options"]', { timeout: 20_000 });
  await page.waitForTimeout(2600);
  note(await has(page, 'workspace-close-all'), 'two panels show "close all"');
  const chartKept = await page.locator('[data-testid="workspace-stage"] iframe, [data-testid="workspace-stage"] canvas').count();
  note(chartKept > 0, 'the chart stays loaded behind the options tab');
  await shot(page, '03-390-two-tabs');

  await tid(page, 'workspace-close-all').click();
  await page.waitForTimeout(900);
  note(!(await has(page, 'workspace-host')), 'close all clears the stage');
  note(await has(page, 'warroom-brain'), 'and the brain comes back');
  await ctx.close();
}

/* ───────────────────────── 390 × 844, beginner, and offline ──────────────── */
console.log('\n390×844 at 100% — beginner');
{
  const { ctx, page } = await session({ width: 390, height: 844 });
  await open(page, '/home?stage=beginner');
  const lit = await litNow(page);
  note(lit.join() === 'memory,watchlist,news', `a beginner lights lessons, news and watchlist (${lit.join()})`);
  note((await tid(page, 'warroom-caption').innerText()).includes('Lessons'), 'the caption speaks to a beginner');
  await shot(page, '04-390-beginner-rest');
  await ctx.close();
}

console.log('\n390×844 at 100% — out of credit');
{
  const { ctx, page } = await session({ width: 390, height: 844 });
  await open(page, '/home?stage=trade_ready&credits=out');
  note((await tid(page, 'kai-status-word').innerText()) === 'KAI OFFLINE', 'the status reads Kai offline');
  note((await litNow(page)).length === 0, 'the brain is dark');
  const cap = await tid(page, 'warroom-caption').innerText();
  note(cap.startsWith("Today's credits are used up."), `one honest line: "${cap}"`);
  note(await has(page, 'home-credit-strip'), 'the credit strip is still there');
  await shot(page, '05-390-kai-offline');
  await ctx.close();
}

/* ─────────────────────────────── 390 × 844, 130% ─────────────────────────── */
console.log('\n390×844 at 130% text');
{
  const { ctx, page } = await session({ width: 390, height: 844, scale: 1.3 });
  await open(page, '/home?stage=trade_ready');
  note(await has(page, 'warroom-brain'), 'the brain is drawn');
  note(await noSideScroll(page), 'no sideways scroll at 130%');
  const barOk = await page.evaluate(() => {
    const bar = document.querySelector('[data-testid="warroom-bar"]');
    if (!bar) return false;
    const r = bar.getBoundingClientRect();
    return [...bar.querySelectorAll('*')].every((el) => el.getBoundingClientRect().right <= r.right + 1);
  });
  note(barOk, 'nothing in the bar runs off the edge at 130%');
  await shot(page, '06-390-130pct-rest');
  await ctx.close();
}

/* ─────────────────────────────── 360 × 780 ───────────────────────────────── */
console.log('\n360×780');
{
  const { ctx, page } = await session({ width: 360, height: 780 });
  await open(page, '/home?stage=developing');
  note(await has(page, 'warroom-brain'), 'the brain is drawn');
  note(await noSideScroll(page), 'no sideways scroll at 360');
  await shot(page, '07-360-developing-rest');
  await tid(page, 'home-panels-open').click();
  await tid(page, 'panel-launcher-symbol').fill('AMD');
  await tid(page, 'panel-launcher-quote').click();
  await page.waitForSelector('[data-testid="workspace-host"]', { timeout: 20_000 });
  await page.waitForTimeout(1200);
  note(await noSideScroll(page), 'no sideways scroll with a panel open at 360');
  await shot(page, '08-360-quote-open');
  await ctx.close();
}

/* ─────────────────────────────── reduced motion ──────────────────────────── */
console.log('\nreduce motion');
{
  const { ctx, page } = await session({ width: 390, height: 844, reduced: true });
  await open(page, '/home?stage=trade_ready');
  // Two frames a second apart must be identical: nothing breathes, nothing pulses.
  const brain = tid(page, 'kai-brain');
  const a = await brain.screenshot();
  await page.waitForTimeout(1500);
  const b = await brain.screenshot();
  note(Buffer.compare(a, b) === 0, 'the brain holds perfectly still under reduce motion');
  await ctx.close();
}
{
  const { ctx, page } = await session({ width: 390, height: 844 });
  await open(page, '/home?stage=trade_ready');
  const brain = tid(page, 'kai-brain');
  const a = await brain.screenshot();
  await page.waitForTimeout(1500);
  const b = await brain.screenshot();
  note(Buffer.compare(a, b) !== 0, 'and breathes when motion is allowed');
  await ctx.close();
}

await browser.close();
console.log(failures.length ? `\n${failures.length} failed:\n  ${failures.join('\n  ')}\n` : '\nall passed\n');
process.exit(failures.length ? 1 : 0);
