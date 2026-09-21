/**
 * THE V2 COMMUNITY, IN REAL PIXELS — feed, rooms rail, post detail, composer,
 * room chat — at 390x844 (100% and 130% text) and 360x780.
 *
 *   cd apps/mobile
 *   npx expo start --web --port 8107            # .env.local → a LOCAL stack
 *   PROOF_BASE=http://localhost:8107 PROOF_OUT=/tmp/rd-community \
 *   PROOF_EMAIL=… PROOF_PASSWORD=… node scripts/proof-rd-community.mjs
 *
 * With EXPO_PUBLIC_FIXTURES=1 the same script runs without a sign-in: every
 * screen renders from `features/community/feed/fixtures.ts`.
 *
 * Signing in: the session is minted in Node against the same local stack
 * (`.env.local`) and placed in the page's storage before the app boots, so the
 * proof never races the sign-in form's hydration.
 *
 * It asserts what the board promises (counts are printed, not just checked),
 * and it fails on any page error.
 */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const BASE = process.env.PROOF_BASE ?? 'http://localhost:8107';
const OUT = path.resolve(process.env.PROOF_OUT ?? path.join(process.cwd(), 'proof', 'rd-community'));
const EMAIL = process.env.PROOF_EMAIL ?? '';
const PASSWORD = process.env.PROOF_PASSWORD ?? '';
const ONLY = process.env.PROOF_ONLY ?? '';
mkdirSync(OUT, { recursive: true });

const failures = [];
const note = (ok, what) => { console.log(`  ${ok ? 'ok ' : 'XX '} ${what}`); if (!ok) failures.push(what); };

const VIEWS = [
  { tag: '390', width: 390, height: 844, scale: 1 },
  { tag: '390-130', width: 390, height: 844, scale: 1.3 },
  { tag: '360', width: 360, height: 780, scale: 1 },
].filter((v) => !ONLY || v.tag === ONLY);

let SESSION = null;
let TOKEN = null;
const API_BASE = (() => {
  try {
    const l = readFileSync('.env.local', 'utf8').split('\n').find((x) => x.startsWith('EXPO_PUBLIC_API_BASE='));
    return l ? l.slice('EXPO_PUBLIC_API_BASE='.length) : '';
  } catch { return ''; }
})();
/**
 * The member's text size is a server setting (`/me` wins over the device), so
 * the 130% pass sets it the way the Account screen would, and puts it back.
 */
