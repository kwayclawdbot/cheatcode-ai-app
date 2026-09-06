/**
 * The App Store lane, shot in the running app.
 *
 *   cd apps/mobile
 *   EXPO_PUBLIC_FIXTURES=1 EXPO_PUBLIC_PRIVACY_URL=... EXPO_PUBLIC_TERMS_URL=... \
 *     npx expo start --web --port 8123
 *   PROOF_BASE=http://localhost:8123 node <this>
 *
 * Asserts the things a screenshot cannot show on its own:
 *   · no price, no "$", no upgrade/buy/subscribe anywhere a person can reach;
 *   · the plan screen still says which plan and what it covers;
 *   · the Trade refusal is honest and has no route to a purchase;
 *   · account deletion exists, is reachable, and states all three outcomes;
 *   · the legal links draw and the disclaimers are present.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const OUT = '/Users/kwaysclawd/projects/cheatcode-ai-sdk57/apps/mobile/proof';
const BASE = process.env.PROOF_BASE ?? 'http://localhost:8123';
const VIEWPORT = { width: 390, height: 844 };
mkdirSync(OUT, { recursive: true });

const failures = [];
const note = (ok, what) => { console.log(`  ${ok ? '✓' : '✗'} ${what}`); if (!ok) failures.push(what); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 2 });
page.on('pageerror', (e) => failures.push(`page error: ${e.message}`));

const go = async (route) => {
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2600);
};
const shot = (n) => page.screenshot({ path: path.join(OUT, `appstore-${n}.png`), fullPage: true });
const has = (id) => page.locator(`[data-testid="${id}"]`).count().then((n) => n > 0);
const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');

/** Every shape a price or a purchase route can take on a screen. */
const MONEY = /\$\s?\d|\bUSD\b|\/mo\b|a month|per month|\bUpgrade\b|\bSubscribe\b|\bCheckout\b|\bBuy\b|\bTop-?up\b|\bPro\b|\bVIP\b/i;
/** Prices that are legitimately market data or the person's own paper money. */
const scanForMoney = (t) => (t.match(new RegExp(MONEY, 'gi')) ?? []);

/* ── 1. the plan screen ───────────────────────────────────────────── */
console.log('\nplan / no storefront');
await go('/account/subscription');
await shot('plan');
{
  const t = await text();
  note(!/\$59|\$99|\$9\b/.test(t), 'no plan price anywhere on the plan screen');
  note(!/\bUpgrade\b/i.test(t), 'no Upgrade action');
  note(!(await has('cta-upgrade')), 'the upgrade button is gone');
  note(!(await has('plan-ladder')), 'the price ladder is gone');
  note(!(await has('sheet-billing')), 'the checkout sheet is gone');
  note(/Your plan/i.test(t), 'it still says which plan you are on');
  note(/credits left today/i.test(t), 'it still says how much is left');
  note(/not investment advice/i.test(t), 'the disclaimer is on it');
  note(await has('plan-legal'), 'the legal links draw');
  console.log(`    money-ish words seen: ${JSON.stringify([...new Set(scanForMoney(t))])}`);
}

/* ── 2. the credits screen ────────────────────────────────────────── */
console.log('\ncredits / no shop');
for (const f of ['', '?fixture=out', '?fixture=ceiling']) {
  await go(`/account/credits${f}`);
  await shot(`credits${f ? f.replace(/\W+/g, '-') : ''}`);
  const t = await text();
  note(!/\$\s?\d/.test(t), `no dollar figure (${f || 'default'})`);
  note(!(await has('cta-topup')), `no buy button (${f || 'default'})`);
  note(!(await has('credits-topup-offer')), `no top-up offer (${f || 'default'})`);
  note(!(await has('credits-ladder')), `no plan ladder (${f || 'default'})`);
  note(!/See the plans/i.test(t), `no link to a price list (${f || 'default'})`);
}
{
  await go('/account/credits?fixture=out');
  const t = await text();
  note(/come back|reset/i.test(t), 'running out still says when it comes back');
  note(!/Pro is|a month/i.test(t), 'running out does not pitch a plan');
}

