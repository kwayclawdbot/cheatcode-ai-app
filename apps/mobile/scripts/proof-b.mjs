/**
 * Fixtures proof for lane MOBILE-B (community rooms, composer, contributor,
 * debriefs). Helpers copied from scripts/proof.mjs — that file belongs to lane
 * MOBILE-A and is not edited here.
 *
 *   EXPO_PUBLIC_FIXTURES=1 npx expo start --port 8091
 *   node scripts/proof-b.mjs
 *
 * Everything lands in proof/b-*.png at 390x844.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'proof');
const BASE = process.env.PROOF_BASE ?? 'http://localhost:8091';
const VIEWPORT = { width: 390, height: 844 };

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

const settle = (page, ms = 900) => page.waitForTimeout(ms);

async function open(page, route) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'load', timeout: 180_000 });
  await settle(page, 1600);
}

const tap = async (page, testid, ms = 600) => {
  const el = page.getByTestId(testid).last();
  await el.waitFor({ state: 'visible', timeout: 30_000 });
  await el.click();
  await settle(page, ms);
};

const main = async () => {
  await fs.mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, colorScheme: 'dark' });
  await installHideDevChrome(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  ! page error:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('  ! console:', m.text().slice(0, 240)); });

  try {
    // Community is THREE CHATS (owner, 8 Sept 2026; migration 0045): Traders,
    // Investors, Beginners. It used to be one room per desk — #day-trade,
    // #swing, #investing — and the first two were merged, so the slugs are now
    // `traders`, `investors`, `beginners` and the surviving Traders row keeps
    // the old `room-day-trade` id (see the header of
    // `src/features/community/fixtures.ts`, which mirrors that on purpose).
    // The ids below are therefore opaque keys, not descriptions.
    console.log('\n[1] community home — three chats, one switch');
    await open(page, '/community');
    await shot(page, 'b-01-community');
    // The in-body room rail went on 7 Sept — it was a second day/swing/invest
    // switch under the one in the headbar. The headbar control is the way into
    // another room now, so that is what this taps.
    //
    // THE MODE IS STILL SWING AND THE ROOM IS NOW TRADERS. Day trading and
    // swing trading share a chat after 0045 — the desk is what you trade, the
    // chat is who you talk to — so tapping Swing lands in Traders Chat, and
    // that is the point of the shot rather than a bug in it.
    await tap(page, 'mode-seg-swing', 1600);
    await shot(page, 'b-02-room-traders-from-swing');

    console.log('[2] the traders chat, with its pinned setup');
    await open(page, '/room/room-day-trade');
    await shot(page, 'b-03-room-setup');
    await tap(page, 'composer-kai');
    await shot(page, 'b-04-room-kai-sheet');
    await tap(page, 'kai-cmd-compare', 1200);
    await shot(page, 'b-05-room-kai-compare');

    console.log('[3] verify a member claim');
    await open(page, '/room/room-day-trade');
    await tap(page, 'message-m-5');            // select a claim
    await tap(page, 'composer-kai');
    await tap(page, 'kai-cmd-verify', 1200);
    await shot(page, 'b-06-room-verify');

    console.log('[4] a room with no setup attached');
    // `room-investing` is Investors Chat's id. Same room, renamed by 0045.
    await open(page, '/room/room-investing');
    await shot(page, 'b-07-room-core');
    await tap(page, 'header-right');
    await shot(page, 'b-08-room-options');

    console.log('[5] structured composer');
    await open(page, '/room/room-day-trade/compose');
    await shot(page, 'b-09-compose-empty');
    const fill = async (id, text) => {
      const el = page.getByTestId(id).last();
      await el.waitFor({ state: 'visible', timeout: 20_000 });
      await el.fill(text);
    };
    await fill('field-direction_thesis', 'Long META — buyers defending 480, expecting a move to 540.');
    await fill('field-entry_condition', 'Break and hold above 504 with volume.');
    await fill('field-invalidation', 'Close below 460.');
    await fill('field-risk_size', '$58 at planned size · fits daily policy.');
    await settle(page, 400);
    await shot(page, 'b-10-compose-partial');
    await tap(page, 'ask-kai-review', 1400);
    await shot(page, 'b-11-compose-kai-feedback');
    await tap(page, 'assist-review', 800);
    await shot(page, 'b-12-compose-kai-draft');
    await tap(page, 'assist-accept', 800);
    await tap(page, 'disclosure-toggle', 600);
    await shot(page, 'b-13-compose-ready');

    console.log('[6] contributor');
    await open(page, '/contributor/u-jordan');
    await shot(page, 'b-14-contributor');
    // `save-contributor` is gone. It saved the person to an AsyncStorage list
    // on this device, which is what the screen did while there was no follows
    // table; there is one now (migration 0038), so the button is a real Follow
    // and the shot is named for what it shows.
    await tap(page, 'follow-contributor', 900);
    await shot(page, 'b-15-contributor-following');

    console.log('[7] debriefs');
    await open(page, '/debrief');
    await shot(page, 'b-16-debriefs');
    await open(page, '/debrief/db-1');
    await shot(page, 'b-17-debrief');
    await tap(page, 'save-lesson', 1000);
    await shot(page, 'b-18-debrief-saved');
    await page.mouse.wheel(0, 900);
    await settle(page, 700);
    await shot(page, 'b-19-debrief-detail-scrolled');
  } finally {
    await ctx.close();
    await browser.close();
  }
  console.log(`\nproof written to ${OUT}`);
};

main().catch((e) => { console.error(e); process.exit(1); });
