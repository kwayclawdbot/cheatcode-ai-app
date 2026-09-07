/**
 * TWO OWNER BUGS, PROVED AGAINST THE REAL API — NOT FIXTURES.
 *
 *   1. "the daytrade alerts is showing swing trades"
 *   2. "the community trade alerts dont show anywhere in app when generated"
 *
 * Both of these are invisible in fixtures mode, which is exactly why they
 * shipped. In fixtures the room's messages are a hard-coded list, the publish
 * takes a local code path that never touches the API, and the alerts board is
 * a canned payload with no modes in it. So this proof runs the app
 * against the REAL hosted database with REAL accounts, and every assertion
 * below is about a row that actually exists.
 *
 *   cd apps/api  && (set -a; . ./.env.prod; set +a; npx next dev -p 3000)
 *   cd apps/mobile
 *   EXPO_PUBLIC_API_BASE=http://localhost:3000 npx expo start --web --port 8100
 *   PROOF_BASE=http://localhost:8100 node scripts/proof-mode-and-calls.mjs
 *
 * WHY TWO ACCOUNTS. One person cannot prove the social loop. A call is written
 * by its author and read by the people who follow them, and the whole bug is
 * that those are two different surfaces and only one of them existed. So:
 *
 *   ALEX  primary_mode = day_trade. Proves the board is filtered, and publishes
 *         the call.
 *   BLAKE primary_mode = swing, and follows Alex. Proves the OTHER side of the
 *         filter — that swing mode still has its cards, so "filtered" did not
 *         quietly become "empty for everyone" — and that Alex's call reaches
 *         the day-trade room's conversation, where a reader will actually
 *         come across it. The Rooms/Following toggle came out on 7 Sept and
 *         the Following feed is no longer a destination; following now decides
 *         who gets TOLD, and the room is where the call is READ.
 *
 * THE OWNER'S OWN LOGIN IS NOT USED. It is his account, on a live database,
 * with a real record attached to it. Two throwaway accounts prove the same
 * thing and take nothing with them.
 *
 * IT WRITES NOTHING IT DOES NOT CLEAN UP. Both accounts are deleted at the end,
 * in a `finally`, and deleting the auth user cascades the profile, the follow
 * and the published call with it. If this script dies halfway, run it again —
 * the emails carry a timestamp and nothing is left holding a name.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'proof');
const BASE = process.env.PROOF_BASE ?? 'http://localhost:8100';
const VIEWPORT = { width: 390, height: 1500 };
const PASSWORD = 'paper-money-first';

mkdirSync(OUT, { recursive: true });

/* ── the service-role client, read from the API's own env ──────────────
 * DEFAULTS TO `.env.prod` because that is what this proof was written for,
 * but the file is overridable — and it has to be, because the two halves of
 * this script talk to Supabase through DIFFERENT doors. The accounts are
 * created here with the service role, and they are signed in over there by the
 * browser using whatever `EXPO_PUBLIC_SUPABASE_URL` the app was started with.
 * Point those at two different databases and the account exists in one while
 * the sign-in is attempted against the other, which fails as "not signed in"
 * and looks like a broken login rather than a mismatched environment. It cost
 * a debugging round to work that out from the symptom.
 *
 *   PROOF_ENV_FILE=../api/.env.local  → run the whole thing against a local
 *   stack and leave the hosted database completely untouched.
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
  else { failures.push(name); console.log(`  FAIL  ${name}${detail === undefined ? '' : `\n        ${JSON.stringify(detail).slice(0, 500)}`}`); }
};

const stamp = Date.now();
const people = {
  alex: { email: `proof-alex+${stamp}@cheatcode.test`, handle: `alex${stamp}`.slice(0, 15), mode: 'day_trade', id: null },
  blake: { email: `proof-blake+${stamp}@cheatcode.test`, handle: `blake${stamp}`.slice(0, 15), mode: 'swing', id: null },
};
/** The call Alex publishes. A real symbol, real levels, so it is scoreable. */
const CALL = { symbol: 'NVDA', entry: '180.00', stop: '172.00', target: '205.00', thesis: `Proof run ${stamp}. Levels are here so the call is scoreable.` };

