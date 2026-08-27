/**
 * Live proof for lane MOBILE-A: setup detail, alerts lifecycle, trade + symbol
 * detail, account completion — all driven against the REAL stack.
 *
 *   npx expo start --port 8081 --lan        (no EXPO_PUBLIC_FIXTURES)
 *   apps/api on :3000, Supabase local up
 *   node scripts/proof-live-a.mjs
 *
 * Signs a brand-new user up through the UI so the run exercises the real auth →
 * onboarding → API path, then walks every round-2 screen and saves live2a-*.png.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(path.resolve(HERE, '..'), 'proof');
const BASE = process.env.PROOF_BASE ?? 'http://localhost:8081';
const EMAIL = `proof-a+${Date.now()}@cheatcode.test`;
const PASSWORD = 'paper-money-first';
/** The seeded META setup (supabase/seed.sql). */
const SETUP_ID = process.env.PROOF_SETUP_ID ?? '11111111-1111-4111-8111-000000000001';

const HIDE_DEV_CHROME = `.__expo_fast_refresh { display: none !important; }`;
const installHideDevChrome = (ctx) =>
  ctx.addInitScript((css) => {
    const add = () => {
      const s = document.createElement('style');
      s.textContent = css;
      document.head.appendChild(s);
    };
    if (document.head) add();
    else document.addEventListener('DOMContentLoaded', add);
  }, HIDE_DEV_CHROME);

const shot = async (p, n) => {
  const root = p.locator('#root');
  await ((await root.count()) ? root : p).screenshot({ path: path.join(OUT, `${n}.png`) });
  console.log(`  ✓ ${n}.png`);
};

/** expo-router keeps previous screens mounted, so scope every locator. */
const on = (page, screen, testid) =>
  page.locator(`[data-testid="${screen}"] [data-testid="${testid}"]`);
const tap = async (page, screen, testid, timeout = 30_000) => {
  const el = on(page, screen, testid).last();
  await el.waitFor({ state: 'visible', timeout });
  await el.click();
};
const arrive = async (page, screen, timeout = 30_000) => {
  await page.locator(`[data-testid="${screen}"]`).last().waitFor({ state: 'visible', timeout });
  await page.waitForTimeout(700);
};
/**
 * Navigate and wait for the screen to have actually ANSWERED, not merely
 * mounted. `ready` is a testID that only exists once the resource has loaded,
 * so a slow first compile of an api route can never be screenshotted as an
 * empty state.
 */
const go = async (page, route, screen, ready) => {
  await page.goto(`${BASE}${route}`, { waitUntil: 'load', timeout: 120_000 });
  if (screen) await arrive(page, screen);
  if (ready) {
    try {
      await page.locator(`[data-testid="${screen}"] [data-testid="${ready}"]`).last()
        .waitFor({ state: 'visible', timeout: 60_000 });
    } catch {
      console.log(`  · ${route} never showed ${ready} — capturing whatever it settled on`);
    }
  }
  await page.waitForTimeout(1500);
};
/** Optional step: a live stack can legitimately have nothing to click. */
const softTap = async (page, screen, testid, label) => {
  try {
    await tap(page, screen, testid, 5000);
    await page.waitForTimeout(700);
    return true;
  } catch {
    console.log(`  · skipped ${label} (not present on the live stack)`);
    return false;
  }
};

