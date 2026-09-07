/**
 * "THERE'S NO WAY TO ADD PROFILE PICTURE AFTER ONBOARDING" — PROVED FIXED,
 * AGAINST THE REAL API AND THE REAL DATABASE.
 *
 * The owner's complaint, 6 Sept. The Account board drew a Profile picture row
 * that was not pressable and said the upload "arrives with the next release".
 * The picker, the upload route and the settings write all existed; they had
 * only ever been wired together on the admin rooms board. Wiring them up for a
 * member touched three files, none of which had been run:
 *
 *   (a) apps/api/src/lib/avatars.ts — `isOurMediaAddress()`. `POST /media`
 *       returns an address on the API's OWN origin, and `PUT /settings` used to
 *       reject exactly that address with "A profile picture has to be one you
 *       uploaded here." — about a picture that had just been uploaded here.
 *   (b) apps/api/src/app/api/v1/media/[id]/route.ts — an avatar no longer needs
 *       a bearer token, because an `<img>` cannot send one. Before this, the
 *       first picture anybody saved rendered as a blank disc everywhere.
 *   (c) apps/mobile/src/features/media/pick.ts — an avatar downscales to 512px
 *       and is capped at 2 MiB, which is the server's avatar ceiling rather
 *       than the 4 MiB message ceiling this file used to be the only one to
 *       know about.
 *
 * NONE OF THAT IS VISIBLE IN FIXTURES MODE. There is no API to take the bytes,
 * no storage to put them in and no row to write, so `useAvatar` short-circuits
 * to "Pictures are stored on the server, and it is not connected here." A green
 * fixtures run would prove that sentence and nothing else. So this runs the web
 * build against a real Next dev server against the hosted database, and every
 * assertion below is about a row and a file that actually exist.
 *
 *   cd apps/api && (set -a; . ./.env.prod; set +a; npx next dev -p 3000)
 *   cd apps/mobile
 *   EXPO_PUBLIC_API_BASE=http://localhost:3000 npx expo start --web --port 8097
 *   PROOF_BASE=http://localhost:8097 node scripts/proof-avatar-change.mjs
 *
 * IF `next dev` REFUSES TO START — "Another next dev server is already
 * running" — somebody else's lane is holding the lock on `apps/api/.next/dev`.
 * DO NOT kill it. The lock follows the dist directory, so the way past it is a
 * second project directory: `apps/api-proof` with `src` copied, `node_modules`
 * symlinked, and `package.json` / `tsconfig.json` / `next.config.ts` copied
 * (it has to sit at the same depth, because `next.config.ts` walks two levels
 * up to find the monorepo root for `@shared/*`). Run `next dev -p 3000` from
 * there with `.env.prod` sourced, and delete the directory afterwards. A
 * SYMLINKED `src` is not enough — Turbopack finds the root layout through one
 * and then serves 404 for every route beneath it.
 *
 * WHY THE WEB AND NOT THE PHONE. The web path is the one that exercises all
 * three fixes at once: `api.uploadAvatar` takes its `File`/FormData branch
 * (a plain `{uri,name,type}` object stringifies to "[object Object]" in a
 * browser and no file arrives), the browser decodes and re-encodes the picture
 * itself, and the rendered `<img>` fetches the media address with no token —
 * which is the only place blocker (b) can actually be observed. It is also the
 * only platform a script can drive end to end.
 *
 * WHAT THIS CANNOT PROVE.
 *   · iOS and Android. `pickPhotos` takes a different branch there (the OS
 *     decodes the file, the uri is `file://`, FormData gets React Native's file
 *     object) and expo-image is a native view rather than an `<img>`. A green
 *     run here says nothing about a phone.
 *   · That EXIF is really stripped. That is the media lane's own guarantee and
 *     it has its own tests; the picture uploaded here is drawn on a canvas and
 *     never had any.
 *   · Anything about a HEIC. A desktop browser cannot decode one at all, which
 *     is why `pick.ts` refuses it with a sentence — asserted nowhere here.
 *   · That the picture looks right. `naturalWidth > 0` proves the bytes loaded,
 *     not that the disc is not empty; the screenshots are for a human to look
 *     at, and they are written even when an assertion fails, on purpose.
 *
 * THE PICTURE IS A REAL JPEG AND IT HAS TO BE. The server sniffs magic bytes
 * and does not trust Content-Type (apps/api/src/lib/media/strip.ts), so a text
 * file named .jpg is refused. It is drawn on a canvas in the browser and
 * written to disk at 900x900 — deliberately larger than AVATAR_EDGE, so the
 * downscale in (c) is exercised rather than skipped, and the stored file's own
 * dimensions are then asserted.
 *
 * IT WRITES NOTHING IT DOES NOT CLEAN UP. One throwaway account, deleted in a
 * `finally`; deleting the auth user cascades the profile. The uploaded asset is
 * an orphan the media lane's own sweep collects. If this dies halfway, run it
 * again — the email carries a timestamp and nothing is left holding a name.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'proof');
const BASE = process.env.PROOF_BASE ?? 'http://localhost:8097';
const API = process.env.PROOF_API ?? 'http://localhost:3000';
const VIEWPORT = { width: 390, height: 1500 };
const PASSWORD = 'paper-money-first';
/** Larger than AVATAR_EDGE (512) so the downscale is exercised, not skipped. */
const SOURCE_EDGE = 900;
const JPEG_PATH = path.join(OUT, 'avatar-source.jpg');

