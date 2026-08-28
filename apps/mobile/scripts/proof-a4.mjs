/**
 * Fixtures proof for lane MOBILE-A, round 4 (the prototype boards).
 *
 *   EXPO_PUBLIC_FIXTURES=1 npx expo start --port 8091
 *   PROOF_BASE=http://localhost:8091 node scripts/proof-a4.mjs
 *
 * Shoots every MOBILE-A board into proof/p4a-*.png, renders the prototype
 * boards at the same 390x844, and writes the side-by-side compares. It also
 * ASSERTS the two rules the round-4 spec makes non-negotiable:
 *   · no component fraction ("18/20", "4/5") may appear on any screen (§4)
 *   · the alert CTA must route to /trade/<sym>?alert=…&ctx=alert (§6)
 */
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const REPO = path.resolve(ROOT, '../..');
const OUT = path.join(ROOT, 'proof');
const BOARDS = path.join(REPO, 'design/prototype');
const BASE = process.env.PROOF_BASE ?? 'http://localhost:8091';
const VIEWPORT = { width: 390, height: 844 };

/**
 * Component fractions are banned by spec §4. The 0–100 grade score IS
 * mandated by the same section ("Display grade and 0–100 score together"),
 * so `87/100` is the one ratio allowed on screen — everything else fails.
 */
const FRACTION = /\b\d{1,3}\s*\/\s*(?!100\b)\d{1,3}\b/g;

const failures = [];
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
const open = async (page, route) => {
  await page.goto(`${BASE}${route}`, { waitUntil: 'load', timeout: 120_000 });
  await settle(page, 1500);
};
const tap = async (page, testid, label = testid) => {
  try {
    await page.getByTestId(testid).last().click({ timeout: 8000 });
    await settle(page, 600);
    return true;
  } catch {
    console.log(`  · skipped ${label}`);
    return false;
  }
};

/** Assert by TEXT: read what the screen actually renders. */
const assertNoFractions = async (page, where) => {
  const text = await page.locator('#root').innerText();
  const hits = [...text.matchAll(FRACTION)].map((m) => m[0]);
  if (hits.length) {
    failures.push(`${where}: component fraction(s) on screen — ${[...new Set(hits)].join(', ')}`);
    console.log(`  ✗ ${where}: fractions ${[...new Set(hits)].join(', ')}`);
  } else {
    console.log(`  ✓ ${where}: no component fractions`);
  }
};

const assertText = async (page, needle, where) => {
  const text = await page.locator('#root').innerText();
  if (text.includes(needle)) { console.log(`  ✓ ${where}: "${needle}"`); return true; }
  failures.push(`${where}: expected "${needle}" on screen`);
  console.log(`  ✗ ${where}: missing "${needle}"`);
  return false;
};

