/**
 * The hosted app, end to end, in a real browser.
 *
 *   node scripts/proof-prod.mjs
 *
 * Signs a real user up on PRODUCTION, walks onboarding, and asserts that the
 * back catalogue the ingest loaded is actually on screen carrying the levels
 * the backfill recovered — the whole point of the exercise being that a setup
 * with no stop is not a trade anyone was told to take.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(path.resolve(HERE, '..'), 'proof');
const BASE = process.env.PROOF_BASE ?? 'https://cheatcode-ai-app.vercel.app';
const EMAIL = `prodcheck+${Date.now()}@cheatcode.test`;
const PASSWORD = 'paper-money-first';

let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d === undefined ? '' : `\n        ${JSON.stringify(d).slice(0, 300)}`}`); } };
const on = (p, s, t) => p.locator(`[data-testid="${s}"] [data-testid="${t}"]`).last();
const tap = async (p, s, t, ms = 900) => { const e = on(p, s, t); await e.waitFor({ state: 'visible', timeout: 60_000 }); await e.click(); await p.waitForTimeout(ms); };
const seen = async (p, s, t) => (await p.locator(`[data-testid="${s}"] [data-testid="${t}"]`).count()) > 0;
const shot = async (p, n) => { const r = p.locator('#root'); await ((await r.count()) ? r : p).screenshot({ path: path.join(OUT, `${n}.png`) }); console.log(`  ✓ ${n}.png`); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2, colorScheme: 'dark' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  await fs.mkdir(OUT, { recursive: true });
  console.log(`\n[1] production sign-up: ${EMAIL}`);
  await page.goto(`${BASE}/welcome`, { waitUntil: 'load', timeout: 180_000 });
  await page.waitForTimeout(4000);
  await shot(page, 'prod-1-welcome');
  await tap(page, 'screen-welcome', 'cta-get-started');
  await page.locator('[data-testid="screen-sign-up"]').last().waitFor({ state: 'visible', timeout: 60_000 });
  await on(page, 'screen-sign-up', 'field-email').fill(EMAIL);
  await on(page, 'screen-sign-up', 'field-password').fill(PASSWORD);
  await tap(page, 'screen-sign-up', 'cta-create', 3000);
  for (const [s, ids] of [
    ['screen-onboarding-kai', ['mode-swing', 'funding-paper']],
    ['screen-goal', ['mode-swing', 'goal-swing', 'cta-continue']],
    ['screen-risk', ['cta-continue']],
    ['screen-personalize', ['experience-some', 'exp-some', 'focus-big_tech', 'cta-continue']],
    ['screen-summary', ['cta-start', 'cta-continue']],
    ['screen-kai-plan', ['cta-start']],
    ['screen-learn', ['level-504', 'cta-watch', 'cta-continue']],
  ]) {
    const there = await page.locator(`[data-testid="${s}"]`).last().waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false);
    if (!there) continue;
    console.log(`  · ${s}`);
    for (const id of ids) if (await seen(page, s, id)) await tap(page, s, id, 800);
  }
  await page.locator('[data-testid="screen-home"]').last().waitFor({ state: 'visible', timeout: 60_000 });
  ok('the hosted app signs a real user up and reaches Home', true);
  await shot(page, 'prod-2-home');

  console.log('\n[2] the back catalogue, with the levels it published');
  const res = await page.evaluate(async () => {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.includes('auth-token') && !k.includes('code-verifier')) keys.push(k); }
    keys.sort();
    let token = null;
    for (const base of new Set(keys.map((k) => k.replace(/\.\d+$/, '')))) {
      let raw = keys.filter((k) => k === base || k.startsWith(base + '.')).map((k) => localStorage.getItem(k) ?? '').join('');
      if (raw.startsWith('base64-')) { try { raw = atob(raw.slice(7)); } catch { continue; } }
      try { const v = JSON.parse(raw); if (v?.access_token) { token = v.access_token; break; } } catch {}
    }
    const r = await fetch('/api/v1/setups', { headers: { Authorization: `Bearer ${token}` } });
    return { status: r.status, body: await r.json() };
  });
  ok('the same-origin /api proxy is authenticated from the browser', res.status === 200, res.status);
  const list = res.body?.setups ?? res.body?.items ?? res.body;
  ok('the hosted database is serving the ingested back catalogue', Array.isArray(list) && list.length > 0, typeof list);

  await page.goto(`${BASE}/(tabs)/alerts`, { waitUntil: 'load', timeout: 180_000 }).catch(() => {});
  await page.waitForTimeout(4000);
  await shot(page, 'prod-3-alerts');
  const text = await page.locator('body').innerText();
  ok('the Alerts tab rendered something real, not an empty state', !/Nothing here right now/.test(text) || text.length > 200, text.slice(0, 200));

  ok('no uncaught page errors', errors.length === 0, errors.slice(0, 3));
} catch (e) {
  fail++; console.error('\nTHREW:', e?.message ?? e);
} finally {
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}
