/**
 * Training Mode proof: the seven-day landing, Day 1 Lesson 1 end to end, and
 * the mastery that has to survive a reload.
 *
 *   npx expo start --web --port 8082      (WITHOUT EXPO_PUBLIC_FIXTURES)
 *   node scripts/proof-training.mjs
 *
 * Signs a brand-new user up through the UI and walks the real onboarding, so
 * the session gate is exercised for real — fixtures mode skips the gate, which
 * is exactly how `/training` could look fine here and bounce to Home on a
 * device. The learner profile is AsyncStorage (localStorage on web), so a new
 * browser context starts genuinely untrained.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(path.resolve(HERE, '..'), 'proof');
const BASE = process.env.PROOF_BASE ?? 'http://localhost:8082';
const EMAIL = `training+${Date.now()}@cheatcode.test`;
const PASSWORD = 'paper-money-first';

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

const shot = async (page, name) => {
  const root = page.locator('#root');
  await ((await root.count()) ? root : page).screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log(`  ✓ ${name}.png`);
};

const on = (page, testid) => page.locator(`[data-testid="${testid}"]`).last();
/** DOM presence is not visibility: react-native-web keeps screens mounted. */
const showing = async (page, testid) => {
  const el = on(page, testid);
  return (await el.count()) ? el.isVisible() : false;
};
/** Drive whatever screen is on top one step forward, whatever it needs. */
const step = async (page) => {
  // A quiz will not let you past until an option is chosen and checked.
  const opt = page.locator('[data-testid^="training-quiz-option-"]:visible').last();
  if (await opt.count()) { await opt.click().catch(() => {}); await settle(page, 300); }
  if (await showing(page, 'training-quiz-check')) {
    await on(page, 'training-quiz-check').click().catch(() => {});
    await settle(page, 700);
  }
  // The sorting game genuinely gates advance until ALL FOUR cards are placed,
  // so it gets sorted properly — and correctly, so the screenshot shows the
  // success state rather than four red cards.
  if (await showing(page, 'training-sort-card-c1')) {
    for (const [card, bucket] of [
      ['c1', 'investor'], ['c2', 'trader'], ['c3', 'trader'], ['c4', 'investor'],
    ]) {
      const c = on(page, `training-sort-card-${card}`);
      if (!(await c.count()) || !(await c.isVisible())) continue;
      await c.click().catch(() => {});
      await settle(page, 250);
      await on(page, `training-sort-bucket-${bucket}`).click().catch(() => {});
      await settle(page, 350);
    }
    await shot(page, 'training-07-sorting-game');
  }
  if (await showing(page, 'training-next')) {
    await on(page, 'training-next').click().catch(() => {});
    await settle(page, 450);
    return true;
  }
  return false;
};
const tapIn = async (page, screen, testid) => {
  const el = page.locator(`[data-testid="${screen}"] [data-testid="${testid}"]`).last();
  await el.waitFor({ state: 'visible', timeout: 30_000 });
  await el.click();
};
const tap = async (page, testid) => {
  const el = on(page, testid);
  await el.waitFor({ state: 'visible', timeout: 30_000 });
  await el.click();
};
const arrive = async (page, screen) => {
  await page.locator(`[data-testid="${screen}"]`).last().waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForTimeout(600);
};
const settle = (page, ms = 700) => page.waitForTimeout(ms);

/** Advance through whatever screen is on top, however many times it takes. */
const advance = async (page, times) => {
  for (let i = 0; i < times; i += 1) {
    const next = on(page, 'training-next');
    if (!(await next.count())) break;
    await next.waitFor({ state: 'visible', timeout: 15_000 });
    await next.click();
    await settle(page, 450);
  }
};