async function createPerson(p) {
  const made = await j(await fetch(`${SUPABASE}/auth/v1/admin/users`, {
    method: 'POST', headers: svc,
    body: JSON.stringify({ email: p.email, password: PASSWORD, email_confirm: true }),
  }));
  if (!made?.id) throw new Error(`could not create ${p.email}: ${JSON.stringify(made).slice(0, 300)}`);
  p.id = made.id;
  // `handle_new_user()` has already written the profiles row. This only sets the
  // three things onboarding would have set, so the app does not send us back
  // through it: who they are, which mode they are in, and that they are done.
  const patched = await fetch(`${SUPABASE}/rest/v1/profiles?user_id=eq.${p.id}`, {
    method: 'PATCH', headers: { ...svc, Prefer: 'return=representation' },
    body: JSON.stringify({
      handle: p.handle,
      primary_mode: p.mode,
      onboarding: { completed_at: new Date().toISOString(), version: 'proof-mode-and-calls' },
    }),
  });
  if (!patched.ok) throw new Error(`could not set up ${p.email}: ${await patched.text()}`);
  console.log(`  · ${p.email} → ${p.mode} (${p.id})`);
}

async function deletePerson(p) {
  if (!p.id) return;
  const r = await fetch(`${SUPABASE}/auth/v1/admin/users/${p.id}`, { method: 'DELETE', headers: svc });
  console.log(`  · deleted ${p.email} → ${r.status}`);
}

/* ── browser helpers ───────────────────────────────────────────────── */
const browser = await chromium.launch({ args: ['--disable-web-security', '--disable-site-isolation-trials'] });

async function signIn(person) {
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, bypassCSP: true, colorScheme: 'dark' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => failures.push(`page error (${person.email}): ${e.message}`));
  await page.goto(`${BASE}/sign-in`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-testid="screen-sign-in"]').waitFor({ timeout: 90_000 });
  await page.locator('input[data-testid="field-email"]').first().fill(person.email);
  await page.locator('input[data-testid="field-password"]').first().fill(PASSWORD);
  await page.locator('[data-testid="cta-sign-in"]').click();
  await page.waitForTimeout(9000);
  ok(`${person.handle} is signed in`, !(await has(page, 'screen-sign-in')));
  return { ctx, page };
}

const has = async (page, id) => (await page.locator(`[data-testid="${id}"]`).count()) > 0;

/**
 * A contributor profile that has finished loading.
 *
 * The screen holds a spinner until BOTH halves land, and on a cold dev server
 * the first request to a route nobody has compiled yet can take a while. A
 * fixed wait here photographs the spinner and reports a missing call, which
 * would be a false failure about the exact thing this file is here to prove.
 * So it waits for the identity block, which only renders once the profile is
 * really there.
 */
const settled = async (page) => {
  await page.locator('[data-testid="screen-contributor"]').waitFor({ timeout: 60_000 }).catch(() => {});
  await page.locator('[data-testid="contributor-handle"]').first()
    .waitFor({ state: 'visible', timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(1500);
};
const bodyText = async (page) => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
const shot = async (page, name) => {
  const root = page.locator('#root');
  await ((await root.count()) ? root : page).screenshot({ path: path.join(OUT, `modecalls-${name}.png`) });
  console.log(`  ✓ modecalls-${name}.png`);
};

/**
 * The alerts payload the cards on screen were actually built from, read with
 * the signed-in user's own token. A screenshot proves what is drawn; this
 * proves what it was drawn FROM, which is where the mode lives.
 */
const feedFor = (page, tab) => page.evaluate(async ({ tab, api }) => {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.includes('auth-token') && !k.includes('code-verifier')) keys.push(k); }
  keys.sort();
  let token = null;
  for (const base of new Set(keys.map((k) => k.replace(/\.\d+$/, '')))) {
    let raw = keys.filter((k) => k === base || k.startsWith(base + '.')).map((k) => localStorage.getItem(k) ?? '').join('');
    if (raw.startsWith('base64-')) { try { raw = atob(raw.slice(7)); } catch { continue; } }
    try { const v = JSON.parse(raw); if (v?.access_token) { token = v.access_token; break; } } catch { /* next */ }
  }
  const r = await fetch(`${api}/api/v1/alerts?tab=${tab}`, { headers: { Authorization: `Bearer ${token}` } });
  return { status: r.status, body: await r.json() };
}, { tab, api: process.env.PROOF_API ?? 'http://localhost:3000' });

