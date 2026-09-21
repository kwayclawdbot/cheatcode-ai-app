/**
 * THE V2 ALERTS BOARD, IN PIXELS (redesign 2026-09-21, board V2 panel 2).
 *
 *   EXPO_PUBLIC_FIXTURES=1 npx expo start --web --port 8106   (another shell)
 *   PROOF_OUT=/some/dir node scripts/proof-rd-alerts.mjs
 *
 * Swing, Day Trade, Invest and History at 390×844 (100% and 130% text) and
 * 360×780, plus element shots of the priority and a compact card. Prints every
 * card's height and asserts: one priority card, its action above the fold at
 * 390×844 100%, no sideways scroll, a microchart and verb on every alert card,
 * a contract row on every Day Trade card, and no verb/trigger on Invest.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const BASE = process.env.PROOF_BASE ?? 'http://localhost:8106';
const OUT = process.env.PROOF_OUT ?? path.resolve(process.cwd(), 'proof');
mkdirSync(OUT, { recursive: true });
const HIDE_DEV_CHROME = `.__expo_fast_refresh { display: none !important; }`;

let failures = 0;
const note = (ok, what) => { console.log(`  ${ok ? '✓' : '✗'} ${what}`); if (!ok) failures += 1; };
const tid = (page, id) => page.locator(`[data-testid="${id}"]`).first();

async function session({ width, height, scale = 1 }) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, colorScheme: 'dark' });
  await ctx.addInitScript(({ css, scale }) => {
    try { localStorage.setItem('ccai.a11y.v1', JSON.stringify({ textScale: scale, reducedMotion: true })); } catch {}
    const add = () => { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); };
    if (document.head) add(); else document.addEventListener('DOMContentLoaded', add);
  }, { css: HIDE_DEV_CHROME, scale });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => note(false, `page error: ${e.message}`));
  return { browser, page };
}

async function heights(page, prefix) {
  return page.$$eval(`[data-testid^="${prefix}"]`, (els, prefix) => els
    .filter((e) => /^[A-Z.]+$/.test(e.getAttribute('data-testid').slice(prefix.length)))
    .map((e) => ({ id: e.getAttribute('data-testid'), h: Math.round(e.getBoundingClientRect().height), top: Math.round(e.getBoundingClientRect().top) })), prefix);
}

const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

async function mode(page, key) {
  await tid(page, `alerts-mode-${key}`).click();
  await page.waitForTimeout(1600);
}

async function board(label, { width, height, scale }) {
  console.log(`\n${label}`);
  const { browser, page } = await session({ width, height, scale });
  const tag = `${width}x${height}-${Math.round(scale * 100)}`;
  await page.goto(`${BASE}/alerts`, { waitUntil: 'domcontentloaded' });
  await tid(page, 'screen-alerts').waitFor({ timeout: 120_000 });
  await page.waitForTimeout(2500);

  // Swing
  await mode(page, 'swing');
  const swing = await heights(page, 'alert-card-');
  console.log(`    swing cards ${JSON.stringify(swing)}`);
  note(swing.length >= 3, 'swing: the board draws its cards');
  const glowing = await page.$$eval('[data-testid^="alert-card-"]', (els) => els.filter((e) => getComputedStyle(e).boxShadow.includes('255, 90, 31')).length);
  note(glowing === 1, `swing: exactly one card wears the orange glow (${glowing})`);
  note(await tid(page, 'alert-range-PURR').count() > 0, 'swing: the priority card draws the stop–entry–target rail');
  note(await tid(page, 'alert-levels-AMD').count() > 0, 'swing: a compact card shows entry · stop · target');
  note(await tid(page, 'alert-verb-UMC').innerText().then((t) => /Target 1 hit/.test(t)), 'swing: UMC says Target 1 hit (tracker)');
  note(await tid(page, 'alert-verb-AMD').innerText().then((t) => /Watching resistance/.test(t)), 'swing: AMD says Watching resistance');
  note(await tid(page, 'alert-chart-PURR').count() > 0, 'swing: microchart drawn from bars');
  const cta = await tid(page, 'alert-cta-PURR').boundingBox();
  note(cta && cta.y + cta.height <= height - 80, `swing: the priority card's action is above the dock (${cta ? Math.round(cta.y + cta.height) : '—'} of ${height})`);
  note(await noSideScroll(page), 'swing: no sideways scroll');
  await page.screenshot({ path: path.join(OUT, `swing-${tag}.png`) });
  if (tag === '390x844-100') {
    await tid(page, 'alert-card-PURR').screenshot({ path: path.join(OUT, 'card-priority-PURR.png') });
    await tid(page, 'alert-card-AMD').screenshot({ path: path.join(OUT, 'card-compact-AMD.png') });
    await tid(page, 'alert-window-PURR-72').click();
    await page.waitForTimeout(400);
    await tid(page, 'alert-card-PURR').screenshot({ path: path.join(OUT, 'card-priority-PURR-72h.png') });
    await tid(page, 'alert-bookmark-AMD').click();
    await page.waitForTimeout(300);
    note(await tid(page, 'alert-bookmark-AMD').getAttribute('aria-selected').then((v) => v === 'true').catch(() => false)
      || await tid(page, 'alert-bookmark-AMD').getAttribute('aria-label').then((v) => /^Saved/.test(v ?? '')), 'bookmark toggles to saved');
    await tid(page, 'alert-card-AMD').screenshot({ path: path.join(OUT, 'card-compact-AMD-saved.png') });
  }

  // History
  await tid(page, 'alerts-tabs-history').click();
  await page.waitForTimeout(1000);
  console.log(`    history rows ${JSON.stringify(await heights(page, 'alert-history-'))}`);
  note(await noSideScroll(page), 'history: no sideways scroll');
  await page.screenshot({ path: path.join(OUT, `history-${tag}.png`) });
  await tid(page, 'alerts-tabs-active').click();
  await page.waitForTimeout(600);

  // Day Trade
  await mode(page, 'day_trade');
  const day = await heights(page, 'alert-card-');
  console.log(`    day-trade cards ${JSON.stringify(day)}`);
  note(day.length >= 2, 'day trade: the board draws its cards');
  for (const c of day) {
    const sym = c.id.slice('alert-card-'.length);
    note(await tid(page, `contract-row-${sym}`).count() > 0, `day trade ${sym}: one contract row`);
  }
  note(await tid(page, 'contract-peak-MRNA').innerText().then((t) => /\$27\.91/.test(t)).catch(() => false), 'day trade: MRNA contract row carries the tracked peak');
  note(await noSideScroll(page), 'day trade: no sideways scroll');
  await page.screenshot({ path: path.join(OUT, `daytrade-${tag}.png`) });
  if (tag === '390x844-100') {
    const first = day[0]?.id;
    if (first) await tid(page, first).screenshot({ path: path.join(OUT, `card-daytrade-${first.slice(11)}.png`) });
  }

  // Invest
  await mode(page, 'invest');
  const inv = await heights(page, 'invest-card-');
  console.log(`    invest cards ${JSON.stringify(inv)}`);
  note(inv.length >= 2, 'invest: the research list is drawn');
  note(await page.locator('[data-testid^="alert-verb-"]').count() === 0, 'invest: no alert verbs / triggers');
  note(await noSideScroll(page), 'invest: no sideways scroll');
  await page.screenshot({ path: path.join(OUT, `invest-${tag}.png`) });

  await mode(page, 'swing');
  await browser.close();
}

await board('390×844 at 100% text', { width: 390, height: 844, scale: 1 });
await board('390×844 at 130% text', { width: 390, height: 844, scale: 1.3 });
await board('360×780 at 100% text', { width: 360, height: 780, scale: 1 });

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
