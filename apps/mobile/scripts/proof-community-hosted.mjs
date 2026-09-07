/**
 * Community chat, shot SIGNED IN against the HOSTED stack.
 *
 * Fixtures prove the shapes. This proves the thing the owner actually asked
 * about: a real account, a real `staff_role()` answer from the real database,
 * and the moderator's half of the sheet that a fixture cannot conjure.
 *
 *   cd apps/api  && (set -a; . ./.env.prod; set +a; npx next dev -p 3000)
 *   cd apps/mobile
 *   EXPO_PUBLIC_API_BASE=http://localhost:3000 npx expo start --web --port 8100
 *   OWNER_PASSWORD="$(cat ~/.openclaw/secrets/cheatcode_ai_app_owner)" \
 *     PROOF_BASE=http://localhost:8100 node scripts/proof-community-hosted.mjs
 *
 * The owner's account carries staff role `owner`, so it sees everything a
 * moderator sees and everything an admin sees. What it proves:
 *
 *   · the "+" on the circles row IS drawn for staff and the sheet opens;
 *   · press and hold a post and the moderator rows are there — Remove, Mute,
 *     Leave it up — none of which a member is offered;
 *   · the board says how fresh it is, honestly.
 *
 * It writes nothing it does not clean up.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'proof');
const BASE = process.env.PROOF_BASE ?? 'http://localhost:8100';
const EMAIL = process.env.OWNER_EMAIL ?? 'kcoffie90@gmail.com';
const PASSWORD = process.env.OWNER_PASSWORD;
const VIEWPORT = { width: 390, height: 844 };

if (!PASSWORD) {
  console.error('Set OWNER_PASSWORD (see ~/.openclaw/secrets/cheatcode_ai_app_owner).');
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });

const failures = [];
const note = (ok, what) => {
  console.log(`  ${ok ? '✓' : '✗'} ${what}`);
  if (!ok) failures.push(what);
};

/**
 * WHY THE SECURITY FLAGS.
 *
 * This harness serves the app from :8100 and the API from :3000 — two origins.
 * In production they are ONE: the app calls a relative `/api/...` path and
 * Vercel rewrites it, which is the whole reason that rewrite exists (iOS blocks
 * the cross-origin call otherwise). So the preflight this harness would trip is
 * an artefact of running the two halves on different ports on a laptop, not
 * anything a phone ever meets. The flags remove the artefact; nothing about the
 * app's own behaviour is relaxed by them.
 */
const browser = await chromium.launch({
  args: ['--disable-web-security', '--disable-site-isolation-trials'],
});
const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, bypassCSP: true });
const page = await context.newPage();
page.on('pageerror', (e) => failures.push(`page error: ${e.message}`));

const shot = (name) => page.screenshot({ path: path.join(OUT, `community-hosted-${name}.png`), fullPage: true });
const has = (id) => page.locator(`[data-testid="${id}"]`).count().then((n) => n > 0);
const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');

/* -- sign in ------------------------------------------------------- */
console.log('\nhosted / sign in as the owner');
await page.goto(`${BASE}/sign-in`, { waitUntil: 'domcontentloaded' });
await page.locator('[data-testid="screen-sign-in"]').waitFor({ timeout: 60_000 });
await page.waitForTimeout(1500);
await shot('sign-in');
{
  const email = page.locator('input[data-testid="field-email"]').first();
  const pw = page.locator('input[data-testid="field-password"]').first();
  note((await email.count()) > 0 && (await pw.count()) > 0, 'the sign-in form is there');
  await email.fill(EMAIL);
  await pw.fill(PASSWORD);
  await page.locator('[data-testid="cta-sign-in"]').click();
  await page.waitForTimeout(11000);
  // Signed in = we are no longer on the sign-in screen. Matching on copy is a
  // false negative waiting to happen; the app's own screen id is the fact.
  const stillOnSignIn = await has('screen-sign-in');
  note(!stillOnSignIn, 'and it accepted the credentials');
}

/* -- the board, with real data ------------------------------------- */
console.log('\nhosted / the board');
await page.goto(`${BASE}/community`, { waitUntil: 'domcontentloaded' });
await page.locator('[data-testid="screen-community"]').waitFor({ timeout: 60_000 });
// The freshness label appears when the room's transport has settled, which is
// the thing this block is here to read. Waiting for it rather than for a clock.
await page.locator('[data-testid="club-freshness"]').waitFor({ timeout: 30_000 }).catch(() => {});
await page.waitForTimeout(1500);
await shot('board');
{
  const t = await text();
  note(await has('screen-community'), 'Community renders against hosted data');
  note(await has('club-composer'), 'with a composer');
  const presence = await page.locator('[data-testid="club-presence"]').innerText().catch(() => '');
  note(!/\d+ online/.test(presence), `the header does not invent presence: "${presence}"`);
  const fresh = await has('club-freshness');
  const label = fresh ? await page.locator('[data-testid="club-freshness"]').innerText() : '(none)';
  /**
   * "REFRESHING EVERY 5S" NO LONGER RENDERS (owner, 7 Sept): the interval was
   * the app narrating its own plumbing in the header of every room, all day.
   * LIVE still renders, because that one changes what you do — a conversation
   * arriving as it is typed is different from one arriving five seconds late.
   *
   * SO THE ASSERTION IS INVERTED, NOT DELETED. The bug this block caught is
   * still the bug worth catching: Supabase accepts a postgres_changes
   * subscription to a table that is not in the publication, so SUBSCRIBED was
   * read as "Live" while nothing would ever arrive. Claiming Live falsely is
   * exactly as wrong as it was before — what changed is that the honest
   * polling state is now SILENT rather than labelled, so the check is that the
   * label is either absent or says Live, and never says anything else.
   */
  note(!fresh || /Live/i.test(label), `freshness is silent while polling, and only ever claims Live: "${label}"`);
  note(!/Refreshing every 5s/.test(t), 'the interval is no longer narrated in the header');
  // The old copy. It said the same thing to every room on every day and named
  // none of them; the replacement names the room and says what to do about it.
  note(!/Nothing has been posted here today/.test(t), 'the old blanket empty-state copy is gone');
}