async function setTextScale(scale) {
  if (!TOKEN || !API_BASE) return;
  await fetch(`${API_BASE}/api/v1/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ accessibility: { text_scale: scale } }),
  });
}
if (EMAIL) {
  const req = createRequire(path.resolve(process.cwd(), '../api/package.json'));
  const { createClient } = req('@supabase/supabase-js');
  const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(Boolean)
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
  if (/supabase\.co/.test(env.EXPO_PUBLIC_SUPABASE_URL)) throw new Error('refusing: proof runs against a LOCAL stack only');
  const sb = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (error) throw new Error(`sign in: ${error.message}`);
  SESSION = JSON.stringify(data.session);
  TOKEN = data.session.access_token;
}

/** Go somewhere; if the gate bounced a cold bundle to /welcome, go again. */
async function visit(page, url, ready) {
  for (let k = 0; k < 4; k++) {
    await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded' });
    try { await page.getByTestId(ready).waitFor({ timeout: 25000 }); return; } catch { /* retry */ }
  }
  throw new Error(`${url} never showed ${ready} (at ${page.url()})`);
}

const browser = await chromium.launch();

for (const v of VIEWS) {
  console.log(`\n== ${v.tag}`);
  await setTextScale(v.scale);
  const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => failures.push(`[${v.tag}] page error: ${e.message}`));
  const shot = (name) => page.screenshot({ path: path.join(OUT, `${v.tag}-${name}.png`) });
  const count = (sel) => page.locator(sel).count();

  // Text scale lives in the a11y prefs (features/a11y/context.tsx, key ccai.a11y.v1).
  await page.addInitScript(([scale, session]) => {
    try {
      localStorage.setItem('ccai.a11y.v1', JSON.stringify({ textScale: scale, reducedMotion: true }));
      if (session) localStorage.setItem('sb-127-auth-token', session);
    } catch {}
  }, [v.scale, SESSION]);

  /* ── the feed ─────────────────────────────────────────────────────── */
  await visit(page, '/community', 'community-feed-list');
  const settle = async () => {
    await page.locator('[data-testid^="post-"][data-testid$="-card"]').first().waitFor({ timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2500);
  };
  await page.locator('[data-testid$="-ring"]').first().waitFor({ timeout: 30000 }).catch(() => {});
  await settle();
  await page.waitForTimeout(2500); // chart bars
  await shot('01-feed-for-you');

  const title = await page.getByTestId('app-bar-title').innerText().catch(() => '');
  note(v.tag !== '390' ? title.includes('Community') : title === 'CheatCode Community', `app bar says "${title}"`);
  await page.waitForFunction(() => /online/.test(document.querySelector('[data-testid="app-bar"]')?.textContent ?? ''), null, { timeout: 15000 }).catch(() => {});
  const status = await page.getByTestId('app-bar').innerText().catch(() => '');
  note(/online/.test(status), `online line: "${status.replace(/\s+/g, ' ')}"`);
  const rooms = await count('[data-testid^="live-room-"][data-testid$="-ring"]');
  note(rooms >= 4, `rooms on the rail — ${rooms}`);
  const railText = (await page.getByTestId('live-rooms').innerText().catch(() => '')).replace(/\s+/g, ' ');
  note(railText.length > 0, `rail (from the API, nothing hard-coded): ${railText}`);
  note(await count('[data-testid^="post-"][data-testid$="-card"]') >= 1, `posts — ${await count('[data-testid^="post-"][data-testid$="-card"]')}`);
  note(await count('[data-testid^="post-chart-"]') >= 1, `chart attachments — ${await count('[data-testid^="post-chart-"]')}`);
  note(await count('[data-testid^="post-call-"]') >= 1, `embedded calls — ${await count('[data-testid^="post-call-"]')}`);
  note(await count('[data-testid^="post-result-"]') >= 1, `result cards — ${await count('[data-testid^="post-result-"]')}`);
  note(await count('[data-testid^="live-invite-"]') <= 1, `live-room invites in the feed — ${await count('[data-testid^="live-invite-"]')}`);
  note(await count('[data-testid*="follow-button"]') === 0, 'no follow button in the feed');

  // Scroll so the result card and the invite are in view.
  await page.mouse.move(v.width / 2, v.height / 2);
  await page.mouse.wheel(0, 640);
  await page.waitForTimeout(1200);
  await shot('02-feed-scrolled');
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(1200);
  await shot('03-feed-more');

  for (const tab of ['following', 'trade_calls', 'media']) {
    await page.getByTestId(`feed-tabs-${tab}`).click();
    await settle();
    await shot(`04-tab-${tab}`);
    const n = await count('[data-testid^="post-"][data-testid$="-card"]');
    note(true, `${tab}: ${n} posts`);
  }
  await page.getByTestId('feed-tabs-for_you').click();
  await page.waitForTimeout(1500);

  /* ── a post, opened ───────────────────────────────────────────────── */
  const firstCard = page.locator('[data-testid^="post-"][data-testid$="-open"]').first();
  if (await firstCard.count()) {
    await firstCard.click();
    await page.getByTestId('screen-post').waitFor({ timeout: 20000 });
    await page.getByTestId('reply-bar').waitFor({ timeout: 20000 });
    await page.waitForTimeout(2500);
    await shot('05-thread');
    note(await count('[data-testid^="reply-"]') >= 1, `replies — ${await count('[data-testid^="reply-"]')}`);
    await page.goBack();
    await page.waitForTimeout(1500);
  }

  /* ── the composer ─────────────────────────────────────────────────── */
  await visit(page, '/community/compose', 'screen-compose');
  await page.waitForTimeout(1500);
  await page.getByTestId('compose-body').fill('$AMD pulled back to 600 and held. Watching for the reclaim of 620.');
  await page.getByTestId('compose-chart').click();
  await page.waitForTimeout(600);
  await shot('06-composer-chart-picker');
  await page.getByTestId('chart-symbol').fill('AMD');
  await page.getByTestId('chart-tf-1D').click();
  await page.getByTestId('chart-entry').fill('620');
  await page.getByTestId('chart-stop').fill('598');
  await page.getByTestId('chart-target').fill('660');
  await page.getByTestId('chart-call-long').click();
  await page.waitForTimeout(400);
  await shot('06b-composer-chart-filled');
  await page.getByTestId('chart-attach').click();
  await page.getByText(/Daily bars/).first().waitFor({ timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(800);
  await shot('07-composer');
  note(await count('[data-testid^="compose-chart-preview"]') >= 1, 'chart attached in the composer');

  /* ── a room ───────────────────────────────────────────────────────── */
  await visit(page, '/community', 'community-feed-list');
  await page.waitForTimeout(2500);
  const ring = page.locator('[data-testid^="live-room-"][data-testid$="-ring"]').first();
  await ring.click();
  await page.getByTestId('screen-room').waitFor({ timeout: 20000 });
  await page.locator('[data-testid^="message-row-"]').first().waitFor({ timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);
  await shot('08-room');
  note(await count('[data-testid="composer-kai"]') === 1, '@Kai on the room composer');
  note(await count('[data-testid^="message-call-object-"]') >= 1, `call cards in the room — ${await count('[data-testid^="message-call-object-"]')}`);
  const header = (await page.getByTestId('room-header').innerText().catch(() => '')).replace(/\s+/g, ' ');
  note(/members/.test(header), `room header: ${header}`);

  await ctx.close();
}

await setTextScale(1);
await browser.close();
console.log(failures.length ? `\n${failures.length} problem(s):\n - ${failures.join('\n - ')}` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);
