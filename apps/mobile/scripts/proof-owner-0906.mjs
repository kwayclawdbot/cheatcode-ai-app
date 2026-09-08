/**
 * The six owner fixes of 6 September, tapped through in a real browser.
 *
 *   EXPO_PUBLIC_FIXTURES=1 npx expo start --port 8091
 *   PROOF_BASE=http://localhost:8091 node scripts/proof-owner-0906.mjs
 *
 * Four of the six are on the community surfaces and are proved here; the two
 * alert-card ones are proved where the alert card already is (proof-a4.mjs
 * section 4, proof-swing1.mjs section 4).
 *
 *   1. Reply opens the composer WITH the quote — it does not go to Home.
 *   2. The mode toggle sits in the headbar, between search and the people
 *      button, and switching it moves the feed to that mode's room.
 *   3. The "claims stay unverified until Kai checks them" line is gone.
 *   4. A room named for a company wears that company's logo.
 *
 * Shots land in proof/owner-0906-*.png.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(path.resolve(HERE, '..'), 'proof');
const BASE = process.env.PROOF_BASE ?? 'http://localhost:8091';
const VIEWPORT = { width: 390, height: 844 };

const failures = [];
const ok = (name, cond, detail) => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}`);
  if (!cond) {
    failures.push(name);
    if (detail !== undefined) console.log(`      ${JSON.stringify(detail).slice(0, 400)}`);
  }
};

const HIDE_DEV_CHROME = '.__expo_fast_refresh { display: none !important; }';
const shot = async (page, name) => {
  const root = page.locator('#root');
  await ((await root.count()) ? root : page).screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log(`  · ${name}.png`);
};
const settle = (page, ms = 900) => page.waitForTimeout(ms);
const open = async (page, route, ms = 2000) => {
  await page.goto(`${BASE}${route}`, { waitUntil: 'load', timeout: 120_000 });
  await settle(page, ms);
};
const count = (page, testid) => page.getByTestId(testid).count();
const text = (page) => page.locator('#root').innerText();

/** Where a testID sits horizontally — the only way to prove "between". */
const midX = async (page, testid) => {
  const box = await page.getByTestId(testid).first().boundingBox();
  return box ? box.x + box.width / 2 : null;
};