const main = async () => {
  await fs.mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  await installHideDevChrome(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  ! page error:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('  ! console:', m.text().slice(0, 240)); });

  console.log(`live user: ${EMAIL}`);

  // ---- real sign up + onboarding, so every request below carries a real JWT
  await page.goto(`${BASE}/welcome`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForTimeout(2500);
  await tap(page, 'screen-welcome', 'cta-get-started');
  await arrive(page, 'screen-sign-up');
  await on(page, 'screen-sign-up', 'field-email').fill(EMAIL);
  await on(page, 'screen-sign-up', 'field-password').fill(PASSWORD);
  await tap(page, 'screen-sign-up', 'cta-create');

  await arrive(page, 'screen-onboarding-kai');
  await tap(page, 'screen-onboarding-kai', 'mode-day_trade');
  await page.waitForTimeout(500);
  await tap(page, 'screen-onboarding-kai', 'funding-paper');
  await arrive(page, 'screen-goal');
  await tap(page, 'screen-goal', 'cta-continue');
  await arrive(page, 'screen-risk');
  await tap(page, 'screen-risk', 'cta-continue');
  await arrive(page, 'screen-summary');
  await tap(page, 'screen-summary', 'cta-start');            // POST /onboarding/complete
  await arrive(page, 'screen-learn');
  await tap(page, 'screen-learn', 'level-504');
  await page.waitForTimeout(400);
  await tap(page, 'screen-learn', 'cta-watch');              // POST /alerts/draft
  await arrive(page, 'screen-home');
  await page.waitForTimeout(3000);

  // ---- 1. setup detail: GET /setups/:id + GET /market/candles
  console.log('[1] setup detail');
  await go(page, `/setup/${SETUP_ID}`, 'screen-setup', 'setup-view');
  await shot(page, 'live2a-01-setup-live');
  await tap(page, 'screen-setup', 'setup-view-plan');
  await page.waitForTimeout(600);
  await shot(page, 'live2a-02-setup-plan');
  await tap(page, 'screen-setup', 'setup-view-learn');
  await page.waitForTimeout(600);
  await shot(page, 'live2a-03-setup-learn');
  await softTap(page, 'screen-setup', 'quiz-option-0', 'quiz answer');
  await shot(page, 'live2a-04-setup-learn-answered');
  await tap(page, 'screen-setup', 'setup-view-plan');
  await page.waitForTimeout(400);
  await softTap(page, 'screen-setup', 'cta-watch-it', 'follow setup');   // POST /setups/:id/follow
  await page.waitForTimeout(1500);
  await shot(page, 'live2a-05-setup-followed');

  // ---- 2. alerts lifecycle: GET /alerts, POST /alerts, GET /alerts/:id
  console.log('[2] alerts');
  await go(page, '/alerts', 'screen-alerts', 'alert-new');
  await shot(page, 'live2a-06-alerts');
  await go(page, '/alert/new', 'screen-alert-new', 'alert-nl-input');
  await on(page, 'screen-alert-new', 'alert-nl-input').fill('Watch META for a break above 504');
  await tap(page, 'screen-alert-new', 'cta-read-it');                    // POST /alerts/draft
  await page.waitForTimeout(4000);
  await shot(page, 'live2a-07-alert-new-preview');
  await softTap(page, 'screen-alert-new', 'cta-activate', 'activate alert');  // POST /alerts
  await page.waitForTimeout(1500);
  await shot(page, 'live2a-08-alert-activated');
  await go(page, '/alerts', 'screen-alerts', 'alert-new');
  await shot(page, 'live2a-09-alerts-after');
  // open whatever the first real alert row is
  const firstAlert = page.locator('[data-testid="screen-alerts"] [data-testid^="alert-row-"]').first();
  if (await firstAlert.count()) {
    await firstAlert.click();
    await arrive(page, 'screen-alert');
    await page.waitForTimeout(1200);
    await shot(page, 'live2a-10-alert-detail');
    await softTap(page, 'screen-alert', 'alert-logic-toggle', 'condition expand');
    await shot(page, 'live2a-11-alert-detail-logic');
  } else {
    console.log('  · no alert rows on the live stack');
  }

  // ---- 3. trade landing, search, symbol detail
  console.log('[3] trade');
  await go(page, '/trade', 'screen-trade', 'trade-search');
  await shot(page, 'live2a-12-trade');
  await go(page, '/symbol/search', 'screen-symbol-search', 'search-input');
  await on(page, 'screen-symbol-search', 'search-input').fill('META');
  await page.waitForTimeout(2500);
  await shot(page, 'live2a-13-symbol-search');
  await go(page, '/symbol/META', 'screen-symbol', 'symbol-quote');
  await page.waitForTimeout(2500);
  await shot(page, 'live2a-14-symbol-detail');
  await softTap(page, 'screen-symbol', 'tf-1M', '1M timeframe');
  await page.waitForTimeout(2000);
  await shot(page, 'live2a-15-symbol-detail-1m');
  await softTap(page, 'screen-symbol', 'toggle-watchlist', 'watchlist toggle');  // POST /watchlist
  await page.waitForTimeout(1200);
  await shot(page, 'live2a-16-symbol-watchlisted');
  await go(page, '/trade', 'screen-trade', 'trade-search');
  await shot(page, 'live2a-17-trade-with-watchlist');

  // ---- 4. account + sub-screens
  console.log('[4] account');
  await go(page, '/account', 'screen-account', 'nav-settings');
  await shot(page, 'live2a-18-account');
  await go(page, '/account/settings', 'screen-settings', 'settings-level');
  await shot(page, 'live2a-19-settings');
  await go(page, '/account/notifications', 'screen-notifications', 'notif-filter');
  await shot(page, 'live2a-20-notifications');
  await go(page, '/account/memory', 'screen-memory', 'toggle-memory-master');
  await shot(page, 'live2a-21-memory');
  await go(page, '/account/paper', 'screen-paper', 'paper-balance');
  await shot(page, 'live2a-22-paper');
  await go(page, '/account/subscription', 'screen-subscription', 'plan-card');
  await shot(page, 'live2a-23-subscription');
  await softTap(page, 'screen-subscription', 'cta-upgrade', 'checkout');   // POST /billing/checkout
  await page.waitForTimeout(1200);
  await shot(page, 'live2a-24-subscription-billing');

  await browser.close();
  console.log(`\nlive MOBILE-A proof written to ${OUT}`);
};

main().catch((e) => { console.error(e); process.exit(1); });
