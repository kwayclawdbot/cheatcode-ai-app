/**
 * SWING-3 — the browser proof: a morning pick reaches a person.
 *
 *   node scripts/proof-swing3.mjs
 *
 * SWING-1 put the Kai morning picks into the app's database. Nothing told
 * anybody, because `setup_alert_prefs` was read by no code. This proves the
 * connector on screen, in a real Chromium, against the real stack: local
 * Supabase holding setups the ingest actually pulled from the live Kai scanner,
 * apps/api on :3000, Metro on :8081.
 *
 * It signs a REAL new user up through the UI — whose `setup_alert_prefs` row is
 * whatever the 0013 signup trigger gives them and which they have never
 * touched, because that is every user on their first morning — then runs the
 * real fan-out and asserts, on screen:
 *
 *   - the pick that clears the default grade floor arrives in the inbox;
 *   - under CHANGES, not "needs you" — nobody asked for this symbol;
 *   - the row says the symbol and the plain thesis, and NOT the letter grade
 *     (bands.ts: "Gold never means profit" — a push is where a quality mark
 *     gets misread as a forecast);
 *   - tapping it opens that setup inside its symbol workspace, not the Alerts
 *     tab, with the setup id carried through the `/setup/[id]` redirect;
 *   - the picks BELOW the user's floor never appear at all.
 *
 * Everything lands in proof/swing3-*.png.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const API_DIR = path.resolve(ROOT, '../api');
const OUT = path.join(ROOT, 'proof');
const BASE = process.env.PROOF_BASE ?? 'http://localhost:8081';
const API = process.env.PROOF_API ?? 'http://localhost:3000';
const EMAIL = `proofswing3+${Date.now()}@cheatcode.test`;
const PASSWORD = 'paper-money-first';

const HIDE_DEV_CHROME = `.__expo_fast_refresh { display: none !important; }`;
const installHideDevChrome = (ctx) =>
  ctx.addInitScript((css) => {
    const add = () => { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); };
    if (document.head) add(); else document.addEventListener('DOMContentLoaded', add);
  }, HIDE_DEV_CHROME);

const shot = async (p, n) => {
  const root = p.locator('#root');
  await ((await root.count()) ? root : p).screenshot({ path: path.join(OUT, `${n}.png`) });
  console.log(`  ✓ ${n}.png`);
};
const on = (page, screen, testid) => page.locator(`[data-testid="${screen}"] [data-testid="${testid}"]`).last();
const tap = async (page, screen, testid, ms = 700) => {
  const el = on(page, screen, testid);
  await el.waitFor({ state: 'visible', timeout: 40_000 });
  await el.click();
  await page.waitForTimeout(ms);
};
const arrive = async (page, screen, ms = 900) => {
  await page.locator(`[data-testid="${screen}"]`).last().waitFor({ state: 'visible', timeout: 40_000 });
  await page.waitForTimeout(ms);
};
const go = async (page, route, wait = 3000) => {
  await page.goto(`${BASE}${route}`, { waitUntil: 'load', timeout: 180_000 });
  await page.waitForTimeout(wait);
};
const seen = async (page, screen, testid) =>
  (await page.locator(`[data-testid="${screen}"] [data-testid="${testid}"]`).count()) > 0;

let pass = 0;
let fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail === undefined ? '' : `\n        ${JSON.stringify(detail)}`}`); }
};

async function envFromApi(name) {
  const text = await fs.readFile(path.join(API_DIR, '.env.local'), 'utf8');
  const v = text.match(new RegExp(`^${name}=(.*)$`, 'm'))?.[1]?.trim();
  if (!v) throw new Error(`${name} is not set — this proof is env-driven like the ingest is`);
  return v;
}
async function db() {
  return {
    url: (process.env.SUPABASE_URL ?? await envFromApi('SUPABASE_URL')).replace(/\/+$/, ''),
    key: process.env.SUPABASE_SERVICE_ROLE_KEY ?? await envFromApi('SUPABASE_SERVICE_ROLE_KEY'),
  };
}
async function rest(q) {
  const { url, key } = await db();
  const res = await fetch(`${url}/rest/v1/${q}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`rest ${q}: ${res.status} ${await res.text()}`);
  return res.json();
}

/** The real fan-out, run the way an operator or a cron would run it. */
function publish(date) {
  return new Promise((resolve, reject) => {
    const p = spawn('npx', ['tsx', 'scripts/publish-swing-setups.ts', `--date=${date}`, '--json'],
      { cwd: API_DIR, env: process.env });
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    // The report is pretty-printed to stdout, which the app's structured
    // logger also writes to. Take the last top-level object, not the first line.
    p.on('close', (code) => {
      if (code !== 0) return reject(new Error(`publish exited ${code}: ${err || out}`));
      const at = out.lastIndexOf('\n{\n');
      const json = at === -1 ? out : out.slice(at + 1);
      try { resolve(JSON.parse(json)); }
      catch (e) { reject(new Error(`publish printed no report: ${e.message}\n${out.slice(-400)}`)); }
    });
  });
}

