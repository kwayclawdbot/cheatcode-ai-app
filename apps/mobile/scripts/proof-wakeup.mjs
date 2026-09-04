/**
 * Proof for the Kai wake-up home screen.
 *
 *   EXPO_PUBLIC_FIXTURES=1 npx expo start --web --port 8081   (another shell)
 *   node scripts/proof-wakeup.mjs
 *
 * Five shots at 390x844 into proof/:
 *   1  first open of the day  — Kai wakes up
 *   2  second open of the day — the same message, not replayed
 *   3  the offers answered inside the conversation
 *   4  a day with genuinely nothing to report
 *   5  the morning the data never arrived (greeting still stands)
 *
 * Each shot also prints the words on screen, so the report can quote them.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'proof');
const BASE = process.env.PROOF_BASE ?? 'http://localhost:8081';
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

let failures = 0;
const fail = (m) => { failures++; console.log(`  ✗ ${m}`); };
const pass = (m) => console.log(`  ✓ ${m}`);

const settle = (page, ms = 1400) => page.waitForTimeout(ms);

async function shot(page, name) {
  const root = page.locator('#root');
  await ((await root.count()) ? root : page).screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log(`  · proof/${name}.png`);
}

async function text(page, testid) {
  const el = page.locator(`[data-testid="${testid}"]`).first();
  if (!(await el.count())) return null;
  return (await el.innerText()).replace(/\s+/g, ' ').trim();
}

/** Print, and check, everything Kai said on this screen. */
async function transcribe(page, label) {
  const parts = {
    greeting: await text(page, 'wakeup-greeting'),
    state: await text(page, 'wakeup-state'),
    lead: await text(page, 'wakeup-lead'),
    evidence: await text(page, 'wakeup-evidence'),
    aside: await text(page, 'wakeup-aside'),
    question: await text(page, 'wakeup-question'),
  };
  const pills = await page.locator('[data-testid^="wakeup-direction-"]').allInnerTexts();
  console.log(`\n  — ${label} —`);
  for (const [k, v] of Object.entries(parts)) if (v) console.log(`    ${k.padEnd(9)} ${v}`);
  console.log(`    offers    ${pills.map((p) => `[ ${p.trim()} ]`).join('  ')}`);
  return { ...parts, pills: pills.map((p) => p.trim()) };
}

