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
    console.log('\n[1] community home');
    await open(page, '/community');
    await shot(page, 'b-01-community');
    await tap(page, 'mode-swing');
    await shot(page, 'b-02-community-swing');
    await tap(page, 'mode-day_trade');

    console.log('[2] setup room');
    await open(page, '/room/room-meta-setup');
    await shot(page, 'b-03-room-setup');
    await tap(page, 'composer-kai');
    await shot(page, 'b-04-room-kai-sheet');
    await tap(page, 'kai-cmd-compare', 1200);
    await shot(page, 'b-05-room-kai-compare');

    console.log('[3] verify a member claim');
    await open(page, '/room/room-meta-setup');
    await tap(page, 'message-m-5');            // select a claim
    await tap(page, 'composer-kai');
    await tap(page, 'kai-cmd-verify', 1200);
    await shot(page, 'b-06-room-verify');

    console.log('[4] core room');
    await open(page, '/room/room-live-setups');
    await shot(page, 'b-07-room-core');
    await tap(page, 'header-right');
    await shot(page, 'b-08-room-options');

    console.log('[5] structured composer');
    await open(page, '/room/room-meta-setup/compose');
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
    await tap(page, 'save-contributor', 800);
    await shot(page, 'b-15-contributor-saved');

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
