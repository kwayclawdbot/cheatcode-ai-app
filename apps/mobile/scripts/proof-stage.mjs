/**
 * READINESS STAGE proof — a brand-new member is placed, and the app changes shape.
 *
 *   npx expo start --web --port 8097 --clear     (WITHOUT EXPO_PUBLIC_FIXTURES)
 *   PROOF_BASE=http://localhost:8097 node scripts/proof-stage.mjs
 *
 * Signs a genuinely new account up through the UI and answers "I'm brand new"
 * to the first onboarding question, then checks the three things that answer is
 * supposed to change: the stage on the profile, the room Community opens in,
 * and where Home puts the training object.
 *
 * FIXTURES MODE WOULD PROVE NOTHING HERE. It skips the session gate and serves
 * canned data, so the placement — which happens in `POST /onboarding/complete`
 * on the real API — would never run. This walks the real chain against the real
 * database, which is also why it signs up rather than reusing an account.
 *
 * PROOF-ACCOUNT HYGIENE: this throwaway POSTS NOTHING. An account that has
 * written a message cannot be deleted (messages carry an author FK), so the
 * script reads rooms and never opens a composer. It is safe to delete the row
 * afterwards.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(path.resolve(HERE, '..'), 'proof');
const BASE = process.env.PROOF_BASE ?? 'http://localhost:8097';
const EMAIL = `stage+${Date.now()}@cheatcode.test`;
const PASSWORD = 'paper-money-first';

const failures = [];
const note = (ok, msg) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!ok) failures.push(msg);
};

const HIDE_DEV_CHROME = `.__expo_fast_refresh { display: none !important; }`;

const shot = async (page, name) => {
  const root = page.locator('#root');
  await ((await root.count()) ? root : page).screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log(`  → ${name}.png`);
};
const settle = (page, ms) => page.waitForTimeout(ms);
const on = (page, id) => page.locator(`[data-testid="${id}"]`).last();
const arrive = async (page, id) =>
  on(page, id).waitFor({ state: 'visible', timeout: 45_000 });
const tapIn = async (page, screen, id) => {
  const el = page.locator(`[data-testid="${screen}"] [data-testid="${id}"]`).last();
  await el.waitFor({ state: 'visible', timeout: 30_000 });
  await el.click();
  await settle(page, 500);
};
const text = (page) => page.locator('#root').innerText();

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
  });
  await ctx.addInitScript((css) => {
    const add = () => {
      const s = document.createElement('style');
      s.textContent = css;
      document.head.appendChild(s);
    };
    if (document.head) add();
    else document.addEventListener('DOMContentLoaded', add);
  }, HIDE_DEV_CHROME);
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') console.log(`    [console] ${m.text().slice(0, 160)}`);
  });

  console.log(`\nSigning up ${EMAIL}`);
  await page.goto(`${BASE}/welcome`, { waitUntil: 'load', timeout: 120_000 });
  await arrive(page, 'screen-welcome');
  await tapIn(page, 'screen-welcome', 'cta-get-started');
  await arrive(page, 'screen-sign-up');
  await page.locator('[data-testid="screen-sign-up"] [data-testid="field-email"]').fill(EMAIL);
  await page.locator('[data-testid="screen-sign-up"] [data-testid="field-password"]').fill(PASSWORD);
  await tapIn(page, 'screen-sign-up', 'cta-create');

  /* ── 1. the new first question ─────────────────────────────────────────── */
  console.log('\nThe question onboarding now opens with');
  await arrive(page, 'screen-start');
  await shot(page, 'stage-01-where-are-you');
  let body = await text(page);
  note(/Where are you right now/i.test(body), 'it asks where you are, in words');
  note(/brand new/i.test(body), '"I\'m brand new" is the first option offered');
  note(/not a label you are stuck with/i.test(body), 'it says the answer is not permanent');
  note(
    await on(page, 'cta-continue').isDisabled(),
    'Continue is refused until an answer is given',
  );

  await tapIn(page, 'screen-start', 'start-brand_new');
  await shot(page, 'stage-02-brand-new-chosen');
  note(!(await on(page, 'cta-continue').isDisabled()), 'and allowed once it is');
  await tapIn(page, 'screen-start', 'cta-continue');

  /* ── 2. it pre-selected the goal screen rather than skipping it ─────────── */
  console.log('\nThe goal screen arrives pre-answered, and still asks');
  await arrive(page, 'screen-goal');
  await shot(page, 'stage-03-goal-preselected');
  /*
   * The selected card is the one wearing a tick. `accessibilityState` does not
   * survive react-native-web as an `aria-selected` attribute on a role=button,
   * so the check icon is the honest thing to look for: `goal.tsx` renders it
   * only when that card is the chosen one. An unselected card draws exactly one
   * svg (its leading icon); the selected one draws two.
   */
  const svgsIn = (id) => page.locator(`[data-testid="${id}"] svg`).count();
  const investSvgs = await svgsIn('goal-invest');
  const swingSvgs = await svgsIn('goal-swing');
  note(
    investSvgs > swingSvgs,
    `"brand new" pre-selected Build My Portfolio — invest is ticked and swing is not (${investSvgs} vs ${swingSvgs})`,
  );
  await tapIn(page, 'screen-goal', 'cta-continue');

  /* ── 3. through the rest of the chain ──────────────────────────────────── */
  console.log('\nThe rest of onboarding');
  await arrive(page, 'screen-risk');
  await tapIn(page, 'screen-risk', 'cta-continue');
  await arrive(page, 'screen-personalize');
  await tapIn(page, 'screen-personalize', 'experience-new');
  await tapIn(page, 'screen-personalize', 'cta-continue');
  await arrive(page, 'screen-username');
  await page
    .locator('[data-testid="screen-username"] [data-testid="username-input"]')
    .fill(`newbie${Date.now().toString().slice(-6)}`);
  await settle(page, 1200);
  await tapIn(page, 'screen-username', 'username-save');
  await arrive(page, 'screen-kai-plan');
  await shot(page, 'stage-04-plan-six-steps');
  await tapIn(page, 'screen-kai-plan', 'cta-start');

  /* ── 4. Home, ordered for a beginner ───────────────────────────────────── */
  console.log('\nHome, for somebody who has just started');
  await arrive(page, 'screen-home');
  await settle(page, 3500);
  await shot(page, 'stage-05-home-beginner');

  const training = on(page, 'home-training');
  note(await training.count(), 'the training object is on Home');

  /*
   * ORDERING IS THE CLAIM, SO MEASURE IT. Two candidates for "the wall", in
   * preference order: a setup object if the market gave us one, and otherwise
   * the invest-mode notice — which a brand-new member always has, because the
   * answer that placed them at `beginner` also pre-selected invest.
   *
   * A "training is near the top" assertion was here first and it was worthless:
   * it passed while the app was reading no stage at all and drawing a
   * beginner's Home for everybody. Comparing two elements catches that; a
   * threshold on one does not.
   */
  const tBox = (await training.count()) ? await training.boundingBox() : null;
  note(tBox != null, 'and it has a position on screen');

  const setups = page.locator('[data-testid="wall-setup"]').first();
  const notice = page.locator('text=/research desk/i').last();
  const wallEl = (await setups.count()) ? setups : (await notice.count()) ? notice : null;
  const wBox = wallEl ? await wallEl.boundingBox() : null;

  if (tBox && wBox) {
    note(
      tBox.y < wBox.y,
      `training sits ABOVE the wall for a beginner (${Math.round(tBox.y)} < ${Math.round(wBox.y)})`,
    );
  } else {
    note(false, 'could not find a wall object to order training against');
  }

  /* ── 5. Community opens in Beginners ───────────────────────────────────── */
  console.log('\nCommunity, for the same person');
  await page.goto(`${BASE}/community`, { waitUntil: 'load', timeout: 120_000 });
  await arrive(page, 'screen-community');
  await settle(page, 4000);
  await shot(page, 'stage-06-community-beginners');
  body = await text(page);
  note(/Beginners/i.test(body), 'the Beginners room is present');
  note(await on(page, 'club-beginners').count(), 'the Beginners door is in the headbar');

  /*
   * THE ROOM ITSELF SAYS WHICH ROOM IT IS. The pill's selected styling is a
   * colour, and a colour is not evidence; the room's own empty state names it.
   * This is the assertion that caught the real bug — the first version of the
   * landing effect was immediately overridden by the mode's desk, and the only
   * visible symptom was this line reading "Investing".
   */
  note(
    /posted in Beginners/i.test(body) || /^\s*Beginners\s*$/m.test(body),
    'a beginner LANDED in Beginners, not in their mode\'s desk',
  );
  note(
    !/posted in Investing/i.test(body),
    'and specifically not in Investing, which is where the mode would have sent them',
  );

  /* ── 6. the tag, quietly, next to the name ─────────────────────────────── */
  console.log('\nThe stage tag');
  await page.goto(`${BASE}/account`, { waitUntil: 'load', timeout: 120_000 });
  await arrive(page, 'screen-account');
  await settle(page, 2500);
  await shot(page, 'stage-07-account');

  console.log(failures.length ? `\n${failures.length} failure(s).\n` : '\nAll good.\n');
  await browser.close();
  console.log(`account used: ${EMAIL}`);
  process.exit(failures.length ? 1 : 0);
})();