const main = async () => {
  await fs.mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
    bypassCSP: true,
  });
  await installHideDevChrome(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  ! page error:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('  ! console:', m.text().slice(0, 200)); });

  console.log(`training learner: ${EMAIL}`);

  // ---- real signup + onboarding, so the gate is exercised -------------------
  await page.goto(`${BASE}/welcome`, { waitUntil: 'load', timeout: 120_000 });
  await settle(page, 2500);
  await tapIn(page, 'screen-welcome', 'cta-get-started');
  await arrive(page, 'screen-sign-up');
  await page.locator('[data-testid="screen-sign-up"] [data-testid="field-email"]').fill(EMAIL);
  await page.locator('[data-testid="screen-sign-up"] [data-testid="field-password"]').fill(PASSWORD);
  await tapIn(page, 'screen-sign-up', 'cta-create');

  // goal -> risk -> personalize -> username -> kai-plan (the current chain;
  // scripts/proof-live.mjs still walks an older one and would fail here).
  await arrive(page, 'screen-goal');
  await tapIn(page, 'screen-goal', 'goal-swing');
  await settle(page, 400);
  await tapIn(page, 'screen-goal', 'cta-continue');

  await arrive(page, 'screen-risk');
  await tapIn(page, 'screen-risk', 'cta-continue');

  await arrive(page, 'screen-personalize');
  await tapIn(page, 'screen-personalize', 'experience-new');
  await settle(page, 300);
  await tapIn(page, 'screen-personalize', 'cta-continue');

  // Set a real username rather than skipping. The root layout asks a nameless
  // member for one ONCE per launch, and that prompt pushes itself over
  // whatever route is open — including /training, which is how this walk first
  // screenshotted the username screen and called it the landing.
  await arrive(page, 'screen-username');
  await page.locator('[data-testid="screen-username"] [data-testid="username-input"]')
    .fill(`learner${Date.now().toString().slice(-6)}`);
  await settle(page, 1200);
  await tapIn(page, 'screen-username', 'username-save');

  await arrive(page, 'screen-kai-plan');
  await tapIn(page, 'screen-kai-plan', 'cta-start');
  await settle(page, 4000);

  // ---- 1. the seven-day landing -------------------------------------------
  await page.goto(`${BASE}/training`, { waitUntil: 'load' });
  await arrive(page, 'screen-training');
  await settle(page, 1200);
  await shot(page, 'training-01-landing-seven-days');

  // ---- 2. Lesson 1 opens ---------------------------------------------------
  // Day 1 is already expanded on arrival — it is the active day — so there is
  // nothing to click open. Tapping the day node here would advance INTO the
  // lesson and the "expanded" screenshot would just be the lesson again.
  await tap(page, 'training-lesson-d1l1');
  await settle(page, 1200);
  await shot(page, 'training-02-lesson-opening');

  // ---- 3. walk the lesson, shooting the screens that matter ----------------
  await advance(page, 1);                       // opening -> core idea
  await shot(page, 'training-03-core-idea');

  // The first quiz: answer it and shoot the teaching feedback.
  const optionA = on(page, 'training-quiz-option-a');
  if (await optionA.count()) {
    await optionA.click();
    await settle(page, 800);
    await shot(page, 'training-04-quiz-feedback');
  }

  await advance(page, 2);
  await shot(page, 'training-05-video-placeholder');

  await advance(page, 1);
  await shot(page, 'training-06-auction');

  // Push on through the middle of the lesson to the Kai free-text check.
  for (let i = 0; i < 40; i += 1) {
    if (await showing(page, 'training-kai-submit')) break;
    if (!(await step(page))) break;
  }

  if (await showing(page, 'training-kai-submit')) {
    await shot(page, 'training-08-kai-check');
    const input = page.locator('[data-testid="training-kai-input"]').last();
    if (await input.count()) await input.fill('A stock is a small ownership interest in a company.');
    await settle(page, 400);
    await on(page, 'training-kai-submit').click();
    await settle(page, 12000);                  // a real Kai call, or the honest failure
    await shot(page, 'training-09-kai-result');
    // Out of credit today: the self-assessment is what carries the lesson on.
    if (await showing(page, 'training-kai-selfassess')) {
      await on(page, 'training-kai-selfassess').click();
      await settle(page, 700);
      await shot(page, 'training-09b-kai-selfassessed');
    }
  } else {
    console.log('  ! never reached the Kai check');
  }

  // ---- 4. finish the lesson ------------------------------------------------
  for (let i = 0; i < 40; i += 1) {
    if (await showing(page, 'training-complete')) break;
    if (!(await step(page))) break;
  }
  await settle(page, 800);
  await shot(page, 'training-10-completion');

  // ---- 5. mastery survives a reload ---------------------------------------
  await page.goto(`${BASE}/training/progress`, { waitUntil: 'load' });
  await settle(page, 1500);
  await shot(page, 'training-11-progress');

  await page.reload({ waitUntil: 'load' });
  await settle(page, 2000);
  await shot(page, 'training-12-progress-after-reload');

  // ---- 6. the two entry points --------------------------------------------
  await page.goto(`${BASE}/home`, { waitUntil: 'load' });
  await settle(page, 4000);
  await shot(page, 'training-13-home-entry');

  await page.goto(`${BASE}/account`, { waitUntil: 'load' });
  await settle(page, 2500);
  await shot(page, 'training-14-account-entry');

  await browser.close();
  console.log(`\ntraining proof written to ${OUT}`);
};

main().catch((e) => { console.error(e); process.exit(1); });