async function captureApp(browser) {
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, colorScheme: 'dark' });
  await installHideDevChrome(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  ! page error:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('  ! console:', m.text().slice(0, 200)); });

  console.log('\n[1] Welcome + onboarding (4 steps incl. personalize + plan)');
  await open(page, '/welcome');       await shot(page, 'p4a-01-welcome');
  await open(page, '/goal');          await shot(page, 'p4a-02-goal');
  await open(page, '/risk');          await shot(page, 'p4a-03-risk');
  await open(page, '/personalize');   await shot(page, 'p4a-04-personalize');
  await assertText(page, 'Let\u2019s tune Kai to you', 'personalize');
  // pick "New to this" + two focus chips, exactly as the live proof does
  await tap(page, 'experience-new', 'experience new');
  // clear the two defaults so exactly two chips end up chosen
  await tap(page, 'focus-tech', 'clear big tech');
  await tap(page, 'focus-ai', 'clear AI & semis');
  await tap(page, 'focus-energy', 'focus energy');
  await tap(page, 'focus-etf', 'focus index ETFs');
  await shot(page, 'p4a-05-personalize-answered');
  await tap(page, 'cta-continue', 'continue to plan');
  await settle(page, 1200);           await shot(page, 'p4a-06-plan');
  // Kai's voice for `new` must be visible on the plan
  await assertText(page, 'I explain every term the first time it appears.', 'plan (voice: new)');

  console.log('[2] Home — conversation workspace + conversations drawer');
  await open(page, '/home');          await shot(page, 'p4a-07-home');
  await tap(page, 'home-threads-open', 'open drawer');
  await settle(page, 700);            await shot(page, 'p4a-08-home-drawer');
  await tap(page, 'conversation-pin-conv-2', 'pin a conversation');
  await shot(page, 'p4a-09-home-drawer-pinned');
  await tap(page, 'conversation-conv-3', 'open a conversation');
  await settle(page, 900);            await shot(page, 'p4a-10-home-thread');
  await tap(page, 'home-thread-new', 'new conversation');
  await settle(page, 900);            await shot(page, 'p4a-11-home-new-thread');

  console.log('[3] Ticker page');
  await open(page, '/symbol/META');   await shot(page, 'p4a-12-ticker');
  await tap(page, 'ticker-section-technicals', 'Technicals');
  await shot(page, 'p4a-13-ticker-technicals');
  await tap(page, 'ticker-section-community', 'Community');
  await shot(page, 'p4a-14-ticker-community');
  await assertNoFractions(page, 'ticker page');

  console.log('[4] Alerts — Active / Watching / History, medallion + scorecard');
  await open(page, '/alerts');        await shot(page, 'p4a-15-alerts-active');
  await assertNoFractions(page, 'alerts · active (collapsed)');
  await tap(page, 'alert-expand-META', 'expand META');
  await settle(page, 700);            await shot(page, 'p4a-16-alerts-expanded');
  await assertText(page, 'WHY THIS GRADE', 'alerts · scorecard');
  await assertText(page, 'Strong', 'alerts · qualitative status');
  await assertNoFractions(page, 'alerts · active (expanded)');
  await tap(page, 'scorecard-evidence', 'see evidence');
  await shot(page, 'p4a-17-alerts-evidence');
  await assertNoFractions(page, 'alerts · evidence open');
  await tap(page, 'alerts-tab-watching', 'Watching tab');
  await shot(page, 'p4a-18-alerts-watching');
  await assertNoFractions(page, 'alerts · watching');
  await tap(page, 'alerts-tab-history', 'History tab');
  await shot(page, 'p4a-19-alerts-history');
  await tap(page, 'alerts-tab-active', 'back to Active');
  // the CTA is the seam with lane MOBILE-B
  await tap(page, 'alert-cta-META', 'primary CTA');
  await settle(page, 1500);
  const url = page.url();
  if (/\/trade\/META\?alert=[^&]+&ctx=alert/.test(url)) console.log(`  ✓ CTA routed to ${url}`);
  else { failures.push(`alert CTA routed to ${url}`); console.log(`  ✗ CTA routed to ${url}`); }
  await shot(page, 'p4a-20-alert-cta-destination');

  console.log('[5] /alert/[id] redirects into the portal');
  await open(page, '/alert/alert-meta-1');
  await settle(page, 2000);
  console.log(`  · /alert/alert-meta-1 → ${page.url()}`);
  await shot(page, 'p4a-21-alert-redirect');

  console.log('[6] Account — Kai profile, voice line, rules, adherence');
  await open(page, '/account');       await shot(page, 'p4a-22-account');
  await assertText(page, 'YOUR KAI PROFILE', 'account');
  await tap(page, 'kai-profile-experience', 'cycle experience');
  await shot(page, 'p4a-23-account-experience-cycled');
  await tap(page, 'kai-profile-focus', 'Kai watches');
  await settle(page, 700);            await shot(page, 'p4a-24-account-focus-sheet');
  await ctx.close();
}

