/**
 * Live proof for lane ADMIN-4 — the operator's board, end to end, against the
 * REAL stack: local Supabase on :54321, apps/api on :3000, Metro on :8081.
 *
 *   node scripts/proof-admin.mjs     (PROOF_BASE / PROOF_API override)
 *
 * Nothing here is a fixture, and nothing here uses the owner's account. It
 * creates its OWN throwaway staff user through the UI and grants it with
 * `set_staff_role` through the service role, exactly as the brief requires.
 *
 * It proves brief §10's flow, and the wall on both sides of it:
 *
 *   1. a signed-in user who is NOT staff sees no door in Account, gets the
 *      app's "that is not something this app does" from every admin route in
 *      the browser, and NOT_FOUND from the API with their own token
 *   2. that same user is granted `admin` → the Account row appears
 *   3. overview: the funnel, the ledger, and at least one metric that says
 *      "not tracked yet" rather than a zero it did not measure
 *   4. sources: the `app` connector runs for real, reports its counts, and a
 *      SECOND run creates zero — idempotence, in the UI, not in a unit test
 *   5. people: search finds a real person; opening the file writes an audit row
 *   6. invites: a code is made, and its `/join/<code>` link is shown
 *   7. a BRAND NEW user signs up in a second browser context and redeems it;
 *      premium lands on their account
 *   8. the redeemed person appears in the CRM, and their status MOVES
 *      (signed_up → paying) once the source has run again
 *   9. the audit log shows every step, including the reads
 *  10. the new user — an ordinary member — still sees nothing
 *
 * It also proves the round-4 regression this lane was asked to fix: a push deep
 * link `/alert/<id>` for an alert armed SECONDS ago must land on the chart, not
 * on the alerts list.
 *
 * Screenshots land in proof/admin-*.png.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import fs from 'node:fs/promises';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'proof');
const BASE = process.env.PROOF_BASE ?? 'http://localhost:8081';
const API = process.env.PROOF_API ?? 'http://localhost:3000';
const STAMP = Date.now();
const STAFF = { email: `proofstaff+${STAMP}@cheatcode.test`, password: 'paper-money-first' };
const MEMBER = { email: `proofmember+${STAMP}@cheatcode.test`, password: 'paper-money-first' };
const SYMBOL = process.env.PROOF_SYMBOL ?? 'NVDA';

const env = Object.fromEntries(
  readFileSync(path.join(ROOT, '../api/.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
const SB = env.SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;

const failures = [];
const notes = [];
const pass = (m) => console.log(`  · ${m}`);
const fail = (m) => { failures.push(m); console.log(`  ✗ ${m}`); };

/* ----------------------------------------------------------- plumbing */

/** `next dev` recompiles on demand and occasionally drops a socket mid-run.
 *  One retry, because a proof that fails on a hot reload proves nothing. */
const once = async (fn) => {
  try { return await fn(); } catch { await new Promise((r) => setTimeout(r, 1500)); return fn(); }
};

const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };
const j = async (res) => { const t = await res.text(); try { return t ? JSON.parse(t) : null; } catch { return t; } };
const rest = (p, init = {}) => once(() => fetch(`${SB}/rest/v1/${p}`, { ...init, headers: { ...svc, ...(init.headers ?? {}) } }).then(j));

