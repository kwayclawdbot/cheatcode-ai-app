/**
 * COMPANIES WORTH UNDERSTANDING — shot signed in, on real desk data.
 *
 *   # terminal 1 — the API, on the hosted app database and the brain database
 *   cd apps/api && set -a && . ./.env.prod && set +a && npx next dev -p 3010
 *
 *   # terminal 2 — the app, NO fixtures, pointed at that API
 *   cd apps/mobile && EXPO_PUBLIC_API_BASE=http://localhost:3010 \
 *     npx expo start --web --port 8093
 *
 *   # terminal 3
 *   PROOF_BASE=http://localhost:8093 PROOF_EMAIL=… PROOF_PASSWORD=… \
 *     node scripts/proof-invest-research.mjs
 *
 * `desk-research-test.mts` proves the rules about the file. This proves the
 * PICTURE, on the twenty-seven companies the desk actually published, because
 * the claims that matter here are claims about what a person sees:
 *
 *   · a real grade letter on the rows, not a blank where a grade was dropped;
 *   · a one-line description of each business, read as a sentence;
 *   · NOTHING to act on — no stop, no target, no trigger, no entry price, and
 *     no five-day outcome anywhere on an Invest surface;
 *   · every ticker with its mark, never as plain text;
 *   · INOD, which the desk picked and never graded, saying so in words rather
 *     than drawing a dash or borrowing a grade from somewhere else.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const OUT = path.resolve(process.cwd(), 'proof');
const BASE = process.env.PROOF_BASE ?? 'http://localhost:8093';
const EMAIL = process.env.PROOF_EMAIL;
const PASSWORD = process.env.PROOF_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error('PROOF_EMAIL and PROOF_PASSWORD are required'); process.exit(1); }
const VIEWPORT = { width: 390, height: 844 };
mkdirSync(OUT, { recursive: true });

const failures = [];
const note = (ok, what) => { console.log(`  ${ok ? '✓' : '✗'} ${what}`); if (!ok) failures.push(what); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, colorScheme: 'dark' });
await ctx.addInitScript(() => {
  const add = () => {
    const s = document.createElement('style');
    s.textContent = '.__expo_fast_refresh{display:none!important}';
    document.head.appendChild(s);
  };
  if (document.head) add(); else document.addEventListener('DOMContentLoaded', add);
});
const page = await ctx.newPage();
page.on('pageerror', (e) => failures.push(`page error: ${e.message}`));

const shot = (n) => page.screenshot({ path: path.join(OUT, `${n}.png`) });
const has = (id) => page.locator(`[data-testid="${id}"]`).count().then((n) => n > 0);
const text = async () => (await page.locator('body').innerText());
const flat = async () => (await text()).replace(/\s+/g, ' ');

/* ── sign in ──────────────────────────────────────────────────────── */
console.log('\nsigning in');
await page.goto(`${BASE}/sign-in`, { waitUntil: 'domcontentloaded' });
await page.locator('[data-testid="screen-sign-in"]').waitFor({ timeout: 120_000 });
await page.locator('input[data-testid="field-email"]').first().fill(EMAIL);
await page.locator('input[data-testid="field-password"]').first().fill(PASSWORD);
await page.locator('[data-testid="cta-sign-in"]').click();
await page.waitForTimeout(8000);
note(!(await has('screen-sign-in')), 'signed in');

/* ── invest mode, so the second tab is the desk ───────────────────── */
console.log('\ninto Invest mode');
await page.goto(`${BASE}/alerts`, { waitUntil: 'domcontentloaded' });
// The web bundle is served by Metro and a cold navigation is slow; wait for the
// tab itself to exist rather than for a stopwatch.
// The web bundle is served by Metro and the mode control is drawn once the
// profile has arrived, so wait for the control itself rather than a stopwatch.
await page.locator('[data-testid="alerts-mode-chip"], [data-testid="desk-mode-chip"]')
  .first().waitFor({ timeout: 180_000 });
