/**
 * Live proof: real Supabase session + real api-app + a real streamed Kai reply.
 *
 *   npx expo start --web --port 8082      (WITHOUT EXPO_PUBLIC_FIXTURES)
 *   node scripts/proof-live.mjs
 *
 * Signs a brand-new user up through the UI, walks the onboarding, and shoots
 * Home with whatever the real Kai says back.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(path.resolve(HERE, '..'), 'proof');
const BASE = process.env.PROOF_BASE ?? 'http://localhost:8082';
const EMAIL = `proof+${Date.now()}@cheatcode.test`;
const PASSWORD = 'paper-money-first';

/** Hide dev-server chrome. `.__expo_fast_refresh` is Metro's Fast Refresh
 *  indicator — dev-only, pointer-events:none, absent from `expo export`. */
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

/** expo-router keeps previous stack screens in the DOM, so every locator is
 *  scoped to the screen that is actually on top. */
const on = (page, screen, testid) =>
  page.locator(`[data-testid="${screen}"] [data-testid="${testid}"]`);
const tap = async (page, screen, testid) => {
  const el = on(page, screen, testid);
  await el.waitFor({ state: 'visible', timeout: 30_000 });
  await el.click();
};
const arrive = async (page, screen) => {
  await page.locator(`[data-testid="${screen}"]`).last().waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForTimeout(700);
};

const main = async () => {
  await fs.mkdir(OUT, { recursive: true });
  // KNOWN GAP (api lane): apps/api sends no CORS headers, so a browser client on
  // :8082 cannot call :3000. Native has no CORS, so this only blocks expo-web.
  // Isolated here so the live proof can run; the fix belongs in apps/api.
  const browser = await chromium.launch({
    args: ['--disable-web-security', '--disable-features=IsolateOrigins,site-per-process'],
  });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark', bypassCSP: true });
  await installHideDevChrome(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  ! page error:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('  ! console:', m.text().slice(0, 240)); });

  console.log(`live user: ${EMAIL}`);
  await page.goto(`${BASE}/welcome`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForTimeout(2500);

  await tap(page, 'screen-welcome', 'cta-get-started');
  await arrive(page, 'screen-sign-up');
  await on(page, 'screen-sign-up', 'field-email').fill(EMAIL);
  await on(page, 'screen-sign-up', 'field-password').fill(PASSWORD);
  await tap(page, 'screen-sign-up', 'cta-create');

  await arrive(page, 'screen-onboarding-kai');
  await shot(page, 'live-01-after-signup');
  await tap(page, 'screen-onboarding-kai', 'mode-day_trade');
  await page.waitForTimeout(500);
  await tap(page, 'screen-onboarding-kai', 'funding-paper');

  await arrive(page, 'screen-goal');
  await tap(page, 'screen-goal', 'cta-continue');
  await arrive(page, 'screen-risk');
  await tap(page, 'screen-risk', 'cta-continue');

  await arrive(page, 'screen-summary');
  await shot(page, 'live-02-summary');
  await tap(page, 'screen-summary', 'cta-start');                   // POST /onboarding/complete

  await arrive(page, 'screen-learn');
  await shot(page, 'live-03-learn');
  await tap(page, 'screen-learn', 'level-504');
  await page.waitForTimeout(500);
  await tap(page, 'screen-learn', 'cta-watch');                     // POST /alerts/draft

  await arrive(page, 'screen-home');
  await page.waitForTimeout(6000);                                  // GET /home → real Kai briefing
  await shot(page, 'live-04-home-briefing');

  await on(page, 'screen-home', 'composer-input').fill('What happens at the CPI print?');
  await tap(page, 'screen-home', 'composer-send');
  await page.waitForTimeout(1500);
  await shot(page, 'live-05-home-streaming');
  await page.waitForTimeout(18000);
  await shot(page, 'live-06-home-kai-reply');                       // SSE stream complete

  await page.goto(`${BASE}/alerts`, { waitUntil: 'load' }); await page.waitForTimeout(2500);
  await shot(page, 'live-07-alerts');
  await page.goto(`${BASE}/community`, { waitUntil: 'load' }); await page.waitForTimeout(2500);
  await shot(page, 'live-08-community');
  await page.goto(`${BASE}/trade`, { waitUntil: 'load' }); await page.waitForTimeout(2500);
  await shot(page, 'live-09-trade');
  await page.goto(`${BASE}/account`, { waitUntil: 'load' }); await page.waitForTimeout(2500);
  await shot(page, 'live-10-account');

  await browser.close();
  console.log(`\nlive proof written to ${OUT}`);
};

main().catch((e) => { console.error(e); process.exit(1); });
