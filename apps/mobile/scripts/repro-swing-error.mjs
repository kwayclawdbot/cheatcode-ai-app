/**
 * REPRO: "swing trades giving error" (owner, 7 Sept, post-push).
 *
 * Throwaway swing account against the REAL API. Captures every surface an
 * error can appear on — page errors, console errors, failed requests, and the
 * words actually drawn on the board — then expands a card, because the report
 * came from someone using the board and the expanded card is the half the mode
 * proof never opened.
 *
 *   PROOF_BASE=http://localhost:8124 PROOF_API=http://localhost:3021 \
 *     node scripts/repro-swing-error.mjs
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'proof');
const BASE = process.env.PROOF_BASE ?? 'http://localhost:8124';
const API = process.env.PROOF_API ?? 'http://localhost:3021';
const PASSWORD = 'paper-money-first';
mkdirSync(OUT, { recursive: true });

const ENV_FILE = process.env.PROOF_ENV_FILE ?? '../api/.env.prod';
const env = Object.fromEntries(
  readFileSync(path.resolve(ROOT, ENV_FILE), 'utf8').split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const svc = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
};

const mode = process.argv[2] ?? 'swing';
const stamp = Date.now();
const email = `repro-${mode}+${stamp}@cheatcode.test`;
let userId = null;

const pageErrors = [];
const consoleErrors = [];
const failedRequests = [];

try {
  const made = await (await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST', headers: svc,
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }),
  })).json();
  userId = made.id;
  await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?user_id=eq.${userId}`, {
    method: 'PATCH', headers: svc,
    body: JSON.stringify({
      handle: `r${stamp}`.slice(0, 15),
      primary_mode: mode,
      onboarding: { completed_at: new Date().toISOString(), version: 'repro' },
    }),
  });
  // A PAYING account, because the owner is one. Without this the Trade section
  // answers 402 and every screen behind it is the entitlement wall rather than
  // the thing being tested — which reads as "no error" and proves nothing.
  await fetch(`${env.SUPABASE_URL}/rest/v1/subscriptions`, {
    method: 'POST', headers: svc,
    body: JSON.stringify({
      user_id: userId, tier: 'premium', status: 'active',
      current_period_end: new Date(Date.now() + 365 * 864e5).toISOString(),
    }),
  });
  console.log(`account ${email} → ${mode}, premium (${userId})`);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 1600 }, colorScheme: 'dark' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => pageErrors.push(`${e.name}: ${e.message}\n${(e.stack ?? '').split('\n').slice(0, 6).join('\n')}`));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 600)); });
  page.on('requestfailed', (r) => failedRequests.push(`${r.method()} ${r.url()} — ${r.failure()?.errorText}`));
  page.on('response', async (r) => {
    if (r.status() >= 400 && r.url().includes('/api/v1/')) {
      failedRequests.push(`${r.status()} ${r.url()} — ${(await r.text().catch(() => '')).slice(0, 300)}`);
    }
  });

  await page.goto(`${BASE}/sign-in`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-testid="screen-sign-in"]').waitFor({ timeout: 90_000 });
  await page.locator('input[data-testid="field-email"]').first().fill(email);
  await page.locator('input[data-testid="field-password"]').first().fill(PASSWORD);
  await page.locator('[data-testid="cta-sign-in"]').click();
  await page.waitForTimeout(9000);

  await page.goto(`${BASE}/alerts`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-testid="screen-alerts"]').waitFor({ timeout: 90_000 });
  await page.locator('[data-testid="alerts-tabs"]').waitFor({ timeout: 90_000 }).catch(() => {});
  await page.locator('[data-testid^="alert-card-"]').first().waitFor({ timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, `repro-${mode}-1-board.png`), fullPage: false });

  const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  const cards = await page.$$eval('[data-testid^="alert-card-"]', (e) => e.map((x) => x.getAttribute('data-testid')));
  console.log(`\nboard: ${cards.length} cards ${JSON.stringify(cards)}`);
  console.log(`error words on the board: ${/went wrong|error|failed|try again|isn't live/i.test(text) ? 'YES' : 'no'}`);
  if (/went wrong|error|failed|try again|isn't live/i.test(text)) console.log(`  → "${text.slice(0, 500)}"`);

  // EVERY card, not just the first. One bad row in nine is exactly the shape of
  // a report that says "giving error" from someone scrolling the board.
  const sym = (cards[0] ?? '').replace('alert-card-', '');
  for (const id of cards) {
    const s1 = id.replace('alert-card-', '');
    const before = pageErrors.length;
    await page.locator(`[data-testid="alert-expand-${s1}"]`).first()
      .click({ timeout: 15_000 }).catch((e) => console.log(`  ${s1}: expand click FAILED — ${e.message.split('\n')[0].slice(0, 160)}`));
    await page.waitForTimeout(1200);
    const alive = (await page.locator(`[data-testid="alert-card-${s1}"]`).count()) > 0;
    const t2 = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    const bad = /went wrong|error|failed|try again/i.test(t2);
    const threw = pageErrors.length > before;
    console.log(`  ${s1}: card ${alive ? 'still drawn' : 'GONE'}${bad ? ', ERROR WORDS' : ''}${threw ? ', THREW' : ''}`);
    if (bad) console.log(`     → "${t2.slice(0, 300)}"`);
  }
  await page.screenshot({ path: path.join(OUT, `repro-${mode}-2-expanded.png`), fullPage: false });

  // "swing TRADES" — the portal a card leads into, and the Trade tab itself.
  if (sym) {
    console.log(`\nopening the trade portal for ${sym}…`);
    const cta = page.locator(`[data-testid="alert-cta-${sym}"]`).first();
    if (await cta.count()) { await cta.click().catch(() => {}); }
    else { await page.goto(`${BASE}/trade/${sym}?ctx=alert`, { waitUntil: 'domcontentloaded' }); }
    await page.waitForTimeout(12000);
    await page.screenshot({ path: path.join(OUT, `repro-${mode}-3-portal.png`), fullPage: false });
    const t3 = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    console.log(`  url: ${page.url()}`);
    console.log(`  error words in the portal: ${/went wrong|error|failed|try again|isn't live|couldn't/i.test(t3) ? 'YES' : 'no'}`);
    console.log(`  → "${t3.slice(0, 420)}"`);
  }

  console.log('\nopening the Trade tab…');
  await page.goto(`${BASE}/trade`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(12000);
  await page.screenshot({ path: path.join(OUT, `repro-${mode}-4-trade-tab.png`), fullPage: false });
  const t4 = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  console.log(`  error words on the Trade tab: ${/went wrong|error|failed|try again|isn't live|couldn't/i.test(t4) ? 'YES' : 'no'}`);
  console.log(`  → "${t4.slice(0, 420)}"`);

  await browser.close();
} catch (e) {
  console.log(`\n!!! THREW: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
} finally {
  if (userId) {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers: svc });
    console.log(`\ncleanup ${email} → ${r.status}`);
  }
}

console.log(`\n=== PAGE ERRORS (${pageErrors.length}) ===`);
pageErrors.slice(0, 6).forEach((e) => console.log(`\n${e}`));
console.log(`\n=== CONSOLE ERRORS (${consoleErrors.length}) ===`);
consoleErrors.slice(0, 10).forEach((e) => console.log(`\n${e}`));
console.log(`\n=== FAILED REQUESTS (${failedRequests.length}) ===`);
failedRequests.slice(0, 10).forEach((e) => console.log(`\n${e}`));
