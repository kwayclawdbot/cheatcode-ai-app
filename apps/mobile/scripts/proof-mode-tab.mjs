/**
 * Proof for the mode-aware second tab.
 *
 *   EXPO_PUBLIC_FIXTURES=1 npx expo start --web --port 8081   (another shell)
 *   node scripts/proof-mode-tab.mjs
 *
 * Ten shots at 390x844 into proof/:
 *   1  the tab in Day Trade mode — today's alerts
 *   2  the mode control open, on the tab itself
 *   3  the same tab in Invest mode — the research desk
 *   4  back to Day Trade, in one tap
 *   5  a day with no alerts — and somewhere to go
 *   6  an investor with an empty watchlist — and somewhere to go
 *   7  Account -> Research desk, still working in every mode
 *   8  themes still sorted on size alone (nothing demoted for being early)
 *   9  a theme still saying no lead has ever been scored
 *  10  an unfinished write-up still saying so in its own words
 *
 * Each shot prints the words on screen, so the report can quote them.
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

let failures = 0;
const fail = (m) => { failures++; console.log(`  ✗ ${m}`); };
const pass = (m) => console.log(`  ✓ ${m}`);
const settle = (page, ms = 1200) => page.waitForTimeout(ms);

async function shot(page, name) {
  const root = page.locator('#root');
  await ((await root.count()) ? root : page).screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log(`  · proof/${name}.png`);
}

const tid = (page, id) => page.locator(`[data-testid="${id}"]`).first();

async function text(page, id) {
  const el = tid(page, id);
  if (!(await el.count())) return null;
  return (await el.innerText()).replace(/\s+/g, ' ').trim();
}

async function seen(page, id, label) {
  const n = await tid(page, id).count();
  if (n) pass(`${label}`); else fail(`${label} — [${id}] is not on screen`);
  return !!n;
}

async function notSeen(page, id, label) {
  const n = await tid(page, id).count();
  if (!n) pass(`${label}`); else fail(`${label} — [${id}] should not be on screen`);
}

/** The five words in the tab bar, in order. */
async function tabWords(page) {
  const bar = tid(page, 'tab-bar');
  const words = await bar.locator('[data-testid^="tab-"]').allInnerTexts();
  return words.map((w) => w.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

async function setMode(page, mode) {
  const chip = (await tid(page, 'alerts-mode-chip').count())
    ? tid(page, 'alerts-mode-chip')
    : tid(page, 'desk-mode-chip');
  if (!(await chip.count())) { fail('no mode control on the tab'); return false; }
  await chip.click();
  await settle(page, 700);
  return true;
}

async function chooseMode(page, mode) {
  const opt = tid(page, `mode-option-${mode}`);
  if (!(await opt.count())) { fail(`the mode sheet has no ${mode} option`); return false; }
  await opt.click();
  await settle(page, 1200);
  return true;
}

const run = async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, colorScheme: 'dark' });
  await ctx.addInitScript((css) => {
    const add = () => { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); };
    if (document.head) add(); else document.addEventListener('DOMContentLoaded', add);
  }, HIDE_DEV_CHROME);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fail(`page error: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') console.log(`  ! console: ${m.text().slice(0, 180)}`); });

  /* ── 1 · Day Trade: the alerts board ───────────────────────────── */
  console.log('\n[1] Day Trade — the tab is alerts');
  await page.goto(`${BASE}/alerts`, { waitUntil: 'domcontentloaded' });
  await settle(page, 2600);
  await seen(page, 'screen-alerts', 'the alerts board is the tab');
  await notSeen(page, 'desk-screen', 'the desk is not drawn in Day Trade');
  console.log(`    tab bar   ${(await tabWords(page)).join(' · ')}`);
  console.log(`    note      ${await text(page, 'alerts-mode-note')}`);
  const words1 = await tabWords(page);
  if (words1.includes('Alerts')) pass('the second tab says Alerts'); else fail(`second tab says ${words1[1]}`);
  await shot(page, 'mode-tab-1-day-trade-alerts');

  /* ── 2 · the mode control, on the tab ──────────────────────────── */
  console.log('\n[2] switching mode, without leaving the tab');
  await setMode(page);
  await seen(page, 'sheet-mode', 'the mode sheet opens from the tab');
  await shot(page, 'mode-tab-2-switching');

  /* ── 3 · Invest: the research desk ─────────────────────────────── */
  console.log('\n[3] Invest — the same tab is the research desk');
  await chooseMode(page, 'invest');
  await seen(page, 'desk-screen', 'the desk is the tab in Invest');
  await notSeen(page, 'screen-alerts', 'the alerts board is gone');
  const words3 = await tabWords(page);
  console.log(`    tab bar   ${words3.join(' · ')}`);
  console.log(`    note      ${await text(page, 'desk-mode-note')}`);
  if (words3.includes('Research')) pass('the second tab says Research'); else fail(`second tab says ${words3[1]}`);
  if (!words3.includes('Alerts')) pass('the tab no longer says Alerts'); else fail('the tab still says Alerts over the desk');
  if (words3.length === 5) pass('the tab bar is still five items'); else fail(`the tab bar has ${words3.length} items`);
  await shot(page, 'mode-tab-3-invest-desk');

  /* ── 4 · and back again ────────────────────────────────────────── */
  console.log('\n[4] and back to Day Trade in one tap');
  await setMode(page);
  await chooseMode(page, 'day_trade');
  await seen(page, 'screen-alerts', 'the alerts board is back');
  await shot(page, 'mode-tab-4-back-to-alerts');

  /* ── 5 · the quiet day ─────────────────────────────────────────── */
  console.log('\n[5] a day with no alerts');
  await page.goto(`${BASE}/alerts?fixture=empty`, { waitUntil: 'domcontentloaded' });
  await settle(page, 2400);
  await seen(page, 'alerts-empty', 'the empty state is drawn');
  console.log(`    copy      ${await text(page, 'alerts-empty')}`);
  const dayOffers = await page.locator('[data-testid^="alerts-empty-"]').allInnerTexts();
  console.log(`    offers    ${dayOffers.map((o) => `[ ${o.trim()} ]`).join('  ')}`);
  if (dayOffers.length >= 1) pass('the empty day offers somewhere to go'); else fail('the empty day dead-ends');
  await shot(page, 'mode-tab-5-empty-alerts');

  /* ── 6 · the empty watchlist ───────────────────────────────────── */
  console.log('\n[6] an investor with an empty watchlist');
  await setMode(page);
  await chooseMode(page, 'invest');
  await seen(page, 'desk-empty', 'the empty desk is drawn');
  console.log(`    copy      ${await text(page, 'desk-empty')}`);
  const deskOffers = await page.locator('[data-testid^="desk-empty-"]').allInnerTexts();
  console.log(`    offers    ${deskOffers.map((o) => `[ ${o.trim()} ]`).join('  ')}`);
  if (deskOffers.length >= 1) pass('the empty watchlist offers somewhere to go'); else fail('the empty watchlist dead-ends');
  await shot(page, 'mode-tab-6-empty-desk');

  // the offer has to land on something real
  await tid(page, 'desk-empty-themes').click();
  await settle(page, 1600);
  await seen(page, 'desk-themes-screen', 'the offer lands on the themes the desk is reading');
  await page.goBack();
  await settle(page, 1200);

  /* ── 7 · Account -> Research desk ──────────────────────────────── */
  console.log('\n[7] Account → Research desk, in Day Trade mode');
  await page.goto(`${BASE}/account`, { waitUntil: 'domcontentloaded' });
  await settle(page, 2400);
  await tid(page, 'nav-desk').click();
  await settle(page, 1800);
  await seen(page, 'desk-screen', 'the Account row still opens the desk');
  await notSeen(page, 'desk-mode-chip', 'the pushed screen carries no mode control (it works in every mode)');
  await seen(page, 'desk-back', 'and it can be left again');
  await shot(page, 'mode-tab-7-account-desk');

  /* ── 8 · the desk's three rules, after the re-homing ───────────── */
  console.log("\n[8] the three rules the desk carried through");
  await page.goto(`${BASE}/desk/themes`, { waitUntil: 'domcontentloaded' });
  await settle(page, 2400);
  await seen(page, 'desk-themes-screen', 'the themes screen still renders');
  const sizes = await page.locator('[data-testid="desk-themes-screen"]').innerText();
  console.log(`    order     ${sizes.replace(/\s+/g, ' ').slice(0, 220)}`);
  const nums = [...sizes.matchAll(/(\d+)\s*of 10/g)].map((m) => Number(m[1]));
  const sorted = nums.every((n, i) => i === 0 || nums[i - 1] >= n);
  if (sorted) pass(`themes sort on size alone: ${nums.join(' ≥ ')}`); else fail(`themes are out of order: ${nums.join(', ')}`);
  await shot(page, 'mode-tab-8-themes');

  await page.goto(`${BASE}/desk/theme/Humanoid-Robotics`, { waitUntil: 'domcontentloaded' });
  await settle(page, 2400);
  const themeText = (await page.locator('[data-testid="desk-theme-screen"]').innerText()).replace(/\s+/g, ' ');
  if (/None of them has been scored yet/.test(themeText)) pass('the theme screen still says no lead was ever scored');
  else fail('the "no lead was ever scored" line is gone');
  await shot(page, 'mode-tab-9-theme');

  await page.goto(`${BASE}/desk/pick/CRWV`, { waitUntil: 'domcontentloaded' });
  await settle(page, 2400);
  const pickText = (await page.locator('[data-testid="desk-pick-screen"]').innerText()).replace(/\s+/g, ' ');
  if (/Never reached a verdict/.test(pickText)) pass('an unfinished write-up still says so in its own words');
  else fail('the unfinished write-up reads as a decision');
  // The desk's own wording denies the reading outright. What must never appear
  // is the screen presenting it AS a rejection — a call, a verdict, a decline.
  if (/it is not a rejection/i.test(pickText)) pass('and it says outright that it is not a rejection');
  else fail('the screen no longer denies that an unfinished write-up is a rejection');
  if (!/\bdeclined\b|\bREJECTED\b/i.test(pickText)) pass('and nothing on it reads as a decision the desk made');
  else fail('an unfinished write-up is being shown as a decision');
  await shot(page, 'mode-tab-10-unfinished-pick');

  await browser.close();
  console.log(failures ? `\n${failures} FAILED\n` : '\nall good\n');
  process.exit(failures ? 1 : 0);
};

run().catch((e) => { console.error(e); process.exit(1); });