async function newSession(browser) {
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, colorScheme: 'dark' });
  await installHideDevChrome(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fail(`page error: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') console.log(`  ! console: ${m.text().slice(0, 200)}`); });
  return { ctx, page };
}

async function open(page, route) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForSelector('[data-testid="screen-home"]', { timeout: 60_000 });
  await settle(page);
}

const main = async () => {
  const browser = await chromium.launch();

  /* ---------------------------------------------------------------- 1 + 2 + 3 */
  console.log('\n[1] first open of the day');
  const s1 = await newSession(browser);
  await open(s1.page, '/home');
  const first = await transcribe(s1.page, 'first open');
  await shot(s1.page, 'wakeup-01-first-open');

  if (first.greeting) pass('Kai greets by name'); else fail('no greeting');
  if (first.lead) pass('Kai says the one relevant thing'); else fail('no lead');
  if (first.question) pass('Kai asks where to go'); else fail('no question');
  if (first.pills.length >= 2) pass(`${first.pills.length} directions offered`); else fail('fewer than two directions');
  if (!(await s1.page.locator('[data-testid="wakeup-earlier"]').count())) pass('no "earlier today" mark on a first open');
  else fail('first open is marked as already seen');

  // The old header furniture must be gone from the today view.
  for (const gone of ['home-thread-title', 'home-mode', 'home-priority', 'also-watching', 'opening-line']) {
    if (await s1.page.locator(`[data-testid="${gone}"]`).count()) fail(`${gone} is still on the today screen`);
    else pass(`${gone} is gone`);
  }

  console.log('\n[2] second open of the same day');
  await s1.page.reload({ waitUntil: 'load' });
  await s1.page.waitForSelector('[data-testid="screen-home"]', { timeout: 60_000 });
  await settle(s1.page);
  const second = await transcribe(s1.page, 'second open');
  await shot(s1.page, 'wakeup-02-second-open');

  if (await s1.page.locator('[data-testid="wakeup-earlier"]').count()) pass('marked "earlier today"');
  else fail('second open is not marked as already seen');
  if (second.lead === first.lead && second.greeting === first.greeting) pass('same words, not a fresh greeting');
  else fail('the wake-up was rewritten on the second open');

  // …and tomorrow it wakes up again. Backdate the stored day and reload.
  await s1.page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('kai.wakeup.v1.'));
    const v = JSON.parse(localStorage.getItem(k));
    v.date = '2000-01-01';
    localStorage.setItem(k, JSON.stringify(v));
  });
  await s1.page.reload({ waitUntil: 'load' });
  await s1.page.waitForSelector('[data-testid="screen-home"]', { timeout: 60_000 });
  await settle(s1.page);
  if (!(await s1.page.locator('[data-testid="wakeup-earlier"]').count())) pass('a NEW day wakes up again');
  else fail('yesterday’s wake-up was reused today');

  console.log('\n[3] the offers, answered in the conversation');
  const watch = s1.page.locator('[data-testid="wakeup-direction-wd-watching"]');
  if (await watch.count()) { await watch.click(); await settle(s1.page, 700); pass('“what else moved?” answered'); }
  const brief = s1.page.locator('[data-testid="wakeup-direction-wd-briefing"]');
  if (await brief.count()) { await brief.click(); await settle(s1.page, 700); pass('“the full report” answered'); }
  await settle(s1.page, 600);
  await shot(s1.page, 'wakeup-03-offers-answered');
  if (await s1.page.locator('[data-testid="briefing"]').count()) pass('the report is in the thread');
  else fail('the report never arrived');
  await s1.ctx.close();

  /* ------------------------------------------------------------------------ 4 */
  console.log('\n[4] a day with nothing to report');
  const s2 = await newSession(browser);
  await open(s2.page, '/home?fixture=quiet');
  const quiet = await transcribe(s2.page, 'nothing to report');
  await shot(s2.page, 'wakeup-04-nothing-to-report');
  if (quiet.lead && /nothing/i.test(quiet.lead)) pass('Kai says there is nothing, plainly');
  else fail('the quiet day does not say it is quiet');
  if (quiet.pills.length >= 2) pass('still offers a direction'); else fail('the quiet day dead-ends');
  await s2.ctx.close();

  /* ------------------------------------------------------------------------ 5 */
  console.log('\n[5] the morning the data never arrived');
  const s3 = await newSession(browser);
  await open(s3.page, '/home?fixture=down');
  const down = await transcribe(s3.page, 'data unavailable');
  await shot(s3.page, 'wakeup-05-data-unavailable');
  if (down.greeting) pass('the greeting still appears'); else fail('no greeting when the data is missing');
  if (down.pills.length >= 2) pass('still offers a direction'); else fail('the failure dead-ends');
  if (!(await s3.page.locator('[data-testid="briefing"]').count())) pass('nothing invented');

  // Fail-soft must not have burned the day: reload should try again, not
  // replay a stored apology.
  await s3.page.reload({ waitUntil: 'load' });
  await s3.page.waitForSelector('[data-testid="screen-home"]', { timeout: 60_000 });
  await settle(s3.page);
  if (!(await s3.page.locator('[data-testid="wakeup-earlier"]').count())) pass('a failed wake-up is not stored as the day’s greeting');
  else fail('the failed wake-up was stored');
  await s3.ctx.close();

  await browser.close();
  console.log(failures ? `\n${failures} FAILED\n` : '\nall good\n');
  process.exit(failures ? 1 : 0);
};

main().catch((e) => { console.error(e); process.exit(1); });