await page.waitForTimeout(2000);
if (!(await has('desk-screen'))) {
  const chip = page
    .locator('[data-testid="alerts-mode-chip"], [data-testid="desk-mode-chip"]').first();
  await chip.click();
  await page.waitForTimeout(1200);
  await page.locator('[data-testid="mode-option-invest"]').first().click();
  await page.waitForTimeout(7000);
}
note(await has('desk-screen'), 'the second tab is the research desk');

/* ── 1 · the research list ────────────────────────────────────────── */
console.log('\nthe research list');
await page.waitForTimeout(3000);
await shot('invest-01-research-companies');
{
  const t = await flat();
  note(await has('desk-research'), 'the research section is on screen');
  note(/Companies worth understanding\./.test(t), 'headed in the desk’s own words');
  note(/Clear ideas\. Real businesses\./.test(t), 'with the line under it');

  const rows = await page.locator('[data-testid^="desk-company-"]').count();
  note(rows > 0, `real company rows are drawn (${rows} in the DOM)`);

  // A grade on a row, not a blank. This is the thing the widened scale fixed.
  const graded = await page.locator('[data-testid^="desk-company-"]')
    .filter({ hasText: 'Idea grade' }).count();
  note(graded > 0, `rows carry a labelled idea grade (${graded})`);
  note(/Idea grade/.test(t), 'and the label says what the grade is a grade OF');

  // Every ticker with its mark. The mark is the logo when there is one and the
  // letters mark when there is not — what must never appear is bare text.
  const first = page.locator('[data-testid^="desk-company-"]').first();
  const marks = await first.locator('img, [data-testid^="ticker-"]').count();
  note(marks > 0 || (await first.locator('img').count()) > 0,
    'the first row carries a ticker mark, not plain text');
}

/* ── nothing on this surface is a trade ───────────────────────────── */
console.log('\nnothing to act on');
{
  const t = await flat();
  for (const [what, re] of [
    ['a stop', /\bstop\b/i],
    ['a target', /\btarget\b/i],
    ['a trigger price', /\btrigger\b/i],
    ['an entry to take', /\bentry\b/i],
    ['a five-day outcome', /\b(5[- ]?day|five[- ]?day|day 5|day 1)\b/i],
    ['a same-day framing', /same-day/i],
  ]) {
    note(!re.test(t), `no ${what} on the research tab`);
  }
}

/* ── 2 · the range of grades, and your own list under it ──────────── */
console.log('\nscrolled — the range, and the two lists');
/*
 * Landed on the LAST few companies rather than on the bottom of the page: the
 * claim being photographed is that the grades run down to a D and that your own
 * list is a separate thing under them, and scrolling all the way to the end
 * puts the desk's range off the top of the frame.
 */
const tail = page.locator('[data-testid^="desk-company-"]').nth(-3);
await tail.scrollIntoViewIfNeeded({ timeout: 30_000 }).catch(async () => {
  await page.mouse.move(195, 500);
  for (let i = 0; i < 12; i += 1) {
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(200);
  }
});
await page.waitForTimeout(2500);
await shot('invest-02-research-scrolled');
{
  const t = await flat();
  note(/You added these/.test(t), 'your own list is a separate section below');
  note(await has('desk-yours'), 'and it is where the add box lives');
}

/* ── the ungraded pick tells the truth ────────────────────────────── */
console.log('\nINOD — picked, never graded');
{
  const t = await text();
  const seen = /INOD/.test(t);
  note(seen, 'INOD is on the board');
  if (seen) {
    const row = page.locator('text=INOD').first();
    const near = await row.locator('xpath=ancestor::*[self::div][3]').innerText().catch(() => '');
    console.log(`    INOD row reads: ${near.replace(/\s+/g, ' ').trim().slice(0, 160)}`);
    note(/ungraded|not graded/i.test(near), 'its missing grade is said in words');
    note(!/—/.test(near), 'and not drawn as a dash');
  }
}

