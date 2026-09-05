/**
 * The credit system, shot in the running app.
 *
 *   cd apps/mobile
 *   EXPO_PUBLIC_FIXTURES=1 npx expo start --web --port 8081
 *   PROOF_BASE=http://localhost:8081 node scripts/proof-credits.mjs
 *
 * Shoots `proof/credits-*.png` at 390x844 and asserts the things a screenshot
 * cannot show on its own:
 *
 *   · the balance meter is countable — ten ticks for ten credits, not a bar;
 *   · the strip above the composer is ABSENT on a normal day and present at
 *     80% and at zero, because permanent chrome would change what Home is;
 *   · running out of today's credits and hitting the month's cost limit are
 *     DIFFERENT screens with different words — the first says come back
 *     tomorrow, the second must not;
 *   · purchased credits are their own line and say they do not reset;
 *   · every question count is hedged with "about", because a credit is
 *     proportional to the work a question causes and a hard number would be a
 *     promise the system breaks;
 *   · no tokens, no dollars of model cost, and no model name reaches a screen
 *     a person sees;
 *   · the Trade refusal names the reason and the way out rather than failing.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'proof');
const BASE = process.env.PROOF_BASE ?? 'http://localhost:8081';
const VIEWPORT = { width: 390, height: 844 };

mkdirSync(OUT, { recursive: true });

const failures = [];
const note = (ok, what) => {
  console.log(`  ${ok ? '✓' : '✗'} ${what}`);
  if (!ok) failures.push(what);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 2 });
page.on('pageerror', (e) => failures.push(`page error: ${e.message}`));

const go = async (route) => {
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
};
const shot = (name) => page.screenshot({ path: path.join(OUT, `credits-${name}.png`), fullPage: true });
const has = (id) => page.locator(`[data-testid="${id}"]`).count().then((n) => n > 0);
const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');

/* ── 1. a normal free day ─────────────────────────────────────────── */
console.log('\ncredits / the balance');
await go('/account/credits');
await shot('default');
{
  const t = await text();
  note(await has('credit-meter'), 'the balance is drawn as a meter');
  const ticks = await page.locator('[data-testid="credit-meter-ticks"] > div').count();
  note(ticks === 10, `ten credits are ten countable ticks (saw ${ticks})`);
  note(/7 of 10 left today/.test(t), 'it says how many are left, and of how many');
  note(/do not carry over/i.test(t), 'it says the credits do not roll over');
  note(/Most questions cost one credit/i.test(t), 'it says what a credit buys');
  note(!/token/i.test(t), 'no tokens anywhere on the screen');
  note(!/\$0\.\d{3}/.test(t), 'no model cost in dollars');
  note(!/sonnet|haiku|opus|claude/i.test(t), 'no model name');
  note(/About 25 questions a day/.test(t), 'the ladder hedges the question count');
  note(/\$59/.test(t) && /\$99/.test(t), 'both paid rungs carry their price');
  note(/100 credits/i.test(t) && /\$9/.test(t), 'the top-up pack is offered with its price');
}

/* ── 2. 80% gone ──────────────────────────────────────────────────── */
console.log('\ncredits / the warning');
await go('/account/credits?fixture=warn');
await shot('warning');
{
  const t = await text();
  note(/2 of 10 left today/.test(t), 'the meter follows the balance down');
  const lit = await page.locator('[data-testid="credit-meter-ticks"] > div').count();
  note(lit === 10, 'spent ticks stay on the meter rather than disappearing');
}