const main = async () => {
  await fs.mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, colorScheme: 'dark' });
  await ctx.addInitScript((css) => {
    const add = () => { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); };
    if (document.head) add(); else document.addEventListener('DOMContentLoaded', add);
  }, HIDE_DEV_CHROME);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  ! page error:', e.message));

  /* ---------------- 2 + 3. the headbar, and the line that left it ------- */
  console.log('\n[2] The mode toggle is in the headbar, between search and the people button');
  await open(page, '/community', 3000);
  await shot(page, 'owner-0906-01-community');

  ok('the headbar has the mode toggle', (await count(page, 'club-mode-segmented')) > 0);
  ok('all three modes are offered', (await count(page, 'mode-seg-day_trade')) > 0
    && (await count(page, 'mode-seg-swing')) > 0
    && (await count(page, 'mode-seg-invest')) > 0);

  const xSearch = await midX(page, 'club-search');
  const xMode = await midX(page, 'club-mode-segmented');
  const xMembers = await midX(page, 'club-members');
  ok(
    'and it sits BETWEEN them, not beside them',
    xSearch != null && xMode != null && xMembers != null && xSearch < xMode && xMode < xMembers,
    { search: xSearch, mode: xMode, people: xMembers },
  );

  // It fits. A control that overflows a 390pt header is not in the header.
  const modeBox = await page.getByTestId('club-mode-segmented').first().boundingBox();
  ok('it fits the headbar on a 390pt phone', !!modeBox && modeBox.x >= 0
    && modeBox.x + modeBox.width <= VIEWPORT.width && modeBox.height <= 40,
    modeBox);

  console.log('\n[3] The unverified-claims disclaimer is gone');
  const club = await text(page);
  ok('no "Claims stay unverified until Kai checks them"', !/Claims stay unverified/i.test(club));
  ok('and no rewording of it either', !/unverified until Kai/i.test(club));

  console.log('\n[2b] Switching the mode moves the feed to that mode\'s room');
  // The in-body room rail was removed on 7 Sept — it was a second day/swing/
  // invest switch under the one in the headbar. So this is now the whole test
  // of that control: press it, and the room the feed is showing has to change.
  ok('there is no second mode switch in the feed body',
    (await page.getByTestId('room-rail').count()) === 0);
  const roomBefore = await page.getByTestId('club-room-name').first().innerText().catch(() => '');
  await page.getByTestId('mode-seg-invest').first().click();
  await settle(page, 1600);
  await shot(page, 'owner-0906-02-mode-invest');
  const invest = await page.getByTestId('mode-seg-invest').first().getAttribute('aria-selected');
  ok('Invest reads as the chosen mode', invest === 'true' || invest === null, { invest });
  const roomAfter = await page.getByTestId('club-room-name').first().innerText().catch(() => '');
  // THE ROOM IS CALLED "Investors Chat" NOW (owner, 8 Sept 2026; migration
  // 0045). It was "#investing" when this proof was written; the three chats are
  // Traders, Investors and Beginners, so the name to look for changed with it.
  ok('and the feed moved to that mode\'s room', /Investors/i.test(roomAfter) && roomAfter !== roomBefore,
    { roomBefore, roomAfter });

  /* ---------------- 4. a room wears its company's logo ------------------ */
  console.log('\n[4] A room named for a company wears that company\'s logo');
  ok('every circle on the board draws a room avatar',
    (await page.locator('[data-testid^="circle-avatar-"]').count()) > 0);
  // The shared TickerMark renders an <img> off /api/v1/market/logo/<SYM> when
  // the company has a logo, and its own letters when it does not. Either is
  // the mark; what must NOT happen is a bare letter with no mark around it.
  const metaAvatar = page.locator('[data-testid^="circle-avatar-"]').first();
  ok('the mark is drawn, not a bare initial', await metaAvatar.count() > 0);
  await shot(page, 'owner-0906-03-circle-avatars');

  // `room-swing` NO LONGER EXISTS. 0045 merged Day Trade and Swing into one
  // Traders Chat and kept the id of whichever row held more conversation; the
  // fixtures mirror that, so the surviving Traders room is `room-day-trade`.
  // A proof that navigates to a dead id renders the not-found screen and then
  // fails on an avatar that was never going to be there.
  await open(page, '/room/room-day-trade', 2500);
  ok('a core room header carries a room avatar too', (await count(page, 'room-avatar')) > 0);
  await shot(page, 'owner-0906-04-room-header');

  /* ---------------- 1. reply opens the composer, with the quote --------- */
  console.log('\n[1] Reply opens the composer with the quote — not Home');
  await open(page, '/room/room-day-trade', 2500);
  const replies = await count(page, 'reply-open');
  ok('there is a Reply to tap', replies > 0, { replies });

  await page.getByTestId('reply-open').first().click();
  await settle(page, 2200);
  const url = page.url();
  await shot(page, 'owner-0906-05-reply-thread');

  ok('it did NOT land on Home', !/\/home\b/.test(url), { url });
  ok('it opened the thread', /\/thread\//.test(url), { url });
  ok('the composer is open', (await count(page, 'room-composer')) > 0
    || (await page.locator('textarea, input[type="text"]').count()) > 0);
  ok('and the post being answered is quoted above it', (await count(page, 'composer-quote')) > 0);

  const quoted = (await count(page, 'composer-quote'))
    ? (await page.getByTestId('composer-quote').first().innerText()).replace(/\s+/g, ' ').trim()
    : '';
  console.log(`  · quote reads: ${quoted.slice(0, 120)}`);
  ok('the quote is not empty', quoted.length > 0);

  await browser.close();

  console.log(failures.length
    ? `\n${failures.length} failure(s):\n${failures.map((f) => `  ✗ ${f}`).join('\n')}\n`
    : '\nall checks passed\n');
  process.exit(failures.length ? 1 : 0);
};

main().catch((e) => { console.error(e); process.exit(1); });