/* -- staff sees the "+" -------------------------------------------- */
console.log('\nhosted / staff may open a circle');
{
  note(await has('circle-create'), 'the "+" IS drawn for a staff account');
  if (await has('circle-create')) {
    await page.locator('[data-testid="circle-create"]').click();
    await page.waitForTimeout(900);
    await shot('create-circle');
    const t = await text();
    note(await has('create-circle-sheet'), 'and opens the real sheet');
    note(!(await has('create-circle-gated')), 'with no refusal copy, because this account may');
    note(!/premium/i.test(t), 'and no premium upsell anywhere in it');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }
}

/* -- an empty room, and then a real one ---------------------------- */
console.log('\nhosted / the empty room says so');
await page.goto(`${BASE}/community`, { waitUntil: 'domcontentloaded' });
await page.locator('[data-testid="screen-community"]').waitFor({ timeout: 60_000 });
await page.waitForTimeout(3500);
{
  const n = await page.locator('[data-testid^="club-message-"]').count();
  if (n === 0) {
    note(
      /Nobody has posted in/.test(await text()),
      'a room with nothing in it says so, in words, and names the room'
    );
    await shot('empty-room');
  } else {
    console.log(`  (the room already has ${n} posts — skipping the empty-state check)`);
  }
}

/* -- post it, moderate it, and put it back ------------------------- */
console.log('\nhosted / post, then moderate');
const STAMP = `proof ${Date.now()}: watching the open here, flat, no position`;
{
  await page.locator('[data-testid="composer-input"]').fill(STAMP);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(6000);
  const t = await text();
  note(t.includes(STAMP), 'the post appears in the room it was written in');
  await shot('posted');

  // The EXACT post this run wrote. `hasText: 'proof '` would match a leftover
  // from an earlier run and quietly moderate the wrong message — which is what
  // it did, and which is exactly the class of mistake this script exists to
  // catch in the app.
  const mine = page.locator('[data-testid^="club-message-"]').filter({ hasText: STAMP }).first();
  note((await mine.count()) > 0, 'and is a real message row');
  await mine.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  const box = await mine.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + 18);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await page.waitForTimeout(1200);
  await shot('actions-staff');

  note(await has('message-actions-sheet'), 'press and hold opens the sheet');
  const excerpt = (await page.locator('[data-testid="message-actions-sheet"]').innerText()).replace(/\s+/g, ' ');
  console.log(`  [debug] the sheet is acting on: "${excerpt.slice(0, 160)}"`);
  note(excerpt.includes(STAMP), 'and the sheet names the post that was just written, not another one');
  note(await has('action-remove'), 'staff is offered Remove');
  note(await has('action-keep'), 'and Leave it up, so a cleared report can be closed');
  note(!(await has('action-report')), 'and is not offered Report on their own post');
  note(/Nothing is deleted/i.test(await text()), 'and the sheet says removing does not delete');

  await page.locator('[data-testid="action-remove"]').click();
  await page.waitForTimeout(600);
  await page.locator('[data-testid="message-action-reason"]').fill('Proof run. Removing the post this script just wrote.');
  await shot('remove-reason');
  await page.locator('[data-testid="message-action-confirm"]').click();
  await page.waitForTimeout(4000);
  await shot('removed-result');

  const result = await page.locator('[data-testid="message-action-result"]').innerText().catch(() => '');
  console.log(`  server said: "${result}"`);
  note(/Removed/i.test(result), 'the server confirms the removal, in its own words');

  await page.locator('[data-testid="message-action-done"]').click();
  await page.waitForTimeout(3000);
  await shot('after-removal');
  const after = await text();
  if (after.includes(STAMP)) {
    const at = after.indexOf(STAMP);
    console.log(`  [debug] STAMP still on screen near: ...${after.slice(Math.max(0, at - 120), at + 120)}...`);
  }
  note(!after.includes(STAMP), 'the words are gone from the room');
  note(/Removed by a moderator/.test(after), 'and the row says why there is a gap');
}

await browser.close();
console.log(`\n${failures.length ? `${failures.length} FAILED` : 'all checks passed'}`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