/* ── 3. spent ─────────────────────────────────────────────────────── */
console.log('\ncredits / out');
await go('/account/credits?fixture=out');
await shot('out');
{
  const t = await text();
  note(await has('credits-stop'), 'Kai says he has stopped');
  note(/Today's credits are spent/.test(t), 'the reason is named as todays credits');
  note(/ten more tomorrow morning/i.test(t), 'it says when they come back');
  note(/0 of 10 left today/.test(t), 'the meter reads zero');
  note(!/error|failed|something went wrong/i.test(t), 'it is not phrased as an error');
}

/* ── 4. the OTHER stop ────────────────────────────────────────────── */
console.log('\ncredits / the month cost limit');
await go('/account/credits?fixture=ceiling');
await shot('ceiling');
{
  const t = await text();
  note(/This month's cost limit/.test(t), 'the month limit is named as itself');
  note(/have not run out of credits/i.test(t), 'it says the credits are not the problem');
  note(!/come back tomorrow|ten more tomorrow/i.test(t),
    'it does NOT tell them to come back tomorrow — tomorrow would stop them too');
  note(/34 of 40 left today/.test(t), 'the untouched daily balance is still shown');
}

/* ── 5. purchased credits ─────────────────────────────────────────── */
console.log('\ncredits / bought credits');
await go('/account/credits?fixture=topup');
await shot('topup');
{
  const t = await text();
  note(await has('credits-topup-balance'), 'purchased credits are their own line');
  note(/100 credits you bought/.test(t), 'the purchased balance is stated');
  note(/do not disappear overnight|stay with you/i.test(t), 'it says they do not reset');
  note(/spent first/i.test(t), 'it says the daily grant is used before what they paid for');
}

/* ── 6. the strip in the chat ─────────────────────────────────────── */
console.log('\nhome / the strip above the composer');
await go('/home');
await shot('home-quiet');
note(!(await has('home-credit-strip')), 'ABSENT on a normal day — Home is a conversation');

await go('/home?credits=warn');
await shot('home-warning');
{
  const t = await text();
  note(await has('home-credit-strip'), 'present once 80% is gone');
  note(/2 credits left today/.test(t), 'it says how many are left');
}

await go('/home?credits=out');
await shot('home-out');
{
  const t = await text();
  note(await has('home-credit-strip'), 'present once Kai has stopped');
  note(/stopped for today/i.test(t), 'it says he has stopped for today');
  // The strip is a real tap target, not a View with a touch handler that only
  // fires on web. Tapping it has to actually go somewhere.
  await page.locator('[data-testid="home-credit-strip"]').click();
  await page.waitForTimeout(1500);
  note(await has('screen-credits'), 'and tapping it opens the credits screen');
}

await go('/home?credits=ceiling');
{
  const t = await text();
  note(/stopped for this month/i.test(t), 'the month limit reads differently in the strip too');
}

/* ── 7. the plan ladder ───────────────────────────────────────────── */
console.log('\nplan / the ladder');
await go('/account/subscription');
await shot('plan');
{
  const t = await text();
  note(await has('plan-ladder'), 'the ladder is on the plan screen');
  note(await has('plan-rung-pro'), 'Pro is a rung');
  note(await has('plan-rung-vip'), 'VIP is a rung');
  note(/40 credits a day/.test(t) && /75 credits a day/.test(t),
    'each rung states the credits a day it is actually enforced on');
  note(/about 25 questions/i.test(t) && /about 50 questions/i.test(t),
    'the question counts are hedged on both rungs');
  note(await has('plan-to-credits'), 'the plan screen links to credits');
}

/* ── 8. the Trade refusal ─────────────────────────────────────────── */
console.log('\ntrade / closed, said honestly');
await go('/trade/META?locked=1');
await shot('trade-locked');
{
  const t = await text();
  note(await has('trade-locked'), 'a free account reaching a Trade route gets a designed screen');
  note(/Trade section is on the paid plans/i.test(t), 'it names what is closed');
  note(/What you still have/i.test(t), 'it names what they keep');
  note(/Kai, every day/i.test(t), 'Kai and the community are still theirs');
  note(await has('trade-locked-upgrade'), 'there is a way to the plans');
  note(await has('trade-locked-ask'), 'and a way to still ask Kai about the symbol');
  note(!/could not open|try again|went wrong/i.test(t),
    'it is NOT dressed up as a failure — nothing failed');
  const spinner = await page.locator('text=Opening').count();
  note(spinner === 0, 'and it does not sit on a spinner');
}

await go('/account');
{
  const t = await text();
  note(/Credits/.test(t), 'Account carries a Credits row');
  note(/7 left today/.test(t), 'and it shows the real balance');
}

await browser.close();

console.log(`\n${failures.length ? `${failures.length} FAILED` : 'all checks passed'}`);
for (const f of failures) console.log(`  - ${f}`);
console.log(`shots in ${OUT}`);
process.exit(failures.length ? 1 : 0);