/* ── 3 · through to the write-up ──────────────────────────────────── */
console.log('\nthe write-up behind a company');
await page.goto(`${BASE}/desk/pick/SITM`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="desk-pick-screen"]', { timeout: 120_000 });
await page.waitForTimeout(5000);
await shot('invest-03-company-writeup');
{
  const t = await flat();
  note(/Idea grade/.test(t), 'the write-up opens on the grade');
  note(/SITM/.test(t), 'for the company that was tapped');
  note(/marks the desk uses/.test(t), 'the scale says how many marks it has');
  note(!/has not put a mark on this one/.test(t),
    'a graded company is NOT described as unmarked');

  // ONE COMPANY, ONE NAME. The card reads the name the desk published; this
  // screen used to read the raw feed string and show "SiTime Corporation Comm…".
  note(!/Comm…|Common Stock/.test(t), 'the header carries the desk’s clean company name');

  /*
   * THE THEME PANEL. The 6 September run could not judge and wrote zeros, and
   * this panel drew "0.0 of 10" — the desk's lowest possible score — for a
   * theme it had scored 7.5 the day before. What must be here now is the last
   * REAL reading with the day it was taken on it.
   */
  const zero = /How big if it is right\s*0\.0\s*of 10/i.test(t);
  note(!zero, 'the theme panel does not draw a 0.0-of-10 reading');
  note(/Judged \d+ \w+ 20\d\d/.test(t), 'the reading says which day it was taken');
  const size = t.match(/How big if it is right\s*([\d.]+|The desk has not judged[^.]*\.)/i);
  console.log(`    theme panel reads: ${size ? size[1] : '(no size line found)'}`);
}

/* ── the theme's reading, with the day it was taken ───────────────── */
console.log('\nthe theme panel, dated');
await page.locator('text=/^Judged \\d/').first().scrollIntoViewIfNeeded({ timeout: 30_000 })
  .catch(async () => {
    await page.mouse.move(195, 500);
    await page.mouse.wheel(0, 1400);
  });
await page.waitForTimeout(1800);
await shot('invest-05-theme-reading-dated');

/* ── the argument itself, and its dated catalysts ─────────────────── */
console.log('\nthe argument, and what would settle it');
// Scroll to the dated catalysts themselves rather than to a pixel offset — the
// write-ups are thousands of words and no fixed distance lands on the same
// thing twice.
await page.locator('text=Dated ahead').first().scrollIntoViewIfNeeded({ timeout: 30_000 })
  .catch(() => {});
await page.waitForTimeout(2500);
await shot('invest-04-writeup-catalysts');
{
  const t = await flat();
  note(/What would settle it|Catalyst|catalysts/i.test(t), 'the dated catalysts are on the page');
  note(/THE CALL|THE THEME|WHAT THEY ACTUALLY DO/i.test(t), 'and the written argument is readable');

  /*
   * The screen's OWN vocabulary, not the analyst's. A thesis may reasonably use
   * the words "target market" or "stop"; what must not appear is this app
   * labelling a level to act on, or grading a long-horizon idea over days.
   */
  for (const [what, re] of [
    ['a stop loss', /stop[- ]?loss/i],
    ['a price target', /price target|take profit/i],
    ['a trigger to buy at', /trigger price/i],
    ['a five-day outcome', /\b(5[- ]?day|five[- ]?day|day 5|day 1)\b/i],
  ]) {
    const hit = t.match(re);
    note(!hit, `no ${what} on the write-up${hit ? ` — found "${hit[0]}"` : ''}`);
  }
}

console.log(failures.length ? `\n${failures.length} FAILED:\n  ${failures.join('\n  ')}\n` : '\nall good\n');
await browser.close();
process.exit(failures.length ? 1 : 0);