mkdirSync(OUT, { recursive: true });

/* ── the service-role client, read from the API's own env ──────────────
 * The same two-door problem `proof-mode-and-calls.mjs` documents: the account
 * is CREATED here with the service role and SIGNED IN over there by the browser
 * against whatever `EXPO_PUBLIC_SUPABASE_URL` the Expo server was started with.
 * Point those at two databases and the sign-in fails as "not signed in", which
 * looks like a broken login rather than a mismatched environment.
 */
const ENV_FILE = process.env.PROOF_ENV_FILE ?? '../api/.env.prod';
const env = Object.fromEntries(
  readFileSync(path.resolve(ROOT, ENV_FILE), 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
const SUPABASE = env.SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE || !SERVICE) {
  console.error(`${ENV_FILE} is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.`);
  process.exit(1);
}
const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };
const j = async (res) => { const t = await res.text(); try { return t ? JSON.parse(t) : null; } catch { return t; } };

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail === undefined ? '' : `\n        ${JSON.stringify(detail).slice(0, 600)}`}`); }
};

const stamp = Date.now();
const person = {
  email: `proof-avatar+${stamp}@cheatcode.test`,
  handle: `av${stamp}`.slice(0, 15),
  id: null,
};

async function createPerson(p) {
  const made = await j(await fetch(`${SUPABASE}/auth/v1/admin/users`, {
    method: 'POST', headers: svc,
    body: JSON.stringify({ email: p.email, password: PASSWORD, email_confirm: true }),
  }));
  if (!made?.id) throw new Error(`could not create ${p.email}: ${JSON.stringify(made).slice(0, 300)}`);
  p.id = made.id;
  // `handle_new_user()` has already written the profiles row. This sets only
  // what onboarding would have set, so the app does not send us back through
  // it — a member who has FINISHED onboarding is the whole premise of the bug.
  const patched = await fetch(`${SUPABASE}/rest/v1/profiles?user_id=eq.${p.id}`, {
    method: 'PATCH', headers: { ...svc, Prefer: 'return=representation' },
    body: JSON.stringify({
      handle: p.handle,
      display_name: 'Proof Member',
      primary_mode: 'swing',
      onboarding: { completed_at: new Date().toISOString(), version: 'proof-avatar-change' },
    }),
  });
  if (!patched.ok) throw new Error(`could not set up ${p.email}: ${await patched.text()}`);
  const row = await j(await fetch(`${SUPABASE}/rest/v1/profiles?user_id=eq.${p.id}&select=avatar_url`, { headers: svc }));
  console.log(`  · ${p.email} (${p.id}) avatar_url=${JSON.stringify(row?.[0]?.avatar_url ?? null)}`);
  return row?.[0]?.avatar_url ?? null;
}

async function deletePerson(p) {
  if (!p.id) return;
  const r = await fetch(`${SUPABASE}/auth/v1/admin/users/${p.id}`, { method: 'DELETE', headers: svc });
  console.log(`  · deleted ${p.email} → ${r.status}`);
}

/* ── browser helpers ───────────────────────────────────────────────── */
const browser = await chromium.launch({ args: ['--disable-web-security', '--disable-site-isolation-trials'] });

async function signIn(p) {
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, bypassCSP: true, colorScheme: 'dark' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => failures.push(`page error: ${e.message}`));
  await page.goto(`${BASE}/sign-in`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-testid="screen-sign-in"]').waitFor({ timeout: 120_000 });
  await page.locator('input[data-testid="field-email"]').first().fill(p.email);
  await page.locator('input[data-testid="field-password"]').first().fill(PASSWORD);
  await page.locator('[data-testid="cta-sign-in"]').click();
  await page.waitForTimeout(9000);
  ok('the account is signed in', !(await has(page, 'screen-sign-in')));
  return { ctx, page };
}

const has = async (page, id) => (await page.locator(`[data-testid="${id}"]`).count()) > 0;
const bodyText = async (page) => (await page.locator('body').innerText()).replace(/\s+/g, ' ');

const shot = async (page, name) => {
  const root = page.locator('#root');
  await ((await root.count()) ? root : page).screenshot({ path: path.join(OUT, `avatar-${name}.png`) }).catch(() => {});
  console.log(`  ✓ avatar-${name}.png`);
};

/**
 * The signed-in session's own access token, read out of localStorage exactly
 * the way `proof-mode-and-calls.mjs` reads it — supabase-js splits a large
 * session across numbered keys and base64-prefixes the value, and both of those
 * have to be undone before there is a token to hold.
 */
const tokenOf = (page) => page.evaluate(() => {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.includes('auth-token') && !k.includes('code-verifier')) keys.push(k);
  }
  keys.sort();
  for (const base of new Set(keys.map((k) => k.replace(/\.\d+$/, '')))) {
    let raw = keys.filter((k) => k === base || k.startsWith(base + '.')).map((k) => localStorage.getItem(k) ?? '').join('');
    if (raw.startsWith('base64-')) { try { raw = atob(raw.slice(7)); } catch { continue; } }
    try { const v = JSON.parse(raw); if (v?.access_token) return v.access_token; } catch { /* next */ }
  }
  return null;
});

/**
 * `GET /api/v1/me`, read from NODE with the member's own bearer token.
 *
 * Deliberately not read through the page. What is being proved is what the
 * SERVER holds, and a value fetched by the app is a value the app could have
 * been holding in memory all along.
 */
const meFor = async (token) => {
  const r = await fetch(`${API}/api/v1/me`, { headers: { Authorization: `Bearer ${token}` } });
  return { status: r.status, body: await j(r) };
};
const avatarOf = (me) => me.body?.data?.profile?.avatar_url ?? me.body?.profile?.avatar_url ?? null;

/** Wait until `/me` says what we are waiting for, or give up and report what it said. */
async function waitForAvatar(token, want, ms = 60_000) {
  const until = Date.now() + ms;
  let last = null;
  for (;;) {
    const me = await meFor(token);
    last = avatarOf(me);
    const settled = want === 'set' ? typeof last === 'string' && last.length > 0 : !last;
    if (settled || Date.now() > until) return { value: last, me };
    await new Promise((r) => setTimeout(r, 1000));
  }
}

/**
 * Is the picture on screen actually LOADED?
 *
 * A broken image has an element, a box and a testid; it just has no pixels.
 * `naturalWidth` is the only thing that separates the two, and it is the whole
 * reason blocker (b) is checkable at all — before that fix the element was
 * there on every screen and every one of them was blank.
 */
const imageIn = (page, testid) => page.evaluate((id) => {
  const host = document.querySelector(`[data-testid="${id}"]`);
  const img = host?.querySelector('img') ?? null;
  if (!img) return { found: false, naturalWidth: 0, naturalHeight: 0, src: null, complete: false };
  return {
    found: true,
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
    src: img.currentSrc || img.src || null,
    complete: img.complete,
  };
}, testid);

/** Poll until an `<img>` under `testid` has really decoded, or time out. */
async function loadedImage(page, testid, ms = 45_000) {
  const until = Date.now() + ms;
  let last = null;
  for (;;) {
    last = await imageIn(page, testid);
    if (last.found && last.naturalWidth > 0) return last;
    if (Date.now() > until) return last;
    await page.waitForTimeout(500);
  }
}

/**
 * A REAL JPEG, DRAWN RATHER THAN CHECKED IN.
 *
 * The server sniffs magic bytes, so this has to be a genuinely encoded JPEG and
 * not a renamed anything. Drawing it on a canvas in the browser that is already
 * open is the shortest way to one with no image library on the machine, and it
 * gets a loud, obviously-synthetic pattern so that a human looking at the
 * screenshots can tell the picture apart from a placeholder disc at a glance.
 */
async function writeSourceJpeg(page) {
  const dataUrl = await page.evaluate((edge) => {
    const c = document.createElement('canvas');
    c.width = edge; c.height = edge;
    const g = c.getContext('2d');
    g.fillStyle = '#ff2d55'; g.fillRect(0, 0, edge, edge);
    g.fillStyle = '#00e5ff';
    for (let y = 0; y < edge; y += 90) for (let x = 0; x < edge; x += 90) {
      if (((x / 90) + (y / 90)) % 2 === 0) g.fillRect(x, y, 90, 90);
    }
    g.fillStyle = '#111'; g.beginPath(); g.arc(edge / 2, edge / 2, edge / 3, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.font = `bold ${Math.round(edge / 4)}px sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('PF', edge / 2, edge / 2);
    return c.toDataURL('image/jpeg', 0.9);
  }, SOURCE_EDGE);
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const bytes = Buffer.from(b64, 'base64');
  writeFileSync(JPEG_PATH, bytes);
  return bytes;
}

