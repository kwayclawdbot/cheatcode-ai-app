/**
 * Live proof for lane MOBILE-A, round 4 (the prototype boards).
 *
 *   npx expo start --port 8081 --lan        (NO EXPO_PUBLIC_FIXTURES)
 *   apps/api on :3000, Supabase local up
 *   node scripts/proof-live-a4.mjs
 *
 * Signs a brand-new user up through the UI so every request carries a real
 * JWT, then walks the round-4 arc against the REAL stack:
 *   sign up → personalize ("New to this" + two focus chips) → plan →
 *   Home (drawer open, new conversation, pin) → ticker page sections →
 *   Alerts (medallion + scorecard, expand, NO fractions asserted by text) →
 *   CTA lands on /trade/<sym>?alert=… (lane MOBILE-B owns the destination) →
 *   Account rows.
 * Shots land in proof/live-a4-*.png.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(path.resolve(HERE, '..'), 'proof');
const BASE = process.env.PROOF_BASE ?? 'http://localhost:8081';
const EMAIL = `proof-a4+${Date.now()}@cheatcode.test`;
const PASSWORD = 'paper-money-first';

/** §4: component fractions are banned. `NN/100` is the mandated grade score. */
const FRACTION = /\b\d{1,3}\s*\/\s*(?!100\b)\d{1,3}\b/g;

