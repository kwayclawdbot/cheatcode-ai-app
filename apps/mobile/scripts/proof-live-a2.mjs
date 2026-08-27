/**
 * Live proof for lane MOBILE-A, round 3 (V5 consolidation).
 *
 *   npx expo start --port 8081 --lan        (no EXPO_PUBLIC_FIXTURES)
 *   apps/api on :3000, Supabase local up
 *   node scripts/proof-live-a2.mjs
 *
 * Signs a brand-new user up through the UI so every request carries a real JWT,
 * then walks the V5 arc against the REAL stack:
 *   Home priority → the workspace → Watch this → the Kai sheet answers about
 *   META → Alerts shows the monitoring row → the NL composer creates an alert.
 * Shots land in proof/live-a2-*.png.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(path.resolve(HERE, '..'), 'proof');
const BASE = process.env.PROOF_BASE ?? 'http://localhost:8081';
const EMAIL = `proof-a2+${Date.now()}@cheatcode.test`;
const PASSWORD = 'paper-money-first';
const SYMBOL = process.env.PROOF_SYMBOL ?? 'META';

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
    await tap(page, screen, testid, 6000);
    await page.waitForTimeout(800);
    return true;
  } catch {
    console.log(`  · skipped ${label} (not present on the live stack)`);
    return false;
  }
};
/** The sheet renders in a portal, so it is NOT under a screen testID. */
const sheetTap = async (page, testid, label, timeout = 8000) => {
  try {
    await page.locator(`[data-testid="${testid}"]`).last().click({ timeout });
    await page.waitForTimeout(600);
    return true;
  } catch {
    console.log(`  · skipped ${label}`);
    return false;
  }
};
/** Read back a rendered string so the log proves what the live stack returned. */
const readText = async (page, selector, label) => {
  try {
    const t = (await page.locator(selector).last().innerText({ timeout: 6000 })).replace(/\s+/g, ' ').trim();
    console.log(`  · ${label}: ${t.slice(0, 120)}`);
    return t;
  } catch {
    console.log(`  · ${label}: (not rendered)`);
    return '';
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

  // ---- real sign up + onboarding
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
  await tap(page, 'screen-summary', 'cta-start');
  await arrive(page, 'screen-learn');
  await tap(page, 'screen-learn', 'level-504');
  await page.waitForTimeout(400);
  await tap(page, 'screen-learn', 'cta-watch');
  await arrive(page, 'screen-home');
  await page.waitForTimeout(4000);

  // ---- 1. Home: one opening line, one priority, one action  (GET /home)
  console.log('[1] Home — V5 priority');
  // Home's briefing is an LLM call — wait for the PRIORITY, not the shell.
  await go(page, '/home', 'screen-home', 'home-priority');
  await page.waitForTimeout(2000);
  await shot(page, 'live-a2-01-home-priority');
  await readText(page, '[data-testid="screen-home"] [data-testid="opening-line"]', 'opening line');
  await readText(page, '[data-testid="screen-home"] [data-testid="priority-action"]', 'primary action');
  // mode is visible global context; the sheet PUTs /mode
  if (await softTap(page, 'screen-home', 'mode-chip', 'mode chip')) {
    await shot(page, 'live-a2-02-home-mode-sheet');
    await sheetTap(page, 'mode-option-swing', 'switch to Swing');
    await page.waitForTimeout(3500);
    await shot(page, 'live-a2-03-home-swing');
    await softTap(page, 'screen-home', 'mode-chip', 'mode chip');
    await sheetTap(page, 'mode-option-day_trade', 'back to Day Trade');
    await page.waitForTimeout(3500);
  }

  // ---- 2. the priority's primary action lands in the workspace
  console.log('[2] workspace — GET /symbols/:symbol');
  const primary = page.locator('[data-testid="screen-home"] [data-testid="priority-action"]').last();
  if (await primary.count()) {
    await primary.click();
    await arrive(page, 'screen-symbol', 45_000);
    await page.waitForTimeout(2500);
  } else {
    console.log('  · no priority on this account — opening the workspace directly');
    await go(page, `/symbol/${SYMBOL}`, 'screen-symbol', 'workspace-symbol');
  }
  await shot(page, 'live-a2-04-workspace-overview');
  await readText(page, '[data-testid="screen-symbol"] [data-testid="workspace-context"]', 'status line');
  // Whatever symbol the priority actually led to is the one Kai must answer on.
  const openSymbol =
    (await readText(page, '[data-testid="screen-symbol"] [data-testid="workspace-symbol"]', 'workspace symbol')) || SYMBOL;

  await softTap(page, 'screen-symbol', 'tab-kai', 'Kai tab');
  await shot(page, 'live-a2-05-workspace-kai');
  await readText(page, '[data-testid="screen-symbol"] [data-testid="kai-interpretation"]', 'Kai read');
  await softTap(page, 'screen-symbol', 'tab-plan', 'Plan tab');
  await shot(page, 'live-a2-06-workspace-plan');
  await softTap(page, 'screen-symbol', 'tab-community', 'Community tab');
  await shot(page, 'live-a2-07-workspace-community');
  await softTap(page, 'screen-symbol', 'tab-overview', 'Overview tab');

  // ---- 3. Watch this  (POST /setups/:id/follow)
  console.log('[3] Watch this');
  if (await softTap(page, 'screen-symbol', 'setup-primary', 'Watch this')) {
    await page.waitForTimeout(2000);
    await shot(page, 'live-a2-08-workspace-watching');
    await readText(page, '[data-testid="screen-symbol"] [data-testid="setup-primary"]', 'primary after tap');
  }
  await softTap(page, 'screen-symbol', 'setup-see-why', 'See why');
  await shot(page, 'live-a2-09-workspace-see-why');

  // ---- 4. the Kai sheet answers about the symbol, in place
  console.log('[4] Kai sheet — POST /kai/conversations with context');
  if (await softTap(page, 'screen-symbol', 'workspace-ask-kai', 'Ask Kai')) {
    await shot(page, 'live-a2-10-kai-sheet-open');
    await readText(page, '[data-testid="kai-sheet-title"]', 'sheet title');
    const input = page.locator('[data-testid="kai-sheet"] [data-testid="composer-input"]').last();
    await input.fill(`What is ${openSymbol} doing right now, and what would confirm it?`);
    await page.locator('[data-testid="kai-sheet"] [data-testid="composer-send"]').last().click();
    await page.waitForTimeout(2000);
    await shot(page, 'live-a2-11-kai-sheet-streaming');
    await page.waitForTimeout(16_000);
    await shot(page, 'live-a2-12-kai-sheet-answered');
    await readText(page, '[data-testid="kai-sheet-thread"]', 'Kai answer');
    // the screen underneath must still be the workspace
    const still = await page.locator('[data-testid="screen-symbol"]').last().isVisible();
    console.log(`  · workspace still mounted under the sheet: ${still}`);
    await sheetTap(page, 'kai-sheet-close', 'close sheet');
  }

  // ---- 5. Alerts: attention / monitoring / history  (GET /alerts)
  console.log('[5] Alerts — three buckets');
  await go(page, '/alerts', 'screen-alerts', 'alert-filters');
  await shot(page, 'live-a2-13-alerts-attention');
  await softTap(page, 'screen-alerts', 'filter-monitoring', 'Monitoring filter');
  await shot(page, 'live-a2-14-alerts-monitoring');
  const monRows = await page.locator('[data-testid="screen-alerts"] [data-testid^="monitoring-"]').count();
  console.log(`  · monitoring rows on the live stack: ${monRows}`);
  await readText(page, '[data-testid="screen-alerts"] [data-testid="monitoring-list"]', 'monitoring');
  await softTap(page, 'screen-alerts', 'filter-history', 'History filter');
  await shot(page, 'live-a2-15-alerts-history');
  await softTap(page, 'screen-alerts', 'filter-attention', 'Attention filter');

  // ---- 6. the inline NL composer creates a real alert
  //         (POST /alerts/draft → POST /alerts)
  console.log('[6] natural-language composer');
  await on(page, 'screen-alerts', 'alert-nl-input').fill(`Tell me when ${openSymbol} drops below 480`);
  await tap(page, 'screen-alerts', 'alert-nl-read');
  await page.waitForTimeout(8000);
  await shot(page, 'live-a2-16-alerts-composer-preview');
  await readText(page, '[data-testid="screen-alerts"] [data-testid="alert-preview"]', 'preview');
  if (await softTap(page, 'screen-alerts', 'alert-activate', 'activate alert')) {
    await page.waitForTimeout(4000);
    await shot(page, 'live-a2-17-alerts-after-activate');
  }
  await go(page, '/alerts', 'screen-alerts', 'alert-filters');
  await softTap(page, 'screen-alerts', 'filter-monitoring', 'Monitoring filter');
  await shot(page, 'live-a2-18-alerts-monitoring-after');
  const monAfter = await page.locator('[data-testid="screen-alerts"] [data-testid^="monitoring-"]').count();
  console.log(`  · monitoring rows after creating one: ${monAfter}`);

  // ---- 7. the old setup link still resolves into the workspace
  console.log('[7] /setup/:id redirect');
  const setupId = process.env.PROOF_SETUP_ID;
  if (setupId) {
    await go(page, `/setup/${setupId}`, 'screen-symbol', 'workspace-symbol');
    await shot(page, 'live-a2-19-setup-redirect');
  } else {
    console.log('  · PROOF_SETUP_ID not set — skipped');
  }

  await browser.close();
  console.log(`\nlive MOBILE-A (V5) proof written to ${OUT}`);
};

main().catch((e) => { console.error(e); process.exit(1); });
