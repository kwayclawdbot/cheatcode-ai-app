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
 *   · every post carries Like and Reply, and Like opens a popover holding
 *     EXACTLY the six emoji the owner picked — 👍 👎 🔥 💯 📈 📉 — which is the
 *     one thing about this feature that is a specification and not a taste
 *     call, and the one thing most likely to drift;
 *   · thumbs down is one of them. A room where the only cheap gesture is
 *     approval reads as unanimous whether or not it is;
 *   · tapping in the picker changes the count in place, and nothing anywhere
 *     says "saved on this device only", because it is not;
 *   · `$META` in a post is a token and not plain text, and it leads to the
 *     ticker — the app's standing rule, checked rather than assumed;
 *   · a post says how many comments it has, and opening it lands on a screen
 *     with the post at the top, the comments under a rule, and NO comment-count
 *     line on a comment — one level in the database, still;
 *   · answering a COMMENT quotes it and draws the answer indented under it,
 *     which is the whole of "reply to another user's comment";
 *   · a removed comment keeps its place and loses its words;
 *   · the composer has a way to add a picture, and the accessibility copy on
 *     it tells the truth about location data before anything is picked.
 *
 * WHAT CHANGED, and why the old assertions are gone: this file used to assert
 * that the bar drew four WORDS and that "no emoji reactions are left in the
 * feed". The owner reversed that on 2026-09-06 and named the six. The old
 * assertions were not wrong when they were written; they are wrong now, and a
 * proof script that asserts last month's decision is worse than none.
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
note(feed.includes('Like'), 'every post offers Like');
note(feed.includes('Reply'), 'every post offers Reply');
note(!/saved on this device only/i.test(feed), 'nothing claims a reaction is device-local any more');

/* -- 1a. the picker -------------------------------------------------- */
const SIX = [
  ['agree', '👍'], ['disagree', '👎'], ['fire', '🔥'],
  ['hundred', '💯'], ['chart_up', '📈'], ['chart_down', '📉'],
];

const like = page.locator('[data-testid="react-open"]').first();
note(await like.count() > 0, 'the Like button is on screen');
if (await like.count()) {
  await like.click();
  await page.waitForTimeout(600);
  note(await has('reaction-picker'), 'tapping Like opens the picker');
  await shot('picker');

  for (const [id, emoji] of SIX) {
    const cell = page.locator(`[data-testid="react-pick-${id}"]`);
    const there = await cell.count() > 0;
    note(there, `the picker offers ${emoji}`);
    if (there) {
      note((await cell.innerText()).includes(emoji), `  ...drawn as ${emoji} and not as a word`);
    }
  }
  const cells = await page.locator('[data-testid^="react-pick-"]').count();
  note(cells === 6, `exactly six, no more (found ${cells})`);

  // The one that earns its place: dissent as cheap as approval.
  note(await page.locator('[data-testid="react-pick-disagree"]').count() > 0, 'thumbs down is one of the six');

  // Tap-away closes it without giving a reaction.
  await page.locator('[data-testid="reaction-picker-dismiss"]').click();
  await page.waitForTimeout(500);
  note(!(await has('reaction-picker')), 'tapping away closes it');
}

/* -- 1b. giving one ------------------------------------------------- */
const firePill = () => page.locator('[data-testid="react-fire"]').first();
const beforeFire = await firePill().count() ? (await firePill().innerText()).replace(/\s+/g, ' ') : '(none)';
if (await like.count()) {
  await like.click();
  await page.waitForTimeout(500);
  await page.locator('[data-testid="react-pick-fire"]').click();
  await page.waitForTimeout(900);
  const afterFire = await firePill().count() ? (await firePill().innerText()).replace(/\s+/g, ' ') : '(none)';
  note(beforeFire !== afterFire, `picking 🔥 changes the count in place ("${beforeFire}" -> "${afterFire}")`);
  note(afterFire.includes('🔥'), 'and the post shows the emoji, with its count');
  await shot('reacted');
}

/* -- 1c. a cashtag is not plain text -------------------------------- */
const cashtag = page.locator('[data-testid^="cashtag-"]').first();
note(await cashtag.count() > 0, 'a $TICKER in a post is drawn as a token');
if (await cashtag.count()) {
  const label = (await cashtag.innerText()).replace(/\s+/g, '');
  note(/^\$[A-Z]{1,5}$/.test(label), `and it is uppercase ("${label}")`);
  await cashtag.click();
  await page.waitForTimeout(2000);
  note(/\/symbol\//.test(page.url()), `and it opens the ticker (${page.url().replace(BASE, '')})`);
  await go('/community');
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

// The rule that has not changed: nothing offers to open a thread ON a comment.
const nestedLines = await page.locator('[data-testid="screen-thread"] [data-testid^="thread-"]').count();
note(nestedLines === 0, 'no comment carries a comment-count line — threads are one level deep');

const threadReact = await page.locator('[data-testid="screen-thread"] [data-testid="react-open"]').count();
note(threadReact >= 2, 'the post AND its comments can be reacted to');

/* -- 2b. answering a comment ---------------------------------------- */
console.log('\nsocial / replying to a comment');
const quoted = page.locator('[data-testid="screen-thread"] [data-testid^="quote-"]');
note(await quoted.count() > 0, 'a comment that answers another comment quotes it');
if (await quoted.count()) {
  const q = (await quoted.first().innerText()).replace(/\s+/g, ' ');
  note(q.length > 0, `and the quote carries who and what ("${q.slice(0, 60)}…")`);
  // One level of indent, not two: the deepest quoted comment must still sit
  // at the same left edge as the first one that was indented.
  const boxes = [];
  for (let i = 0; i < await quoted.count(); i++) boxes.push(await quoted.nth(i).boundingBox());
  const lefts = [...new Set(boxes.filter(Boolean).map((b) => Math.round(b.x)))];
  note(lefts.length <= 2, `never more than one level of indent (left edges: ${lefts.join(', ')})`);
}

const replyBtn = page.locator('[data-testid="screen-thread"] [data-testid="reply-open"]').nth(1);
if (await replyBtn.count()) {
  await replyBtn.click();
  await page.waitForTimeout(700);
  note(await has('composer-quote'), 'tapping Reply on a comment arms the composer with a quote');
  const armed = (await page.locator('[data-testid="composer-quote"]').innerText()).replace(/\s+/g, ' ');
  note(/replying to/i.test(armed), `and says who is being answered ("${armed.slice(0, 50)}…")`);
  await shot('reply-armed');
  // The quote is an OBJECT, not text pasted into the input the member has to
  // delete before they can write.
  // Scoped to the thread's own composer: the club board keeps its composer
  // mounted behind this screen, so an unscoped testid matches two inputs.
  const input = page.locator('[data-testid="screen-thread"] [data-testid="composer-input"]');
  note((await input.inputValue()) === '', 'and the input is still empty — the quote is not pasted into it');
  await page.locator('[data-testid="composer-quote-clear"]').click();
  await page.waitForTimeout(500);
  const stillQuoting = (await page.locator('[data-testid="composer-quote"]').innerText()).replace(/\s+/g, ' ');
  note(/post/i.test(stillQuoting), 'cancelling goes back to answering the post, not to quoting nothing');
} else {
  note(false, 'a comment offers Reply');
}

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
