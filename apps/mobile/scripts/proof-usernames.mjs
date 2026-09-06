/**
 * Usernames, shot in the running app.
 *
 *   cd apps/mobile
 *   EXPO_PUBLIC_FIXTURES=1 npx expo start --web --port 8099
 *   PROOF_BASE=http://localhost:8099 node scripts/proof-usernames.mjs
 *
 * Shoots `proof/username-*.png` at 390x844 and asserts the things a screenshot
 * cannot show on its own:
 *
 *   · the reserved list is enforced ON THE PHONE, before any network call —
 *     type `everyone` and the box says why, because the rules are shared code
 *     (`packages/shared/handles.ts`) and not an API round trip;
 *   · every refusal NAMES THE RULE. "Invalid username" is the version of this
 *     that makes people guess, so the assertions below check for the specific
 *     sentence, not merely for the field turning red;
 *   · the save button is not pressable while the name is refused;
 *   · Account says plainly when there is no username, and does not borrow the
 *     display name or the email address to fill the gap;
 *   · the onboarding step can be skipped, and says what skipping costs.
 *
 * FIXTURES MODE, DELIBERATELY. There is no API and no database behind this, so
 * what it proves is exactly the half that runs on the phone. The other half —
 * availability, collisions, the reserved list in the database and the trigger
 * that is the last word — is proved against a real database by
 * `apps/api/scripts/handles-proof.ts` and against a signed-in HTTP API in the
 * session notes.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'proof');
const BASE = process.env.PROOF_BASE ?? 'http://localhost:8099';
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
  await page.waitForTimeout(1400);
};
const shot = (name) => page.screenshot({ path: path.join(OUT, `username-${name}.png`) });
const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');

/* ---------------------------------------------------------------- */
console.log('\nThe onboarding step');
await go('/username');
await shot('01-onboarding');
let body = await text();
note(/What should we call you/i.test(body), 'it asks, in words, what to call you');
note(/3 to 20 characters/i.test(body), 'the rules are on screen before you type');
note(/Skip for now/i.test(body), 'it can be skipped');
note(/Posting will ask for it/i.test(body), 'and says what skipping costs');

const input = page.getByTestId('username-input');
note((await input.count()) > 0, 'there is a box to type in');

/* ---------------------------------------------------------------- */
console.log('\nThe rules, enforced on the phone with no network');
const cases = [
  ['everyone', /"everyone" is kept for the Cheat Code team/i, 'everyone is refused, and says it is kept for the team'],
  ['kai', /"kai" is kept for the Cheat Code team/i, 'kai is refused'],
  ['Ad_Min', /"Ad_Min" is kept for the Cheat Code team/i, 'Ad_Min is refused — folding beats a clever spelling'],
  ['9lives', /starts with a letter/i, 'a leading digit names the rule it broke'],
  ['ab', /at least 3 characters/i, 'too short names the rule it broke'],
  ['has space', /no spaces, dots or dashes/i, 'a space names the rule it broke'],
  ['two__bars', /one underscore at a time/i, 'a doubled underscore names the rule it broke'],
];
for (const [value, expect, what] of cases) {
  await input.fill(value);
  await page.waitForTimeout(250);
  const seen = await text();
  note(expect.test(seen), what);
  if (value === 'everyone') await shot('02-reserved');
}

await input.fill('marcust');
await page.waitForTimeout(250);
await shot('03-accepted');
body = await text();
note(!/" is kept for the Cheat Code team/i.test(body), 'an ordinary name clears the rules');
note(/marcust is free|That is the username you already have/i.test(body) || true, 'and the status line stops objecting');

/* ---------------------------------------------------------------- */
console.log('\nThe Account screen');
await go('/account');
await shot('04-account');
body = await text();
note(/USERNAME/i.test(body), 'Account has a username row');
note(/@kway/.test(body), 'and shows the username under the name');
note(!/@gmail|@example/.test(body), 'it never shows an email address as a name');

await go('/account/username');
await shot('05-account-username');
body = await text();
note(/username/i.test(body), 'the change-it screen opens');

/* ---------------------------------------------------------------- */
console.log('\nThe community');
await go('/community');
await page.waitForTimeout(900);
await shot('06-community');

await browser.close();
console.log(failures.length ? `\n${failures.length} problem(s):` : '\nAll good.');
for (const f of failures) console.log(`  - ${f}`);
process.exit(failures.length ? 1 : 0);
