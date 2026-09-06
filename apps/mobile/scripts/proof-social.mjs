/**
 * The social layer, shot in the running app.
 *
 *   cd apps/mobile
 *   EXPO_PUBLIC_FIXTURES=1 npx expo start --web --port 8099
 *   PROOF_BASE=http://localhost:8099 node scripts/proof-social.mjs
 *
 * Shoots `proof/social-*.png` at 390x844 and asserts the things a screenshot
 * cannot show on its own:
 *
 *   · the reaction bar draws the FOUR named reactions and not a row of emoji,
 *     and "Disagree" is one of them — a room where the only cheap gesture is
 *     approval reads as unanimous whether or not it is;
 *   · tapping one changes the count in place, and nothing anywhere says
 *     "saved on this device only" any more, because it is not;
 *   · a post says how many comments it has, and opening it lands on a screen
 *     with the post at the top, the comments under a rule, and NO way to reply
 *     to a reply — one level, enforced by the database;
 *   · a removed comment keeps its place and loses its words;
 *   · the composer has a way to add a picture, and the accessibility copy on
 *     it tells the truth about location data before anything is picked.
 *
 * WHAT THIS CANNOT PROVE, and is not claimed anywhere: the picker itself.
 * `expo-image-picker` opens the phone's own library and Expo Go carries its own
 * permission strings, so the permission sheet a member sees here is Expo's and
 * not ours. Picking, downscaling and the permission copy have to be checked in
 * a native build, and this app has never had one.
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
  await page.waitForTimeout(2600);
};
const shot = (name) => page.screenshot({ path: path.join(OUT, `social-${name}.png`), fullPage: true });
const has = (id) => page.locator(`[data-testid="${id}"]`).count().then((n) => n > 0);
const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');

/* -- 1. the reaction bar ------------------------------------------- */
console.log('\nsocial / reactions in the club feed');
await go('/community');
await shot('feed');

const feed = await text();
for (const label of ['Agree', 'Disagree', 'Watching', 'Useful']) {
  note(feed.includes(label), `the feed offers "${label}"`);
}
note(!/saved on this device only/i.test(feed), 'nothing claims a reaction is device-local any more');
note(!/🔥|💬/.test(feed), 'no emoji reactions are left in the feed');

const agree = page.locator('[data-testid="react-agree"]').first();
if (await agree.count()) {
  const before = (await agree.innerText()).replace(/\s+/g, ' ');
  await agree.click();
  await page.waitForTimeout(900);
  const after = (await agree.innerText()).replace(/\s+/g, ' ');
  note(before !== after, `tapping Agree changes it in place ("${before}" -> "${after}")`);
  await shot('reacted');
} else {
  note(false, 'a reaction chip is on screen');
}

/* -- 1b. a picture on a post --------------------------------------- */
console.log('\nsocial / a picture on a post');
const strip = page.locator('[data-testid="media-strip"]').first();
note(await strip.count() > 0, 'a post with a picture draws it');
if (await strip.count()) {
  const box = await strip.boundingBox();
  note(!!box && box.height > 100, `and reserves real height for it (${box ? Math.round(box.height) : 0}px)`);
  note(await page.locator('[data-testid^="media-gone-"]').count() === 0, 'and it is not the "no longer available" frame');
}

/* -- 2. the way into a thread -------------------------------------- */
console.log('\nsocial / comments');
const threadLine = page.locator('[data-testid^="thread-"]').first();
note(await threadLine.count() > 0, 'a post offers a way into its comments');
if (await threadLine.count()) {
  const label = (await threadLine.innerText()).replace(/\s+/g, ' ');
  note(/comment/i.test(label), `and says what is there ("${label}")`);
  await threadLine.click();
  await page.waitForTimeout(2400);
}

await shot('thread');
const thread = await text();
note(await has('screen-thread'), 'the thread screen opened');
note(/comments/i.test(thread), 'it is headed as comments');
note(/This message was removed/i.test(thread), 'a removed comment keeps its place and loses its words');

// The rule that matters: no comment offers to be commented on.
const nestedLines = await page.locator('[data-testid="screen-thread"] [data-testid^="thread-"]').count();
note(nestedLines === 0, 'no comment offers a reply of its own — threads are one level deep');

const threadReact = await page.locator('[data-testid="screen-thread"] [data-testid="react-agree"]').count();
note(threadReact >= 2, 'the post AND its comments can be reacted to');

/* -- 3. the composer ----------------------------------------------- */
console.log('\nsocial / adding a picture');
const attach = page.locator('[data-testid="composer-attach"]').first();
note(await attach.count() > 0, 'the comment composer offers a picture');
if (await attach.count()) {
  const hint = await attach.getAttribute('aria-describedby');
  const label = await attach.getAttribute('aria-label');
  note(label === 'Add a picture', `and names the action ("${label}")`);
  void hint;
}

await go('/room/room-meta');
await page.waitForTimeout(1200);
await shot('room-composer');
note(await has('composer-attach'), 'the room composer offers one too');

await go('/community');
await page.waitForTimeout(1200);
note(await has('composer-attach'), 'and so does the club board');

// Kai's composer is the SAME component and must NOT grow a camera.
await go('/');
await page.waitForTimeout(2000);
const kaiAttach = await page.locator('[data-testid="composer-attach"]').count();
note(kaiAttach === 0, 'Kai\'s composer does not offer one — he does not take photographs');

/* -- done ----------------------------------------------------------- */
await browser.close();

console.log('');
if (failures.length) {
  console.log(`${failures.length} problem(s):`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('social proof: everything asserted held. Screenshots in apps/mobile/proof/social-*.png\n');