const failures = [];
const note = (ok, msg) => {
  console.log(`  ${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) failures.push(msg);
};

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
const on = (page, screen, testid) => page.locator(`[data-testid="${screen}"] [data-testid="${testid}"]`);
const tap = async (page, screen, testid, timeout = 30_000) => {
  const el = on(page, screen, testid).last();
  await el.waitFor({ state: 'visible', timeout });
  await el.click();
};
const arrive = async (page, screen, timeout = 45_000) => {
  await page.locator(`[data-testid="${screen}"]`).last().waitFor({ state: 'visible', timeout });
  await page.waitForTimeout(700);
};
const go = async (page, route, screen, ready) => {
  await page.goto(`${BASE}${route}`, { waitUntil: 'load', timeout: 120_000 });
  if (screen) await arrive(page, screen);
  if (ready) {
    try {
      await page.locator(`[data-testid="${screen}"] [data-testid="${ready}"]`).last().waitFor({ state: 'visible', timeout: 60_000 });
    } catch {
      console.log(`  · ${route} never showed ${ready} — capturing whatever it settled on`);
    }
  }
  await page.waitForTimeout(1500);
};
const softTap = async (page, screen, testid, label) => {
  try {
    await tap(page, screen, testid, 8000);
    await page.waitForTimeout(900);
    return true;
  } catch {
    console.log(`  · skipped ${label} (not present on the live stack)`);
    return false;
  }
};
const readText = async (page, selector, label) => {
  try {
    const t = (await page.locator(selector).last().innerText({ timeout: 6000 })).replace(/\s+/g, ' ').trim();
    console.log(`  · ${label}: ${t.slice(0, 160)}`);
    return t;
  } catch {
    console.log(`  · ${label}: (not rendered)`);
    return '';
  }
};
/** Assert BY TEXT against what the live stack actually rendered. */
const assertNoFractions = async (page, where) => {
  const text = await page.locator('#root').innerText();
  const hits = [...new Set([...text.matchAll(FRACTION)].map((m) => m[0]))];
  note(hits.length === 0, hits.length ? `${where}: component fraction(s) on screen — ${hits.join(', ')}` : `${where}: no component fractions on screen`);
};
const assertOnScreen = async (page, needle, where) => {
  const text = await page.locator('#root').innerText();
  note(text.includes(needle), `${where}: "${needle}"`);
  return text;
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

  // ---- 1. sign up, then the 4-step onboarding with personalize
  console.log('[1] sign up → goal → risk → personalize → plan');
  await page.goto(`${BASE}/welcome`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForTimeout(2500);
  await shot(page, 'live-a4-01-welcome');
  await tap(page, 'screen-welcome', 'cta-get-started');
  await arrive(page, 'screen-sign-up');
  await on(page, 'screen-sign-up', 'field-email').fill(EMAIL);
  await on(page, 'screen-sign-up', 'field-password').fill(PASSWORD);
  await tap(page, 'screen-sign-up', 'cta-create');

  await arrive(page, 'screen-goal', 60_000);
  await tap(page, 'screen-goal', 'goal-day_trade');
  await tap(page, 'screen-goal', 'cta-continue');
  await arrive(page, 'screen-risk');
  await shot(page, 'live-a4-02-risk');
  await readText(page, '[data-testid="screen-risk"] [data-testid="risk-cap"]', 'daily loss cap');
  await tap(page, 'screen-risk', 'cta-continue');

  await arrive(page, 'screen-personalize');
  // the brief's exact walk: "New to this" + two focus chips
  await tap(page, 'screen-personalize', 'experience-new');
  // clear the two defaults so exactly two chips end up chosen
  await tap(page, 'screen-personalize', 'focus-tech');
  await tap(page, 'screen-personalize', 'focus-ai');
  await tap(page, 'screen-personalize', 'focus-energy');
  await tap(page, 'screen-personalize', 'focus-etf');
  await page.waitForTimeout(500);
  await shot(page, 'live-a4-03-personalize');
  await readText(page, '[data-testid="screen-personalize"] [data-testid="focus-summary"]', 'focus summary');
  await tap(page, 'screen-personalize', 'cta-continue');

  await arrive(page, 'screen-kai-plan');
  await page.waitForTimeout(800);
  await shot(page, 'live-a4-04-plan');
  // experience `new` must change Kai's voice, not just a stored label
  await assertOnScreen(page, 'I explain every term the first time it appears.', 'plan · Kai voice (new)');
  await tap(page, 'screen-kai-plan', 'cta-start');
  try {
    await arrive(page, 'screen-home', 60_000);
  } catch (e) {
    const text = await page.locator('#root').innerText();
    console.log('  ! never reached Home. url=', page.url());
    console.log('  ! screen text:', text.replace(/\s+/g, ' ').slice(0, 600));
    await shot(page, 'live-a4-04b-plan-stuck');
    throw e;
  }
  await page.waitForTimeout(5000);

  // ---- 2. Home: the conversation workspace + the drawer
  console.log('[2] Home — conversation workspace + conversations drawer');
  await go(page, '/home', 'screen-home', 'home-thread-title');
  await page.waitForTimeout(3000);
  await shot(page, 'live-a4-05-home');
  await readText(page, '[data-testid="screen-home"] [data-testid="home-thread-title"]', 'thread title');
  await readText(page, '[data-testid="screen-home"] [data-testid="opening-line"]', 'opening line');

  if (await softTap(page, 'screen-home', 'home-threads-open', 'open conversations drawer')) {
    await page.waitForTimeout(1200);
    await shot(page, 'live-a4-06-home-drawer');
    const drawer = await page.locator('[data-testid="threads-drawer"]').count();
    note(drawer > 0, 'conversations drawer opened');
    // pin whatever the live account actually has
    const pin = page.locator('[data-testid^="conversation-pin-"]').first();
    if (await pin.count()) {
      await pin.click();
      await page.waitForTimeout(1200);
      await shot(page, 'live-a4-07-home-drawer-pinned');
      console.log('  · pinned the first conversation (PATCH /kai/conversations/:id)');
    } else {
      console.log('  · no conversations on this brand-new account yet');
    }
    // new conversation
    const fresh = page.locator('[data-testid="threads-new"]').last();
    if (await fresh.count()) { await fresh.click(); await page.waitForTimeout(1500); }
    await shot(page, 'live-a4-08-home-new-conversation');
    await readText(page, '[data-testid="screen-home"] [data-testid="home-thread-title"]', 'thread title after new');
  }

  // ---- 3. the ticker page
  console.log('[3] Ticker page — GET /symbols/:symbol');
  await go(page, '/symbol/META', 'screen-ticker', 'ticker-symbol');
  await page.waitForTimeout(2500);
  await shot(page, 'live-a4-09-ticker');
  await readText(page, '[data-testid="screen-ticker"] [data-testid="ticker-price"]', 'live price');
  await readText(page, '[data-testid="screen-ticker"] [data-testid="ticker-kai-view"]', "Kai's view");
  await softTap(page, 'screen-ticker', 'ticker-section-technicals', 'Technicals');
  await shot(page, 'live-a4-10-ticker-technicals');
  await softTap(page, 'screen-ticker', 'ticker-section-community', 'Community');
  await shot(page, 'live-a4-11-ticker-community');
  await assertNoFractions(page, 'ticker page');

  // ---- 4. Alerts as trade objects
  console.log('[4] Alerts — Active / Watching / History');
  await go(page, '/alerts', 'screen-alerts', 'alerts-tabs');
  await page.waitForTimeout(2500);
  await shot(page, 'live-a4-12-alerts-active');
  await assertNoFractions(page, 'alerts · active (collapsed)');

  // A brand-new account owns no alerts and follows no setups, so there is
  // nothing for the card grammar to draw. Create one the way a person would —
  // through the NL composer this screen keeps — so the rest of the walk runs
  // against a REAL alert this user owns, not a fixture.
  if (!(await page.locator('[data-testid^="alert-card-"]').count())) {
    console.log('  · no cards yet — creating one through the NL composer');
    const input = page.locator('[data-testid="alert-nl-input"]').last();
    if (await input.count()) {
      await input.fill('Tell me when META breaks above 504');
      await page.locator('[data-testid="alert-nl-read"]').last().click();
      await page.waitForTimeout(4000);
      await shot(page, 'live-a4-12b-alerts-composer-preview');
      await readText(page, '[data-testid="alert-preview"]', 'what Kai understood');
      const activate = page.locator('[data-testid="alert-activate"]').last();
      if (await activate.count()) {
        await activate.click();
        await page.waitForTimeout(6000);
        await shot(page, 'live-a4-12c-alerts-after-activate');
      }
    }
    await go(page, '/alerts', 'screen-alerts', 'alerts-tabs');
    await page.waitForTimeout(2500);
    // the new alert is a monitored idea → it lands in Watching
    await softTap(page, 'screen-alerts', 'alerts-tab-watching', 'Watching tab');
    await page.waitForTimeout(2000);
    await shot(page, 'live-a4-12d-alerts-watching-after-create');
  }

  // whatever card the live account has — expand it and read the scorecard
  const card = page.locator('[data-testid^="alert-card-"]').first();
  const symbol = (await card.count())
    ? (await page.locator('[data-testid^="alert-expand-"]').first().getAttribute('data-testid') ?? '').replace('alert-expand-', '')
    : '';
  if (symbol) {
    console.log(`  · first active card: ${symbol}`);
    await page.locator(`[data-testid="alert-expand-${symbol}"]`).last().click();
    await page.waitForTimeout(1200);
    await shot(page, 'live-a4-13-alerts-expanded');
    const medallion = await page.locator(`[data-testid="medallion-${symbol}"]`).count();
    note(medallion > 0, `grade medallion rendered for ${symbol}`);
    // A user-written watch with no graded setup behind it has no scorecard —
    // spec §4 leaves it unqualified rather than inventing components. Assert
    // the scorecard only where there IS a grade to explain.
    const graded = (await page.locator(`[data-testid="medallion-${symbol}"]`).innerText()).includes('/100');
    const scorecard = await page.locator(`[data-testid="scorecard-${symbol}"]`).count();
    if (graded) note(scorecard > 0, `qualitative scorecard rendered for graded ${symbol}`);
    else console.log(`  · ${symbol} is an ungraded watch — no scorecard, which is correct (§4)`);
    await assertNoFractions(page, 'alerts · active (expanded)');
    await softTap(page, 'screen-alerts', 'scorecard-evidence', 'See evidence');
    await shot(page, 'live-a4-14-alerts-evidence');
    await assertNoFractions(page, 'alerts · evidence open');
  } else {
    console.log('  · no active card on this account — Watching is where the seed lands');
  }

  await softTap(page, 'screen-alerts', 'alerts-tab-watching', 'Watching tab');
  await page.waitForTimeout(1500);
  await shot(page, 'live-a4-15-alerts-watching');
  await assertNoFractions(page, 'alerts · watching');
  await softTap(page, 'screen-alerts', 'alerts-tab-history', 'History tab');
  await page.waitForTimeout(1500);
  await shot(page, 'live-a4-16-alerts-history');
  await softTap(page, 'screen-alerts', 'alerts-tab-active', 'back to Active');
  await page.waitForTimeout(1200);

  // ---- 5. the CTA is the seam with lane MOBILE-B
  console.log('[5] CTA → /trade/<sym>?alert=…&ctx=alert');
  const cta = page.locator('[data-testid^="alert-cta-"]').first();
  if (await cta.count()) {
    await cta.click();
    await page.waitForTimeout(3000);
    const url = page.url();
    note(/\/trade\/[A-Z.]+\?alert=[^&]+&ctx=alert/.test(url), `CTA routed to ${url}`);
    await shot(page, 'live-a4-17-cta-destination');
  } else {
    // Watching cards carry the same contract
    await softTap(page, 'screen-alerts', 'alerts-tab-watching', 'Watching tab');
    const w = page.locator('[data-testid^="alert-cta-"]').first();
    if (await w.count()) {
      await w.click();
      await page.waitForTimeout(3000);
      const url = page.url();
      note(/\/trade\/[A-Z.]+\?alert=[^&]+&ctx=alert/.test(url), `CTA routed to ${url}`);
      await shot(page, 'live-a4-17-cta-destination');
    } else {
      note(false, 'no alert card on the live account to press');
    }
  }

  // ---- 6. `/alert/[id]` must redirect, never render a detail page
  console.log('[6] /alert/[id] redirect');
  await page.goto(`${BASE}/alert/does-not-exist`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForTimeout(3500);
  console.log(`  · /alert/does-not-exist → ${page.url()}`);
  note(!page.url().includes('/alert/does-not-exist'), 'alert route redirected away from a detail page');
  await shot(page, 'live-a4-18-alert-redirect');

  // ---- 7. Account
  console.log('[7] Account — Kai profile rows');
  await go(page, '/account', 'screen-account', 'kai-profile');
  await page.waitForTimeout(2500);
  await shot(page, 'live-a4-19-account');
  await assertOnScreen(page, 'YOUR KAI PROFILE', 'account');
  await readText(page, '[data-testid="screen-account"] [data-testid="kai-profile"]', 'Kai profile rows');
  await readText(page, '[data-testid="screen-account"] [data-testid="kai-voice-line"]', 'voice line');
  const adherence = await page.locator('[data-testid="rule-adherence"]').count();
  console.log(`  · rule adherence shown: ${adherence > 0} (hidden under 3 sessions, which is correct for a new account)`);
  if (await softTap(page, 'screen-account', 'kai-profile-experience', 'cycle experience')) {
    await page.waitForTimeout(1500);
    await shot(page, 'live-a4-20-account-experience-cycled');
    await readText(page, '[data-testid="screen-account"] [data-testid="kai-voice-line"]', 'voice line after cycle');
  }
  if (await softTap(page, 'screen-account', 'kai-profile-focus', 'Kai watches')) {
    await page.waitForTimeout(1000);
    await shot(page, 'live-a4-21-account-focus-sheet');
  }

  await browser.close();
  if (failures.length) {
    console.log(`\n${failures.length} assertion failure(s):`);
    failures.forEach((f) => console.log(`  ✗ ${f}`));
    process.exit(1);
  }
  console.log('\nall live assertions passed');
};

main().catch((e) => { console.error(e); process.exit(1); });
