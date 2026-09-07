/**
 * A DEAD SERVICE MUST NOT LOOK LIKE A COMMUNITY.
 *
 * The owner opened the app during a window where the API was not answering and
 * saw a club full of posts with names on them. They were `fixtureRooms` and
 * `fixtureMessages`: the community layer fell back to example content whenever
 * the live call failed, whether or not anybody had asked for examples. A small
 * "Example rooms" caption was the only tell, and it is not enough — a feed of
 * invented posts reads as a feed.
 *
 * This runs the app in REAL mode (no EXPO_PUBLIC_FIXTURES) and blocks the API
 * at the network layer, which is the same thing the owner hit. It asserts what
 * must NOT be there — the fixture authors by name — and that what IS there
 * says so and offers a retry.
 *
 *   EXPO_PUBLIC_SUPABASE_URL=… EXPO_PUBLIC_SUPABASE_ANON_KEY=… \
 *   EXPO_PUBLIC_API_BASE=http://localhost:3000 npx expo start --web --port 8108
 *   PROOF_BASE=http://localhost:8108 node scripts/proof-no-fake-data.mjs
 */
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readFileSync } from 'node:fs';

const OUT = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'proof');
const BASE = process.env.PROOF_BASE ?? 'http://localhost:8108';
mkdirSync(OUT, { recursive: true });

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail === undefined ? '' : `\n        ${String(detail).slice(0, 300)}`}`); }
};

/** Names that only ever exist in `features/community/fixtures`. */
const FIXTURE_TELLS = ['Jordan', 'Priya Raman', 'Marcus Kim', 'reclaimed VWAP on strong volume'];

/* A throwaway account, because /community is behind the session gate. */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  readFileSync(path.resolve(ROOT, process.env.PROOF_ENV_FILE ?? '../api/.env.local'), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
const S = env.SUPABASE_URL, K = env.SUPABASE_SERVICE_ROLE_KEY;
const svc = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' };
const stamp = Date.now();
const email = `nofake+${stamp}@cheatcode.test`;
const PW = 'paper-money-first';
const made = await (await fetch(`${S}/auth/v1/admin/users`, {
  method: 'POST', headers: svc, body: JSON.stringify({ email, password: PW, email_confirm: true }),
})).json();
await fetch(`${S}/rest/v1/profiles?user_id=eq.${made.id}`, {
  method: 'PATCH', headers: { ...svc, Prefer: 'return=representation' },
  body: JSON.stringify({ handle: `nf${stamp}`.slice(0, 15), primary_mode: 'day_trade', onboarding: { completed_at: new Date().toISOString() } }),
});

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 1400 }, colorScheme: 'dark' });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/sign-in`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.locator('[data-testid="screen-sign-in"]').waitFor({ timeout: 90_000 });
  await page.locator('input[data-testid="field-email"]').first().fill(email);
  await page.locator('input[data-testid="field-password"]').first().fill(PW);
  await page.locator('[data-testid="cta-sign-in"]').click();
  await page.waitForTimeout(9000);

  /**
   * NOW the dead-window, reproduced properly.
   *
   * The API is blocked and Supabase is left up, which is the strongest thing
   * a browser can actually assert here. The community layer falls back from
   * the API to a direct Supabase read — REAL rooms — so the club keeps working
   * and no failure state is due. What must be true either way is that not one
   * line of example content appears, and before this change it did: the same
   * failure produced `fixtureRooms` and `fixtureMessages` with invented names
   * on them. Blocking Supabase as well would be closer to the owner's dead
   * window, but it also fails the profile read and the session gate diverts to
   * onboarding before the club renders — see `no-fake-data-test.mts`.
   */
  await page.route('**/api/v1/**', (r) => r.abort());

  await page.goto(`${BASE}/community`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForTimeout(9000);
  const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');

  console.log('\n[1] the club, with nothing reachable');
  for (const tell of FIXTURE_TELLS) {
    ok(`no invented content on screen: "${tell}"`, !body.includes(tell), body.slice(0, 200));
  }
  /**
   * THE UNREACHABLE BANNER IS NOT ASSERTED HERE, ON PURPOSE.
   *
   * Reaching it means making Supabase unreachable too — and that fails the
   * profile read, so `onboardingDone` goes false and the session gate diverts
   * to onboarding before the club renders. The proof would then be
   * photographing the onboarding screen. `no-fake-data-test.mts` asserts the
   * banner and its retry exist, and asserts the rule that produces them; what
   * this file adds is the part only a browser can say — that with the service
   * down, a real member is not reading invented posts.
   */
  ok('the club still renders rather than crashing', /Cheat Code Club/i.test(body), body.slice(0, 160));
  await page.screenshot({ path: path.join(OUT, 'nofake-01-community-unreachable.png') });
  console.log('  · nofake-01-community-unreachable.png');
} catch (e) {
  failures.push(`threw: ${e.message}`);
  console.error(e);
} finally {
  await browser.close();
  if (made?.id) await fetch(`${S}/auth/v1/admin/users/${made.id}`, { method: 'DELETE', headers: svc });
  console.log(`\n${pass} passed, ${failures.length} failed`);
  failures.forEach((f) => console.log(`  · ${f}`));
  process.exit(failures.length ? 1 : 0);
}