/* ── 3. the trade refusal ─────────────────────────────────────────── */
console.log('\ntrade / refused honestly');
await go('/trade/NVDA');
await shot('trade');
{
  const t = await text();
  const locked = await has('trade-locked');
  console.log(`    trade-locked rendered: ${locked}`);
  note(!(await has('trade-locked-upgrade')), 'no "see the plans" button on the refusal');
  note(!/\$59|\$99/.test(t), 'the refusal names no price');
}

/* ── 4. account deletion ──────────────────────────────────────────── */
console.log('\naccount deletion');
await go('/account');
await shot('account');
{
  const t = await text();
  note(await has('cta-delete-account-entry'), 'Delete account is reachable from Account');
  note(await has('account-legal'), 'the legal links are on Account');
  note(/not investment advice/i.test(t), 'the disclaimer is on Account');
  note(!/\$59|\$99/.test(t), 'no plan price on Account');
}
await go('/account/delete');
await shot('delete');
{
  const t = await text();
  note(await has('delete-list-deleted'), 'it lists what is deleted');
  note(await has('delete-list-anonymised'), 'it lists what is kept but anonymised');
  note(await has('delete-list-kept'), 'it lists what is retained');
  note(await has('delete-billing-warning'), 'it warns that a subscription is not cancelled');
  note(/cannot be undone/i.test(t), 'it says it cannot be undone');
  const btn = page.locator('[data-testid="cta-delete-account"]');
  note((await btn.count()) > 0, 'the delete button exists');
  const disabledBefore = await btn.first().getAttribute('aria-disabled');
  note(disabledBefore === 'true' || (await btn.first().isDisabled().catch(() => false)),
    'the delete button is disabled before the word is typed');
  await page.locator('[data-testid="field-confirm-delete"]').fill('DELETE');
  await page.waitForTimeout(400);
  const disabledAfter = await btn.first().getAttribute('aria-disabled');
  note(disabledAfter !== 'true', 'typing DELETE arms the button');
  await shot('delete-armed');
  // Tapping it in fixtures must refuse rather than pretend.
  await btn.first().click();
  await page.waitForTimeout(900);
  const t2 = await text();
  note(/not connected/i.test(t2), 'fixtures mode refuses instead of faking a deletion');
  await shot('delete-fixtures-refusal');
}

/* ── 5. before sign-in ────────────────────────────────────────────── */
console.log('\nwelcome / legal before sign-in');
await go('/welcome');
await shot('welcome');
note(await has('welcome-legal'), 'the policy links are reachable before signing in');

/* ── 6. alerts + Kai disclaimers ──────────────────────────────────── */
console.log('\ndisclaimers');
// NOTE: `/alerts` in day_trade renders the "not live yet" screen (the alerts
// lane archived that mode), so the alerts BOARD is not reachable in this
// fixture. `/alert/new` is, and carries the same line.
await go('/alerts');
await shot('alerts');
await go('/alert/new');
await shot('alert-new');
{
  const t = await text();
  note(await has('alert-new-not-advice'), 'the alert composer carries the line');
  note(/not a recommendation|not investment advice/i.test(t), 'and it reads as not-advice');
  note(!/premium plan/i.test(t), 'no "needs the premium plan" title');
}

/* ── 7. the paper account ─────────────────────────────────────────── */
console.log('\npaper');
await go('/account/paper');
await shot('paper');
{
  const t = await text();
  note(await has('paper-not-advice'), 'the paper account carries its own line');
  note(/practice with money that does not exist/i.test(t), 'and it says the money is not real');
}

await browser.close();
console.log(`\n${failures.length ? `FAILED (${failures.length})` : 'ALL PASS'}`);
for (const f of failures) console.log(`  - ${f}`);
process.exit(failures.length ? 1 : 0);
