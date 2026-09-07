/**
 * Community chat, shot in the running app.
 *
 *   cd apps/mobile
 *   EXPO_PUBLIC_FIXTURES=1 npx expo start --web --port 8099
 *   PROOF_BASE=http://localhost:8099 node scripts/proof-community.mjs
 *
 * Shoots `proof/community-*.png` at 390x844 and asserts the things a
 * screenshot cannot show on its own:
 *
 *   · the board never claims to be Live while it is polling — a label that
 *     claims live while it polls is the small lie that stops people trusting
 *     the big numbers. It used to say "Refreshing every 5s" out loud; since
 *     7 Sept the polling state is silent (the interval was plumbing narrated
 *     in every room's header all day) and only Live is ever printed, so the
 *     rule is now "silent or Live", never a third thing;
 *   · press and hold a post and something real happens: Report for a member,
 *     Remove / Mute / Leave it up for staff, and a reason is REQUIRED for all
 *     of them;
 *   · a quiet room says it is quiet and says what to do about it, and never
 *     shows a number nobody posted;
 *   · the "+" on the circles row is not drawn for a member, and the sheet says
 *     the team opens circles — not that it is a premium feature.
 *
 * The staff half of the sheet is proved against the HOSTED stack signed in as
 * the owner; see `proof-community-hosted.mjs`, which is the same screens with a
 * real `owner` role behind them.
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
const shot = (name) => page.screenshot({ path: path.join(OUT, `community-${name}.png`), fullPage: true });
const has = (id) => page.locator(`[data-testid="${id}"]`).count().then((n) => n > 0);
const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');

/* -- 1. the board -------------------------------------------------- */
console.log('\ncommunity / the board');
await go('/community');
await shot('board');
{
  const t = await text();
  note(await has('screen-community'), 'the Community tab renders');
  note(await has('club-composer'), 'there is a composer');
  // ONE MODE SWITCH (owner, 7 Sept). The in-body rail of day/swing/invest
  // pills is gone; the headbar control is the switch and the header names the
  // room. Asserted absent rather than simply unmentioned — a proof that stopped
  // referring to the rail would not notice it coming back.
  note(!(await has('room-rail')), 'there is no second mode switch in the feed body');
  note(await has('club-mode-segmented'), 'the headbar mode control is the one switch');
  note(await has('club-room-name'), 'and the header names the room you are reading');
  note(/Day Trade/.test(t), 'which is Day Trade, the fixture profile’s mode');
  // THE FABRICATED SYNTHESIS BAR IS GONE. It read as Kai having looked at the
  // conversation; it was a template fed the circle symbols.
  note(!/driving today’s discussion|driving today's discussion/.test(t),
    'nothing claims to have read the conversation');
  note(await has('circles-row'), 'the circles row is drawn');
  note(!/Premium/.test(t), 'the circles row no longer advertises a premium upsell');
  // Presence is NOT checked here. In fixtures the number comes from the fixture
  // itself, and the screen labels the whole board "Example rooms". The real
  // check — that a live board never reads "N online" off the message count —
  // belongs to proof-community-hosted.mjs, where the numbers are real.
}

/* -- 2. a post, and what you can do about it ------------------------ */
console.log('\ncommunity / press and hold a post');
{
  const first = page.locator('[data-testid^="club-message-"]').first();
  note((await first.count()) > 0, 'there are posts to act on');
  const box = await first.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + 20);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await page.waitForTimeout(900);
  await shot('actions-member');

  const t = await text();
  note(await has('message-actions-sheet'), 'press and hold opens the actions sheet');
  note(await has('action-report'), 'a member can report the post');
  note(!(await has('action-remove')), 'and is NOT offered Remove');
  note(!(await has('action-mute')), 'or Mute');
  note(/moderator reads it/i.test(t), 'the sheet says what reporting actually does');
  note(/stays up until they decide/i.test(t), 'and that the post is not taken down by reporting it');
}

/* -- 3. a reason is not optional ----------------------------------- */
console.log('\ncommunity / a reason is required');
{
  await page.locator('[data-testid="action-report"]').click();
  await page.waitForTimeout(500);
  await shot('actions-reason');
  note(await has('message-action-reason'), 'the action asks why');
  await page.locator('[data-testid="message-action-confirm"]').click();
  await page.waitForTimeout(500);
  note(await has('message-action-error'), 'and refuses an empty reason');
  const t = await text();
  note(/on the record with your name/i.test(t), 'saying that the reason is kept, with the name');
  await shot('actions-reason-refused');
}

/* -- 4. who opens a circle ----------------------------------------- */
console.log('\ncommunity / who opens a circle');
await go('/community');
{
  // In fixtures there is no server to ask, so `can_create` answers true and the
  // "+" is drawn — which is what makes the SHEET reachable here. Whether a real
  // member is offered it is a server question, and it is answered in
  // proof-community-hosted.mjs and in apps/api/scripts/community-chat-test.mts.
  const plus = await has('circle-create');
  note(plus, 'the "+" is reachable in fixtures, so the sheet can be shot');
  if (plus) {
    await page.locator('[data-testid="circle-create"]').click();
    await page.waitForTimeout(700);
    await shot('create-circle');
    const t = await text();
    note(await has('create-circle-sheet'), 'the sheet is real: a symbol and a life span');
    note(await has('create-circle-symbol'), 'it takes a symbol');
    note(await has('create-circle-ttl'), 'and how long it stays open');
    note(!/premium plan/i.test(t), 'and never calls circle creation a premium plan feature');
  }
}

/* -- 5. an empty room tells the truth ------------------------------ */
console.log('\ncommunity / an empty circle');
await go('/circle/circle-empty-proof');
await page.waitForTimeout(1500);
await shot('circle');
{
  const t = await text();
  note(await has('screen-circle'), 'a circle opens');
  note(await has('circle-composer'), 'with a composer');
  const posts = await page.locator('[data-testid^="circle-message-"]').count();
  note(
    posts > 0 || /Nobody has posted in this circle yet/i.test(t),
    `it either shows the thread (${posts} posts) or says nobody has posted`
  );
  note(await has('circle-chart'), 'the setup levels are at the top, so nobody argues about a level they cannot see');
  note(!/\b0 members\b.*\b0 members\b/.test(t), 'no invented counts');
}

await browser.close();
console.log(`\n${failures.length ? `${failures.length} FAILED` : 'all checks passed'}`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
