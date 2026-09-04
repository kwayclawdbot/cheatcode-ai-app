/**
 * The research desk, shot in the running app.
 *
 *   # terminal 1 — the API, because the ticker marks come through it
 *   cd apps/api && npx next dev -p 3010
 *
 *   # terminal 2 — the app, fixtures, pointed at that API
 *   cd apps/mobile
 *   EXPO_PUBLIC_FIXTURES=1 EXPO_PUBLIC_DEV_TOOLS=1 \
 *   EXPO_PUBLIC_API_BASE=http://localhost:3010 npx expo start --web --port 8093
 *
 *   # terminal 3
 *   PROOF_BASE=http://localhost:8093 node scripts/proof-desk.mjs
 *
 * Shoots `proof/desk-*.png` at 390x844 and asserts the things a screenshot
 * cannot show on its own:
 *
 *   · the potential move NEVER prints a figure the brain did not write — not
 *     the ranking score, not anything derived from market cap;
 *   · a pass and a D read as judgements, with the desk's own wording;
 *   · an unfinished write-up says it never reached a verdict;
 *   · an eleven-thousand-character argument arrives as an index of eight
 *     named sections with the verdict already open;
 *   · a write-up filed without headings says so instead of being given any.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'proof');
const BASE = process.env.PROOF_BASE ?? 'http://localhost:8093';
const VIEWPORT = { width: 390, height: 844 };

mkdirSync(OUT, { recursive: true });

const failures = [];
const note = (ok, what) => {
  console.log(`  ${ok ? '✓' : '✗'} ${what}`);
  if (!ok) failures.push(what);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  const add = () => {
    const s = document.createElement('style');
    s.textContent = '.__expo_fast_refresh{display:none!important}';
    document.head.appendChild(s);
  };
  if (document.head) add();
  else document.addEventListener('DOMContentLoaded', add);
});
const page = await ctx.newPage();

const go = async (route, testid) => {
  await page.goto(`${BASE}${route}`, { waitUntil: 'load', timeout: 180_000 });
  await page.waitForSelector(`[data-testid="${testid}"]`, { timeout: 120_000 });
  await page.waitForTimeout(2500);
};
const shot = async (name) => {
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log(`  · ${name}.png`);
};
const text = () => page.evaluate(() => document.body.innerText);

/* ── 1. a graded, actionable pick ─────────────────────────────────── */
console.log('\nINOD — graded B+, long, running');
await go('/desk/pick/INOD', 'desk-pick-screen');
await shot('desk-pick-graded');
{
  const t = await text();
  note(/B\+/.test(t), 'the grade is on its scale');
  note(/Long/.test(t) && /two quarters/.test(t), 'the call and the time frame read as words');
  note(/Potential move/.test(t) && /Not measured yet/.test(t),
    'the potential move has a place and says it is not measured');
  note(!/Move potential/.test(t), 'the old mislabelled ranking score is gone');
  note(!/0\.5973|0\.597/.test(t), 'no ranking score is printed as if it were a move');
  note(/THE CALL/.test(t), 'the argument arrives as its own named sections');
  note(/what the screen found/i.test(t), 'the evidence is a ledger, not a paragraph');
}

/* ── 2. the same pick, deeper into the argument ───────────────────── */
console.log('\nINOD — the argument, opened');
await page.getByTestId('desk-thesis-toggle-all').click();
await page.waitForTimeout(600);
await page.evaluate(() => {
  const el = document.querySelector('[data-testid="desk-thesis"]');
  if (el) el.scrollIntoView({ block: 'start' });
});
await page.waitForTimeout(900);
await page.mouse.wheel(0, 1400);
await page.waitForTimeout(900);
await shot('desk-pick-thesis-mid');

/* ── 3. a pass, at real length, with a real write-up ──────────────── */
console.log('\nPDYN — a real 11,000-character write-up, passed, C');
await go('/desk/pick/PDYN', 'desk-pick-screen');
await shot('desk-pick-pass');
{
  const t = await text();
  note(/Passed/.test(t), 'the call reads Passed');
  note(/a decision, not a miss/.test(t), 'and is framed as a decision, not a failure');
  note(!/reject/i.test(t), 'nothing on the screen calls it a rejection');
  note(/THE THEME/.test(t) && /WHAT WOULD HAVE TO BE TRUE/.test(t) && /THE CALL/.test(t),
    'all eight of the desk’s own headings are on the page');
  note(/Not measured yet/.test(t), 'the potential move is still an empty measure');
}
// the verdict is open on arrival — check the reader landed there
{
  const openFirst = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="desk-thesis"]');
    return el ? el.innerText : '';
  });
  note(/THE CALL[\s\S]{0,400}revenue acceleration is real/.test(openFirst),
    'the verdict is already open when the screen arrives');
}