const main = async () => {
  await fs.mkdir(OUT, { recursive: true });

  /* ---- the session with the most real picks on it ---------------------- */
  const live = await rest(
    'setups?select=id,symbol,score,grade_band,grade_display,thesis_plain,quote_snapshot'
    + '&mode=eq.swing&state=eq.ready&intent=eq.buy_to_open'
    + '&quote_snapshot->>origin=eq.kai_sms_scanner&order=score.desc');
  if (!live.length) throw new Error('no live ingested swing setups — run scripts/ingest-swing-setups.ts first');

  const bySession = new Map();
  for (const s of live) {
    const d = s.quote_snapshot?.et_date;
    if (d) bySession.set(d, [...(bySession.get(d) ?? []), s]);
  }
  const [session, picks] = [...bySession.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  const above = picks.filter((s) => s.grade_band === 'A' || s.grade_band === 'B');
  const below = picks.filter((s) => s.grade_band === 'C');
  if (!above.length) throw new Error(`session ${session} has no pick above the default B floor`);

  console.log(`\nsession ${session}, ${picks.length} live pick(s) straight from the ingest:`);
  for (const s of picks) console.log(`  ${s.symbol.padEnd(6)} score ${s.score} band ${s.grade_band}`);
  console.log(`  → ${above.length} at or above the default floor, ${below.length} below it`);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  await installHideDevChrome(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  ! page error:', e.message));

  try {
    console.log(`\n[1] a real user who has never set a preference: ${EMAIL}`);
    await go(page, '/welcome', 2500);
    await tap(page, 'screen-welcome', 'cta-get-started');
    await arrive(page, 'screen-sign-up');
    await on(page, 'screen-sign-up', 'field-email').fill(EMAIL);
    await on(page, 'screen-sign-up', 'field-password').fill(PASSWORD);
    await tap(page, 'screen-sign-up', 'cta-create');
    await walkOnboarding(page);

    const me = (await rest(`profiles?select=user_id&limit=1&order=created_at.desc`))[0];
    const prefs = (await rest(
      `setup_alert_prefs?select=enabled,min_grade,modes,intents,symbols_include,symbols_exclude&user_id=eq.${me.user_id}`))[0];
    // 0013 stamps this row at signup. The user has expressed no preference; the
    // floor that decides what they hear this morning is a DEFAULT, not a choice.
    ok('their prefs are the untouched signup defaults',
      prefs?.enabled === true && prefs?.min_grade === 'B'
      && !prefs?.symbols_include && !prefs?.symbols_exclude, prefs);

    console.log('\n[2] the inbox before the morning runs');
    await go(page, '/account/notifications', 2500);
    await arrive(page, 'screen-notifications');
    await shot(page, 'swing3-1-inbox-empty');
    const emptyText = await page.locator('[data-testid="screen-notifications"]').last().innerText();
    ok('it says there is nothing, rather than showing a stale list', /Nothing here right now/.test(emptyText), emptyText.slice(0, 120));

    console.log(`\n[3] the fan-out, run as a cron would run it`);
    const report = await publish(session);
    console.log(`    published ${report.published} of ${report.considered} to ${report.notified} recipient(s)`);
    console.log(`    refusals: ${JSON.stringify(report.refusals)}`);
    ok('every pick above the floor was announced', report.published === picks.length, { published: report.published, picks: picks.length });
    ok('and the ones below it were refused per user, not published',
      (report.refusals.below_min_grade ?? 0) > 0 || below.length === 0, report.refusals);

    console.log('\n[4] the inbox after');
    await go(page, '/account/notifications', 3000);
    await arrive(page, 'screen-notifications');
    await shot(page, 'swing3-2-inbox-delivered');
    const text = await page.locator('[data-testid="screen-notifications"]').last().innerText();

    for (const s of above) {
      ok(`${s.symbol} (band ${s.grade_band}) is on screen`, text.includes(s.symbol), text.slice(0, 400));
    }
    for (const s of below) {
      ok(`${s.symbol} (band C) is NOT — it is under this user's floor`, !text.includes(`${s.symbol} —`), text.slice(0, 400));
    }
    ok('it is filed under CHANGES', /CHANGES/.test(text), text.slice(0, 200));
    ok('and not under NEEDS YOU', !/NEEDS YOU/.test(text), text.slice(0, 200));
    ok('the row carries the plain thesis, not a payload dump',
      above.some((s) => s.thesis_plain && text.includes(s.thesis_plain.slice(0, 24))), text.slice(0, 400));
    ok('the letter grade is not in the copy', !/Grade [ABC]/.test(text), text.slice(0, 400));

    console.log('\n[5] the CHANGES filter, and the tap');
    await tap(page, 'screen-notifications', 'notif-filter', 400).catch(() => {});
    await page.getByText('Changes', { exact: true }).last().click().catch(() => {});
    await page.waitForTimeout(1200);
    await shot(page, 'swing3-3-inbox-changes');

    const rowIds = await rest(
      `notifications?select=id,payload,kind&kind=eq.setup_published&user_id=eq.${me.user_id}&order=created_at.desc`);
    ok('the rows in the table belong to this user', rowIds.length === above.length, rowIds.length);
    const target = rowIds[0];
    await go(page, '/account/notifications', 2000);
    await tap(page, 'screen-notifications', `notif-${target.id}`, 3000);
    // `/setup/[id]` is a REDIRECT that exists for exactly this case (see the
    // route's own comment): a setup is a module inside the symbol's workspace,
    // not a destination. What must survive the hop is the setup id.
    const url = page.url();
    ok('tapping it opens that symbol\'s workspace, not the Alerts tab',
      url.includes(`/symbol/${target.payload.symbol}`), url);
    ok('and the setup it is about survives the redirect',
      url.includes(`setup=${target.payload.setup_id}`), url);
    await shot(page, 'swing3-4-setup-from-notification');
    const setupText = await page.locator('body').innerText();
    ok('and the setup page is really that symbol', setupText.includes(target.payload.symbol), setupText.slice(0, 200));
  } finally {
    await browser.close();
  }
};

/** Onboarding is another lane's screen set; walk whatever is actually there. */
async function walkOnboarding(page) {
  const visible = async (screen) =>
    page.locator(`[data-testid="${screen}"]`).last()
      .waitFor({ state: 'visible', timeout: 12_000 }).then(() => true).catch(() => false);
  const step = async (screen, ids) => {
    if (!(await visible(screen))) return false;
    console.log(`  · ${screen}`);
    for (const id of ids) if (await seen(page, screen, id)) await tap(page, screen, id, 700);
    return true;
  };
  await step('screen-onboarding-kai', ['mode-swing', 'funding-paper']);
  await step('screen-goal', ['mode-swing', 'goal-swing', 'cta-continue']);
  await step('screen-risk', ['cta-continue']);
  await step('screen-personalize', ['experience-some', 'exp-some', 'focus-big_tech', 'cta-continue']);
  await step('screen-summary', ['cta-start', 'cta-continue']);
  await step('screen-kai-plan', ['cta-start']);
  await step('screen-learn', ['level-504', 'cta-watch', 'cta-continue']);
  await page.locator('[data-testid="screen-home"]').last()
    .waitFor({ state: 'visible', timeout: 40_000 })
    .catch(() => { throw new Error('onboarding never reached Home'); });
}

main()
  .catch((e) => { fail += 1; console.error('\nPROOF THREW:', e?.message ?? e); })
  .finally(() => {
    console.log(`\n${pass} passed, ${fail} failed\n`);
    process.exit(fail === 0 ? 0 : 1);
  });