const apiCall = (token, p, init = {}) => once(async () => {
  const res = await fetch(`${API}/api/v1${p}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* html 404 */ }
  return { status: res.status, json };
});

const HIDE_DEV_CHROME = `.__expo_fast_refresh { display: none !important; }`;
const installHideDevChrome = (ctx) =>
  ctx.addInitScript((css) => {
    const add = () => { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); };
    if (document.head) add(); else document.addEventListener('DOMContentLoaded', add);
  }, HIDE_DEV_CHROME);

const shot = async (page, name) => {
  const root = page.locator('#root');
  await ((await root.count()) ? root : page).screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log(`  ✓ ${name}.png`);
};

const on = (page, screen, testid) => page.locator(`[data-testid="${screen}"] [data-testid="${testid}"]`).last();
const seen = async (page, screen, testid) =>
  (await page.locator(`[data-testid="${screen}"] [data-testid="${testid}"]`).count()) > 0;
const visible = async (page, screen, ms = 20_000) =>
  page.locator(`[data-testid="${screen}"]`).last().waitFor({ state: 'visible', timeout: ms }).then(() => true).catch(() => false);
const tap = async (page, screen, testid, ms = 900) => {
  const el = on(page, screen, testid);
  await el.waitFor({ state: 'visible', timeout: 40_000 });
  await el.click();
  await page.waitForTimeout(ms);
};
const go = async (page, url, wait = 2600) => {
  await page.goto(url, { waitUntil: 'load', timeout: 180_000 });
  await page.waitForTimeout(wait);
};
const text = (page, testid) => page.locator(`[data-testid="${testid}"]`).last().innerText().catch(() => '');

async function must(page, screen, testid, why) {
  try {
    await on(page, screen, testid).waitFor({ state: 'visible', timeout: 30_000 });
    pass(why);
    return true;
  } catch {
    fail(`${why} — [${screen}] > [${testid}] never appeared`);
    return false;
  }
}

async function accessToken(page) {
  return page.evaluate(() => {
    const keys = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.includes('auth-token') && !k.includes('code-verifier')) keys.push(k);
    }
    keys.sort();
    const bases = new Set(keys.map((k) => k.replace(/\.\d+$/, '')));
    for (const base of bases) {
      const parts = keys.filter((k) => k === base || k.startsWith(base + '.'));
      let raw = parts.map((k) => window.localStorage.getItem(k) ?? '').join('');
      if (!raw) continue;
      if (raw.startsWith('base64-')) { try { raw = atob(raw.slice(7)); } catch { continue; } }
      try {
        const v = JSON.parse(raw);
        const s = v?.currentSession ?? v;
        if (s?.access_token) return { token: s.access_token, user_id: s.user?.id ?? null };
      } catch { /* not this one */ }
    }
    return null;
  });
}

/** Onboarding belongs to another lane and moves; walk whatever is on screen. */
async function signUpAndOnboard(page, who) {
  await go(page, `${BASE}/welcome`, 3000);
  await tap(page, 'screen-welcome', 'cta-get-started');
  await on(page, 'screen-sign-up', 'field-email').fill(who.email);
  await on(page, 'screen-sign-up', 'field-password').fill(who.password);
  await tap(page, 'screen-sign-up', 'cta-create', 1500);

  const step = async (screen, ids) => {
    if (!(await visible(page, screen, 12_000))) return;
    for (const id of ids) if (await seen(page, screen, id)) await tap(page, screen, id, 600);
  };
  await step('screen-onboarding-kai', ['mode-day_trade', 'funding-paper']);
  await step('screen-goal', ['mode-day_trade', 'goal-day_trade', 'cta-continue']);
  await step('screen-risk', ['cta-continue']);
  await step('screen-personalize', ['experience-some', 'exp-some', 'focus-big_tech', 'cta-continue']);
  await step('screen-summary', ['cta-start', 'cta-continue']);
  await step('screen-kai-plan', ['cta-start']);
  if (!(await visible(page, 'screen-home', 40_000))) throw new Error(`${who.email}: onboarding never reached Home`);
  await page.waitForTimeout(1200);
  const s = await accessToken(page);
  if (!s?.token) throw new Error(`${who.email}: no access token after sign-up`);
  return s;
}

/* ------------------------------------------------------------- the run */

const main = async () => {
  await fs.mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const mk = async () => {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 900 }, deviceScaleFactor: 2, colorScheme: 'dark',
    });
    await installHideDevChrome(ctx);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('  ! page error:', e.message));
    page.on('console', (m) => { if (m.type() === 'error') console.log('  ! console:', m.text().slice(0, 180)); });
    return { ctx, page };
  };

  const staff = await mk();
  let member = null;

  try {
    console.log(`staff-to-be: ${STAFF.email}`);
    console.log(`newcomer:    ${MEMBER.email}`);

    console.log('\n[1] an ordinary signed-in user — no door, and nothing behind it');
    const s1 = await signUpAndOnboard(staff.page, STAFF);
    await go(staff.page, `${BASE}/account`, 3000);
    if (!(await visible(staff.page, 'screen-account'))) fail('the Account board never rendered');
    if (await seen(staff.page, 'screen-account', 'nav-admin')) fail('a non-staff account was shown the operator row');
    else pass('Account draws no operator row for a non-staff user');
    await shot(staff.page, 'admin-01-account-no-door');

    for (const p of ['/admin/overview', '/admin/people', '/admin/invites', '/admin/audit', '/admin/sync']) {
      const r = await apiCall(s1.token, p);
      if (r.status === 404 && r.json?.error?.code === 'NOT_FOUND') pass(`GET ${p} → NOT_FOUND with their own token (never FORBIDDEN)`);
      else fail(`GET ${p} answered ${r.status} ${JSON.stringify(r.json).slice(0, 140)}`);
    }

    await go(staff.page, `${BASE}/admin`, 3500);
    if (await visible(staff.page, 'screen-admin-denied', 12_000)) {
      const copy = await staff.page.locator('[data-testid="screen-admin-denied"]').innerText();
      if (/not something this app does/i.test(copy)) pass('the browser route answers with the API\'s own sentence, not "you are not an admin"');
      else fail(`the refusal copy drifted: "${copy.slice(0, 120)}"`);
    } else fail('/admin did not render the refusal screen for a non-staff user');
    await shot(staff.page, 'admin-02-denied');

    console.log('\n[2] grant this throwaway user `admin` — through set_staff_role, as the service role');
    const owners = await rest('staff_members?role=eq.owner&revoked_at=is.null&select=user_id');
    const ownerId = Array.isArray(owners) && owners[0]?.user_id;
    if (!ownerId) throw new Error('no active owner in staff_members — run scripts/create-owner.mjs');
    const granted = await rest('rpc/set_staff_role', {
      method: 'POST',
      body: JSON.stringify({ p_user_id: s1.user_id, p_role: 'admin', p_actor_user_id: ownerId, p_reason: 'ADMIN-4 browser proof' }),
    });
    if (granted?.role === 'admin') pass(`set_staff_role granted admin to ${STAFF.email}`);
    else fail(`set_staff_role did not grant: ${JSON.stringify(granted).slice(0, 160)}`);

    const me = await apiCall(s1.token, '/me');
    if (me.json?.staff?.is_staff && me.json.staff.role === 'admin') pass(`/me now reports staff: ${me.json.staff.plain}`);
    else fail(`/me did not report staff: ${JSON.stringify(me.json?.staff)}`);

    console.log('\n[3] the door appears in Account');
    await go(staff.page, `${BASE}/account`, 3000);
    await must(staff.page, 'screen-account', 'nav-admin', 'Account now draws the operator row');
    await shot(staff.page, 'admin-03-account-door');
    await tap(staff.page, 'screen-account', 'nav-admin', 3500);

    console.log('\n[4] overview — the funnel, the ledger, and the metric that refuses');
    if (!(await visible(staff.page, 'screen-admin-overview', 30_000))) fail('the overview never rendered');
    await must(staff.page, 'screen-admin-overview', 'admin-rail', 'the board rail is the app\'s own ChipRail');
    const overviewText = await staff.page.locator('[data-testid="screen-admin-overview"]').innerText();
    if (/not tracked yet/.test(overviewText)) pass('at least one metric renders "not tracked yet" rather than a zero it did not measure');
    else fail('no metric said "not tracked yet" — check that a null value is not being coalesced');
    for (const w of ['THE FUNNEL', 'COUNTED FROM ROWS', 'INVITES', 'SOURCES']) {
      if (overviewText.includes(w)) pass(`section "${w}" is on the board`);
      else fail(`section "${w}" is missing`);
    }
    await shot(staff.page, 'admin-04-overview');

    console.log('\n[5] sources — the app connector runs for real, twice');
    await go(staff.page, `${BASE}/admin/sources`, 3500);
    if (!(await visible(staff.page, 'screen-admin-sources', 25_000))) fail('the sources board never rendered');
    for (const s of ['kai_sms', 'stripe']) {
      if (await seen(staff.page, 'screen-admin-sources', `source-reason-${s}`)) {
        pass(`${s} is shown as switched off with its reason: "${(await text(staff.page, `source-reason-${s}`)).slice(0, 80)}"`);
      } else fail(`${s} did not render its "switched off" reason`);
    }
    await tap(staff.page, 'screen-admin-sources', 'sync-app', 6000);
    const run1 = await text(staff.page, 'sync-result');
    pass(`first run: ${run1}`);
    await shot(staff.page, 'admin-05-sources');
    await staff.page.locator('[data-testid="sheet-sync"] >> text=Close').last().click().catch(() => {});
    await staff.page.waitForTimeout(800);
    await tap(staff.page, 'screen-admin-sources', 'sync-app', 6000);
    const run2 = await text(staff.page, 'sync-result');
    const created2 = /created (\d+)/.exec(run2)?.[1];
    if (created2 === '0') pass(`second run created ${created2} — a re-ingest writes nothing new`);
    else fail(`the second run created ${created2 ?? '?'}: ${run2}`);
    await shot(staff.page, 'admin-05b-sources-second-run');
    await staff.page.locator('[data-testid="sheet-sync"] >> text=Close').last().click().catch(() => {});

    console.log('\n[6] people — search finds a real person');
    await go(staff.page, `${BASE}/admin/people`, 3500);
    if (!(await visible(staff.page, 'screen-admin-people', 25_000))) fail('the people board never rendered');
    await on(staff.page, 'screen-admin-people', 'people-search').fill(STAFF.email);
    await staff.page.waitForTimeout(2600);
    const searched = await text(staff.page, 'people-searched');
    if (/Searched .*email/i.test(searched)) pass(`the screen states what it searched: "${searched}"`);
    else fail(`the searched-fields footnote is missing: "${searched}"`);
    const rowCount = await staff.page.locator('[data-testid^="person-"]').count();
    if (rowCount >= 1) pass(`search for ${STAFF.email} returned ${rowCount} row(s)`);
    else fail('the search found nobody — the app source did not create this person');
    await shot(staff.page, 'admin-06-people');

    console.log('\n[7] the person\'s file');
    await staff.page.locator('[data-testid^="person-"]').first().click();
    await staff.page.waitForTimeout(3200);
    if (!(await visible(staff.page, 'screen-admin-person', 25_000))) fail('the person board never rendered');
    const personText = await staff.page.locator('[data-testid="screen-admin-person"]').innerText();
    if (/not tracked yet/.test(personText)) pass('money that this database does not know renders "not tracked yet"');
    else fail('the money block did not say "not tracked yet" for an unknown figure');
    if (/not copied into the CRM|counts and timestamps/i.test(personText)) pass('the Kai block says the words are not here');
    else fail('the Kai privacy line is missing from the person board');
    if (/audit log/i.test(personText)) pass('the page says out loud that opening it was logged');
    await shot(staff.page, 'admin-07-person');

    console.log('\n[8] make a code');
    await go(staff.page, `${BASE}/admin/invites`, 3500);
    if (!(await visible(staff.page, 'screen-admin-invites', 25_000))) fail('the invites board never rendered');
    await on(staff.page, 'screen-admin-invites', 'invite-label').fill(`ADMIN-4 proof ${STAMP}`);
    await tap(staff.page, 'screen-admin-invites', 'cta-make-invite', 4000);
    const code = (await text(staff.page, 'invite-made-code')).trim();
    const link = (await text(staff.page, 'invite-made-link')).trim();
    if (/^[A-Z0-9]{10,}$/.test(code)) pass(`code ${code} minted (${code.length} glyphs, no ambiguous ones)`);
    else fail(`the code does not look like a code: "${code}"`);
    if (link === `/join/${code}`) pass(`the link is ${link} — a path, so the host belongs to whoever shares it`);
    else fail(`the link is "${link}", expected /join/${code}`);
    await shot(staff.page, 'admin-08-invite');

    console.log('\n[9] a brand new user redeems it');
    member = await mk();
    const s2 = await signUpAndOnboard(member.page, MEMBER);
    await go(member.page, `${BASE}/join/${code}`, 3500);
    if (!(await visible(member.page, 'screen-join', 25_000))) fail('the join screen never rendered');
    await tap(member.page, 'screen-join', 'cta-join-redeem', 4000);
    if (await seen(member.page, 'screen-join', 'join-done')) {
      pass(`redeemed: "${(await text(member.page, 'join-plain')).slice(0, 90)}"`);
    } else {
      fail(`the redemption was refused: "${(await text(member.page, 'join-refused')).slice(0, 140)}"`);
    }
    await shot(member.page, 'admin-09-redeemed');

    const memberMe = await apiCall(s2.token, '/me');
    if (memberMe.json?.subscription?.tier === 'premium') pass('the new account really is premium now — read back from /me, not predicted');
    else fail(`the grant did not land: tier is ${memberMe.json?.subscription?.tier}`);

    console.log('\n[10] the person exists, and their status MOVES');
    // GROUND TRUTH, READ FROM THE DATABASE, NOT FROM THE SCREEN. Straight after
    // a redemption the person has an app_user identity and no email yet — the
    // email is what the `app` source fills in — so they are genuinely not
    // findable by the People search at this instant, and asserting otherwise
    // would be asserting a bug.
    const dbRow = await rest(`crm_people?app_user_id=eq.${s2.user_id}&select=id,status,source,primary_email`);
    const before = Array.isArray(dbRow) ? dbRow[0] : null;
    if (before) pass(`the redemption itself created the person: ${before.id} — status ${before.status}, source ${before.source}`);
    else fail('the redeemer is not in the CRM at all');

    const findPerson = async () => {
      const r = await apiCall(s1.token, `/admin/people?q=${encodeURIComponent(MEMBER.email)}&limit=5`);
      return (r.json?.people ?? [])[0] ?? null;
    };
    if (await findPerson()) {
      notes.push('the redeemer was already searchable by email before the sync');
    } else {
      pass('and is not yet searchable by email — the app source is what fills that in');
    }

    await go(staff.page, `${BASE}/admin/sources`, 3000);
    await tap(staff.page, 'screen-admin-sources', 'sync-app', 6000);
    pass(`third run (after the grant): ${await text(staff.page, 'sync-result')}`);
    await staff.page.locator('[data-testid="sheet-sync"] >> text=Close').last().click().catch(() => {});

    const after = await findPerson();
    if (!after) {
      fail('the redeemer is still not findable after the sync');
    } else {
      if (after.id === before?.id) pass(`the sync resolved to the SAME person (${after.id}) — no duplicate was created`);
      else fail(`the sync created a second person: ${before?.id} then ${after.id}`);
      if (before && before.status !== after.status) pass(`status moved ${before.status} → ${after.status}`);
      else fail(`status did not move: ${before?.status} → ${after.status}`);
      if (after.primary_email === MEMBER.email) pass('and the source filled in their email');
    }

    await go(staff.page, `${BASE}/admin/people`, 3000);
    await on(staff.page, 'screen-admin-people', 'people-search').fill(MEMBER.email);
    await staff.page.waitForTimeout(2600);
    await shot(staff.page, 'admin-10-people-after');
    if (after) {
      await go(staff.page, `${BASE}/admin/person/${after.id}`, 3500);
      const t = await staff.page.locator('[data-testid="screen-admin-person"]').innerText().catch(() => '');
      if (/PAYING/.test(t)) pass('the person board shows the moved status in type, not in green');
      if (/Premium/i.test(t)) pass('the file shows the premium the code granted');
      await shot(staff.page, 'admin-11-person-after');
    }

    console.log('\n[11] the audit log shows every step');
    await go(staff.page, `${BASE}/admin/audit`, 3500);
    if (!(await visible(staff.page, 'screen-admin-audit', 25_000))) fail('the audit board never rendered');
    await shot(staff.page, 'admin-12-audit');
    for (const action of [
      'admin.overview.read', 'crm.sync.run', 'admin.people.search', 'crm.person.read',
      'invite.create', 'invite.redeem', 'admin.audit.read',
    ]) {
      const r = await apiCall(s1.token, `/admin/audit?action=${action}&limit=3`);
      const n = (r.json?.entries ?? []).length;
      if (n > 0) pass(`audit carries ${action} (${n} shown) — "${r.json.entries[0].plain}"`);
      else fail(`audit has no ${action} row`);
    }
    const anyLens = await staff.page.locator('[data-testid^="audit-"]').count();
    if (anyLens > 0) pass(`the audit board itself rendered ${anyLens} rows`);
    else fail('the audit board rendered no rows');

    console.log('\n[12] the newcomer is still an ordinary member');
    await go(member.page, `${BASE}/account`, 3000);
    if (await seen(member.page, 'screen-account', 'nav-admin')) fail('the redeemer was shown the operator row');
    else pass('the redeemer sees no operator row');
    await go(member.page, `${BASE}/admin/people`, 3500);
    if (await visible(member.page, 'screen-admin-denied', 12_000)) pass('and the route refuses them in the browser too');
    else fail('the redeemer was not refused at /admin/people');
    for (const p of ['/admin/people', '/admin/audit']) {
      const r = await apiCall(s2.token, p);
      if (r.status === 404) pass(`GET ${p} → 404 for the redeemer`);
      else fail(`GET ${p} answered ${r.status} for an ordinary user`);
    }
    await shot(member.page, 'admin-13-newcomer-denied');

    console.log('\n[13] the round-4 deep link, fixed: /alert/<id> for a seconds-old alert');
    const draft = await apiCall(s2.token, '/alerts/draft', {
      method: 'POST',
      body: JSON.stringify({ natural_language: `Tell me when ${SYMBOL} trades above 500`, refs: { symbol: SYMBOL, level: 500 } }),
    });
    const draftId = draft.json?.alert?.id;
    if (!draftId) fail(`could not draft an alert: ${draft.status}`);
    const armed = draftId
      ? await apiCall(s2.token, '/alerts', { method: 'POST', body: JSON.stringify({ draft_id: draftId }) })
      : { json: null };
    const alertId = armed.json?.alert?.id ?? armed.json?.id ?? draftId;
    if (alertId) {
      await go(member.page, `${BASE}/alert/${alertId}`, 5000);
      const landed = member.page.url().replace(BASE, '');
      if (landed.startsWith(`/trade/${SYMBOL}`)) pass(`the deep link resolved to the chart: ${landed}`);
      else if (landed.startsWith('/alerts')) fail(`the deep link still falls back to the list: ${landed}`);
      else fail(`the deep link went somewhere unexpected: ${landed}`);
      await shot(member.page, 'admin-14-deeplink');
    }
  } catch (e) {
    fail(`run aborted: ${e.message}`);
    await shot(staff.page, 'admin-99-aborted').catch(() => {});
  } finally {
    await staff.ctx.close().catch(() => {});
    if (member) await member.ctx.close().catch(() => {});
    await browser.close();
  }

  console.log('\n──────── notes ────────');
  notes.forEach((n) => console.log(`  · ${n}`));
  if (failures.length) {
    console.log('\n──────── FAILURES ────────');
    failures.forEach((f) => console.log(`  ✗ ${f}`));
    process.exit(1);
  }
  console.log('\nproof-admin: green');
};

main();
