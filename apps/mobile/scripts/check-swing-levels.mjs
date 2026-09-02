/**
 * Are the recovered stop/target actually on screen, and does the scorecard stop
 * saying "Unknown" for Risk/Reward? Ad-hoc verification for the level backfill.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(path.resolve(HERE, '..'), 'proof');
const BASE = 'http://localhost:8081';
const EMAIL = `levelcheck+${Date.now()}@cheatcode.test`;
const PASSWORD = 'paper-money-first';
const SETUP = process.argv[2];

const on = (p, s, t) => p.locator(`[data-testid="${s}"] [data-testid="${t}"]`).last();
const tap = async (p, s, t, ms = 700) => {
  const el = on(p, s, t); await el.waitFor({ state: 'visible', timeout: 40_000 });
  await el.click(); await p.waitForTimeout(ms);
};
const seen = async (p, s, t) => (await p.locator(`[data-testid="${s}"] [data-testid="${t}"]`).count()) > 0;
const arrive = (p, s) => p.locator(`[data-testid="${s}"]`).last().waitFor({ state: 'visible', timeout: 40_000 });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2, colorScheme: 'dark' });
await ctx.addInitScript(() => {
  const add = () => { const s = document.createElement('style'); s.textContent = '.__expo_fast_refresh{display:none!important}'; document.head.appendChild(s); };
  if (document.head) add(); else document.addEventListener('DOMContentLoaded', add);
});
const page = await ctx.newPage();
try {
  await page.goto(`${BASE}/welcome`, { waitUntil: 'load', timeout: 180_000 });
  await page.waitForTimeout(2500);
  await tap(page, 'screen-welcome', 'cta-get-started');
  await arrive(page, 'screen-sign-up');
  await on(page, 'screen-sign-up', 'field-email').fill(EMAIL);
  await on(page, 'screen-sign-up', 'field-password').fill(PASSWORD);
  await tap(page, 'screen-sign-up', 'cta-create');
  for (const [s, ids] of [
    ['screen-onboarding-kai', ['mode-swing', 'funding-paper']],
    ['screen-goal', ['mode-swing', 'goal-swing', 'cta-continue']],
    ['screen-risk', ['cta-continue']],
    ['screen-personalize', ['experience-some', 'exp-some', 'focus-big_tech', 'cta-continue']],
    ['screen-summary', ['cta-start', 'cta-continue']],
    ['screen-kai-plan', ['cta-start']],
    ['screen-learn', ['level-504', 'cta-watch', 'cta-continue']],
  ]) {
    const there = await page.locator(`[data-testid="${s}"]`).last().waitFor({ state: 'visible', timeout: 10_000 }).then(() => true).catch(() => false);
    if (!there) continue;
    for (const id of ids) if (await seen(page, s, id)) await tap(page, s, id, 700);
  }
  await page.locator('[data-testid="screen-home"]').last().waitFor({ state: 'visible', timeout: 40_000 });

  await page.goto(`${BASE}/setup/${SETUP}`, { waitUntil: 'load', timeout: 180_000 });
  await page.waitForTimeout(5000);
  await fs.mkdir(OUT, { recursive: true });
  const root = page.locator('#root');
  // The setup is a module inside the workspace; "View" opens the plan.
  await page.getByText('View', { exact: true }).last().click().catch(() => {});
  await page.waitForTimeout(3000);
  await ((await root.count()) ? root : page).screenshot({ path: path.join(OUT, 'swing-levels-setup.png'), fullPage: false });
  const text = await page.locator('body').innerText();
  console.log('URL:', page.url());
  console.log('---- what the page says ----');
  console.log(text.slice(0, 2200));
} finally { await browser.close(); }
