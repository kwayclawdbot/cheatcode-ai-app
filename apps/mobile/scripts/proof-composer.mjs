/**
 * THE COMPOSER, PROVEN IN THE BROWSER AGAINST THE REAL SERVICE.
 *
 *   cd apps/api && npm run dev                       (local Supabase up)
 *   cd apps/mobile && EXPO_PUBLIC_API_BASE=http://localhost:3000 \
 *     EXPO_PUBLIC_SUPABASE_URL=http://localhost:54321 \
 *     EXPO_PUBLIC_SUPABASE_ANON_KEY=… npx expo start --web --port 8098
 *   node scripts/proof-composer.mjs                  (PROOF_BASE overrides)
 *
 * WHY THIS EXISTS AND WHY IT IS NOT A UNIT TEST. The owner reported "the image
 * uploads don't work — they don't accept the image formats". The formats were
 * never the problem and neither was the server: on the web, `FormData.append`
 * stringifies React Native's `{uri,name,type}` file object to the text
 * "[object Object]", so nothing was ever attached and the API said, correctly,
 * that no picture arrived. A mock of `fetch` would have passed the whole time.
 * The only thing that proves this is a REAL file going through the REAL picker,
 * the REAL multipart request and the REAL service, so that is what this does:
 * it drives the browser's own file chooser with a JPEG and a PNG on disk and
 * waits for the thumbnail to stop being dim.
 *
 * IT ALSO ASSERTS THE TWO CONTROLS THAT CHANGED WITH IT:
 *   · the primary circle is SEND in every state — dimmed and disabled while
 *     there is nothing to post, lit the moment there is. It used to be a
 *     microphone with no speech-to-text behind it anywhere in the app.
 *   · adding things is one + that opens a menu of NAMED rows, not a bar of
 *     unlabelled glyphs, and the rows say what they will not do (video) and
 *     what they cost (Kai) before they are tapped.
 *
 * Everything it uploads is left for the API's orphan sweep — nothing is posted
 * into a room, so there is nothing to clean up.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'proof');
const BASE = process.env.PROOF_BASE ?? 'http://localhost:8098';
const EMAIL = `proofcomposer+${Date.now()}@cheatcode.test`;
const PASSWORD = 'paper-money-first';

const failures = [];
const ok = (what, pass, extra) => {
  console.log(`  ${pass ? '✓' : '✗'} ${what}${extra ? ` — ${extra}` : ''}`);
  if (!pass) failures.push(what);
};

const on = (page, screen, testid) => page.locator(`[data-testid="${screen}"] [data-testid="${testid}"]`).last();
const tap = async (page, screen, testid) => {
  const el = on(page, screen, testid);
  await el.waitFor({ state: 'visible', timeout: 40_000 });
  await el.click();
};
const arrive = async (page, screen) => {
  await page.locator(`[data-testid="${screen}"]`).last().waitFor({ state: 'visible', timeout: 40_000 });
  await page.waitForTimeout(800);
};
const go = async (page, route, wait = 3000) => {
  await page.goto(`${BASE}${route}`, { waitUntil: 'load', timeout: 180_000 });
  await page.waitForTimeout(wait);
};
const shot = async (p, n) => {
  const root = p.locator('#root');
  await ((await root.count()) ? root : p).screenshot({ path: path.join(OUT, `${n}.png`) });
  console.log(`  · ${n}.png`);
};

const HIDE_DEV_CHROME = `.__expo_fast_refresh { display: none !important; }`;

/**
 * Two real files on disk, made from a screenshot this repo already has, so the
 * script carries no binary of its own. One JPEG and one PNG: those are the two
 * types the service accepts (apps/api media limits), and the client re-encodes
 * everything to JPEG on the way out, so these two are the whole matrix.
 */
async function makeFixtures() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'composer-proof-'));
  const source = path.join(OUT, 'community-board.png');
  const { execFile } = await import('node:child_process');
  const run = (args) => new Promise((res, rej) =>
    execFile('sips', args, (e) => (e ? rej(e) : res())));
  const png = path.join(dir, 'chart-shot.png');
  const jpg = path.join(dir, 'desk-photo.jpg');
  await run(['-Z', '900', '-s', 'format', 'png', source, '--out', png]);
  await run(['-Z', '900', '-s', 'format', 'jpeg', source, '--out', jpg]);
  return { dir, png, jpg };
}

/**
 * Pick one file through the app's own button and wait for it to LAND.
 *
 * "Landed" is not "the thumbnail appeared" — the thumbnail is the local file
 * and draws instantly whether or not anything uploaded. It is the tray's
 * spinner going away with no failure note under it, which only happens when
 * the API answered with an asset id.
 */
