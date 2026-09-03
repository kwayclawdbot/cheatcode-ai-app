/**
 * SWING-4 — the Railway alerts, in the hosted app, in a real browser.
 *
 *   node scripts/proof-swing4.mjs
 *
 * Two claims are being tested, and neither can be checked from the database:
 *
 *   1. THE BACK CATALOGUE IS ON SCREEN. Every family the SMS product has ever
 *      sent is in the app, and History shows a share of each — not just the two
 *      that still fire. A record that quietly drops a losing family is not a
 *      record.
 *   2. A RECORD SAYS WHAT IT IS. An intraday or short card carries no
 *      medallion, says why it never will, and shows what the pick actually did.
 *
 * It signs a real user up on PRODUCTION and cleans nothing up — the account is
 * a `@cheatcode.test` address and costs nothing to leave.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(path.resolve(HERE, '..'), 'proof');
const BASE = process.env.PROOF_BASE ?? 'https://cheatcode-ai-app.vercel.app';
const EMAIL = `swing4+${Date.now()}@cheatcode.test`;
const PASSWORD = 'paper-money-first';

let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d === undefined ? '' : `\n        ${JSON.stringify(d).slice(0, 400)}`}`); } };
const on = (p, s, t) => p.locator(`[data-testid="${s}"] [data-testid="${t}"]`).last();
const tap = async (p, s, t, ms = 900) => { const e = on(p, s, t); await e.waitFor({ state: 'visible', timeout: 60_000 }); await e.click(); await p.waitForTimeout(ms); };
const seen = async (p, s, t) => (await p.locator(`[data-testid="${s}"] [data-testid="${t}"]`).count()) > 0;
const shot = async (p, n) => { const r = p.locator('#root'); await ((await r.count()) ? r : p).screenshot({ path: path.join(OUT, `${n}.png`) }); console.log(`  ✓ ${n}.png`); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 1400 }, deviceScaleFactor: 2, colorScheme: 'dark' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

try {
  await fs.mkdir(OUT, { recursive: true });

  console.log(`\n[1] sign up on production: ${EMAIL}`);
  await page.goto(`${BASE}/welcome`, { waitUntil: 'load', timeout: 180_000 });
  await page.waitForTimeout(4000);
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
    for (const id of ids) if (await seen(page, s, id)) await tap(page, s, id, 800);
  }
  await page.locator('[data-testid="screen-home"]').last().waitFor({ state: 'visible', timeout: 60_000 });
  ok('a real user reaches Home on the hosted app', true);

  console.log('\n[2] Active — what Kai is calling now');
  await page.goto(`${BASE}/(tabs)/alerts`, { waitUntil: 'load', timeout: 180_000 });
  await page.waitForTimeout(5000);
  await shot(page, 'swing4-1-active');
  const activeCards = await page.locator('[data-testid^="alert-card-"]').count();
  ok('the Active tab shows the live morning picks as cards', activeCards > 0, { activeCards });

  console.log('\n[3] History — every family the product has ever sent');
  await tap(page, 'alerts-tabs', 'alerts-tab-history', 3000);
  await page.waitForTimeout(2500);
  await shot(page, 'swing4-2-history');
  const body = await page.locator('body').innerText();
  ok('History is not an empty state', !/Nothing here right now/i.test(body), body.slice(0, 200));

  // The API behind the screen, read through the app's own same-origin proxy so
  // this is the payload the cards were actually built from.
  const feed = await page.evaluate(async () => {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.includes('auth-token') && !k.includes('code-verifier')) keys.push(k); }
    keys.sort();
    let token = null;
    for (const base of new Set(keys.map((k) => k.replace(/\.\d+$/, '')))) {
      let raw = keys.filter((k) => k === base || k.startsWith(base + '.')).map((k) => localStorage.getItem(k) ?? '').join('');
      if (raw.startsWith('base64-')) { try { raw = atob(raw.slice(7)); } catch { continue; } }
      try { const v = JSON.parse(raw); if (v?.access_token) { token = v.access_token; break; } } catch {}
    }
    const r = await fetch('/api/v1/alerts?tab=history', { headers: { Authorization: `Bearer ${token}` } });
    return { status: r.status, body: await r.json() };
  });
  ok('the same-origin proxy served the History feed', feed.status === 200, feed.status);

  const cards = feed.body?.cards ?? [];
  ok('History carries a full page of cards', cards.length >= 20, cards.length);

  const shapes = new Set(cards.map((c) => `${c.identity.mode}/${c.identity.direction}`));
  ok('swing longs are represented', shapes.has('swing/long'), [...shapes]);
  ok('swing shorts are represented — the losing half is not dropped', shapes.has('swing/short'), [...shapes]);
  ok('intraday longs are represented — the day_trade records are visible', shapes.has('day_trade/long'), [...shapes]);
  ok('intraday shorts are represented', shapes.has('day_trade/short'), [...shapes]);

  ok('every History card says what the pick actually did', cards.every((c) => c.outcome?.plain), cards.filter((c) => !c.outcome?.plain).map((c) => c.identity.symbol));
  ok('every History card carries a performance line with its n', cards.every((c) => (c.family_performance?.n ?? 0) > 0), cards.filter((c) => !c.family_performance?.n).map((c) => c.identity.symbol));

  const families = new Set(cards.map((c) => c.family_performance?.family));
  ok('and the line is the card\'s OWN family, not one number for all of them', families.size >= 3, [...families]);

  const records = cards.filter((c) => c.identity.mode === 'day_trade' || c.identity.direction === 'short');
  ok('a record carries no medallion', records.length > 0 && records.every((c) => c.grade?.display === null), records.filter((c) => c.grade?.display !== null).map((c) => c.identity.symbol));
  ok('and says it never will, rather than "not graded yet"', records.every((c) => /^Not graded\./.test(c.grade?.plain ?? '')), records.map((c) => c.grade?.plain).slice(0, 2));

  const intraday = cards.filter((c) => c.identity.mode === 'day_trade');
  ok('an intraday line names the horizon it is NOT measured at', intraday.every((c) => /not the one they claimed/.test(c.family_performance?.plain ?? '')), intraday.map((c) => c.identity.symbol));

  ok('no card in History is presented as actionable', cards.every((c) => c.tab === 'history'), cards.filter((c) => c.tab !== 'history').map((c) => c.identity.symbol));

  ok('no uncaught page errors', errors.length === 0, errors.slice(0, 3));
} catch (e) {
  fail++; console.error('\nTHREW:', e?.stack ?? e?.message ?? e);
} finally {
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}