/* ══════════════════════════════════════════════════════════════════ */

try {
  console.log('\n[0] two throwaway accounts on the hosted database');
  await createPerson(people.alex);
  await createPerson(people.blake);

  // Blake follows Alex. Written with the service role, because `follows` is RLS
  // with zero policies and the app has no client-write path to it either — the
  // API is the only door, and this is the same door.
  {
    const r = await fetch(`${SUPABASE}/rest/v1/follows`, {
      method: 'POST', headers: svc,
      body: JSON.stringify({ follower_id: people.blake.id, followee_id: people.alex.id }),
    });
    ok('Blake follows Alex', r.ok, await r.text());
  }

  /* ── 1. the Day Trade board carries no swing cards ──────────────── */
  console.log('\n[1] Day Trade board — Alex');
  const alex = await signIn(people.alex);
  await alex.page.goto(`${BASE}/alerts`, { waitUntil: 'domcontentloaded' });
  await alex.page.locator('[data-testid="screen-alerts"]').waitFor({ timeout: 90_000 });
  await alex.page.waitForTimeout(6000);
  await shot(alex.page, '01-day-trade-active');
  {
    ok('a day-trade account lands on the alerts board', await has(alex.page, 'screen-alerts'));
    ok('the Active/Community/History rail is there', await has(alex.page, 'alerts-tabs'));
    // Watching folded into Active on 7 Sept and the tab it freed became
    // Community. Asserted by name, because a rail that quietly grew a fourth
    // tab or lost the new one would still satisfy the line above.
    ok('Watching is no longer a tab of its own', !(await has(alex.page, 'alerts-tab-watching')));
    ok('and Community is', await has(alex.page, 'alerts-tab-community'));

    const feed = await feedFor(alex.page, 'active');
    ok('the API served the Active feed', feed.status === 200, feed.status);
    const cards = feed.body?.cards ?? [];
    const modes = [...new Set(cards.map((c) => c.identity?.mode))];
    ok(
      'NOT ONE swing card is on a Day Trade board',
      cards.every((c) => c.identity?.mode === 'day_trade'),
      { count: cards.length, modes }
    );

    // There are no live day-trade setups today, so the honest answer is an
    // empty board that says which engine is watching and when it looks.
    if (cards.length === 0) {
      const t = await bodyText(alex.page);
      ok('an empty Day Trade board says so in day-trade words', /No day-trade alerts today/i.test(t), t.slice(0, 300));
      ok('and names when the engine is looking', /opening bell/i.test(t));
      ok('and does not read as breakage', !/went wrong|failed|error/i.test(t));
    }
  }

  console.log('\n[1b] History is still every mode, on purpose');
  {
    const hist = await feedFor(alex.page, 'history');
    const cards = hist.body?.cards ?? [];
    const modes = new Set(cards.map((c) => c.identity?.mode));
    ok('History still carries the swing back-catalogue', modes.has('swing'), [...modes]);
    ok('History still carries the day-trade records', modes.has('day_trade'), [...modes]);
    await alex.page.locator('[data-testid="alerts-tab-history"]').first().click().catch(() => {});
    await alex.page.waitForTimeout(3000);
    await shot(alex.page, '02-day-trade-history');
  }

  /* ── 2. publishing a call, and finding it again ─────────────────── */
  console.log('\n[2] Alex publishes a call');
  await alex.page.goto(`${BASE}/community/call/new`, { waitUntil: 'domcontentloaded' });
  await alex.page.locator('[data-testid="screen-community-call-new"]').waitFor({ timeout: 60_000 });
  await alex.page.waitForTimeout(1200);
  {
    await alex.page.locator('[data-testid="composer-symbol"]').first().fill(CALL.symbol);
    await alex.page.locator('[data-testid="composer-entry"]').first().fill(CALL.entry);
    await alex.page.locator('[data-testid="composer-stop"]').first().fill(CALL.stop);
    await alex.page.locator('[data-testid="composer-target"]').first().fill(CALL.target);
    await alex.page.locator('[data-testid="composer-thesis"]').first().fill(CALL.thesis);
    await alex.page.waitForTimeout(800);
    await shot(alex.page, '03-composer');

    const promise = await bodyText(alex.page);
    ok('the composer does not promise a room it never posts to', !/WHAT THE ROOM WILL SEE/i.test(promise), promise.slice(0, 300));

    await alex.page.locator('[data-testid="composer-publish"]').first().click();
    await alex.page.waitForTimeout(7000);
    await shot(alex.page, '04-published-sheet');

    const sheet = await bodyText(alex.page);
    ok('the published sheet appears', await has(alex.page, 'sheet-call-published'), sheet.slice(0, 300));
    // The envelope bug: a call WITH an entry and a target came back as if it
    // had neither, so a scoreable call was confirmed as unscoreable.
    ok('a call with real levels is confirmed as scoreable', /it counts|will be scored|counts\b/i.test(sheet), sheet.slice(0, 400));
    ok('and it is NOT told the levels are missing', !/without an entry and a stop or a target/i.test(sheet), sheet.slice(0, 400));
  }

  console.log('\n[2b] and it lands somewhere the author can see it');
  {
    // Close the sheet the way a person does — press the button it offers — and
    // follow wherever it sends them. The label IS the promise being tested.
    const done = alex.page.getByText('See it on your profile').last();
    ok('the sheet offers to show the author the call', (await done.count()) > 0);
    if (await done.count()) await done.click().catch(() => {});
    // Wait for the PROFILE to have finished loading, not for a stopwatch. The
    // first hit on a route a dev server has never compiled is slow enough to
    // photograph a spinner and call it a missing call, which is a false
    // failure about the one thing this proof exists to check.
    await settled(alex.page);
    await shot(alex.page, '05-after-publish-landing');

    const url = alex.page.url();
    ok('publishing lands the author on their own profile, not an empty feed', url.includes(`/contributor/${people.alex.id}`), url);

    const t = await bodyText(alex.page);
    ok('the call is on the page the author was sent to', t.includes(CALL.symbol), t.slice(0, 400));
    ok('under the published-calls block', await has(alex.page, 'contributor-calls'));
    ok('and the app does not offer to follow you to yourself', !(await has(alex.page, 'follow-contributor')));
  }

  console.log('\n[2c] the author can reach it again from Account, without publishing');
  {
    await alex.page.goto(`${BASE}/account`, { waitUntil: 'domcontentloaded' });
    await alex.page.locator('[data-testid="screen-account"]').waitFor({ timeout: 60_000 }).catch(() => {});
    await alex.page.waitForTimeout(3000);
    const row = alex.page.locator('[data-testid="nav-profile"]').first();
    ok('Account has a way into your own profile', (await row.count()) > 0);
    if (await row.count()) {
      await row.click();
      await settled(alex.page);
      await shot(alex.page, '06-own-profile-from-account');
      ok('and it opens the profile carrying the call', (await bodyText(alex.page)).includes(CALL.symbol));
    }
  }

  /* ── 3. the other side: a follower, and a swing board ───────────── */
  console.log('\n[3] Blake — swing board still has its cards');
  const blake = await signIn(people.blake);
  await blake.page.goto(`${BASE}/alerts`, { waitUntil: 'domcontentloaded' });
  await blake.page.locator('[data-testid="screen-alerts"]').waitFor({ timeout: 90_000 });
  await blake.page.waitForTimeout(6000);
  await shot(blake.page, '07-swing-active');
  {
    const feed = await feedFor(blake.page, 'active');
    const cards = feed.body?.cards ?? [];
    const modes = [...new Set(cards.map((c) => c.identity?.mode))];
    ok('a swing account still HAS an Active board', cards.length > 0, { count: cards.length });
    ok('and every card on it is a swing card', cards.every((c) => c.identity?.mode === 'swing'), modes);
    const drawn = await blake.page.locator('[data-testid^="alert-card-"]').count();
    ok('the cards are actually drawn on screen', drawn > 0, { drawn });
  }

  /*
   * [4] WHERE THE CALL ACTUALLY LANDS NOW (owner, 7 Sept).
   *
   * This section used to open `/community?feed=following` and assert Blake saw
   * the call in a feed of the people he follows. That destination is gone: the
   * Rooms/Following toggle came out and a call is delivered into the room's own
   * conversation, as a message carrying its own card. So the assertion is not
   * deleted, it is moved to the place the call now has to reach — which is the
   * harder claim, because it involves the server writing a message row and the
   * room's ordinary five-second poll picking it up with no realtime stack.
   *
   * Blake reads SWING by default and the call was published for the DAY TRADE
   * desk, so he has to change rooms to see it. That is the point of the rail,
   * and it is also the proof that `mode` on the call decided which room it
   * landed in rather than the call being sprayed at all three.
   */
  console.log('\n[4] Blake sees Alex\'s call in the day-trade room chat');
  await blake.page.goto(`${BASE}/community`, { waitUntil: 'domcontentloaded' });
  await blake.page.locator('[data-testid="screen-community"]').waitFor({ timeout: 90_000 });
  await blake.page.waitForTimeout(7000);
  {
    ok('Community is the rooms — there is no feed switch', !(await has(blake.page, 'community-feed')));
    ok('and no Following feed as a destination', !(await has(blake.page, 'following-feed')));
    // The in-body room rail was removed on 7 Sept — it duplicated the headbar
    // mode control. The header names the room; the headbar changes it.
    ok('there is no second mode switch in the feed body', !(await has(blake.page, 'room-rail')));
    ok('the header names the room you are reading', await has(blake.page, 'club-room-name'));
    // The door that used to live in the Following feed's empty state. It needs
    // a signed-in id to build a profile route, so this is the only kind of run
    // that can prove it is there.
    ok('and "Your calls" survived the feed it used to live in', await has(blake.page, 'community-my-calls'));
    ok(
      'Follow is still on an author line in the room — following lost a page, not the graph',
      (await blake.page.locator('[data-testid^="club-follow-"]').count()) > 0,
    );

    // Changing rooms is now the headbar mode control, and only that. This is
    // the assertion that the one remaining switch actually switches.
    const dayTrade = blake.page.locator('[data-testid="mode-seg-day_trade"]').first();
    if (await dayTrade.count()) {
      // Not `settled()` — that one waits for a contributor profile. This is a
      // room changing under an already-mounted tab, so what is waited on is the
      // next poll bringing the room's messages back.
      await dayTrade.click();
      await blake.page.waitForTimeout(8000);
      const room = await blake.page.getByTestId('club-room-name').first().innerText().catch(() => '');
      ok('the headbar mode control moved the feed to the Day Trade room', /Day Trade/i.test(room), { room });
    }
    await shot(blake.page, '08-call-in-room-chat');

    const t = await bodyText(blake.page);
    ok(
      'the call is drawn as a card in the conversation',
      (await blake.page.locator('[data-testid^="club-message-call-"]').count()) > 0,
      t.slice(0, 500),
    );
    ok('a follower reading the room sees the call', t.includes(CALL.symbol), t.slice(0, 500));
    ok('with the author on it', t.includes(people.alex.handle), t.slice(0, 500));
    ok('and it says COMMUNITY TRADE, so it is never mistaken for a house alert', /COMMUNITY TRADE/i.test(t));
  }

  /*
   * [4b] THE ORPHANED ADDRESS LEADS SOMEWHERE HONEST.
   *
   * This used to assert that `?feed=following` was honoured on an already
   * mounted tab — a real bug at the time, because the tab read the param once
   * at mount and ignored every later change. Nothing reads the param now, so
   * the assertion is reversed: the address must resolve to the rooms rather
   * than to a blank screen or to a feed kept alive only for old links.
   */
  console.log('\n[4b] and the retired ?feed=following address lands on the rooms');
  {
    await blake.page.goto(`${BASE}/community`, { waitUntil: 'domcontentloaded' });
    await blake.page.waitForTimeout(4000);
    await blake.page.evaluate(() => window.history.pushState({}, '', '/community?feed=following'));
    await blake.page.waitForTimeout(3000);
    ok('no Following feed comes back', !(await has(blake.page, 'following-feed')));
    ok('the rooms are still what is on screen', await has(blake.page, 'club-room-name'));
    ok('and the room composer is still there', await has(blake.page, 'club-composer'));
  }
} catch (e) {
  failures.push(`threw: ${e instanceof Error ? e.message : String(e)}`);
  console.error(e);
} finally {
  console.log('\n[9] cleaning up');
  await deletePerson(people.alex);
  await deletePerson(people.blake);
  await browser.close();
}

console.log(`\n${pass} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  · ${f}`);
process.exit(failures.length ? 1 : 0);