/* ══════════════════════════════════════════════════════════════════ */

let session = null;

try {
  console.log('\n[0] one throwaway account on the hosted database, past onboarding');
  const startedWith = await createPerson(person);
  ok('a fresh account starts with no profile picture', !startedWith, startedWith);

  session = await signIn(person);
  const { page } = session;
  const token = await tokenOf(page);
  ok('the run holds the account’s own access token', typeof token === 'string' && token.length > 20);

  /* ── 1. the row exists, and it is ACTIONABLE ────────────────────── */
  console.log('\n[1] the Account board offers a profile picture');
  await page.goto(`${BASE}/account`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-testid="screen-account"]').waitFor({ timeout: 120_000 });
  await page.locator('[data-testid="identity-avatar"]').first().waitFor({ timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await shot(page, '01-account-before');
  {
    const t = await bodyText(page);
    ok('the Profile picture row is on the board', await has(page, 'identity-avatar'));
    ok('and the header disc is a door to it too', await has(page, 'account-avatar'));
    // THE OWNER'S SENTENCE, ASSERTED ABSENT. This is what the row used to say
    // instead of doing anything, and it is the exact text of the complaint.
    ok('it no longer says the upload arrives with the next release', !/arrives with the next release/i.test(t), t.slice(0, 400));
    ok('it invites the member to add one', /Add one/i.test(t), t.slice(0, 400));
    // Not a label that happens to look pressable: react-native-web renders a
    // Pressable as a real button, and a disabled one would be inert.
    const role = await page.locator('[data-testid="identity-avatar"]').first()
      .evaluate((el) => ({ tag: el.tagName, role: el.getAttribute('role'), disabled: el.getAttribute('aria-disabled') }));
    ok('and the row is genuinely pressable', role.role === 'button' && role.disabled !== 'true', role);
    ok('there is nothing to remove yet', !(await has(page, 'identity-avatar-remove')));
  }

  /* ── 2. tapping it opens a file chooser ─────────────────────────── */
  console.log('\n[2] tapping the row opens a file chooser and takes a real JPEG');
  const jpeg = await writeSourceJpeg(page);
  ok('a real JPEG was written to disk', jpeg[0] === 0xff && jpeg[1] === 0xd8 && jpeg.length > 1000, { bytes: jpeg.length, magic: [jpeg[0], jpeg[1]] });
  {
    const chooserPromise = page.waitForEvent('filechooser', { timeout: 30_000 }).catch(() => null);
    await page.locator('[data-testid="identity-avatar"]').first().click();
    const chooser = await chooserPromise;
    ok('a file chooser opened', chooser !== null);
    await shot(page, '02-file-chooser');
    if (chooser) {
      await chooser.setFiles(JPEG_PATH);
    } else {
      // expo-image-picker appends its own input to the body; if the chooser
      // event was missed the input is still the honest way in.
      await page.locator('input[data-testid="file-input"]').first().setInputFiles(JPEG_PATH).catch(() => {});
    }
  }

  /* ── 3. it SAVED — blocker (a) ──────────────────────────────────── */
  console.log('\n[3] the address the upload minted is accepted by PUT /settings');
  const saved = await waitForAvatar(token, 'set');
  await page.waitForTimeout(1500);
  await shot(page, '03-account-after-upload');
  {
    const err = (await page.locator('[data-testid="identity-avatar-error"]').innerText().catch(() => '')).trim();
    ok('the row shows no error', err === '', err);
    ok('GET /me now carries a profile picture', typeof saved.value === 'string' && saved.value.length > 0, { value: saved.value, status: saved.me.status });
    ok(
      'and it is an address on our own media route, not a signed storage link',
      typeof saved.value === 'string' && saved.value.includes('/api/v1/media/'),
      saved.value,
    );
    // The exact refusal blocker (a) was: the save came back with this sentence
    // about a picture that had just been uploaded here.
    ok('nothing was refused as "not one you uploaded here"', !/uploaded here/i.test(err), err);
  }

  /* ── 4. it RENDERS — blocker (b) ────────────────────────────────── */
  console.log('\n[4] the picture actually loads, with no bearer token on the fetch');
  const headerImg = await loadedImage(page, 'account-avatar');
  await shot(page, '04-header-picture');
  {
    ok('there is an <img> on the account header', headerImg.found, headerImg);
    ok('and it DECODED — a broken image has an element too', headerImg.naturalWidth > 0, headerImg);
    ok('it is drawing the address that was saved', (headerImg.src ?? '').includes('/api/v1/media/'), headerImg.src);
    // Blocker (c): the source was 900px square and the stored file must be the
    // downscale, not the original.
    ok(
      'the stored picture is the 512px downscale, not the 900px original',
      headerImg.naturalWidth > 0 && headerImg.naturalWidth <= 512 && headerImg.naturalHeight <= 512,
      headerImg,
    );
    const rowImg = await loadedImage(page, 'identity-avatar');
    ok('the row itself draws the picture too', rowImg.found && rowImg.naturalWidth > 0, rowImg);
    ok('and the row now offers to remove it', await has(page, 'identity-avatar-remove'));
  }

  /* ── 5. it is there on another surface ──────────────────────────── */
  console.log('\n[5] it survives a reload and appears on the member’s own profile');
  {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('[data-testid="screen-account"]').waitFor({ timeout: 120_000 });
    const again = await loadedImage(page, 'account-avatar');
    await shot(page, '05-after-reload');
    ok('a cold load of the board draws the picture', again.found && again.naturalWidth > 0, again);

    await page.goto(`${BASE}/contributor/${person.id}`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-testid="screen-contributor"]').waitFor({ timeout: 120_000 }).catch(() => {});
    await page.locator('[data-testid="contributor-handle"]').first().waitFor({ state: 'visible', timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const onProfile = await page.evaluate(() => {
      const imgs = [...document.querySelectorAll('img')].filter((i) => (i.currentSrc || i.src || '').includes('/api/v1/media/'));
      return imgs.map((i) => ({ naturalWidth: i.naturalWidth, src: i.currentSrc || i.src }));
    });
    await shot(page, '06-contributor-profile');
    ok('the picture is on the member’s own contributor profile', onProfile.length > 0, onProfile);
    ok('and it loaded there as well', onProfile.some((i) => i.naturalWidth > 0), onProfile);
  }

  /* ── 6. removing it clears the column ───────────────────────────── */
  console.log('\n[6] "Remove my picture" really clears it');
  {
    await page.goto(`${BASE}/account`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-testid="screen-account"]').waitFor({ timeout: 120_000 });
    const remove = page.locator('[data-testid="identity-avatar-remove"]').first();
    await remove.waitFor({ timeout: 60_000 }).catch(() => {});
    ok('the remove control is offered while there is a picture', (await remove.count()) > 0);
    if (await remove.count()) await remove.click();

    const cleared = await waitForAvatar(token, 'clear');
    await page.waitForTimeout(2000);
    await shot(page, '07-after-remove');
    ok('GET /me says the picture is gone', !cleared.value, cleared.value);
    const gone = await imageIn(page, 'account-avatar');
    ok('and the header is back to the initial disc, with no image left in it', !gone.found, gone);
    ok('the remove control takes itself away with the picture', !(await has(page, 'identity-avatar-remove')));
    const err = (await page.locator('[data-testid="identity-avatar-error"]').innerText().catch(() => '')).trim();
    ok('removing said nothing went wrong', err === '', err);
  }
} catch (e) {
  failures.push(`threw: ${e instanceof Error ? e.message : String(e)}`);
  console.error(e);
  if (session?.page) await shot(session.page, '99-threw');
} finally {
  console.log('\n[9] cleaning up');
  await deletePerson(person);
  await browser.close();
}

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  · ${f}`);
process.exit(failures.length ? 1 : 0);