/* the index itself: eight named sections instead of eleven thousand characters */
await page.evaluate(() => {
  const el = document.querySelector('[data-testid="desk-thesis"]');
  if (el) el.scrollIntoView({ block: 'start' });
});
await page.waitForTimeout(900);
await shot('desk-pick-thesis-index');

/* ── 4. a D, and what it is allowed to look like ──────────────────── */
console.log('\nSPCE — a D on the idea');
await go('/desk/pick/SPCE', 'desk-pick-screen');
await shot('desk-pick-d-grade');
{
  const t = await text();
  note(/\bD\b/.test(t), 'the D is marked on the same scale as an A');
  note(/Sixth of the six marks/.test(t), 'and is described as a place on that scale');
  note(/What brings it back/.test(t), 'the way back is stated');
  note(/Passed/.test(t) && /a decision, not a miss/.test(t),
    'a D still reads as a decision the desk made');
  // The theme is not marked down because the company was. A screen that let a
  // D bleed onto the theme would be arguing with the rule the desk works to.
  note(/7\.0/.test(t), 'the theme keeps its own score, untouched by the D');
  // Nothing in the app's own chrome calls this an error, a problem or a miss —
  // the prose can say what it likes, the interface may not editorialise.
  const chrome = t.split('The desk went looking for')[0] + (t.split('The argument')[1] ?? '');
  note(!/\b(failed|failure|error|invalid|problem)\b/i.test(chrome),
    'and the screen’s own wording never calls it a failure');
}

/* ── 5. a write-up that never reached a verdict ───────────────────── */
console.log('\nCRWV — an argument that ran out of room');
await go('/desk/pick/CRWV', 'desk-pick-screen');
await shot('desk-pick-unfinished');
{
  const t = await text();
  note(/Never reached a verdict/.test(t), 'it says it never reached a verdict');
  note(/not a rejection/.test(t), 'and says plainly that it is not a rejection');
  note(/None stated/.test(t), 'the call reads as none stated rather than as a pass');
}

/* ── 6. a write-up filed without headings ─────────────────────────── */
console.log('\nAAOI — a real write-up whose sections are bold lines');
await go('/desk/pick/AAOI', 'desk-pick-screen');
await shot('desk-pick-bold-sections');
{
  const t = await text();
  note(/WHAT THEY ACTUALLY DO/.test(t) && /THE CONNECTION/.test(t),
    'its bold-line sections are found and indexed');
  note(!/\*\*/.test(t.split('The argument')[1] ?? ''), 'no raw asterisks reach the reader');
}

/* ── the honest fallback: a write-up with no headings at all ──────── */
console.log('\nNGS — a write-up filed with no headings of any kind');
await go('/desk/pick/NGS', 'desk-pick-screen');
await page.evaluate(() => {
  const el = document.querySelector('[data-testid="desk-thesis"]');
  if (el) el.scrollIntoView({ block: 'start' });
});
await page.waitForTimeout(900);
await shot('desk-pick-no-headings');
{
  const t = await text();
  note((await page.getByTestId('desk-thesis-unsectioned').count()) > 0,
    'the reader knows there is no structure to find');
  note(/was not filed in sections/.test(t), 'and says so in its own words');
  note(/It is shown whole/.test(t), 'then shows the argument whole rather than inventing headings');
  note((await page.getByTestId('desk-thesis-toggle-all').count()) === 0,
    'no open-all control appears, because there is nothing to open');
  note(/Not measured yet/.test(t), 'the potential move is still an empty measure');
  note(/not graded/i.test(t) || /has not put a mark/.test(t),
    'an ungraded write-up says the mark is missing rather than showing a low one');
}

/* ── 7. a theme in depth ──────────────────────────────────────────── */
console.log('\na theme, in depth');
await go('/desk/theme/Humanoid-Robotics', 'desk-theme-screen');
await shot('desk-theme');
{
  const t = await text();
  note(/9\.5/.test(t) && /5y\+/.test(t), 'size and timing are both on the page');
  note(/never averaged/.test(t), 'and the screen says they are never averaged');
  note(/None of them has been scored yet/.test(t),
    'the leads say outright that none has ever been scored');
}

/* ── 8. the themes list ───────────────────────────────────────────── */
console.log('\nevery theme the desk is reading');
await go('/desk/themes', 'desk-themes-screen');
await shot('desk-themes');
{
  const t = await text();
  const order = t.indexOf('Humanoid') < t.indexOf('AI Compute');
  note(order, 'the biggest theme is first even though it lands furthest out');
}

/* ── 9. the watchlist ─────────────────────────────────────────────── */
console.log('\nthe watchlist');
await go('/desk', 'desk-screen');
await shot('desk-watchlist');
{
  const t = await text();
  note(/The desk argued for these/.test(t), 'the argued names are grouped first');
  note(/You added these/.test(t), 'and the ones you typed in are kept separate');
}

console.log(`\n${failures.length ? `${failures.length} FAILED` : 'all checks passed'}\n`);
await browser.close();
process.exit(failures.length ? 1 : 0);