/** Render one prototype board at exactly 390x844 so it compares 1:1. */
async function captureBoard(browser, file, name) {
  const ctx = await browser.newContext({ viewport: { width: 470, height: 1000 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(pathToFileURL(path.join(BOARDS, file)).href, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    document.body.style.padding = '0';
    const d = document.querySelector('div[data-screen-label]');
    if (d) { d.style.width = '390px'; d.style.height = '844px'; }
  });
  await page.waitForTimeout(400);
  const el = await page.$('div[data-screen-label]');
  await (el ?? page).screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log(`  ✓ ${name}.png`);
  await ctx.close();
}

async function compare(browser, board, build, out, title) {
  const ctx = await browser.newContext({ viewport: { width: 860, height: 940 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const enc = async (n) => `data:image/png;base64,${(await fs.readFile(path.join(OUT, `${n}.png`))).toString('base64')}`;
  const a = await enc(board);
  const b = await enc(build);
  await page.setContent(`
    <style>
      body{margin:0;background:#050507;color:#B9B0A8;font:12px -apple-system,system-ui,sans-serif;padding:16px}
      h1{font-size:13px;color:#C8FF00;margin:0 0 12px;font-weight:600}
      .r{display:flex;gap:24px;align-items:flex-start}
      figure{margin:0}
      figcaption{margin-bottom:6px;letter-spacing:.06em;text-transform:uppercase;font-size:10px}
      img{width:390px;height:844px;display:block;border:1px solid #1C1C22}
    </style>
    <h1>${title}</h1>
    <div class="r">
      <figure><figcaption>Prototype board</figcaption><img src="${a}"></figure>
      <figure><figcaption>Build (expo web, 390&times;844)</figcaption><img src="${b}"></figure>
    </div>`);
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, `${out}.png`), fullPage: true });
  console.log(`  ✓ ${out}.png`);
  await ctx.close();
}

const main = async () => {
  await fs.mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  try {
    await captureApp(browser);
    console.log('\n[7] boards + compares');
    await captureBoard(browser, 'Welcome.html', 'p4a-board-welcome');
    await captureBoard(browser, 'Onboarding-personalize.html', 'p4a-board-personalize');
    await captureBoard(browser, 'Onboarding-plan.html', 'p4a-board-plan');
    await captureBoard(browser, 'Home.html', 'p4a-board-home');
    await captureBoard(browser, 'Ticker-page.html', 'p4a-board-ticker');
    await captureBoard(browser, 'Alerts.html', 'p4a-board-alerts');
    await captureBoard(browser, 'Account.html', 'p4a-board-account');
    await compare(browser, 'p4a-board-welcome', 'p4a-01-welcome', 'compare4-welcome', 'Welcome — board vs build');
    await compare(browser, 'p4a-board-personalize', 'p4a-05-personalize-answered', 'compare4-personalize', 'Onboarding personalize — board vs build');
    await compare(browser, 'p4a-board-plan', 'p4a-06-plan', 'compare4-plan', 'Onboarding plan — board vs build');
    // the board renders with its drawer open, so compare against the same state
    await compare(browser, 'p4a-board-home', 'p4a-08-home-drawer', 'compare4-home', 'Home conversation workspace — board vs build');
    await compare(browser, 'p4a-board-ticker', 'p4a-12-ticker', 'compare4-ticker', 'Ticker page — board vs build');
    await compare(browser, 'p4a-board-alerts', 'p4a-16-alerts-expanded', 'compare4-alerts', 'Alerts as trade objects — board vs build');
    await compare(browser, 'p4a-board-account', 'p4a-22-account', 'compare4-account', 'Account — board vs build');
  } finally {
    await browser.close();
  }
  console.log(`\nproof written to ${OUT}`);
  if (failures.length) {
    console.log(`\n${failures.length} assertion failure(s):`);
    failures.forEach((f) => console.log(`  ✗ ${f}`));
    process.exit(1);
  }
  console.log('\nall assertions passed');
};

main().catch((e) => { console.error(e); process.exit(1); });