async function uploadThrough(page, file, label) {
  const before = await page.locator('[data-testid^="composer-attachment-remove-"]').count();

  await page.locator('[data-testid="composer-plus"]').last().click();
  await page.waitForTimeout(500);
  const chooser = page.waitForEvent('filechooser', { timeout: 20_000 });
  await page.locator('[data-testid="composer-action-photo"]').last().click();
  (await chooser).setFiles(file);

  await page.waitForFunction(
    (n) => document.querySelectorAll('[data-testid^="composer-attachment-remove-"]').length > n,
    before,
    { timeout: 30_000 },
  );
  // The upload starts on pick, not on Send, so this is the whole round trip.
  await page.waitForTimeout(9000);

  const tray = page.locator('[data-testid="composer-attachments"]').last();
  const trayText = (await tray.count()) ? (await tray.innerText()).replace(/\s+/g, ' ').trim() : '';
  const spinners = await tray.locator('[role="progressbar"], .css-progressbar').count().catch(() => 0);

  ok(`${label} uploaded through the real service`,
    !/would not upload|could not be opened|no picture arrived|not connected/i.test(trayText) && spinners === 0,
    trayText ? `tray says: "${trayText.slice(0, 120)}"` : 'tray is clean');
  return trayText;
}

const main = async () => {
  await fs.mkdir(OUT, { recursive: true });
  const fixtures = await makeFixtures();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  await ctx.addInitScript((css) => {
    const add = () => {
      const s = document.createElement('style');
      s.textContent = css;
      document.head.appendChild(s);
    };
    if (document.head) add(); else document.addEventListener('DOMContentLoaded', add);
  }, HIDE_DEV_CHROME);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  ! page error:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('  ! console:', m.text().slice(0, 180)); });

  const uploads = [];
  page.on('response', async (r) => {
    if (r.url().includes('/api/v1/media')) uploads.push({ status: r.status(), url: r.url() });
  });

  try {
    console.log(`live user: ${EMAIL}`);
    await go(page, '/welcome', 2500);
    await tap(page, 'screen-welcome', 'cta-get-started');
    await arrive(page, 'screen-sign-up');
    await on(page, 'screen-sign-up', 'field-email').fill(EMAIL);
    await on(page, 'screen-sign-up', 'field-password').fill(PASSWORD);
    await tap(page, 'screen-sign-up', 'cta-create');

    /**
     * Onboarding is walked by what is ON SCREEN, not by a memorised list of
     * steps. It has been re-cut twice this month; a script that hardcodes the
     * order fails on somebody else's unrelated change and says nothing useful
     * about the composer, which is the only thing this file is here to prove.
     */
    console.log('\n[1] onboarding');
    for (let i = 0; i < 12; i++) {
      if (/\/(home|community)\b/.test(page.url()) || (await page.locator('[data-testid="screen-home"]').count())) break;
      const screens = await page.evaluate(() =>
        [...document.querySelectorAll('[data-testid^="screen-"]')].map((e) => e.getAttribute('data-testid')));
      const cur = screens[screens.length - 1];
      if (!cur) { await page.waitForTimeout(1500); continue; }
      const ids = await page.evaluate((s) => {
        const root = [...document.querySelectorAll(`[data-testid="${s}"]`)].pop();
        return root ? [...new Set([...root.querySelectorAll('[data-testid]')].map((e) => e.getAttribute('data-testid')))] : [];
      }, cur);
      // Posting asks for a username — the club board sends anybody without one
      // here — so this is picked rather than skipped.
      if (ids.includes('username-input')) {
        await on(page, cur, 'username-input').fill(`proof${Date.now()}`.slice(0, 18));
        await page.waitForTimeout(1200);
        await on(page, cur, 'username-save').click({ timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(3000);
        continue;
      }
      const choice = ids.find((t) => /^(goal|risk|mode|funding|level|experience)-/.test(t));
      if (choice) { await on(page, cur, choice).click({ timeout: 8000 }).catch(() => {}); await page.waitForTimeout(700); }
      const forward = ids.find((t) => t.startsWith('cta-')) ?? ids.find((t) => t === 'username-skip');
      if (forward) await on(page, cur, forward).click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(2600);
    }
    console.log(`  · onboarding left us at ${page.url()}`);

    console.log('\n[2] send, not a microphone');
    await go(page, '/community', 4000);
    const send = page.locator('[data-testid="composer-send"]').last();
    ok('the composer has a send button', (await send.count()) > 0);
    ok('there is no microphone anywhere on it',
      (await page.locator('[data-testid="composer-mic"]').count()) === 0);
    ok('and it is disabled while the field is empty',
      (await send.getAttribute('aria-disabled')) === 'true');
    await shot(page, 'composer-01-send-empty');

    await page.locator('[data-testid="composer-input"]').last().fill('Watching 504 into the close.');
    await page.waitForTimeout(600);
    ok('it lights up the moment there is something to post',
      (await send.getAttribute('aria-disabled')) !== 'true');
    await shot(page, 'composer-02-send-ready');
    await page.locator('[data-testid="composer-input"]').last().fill('');
    await page.waitForTimeout(400);

    console.log('\n[3] the + menu');
    await page.locator('[data-testid="composer-plus"]').last().click();
    await page.waitForTimeout(600);
    ok('the + opens a menu', (await page.locator('[data-testid="composer-plus-menu"]').count()) > 0);
    const menu = (await page.locator('[data-testid="composer-plus-menu"]').last().innerText()).replace(/\s+/g, ' ');
    ok('with a named row for a picture', /Add a picture/i.test(menu));
    ok('that says video is not accepted rather than offering it', /video is not accepted/i.test(menu), menu.slice(0, 90));
    ok('and a row for publishing a call', /Publish a call/i.test(menu));
    await shot(page, 'composer-03-plus-menu');
    await page.locator('[data-testid="composer-plus-backdrop"]').click();
    await page.waitForTimeout(500);

    console.log('\n[4] a real JPEG and a real PNG, through the real service');
    await uploadThrough(page, fixtures.jpg, 'a JPEG');
    await shot(page, 'composer-04-jpeg-uploaded');
    await uploadThrough(page, fixtures.png, 'a PNG');
    await shot(page, 'composer-05-png-uploaded');

    // 201: the route CREATES an asset and says so. Asserted as a set rather
    // than as "200" so the assertion is about the service having accepted the
    // file, which is the thing that was broken.
    ok('the service accepted both files',
      uploads.length >= 2 && uploads.every((u) => u.status === 200 || u.status === 201),
      uploads.map((u) => u.status).join(', ') || 'no /media call was made at all');
    ok('a picture on its own is enough to post',
      (await page.locator('[data-testid="composer-send"]').last().getAttribute('aria-disabled')) !== 'true');

    console.log('\n[5] the room composer, same controls');
    // `club-members` is the club board's door into the room behind it.
    const room = page.locator('[data-testid="club-members"]').last();
    if (await room.count()) {
      await room.click();
      await page.waitForTimeout(4000);
    }
    if (await page.locator('[data-testid="room-composer"]').count()) {
      ok('the room composer has the + too', (await page.locator('[data-testid="composer-plus"]').count()) > 0);
      await page.locator('[data-testid="composer-plus"]').last().click();
      await page.waitForTimeout(600);
      const rmenu = (await page.locator('[data-testid="composer-plus-menu"]').last().innerText()).replace(/\s+/g, ' ');
      ok('and its menu offers Kai a summary, saying what it costs', /Ask Kai/i.test(rmenu) && /credits/i.test(rmenu), rmenu.slice(0, 140));
      ok('and posting an idea', /Post an idea/i.test(rmenu));
      await shot(page, 'composer-06-room-plus-menu');
      await page.locator('[data-testid="composer-plus-backdrop"]').click();
      await page.waitForTimeout(600);

      /**
       * [6] Ask Kai — the wiring, WITHOUT spending a credit.
       *
       * The row runs the room's existing `summarize` command, and a real one
       * costs the owner money for a screenshot. So the route is intercepted and
       * answered with the shape the API uses when it will not take a command,
       * which proves the two things worth proving: the tap reaches
       * `POST /rooms/:id/kai` with `command: "summarize"`, and a refusal
       * arrives on screen IN THE SERVICE'S OWN WORDS rather than as an invented
       * summary. Nothing here fires without the tap.
       */
      let asked = null;
      await page.route('**/api/v1/rooms/*/kai', async (route) => {
        asked = route.request().postDataJSON?.() ?? null;
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: {
            code: 'VALIDATION_FAILED',
            message_plain: 'Kai cannot summarise this room yet. Nothing was posted.',
          } }),
        });
      });
      await page.locator('[data-testid="composer-plus"]').last().click();
      await page.waitForTimeout(600);
      await page.locator('[data-testid="composer-action-kai"]').last().click();
      await page.waitForTimeout(4000);
      ok('tapping Ask Kai calls the room\'s Kai route', !!asked, JSON.stringify(asked));
      ok('with the summarize command', asked?.command === 'summarize');
      const roomText = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
      ok('and a refusal is shown in the service\'s own words',
        roomText.includes('Kai cannot summarise this room yet. Nothing was posted.'));
      await shot(page, 'composer-07-room-kai-refused');
      await page.unroute('**/api/v1/rooms/*/kai');
    } else {
      console.log('  · no room reachable from this account — room menu not shot');
    }
  } finally {
    await browser.close();
    await fs.rm(fixtures.dir, { recursive: true, force: true });
  }

  console.log(failures.length
    ? `\n${failures.length} failure(s):\n${failures.map((f) => `  ✗ ${f}`).join('\n')}\n`
    : '\nall checks passed\n');
  process.exit(failures.length ? 1 : 0);
};

main().catch((e) => { console.error(e); process.exit(1); });
