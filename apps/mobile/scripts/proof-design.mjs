/**
 * Design proof for the ticker mark + the grade gauge.
 *
 *   # terminal 1 — the API, because the logos come through it
 *   cd apps/api && npx next dev -p 3010
 *
 *   # terminal 2 — the app, fixtures, pointed at that API
 *   cd apps/mobile
 *   EXPO_PUBLIC_FIXTURES=1 EXPO_PUBLIC_DEV_TOOLS=1 \
 *   EXPO_PUBLIC_API_BASE=http://localhost:3010 npx expo start --web --port 8093
 *
 *   # terminal 3
 *   PROOF_BASE=http://localhost:8093 node scripts/proof-design.mjs
 *
 * Shoots `proof/design-*.png`: every grade band beside the one it replaced, the
 * chip in a dense row, and tickers with a real logo / with none / with a long
 * symbol — rendered in the running app, on the real fonts, against the real
 * Polygon marks. It also asserts the two things a screenshot cannot show:
 *
 *   · every logo the page requested actually returned image bytes (a proof
 *     where the marks silently 404'd would look identical to one where they
 *     did not, because the fallback is deliberately good);
 *   · no component fraction reaches the screen (spec §4).
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'proof');
const BASE = process.env.PROOF_BASE ?? 'http://localhost:8093';
const VIEWPORT = { width: 390, height: 844 };
/** The sheet is taller than a phone; a section screenshot needs the room. */
const SHEET_VIEWPORT = { width: 390, height: 2000 };

/** `NN/100` was the one legal ratio; the gauge replaced it, so now none are. */
const FRACTION = /\b\d{1,3}\s*\/\s*\d{1,3}\b/g;

const failures = [];
const note = (ok, what) => {
  console.log(`  ${ok ? '✓' : '✗'} ${what}`);
  if (!ok) failures.push(what);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: SHEET_VIEWPORT, deviceScaleFactor: 2 });
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

/** Every logo request the page makes, and what came back. */
const logos = new Map();
page.on('response', (res) => {
  const u = res.url();
  if (u.includes('/api/v1/market/logo/')) {
    logos.set(decodeURIComponent(u.split('/').pop()), res.status());
  }
});

const shot = async (name, locator) => {
  await (locator ?? page).screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log(`  \u00b7 ${name}.png`);
};

console.log(`\ndesign-check @ ${BASE}`);
await page.goto(`${BASE}/design-check`, { waitUntil: 'load', timeout: 180_000 });
await page.waitForSelector('[data-testid="screen-design-check"]', { timeout: 120_000 });
// Fonts, then marks. The marks fade in over 180ms; give the network the room.
await page.waitForTimeout(4500);
note((await page.getByTestId('screen-design-check').count()) > 0, 'design harness mounted');

/**
 * One image per section rather than a scroll of viewports. A design review is
 * an argument about one thing at a time, and a locator screenshot captures the
 * whole section even where it runs past the fold.
 */
const SECTIONS = [
  ['01-grade-bands', 'section-grade'],
  ['02-chip-dense-row', 'section-chip'],
  ['03-ticker-before', 'section-ticker-before'],
  ['04-ticker-real-logo', 'section-ticker-logo'],
  ['05-ticker-no-mark', 'section-ticker-none'],
  ['06-ticker-long-symbol', 'section-ticker-long'],
  ['07-ticker-sizes', 'section-ticker-sizes'],
  ['08-in-context', 'section-context'],
];
for (const [name, testid] of SECTIONS) {
  const el = page.getByTestId(testid);
  note((await el.count()) > 0, `section ${testid} present`);
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(350);
  await shot(`design-${name}`, el);
}

/* --------------------------------------------------------------- */
/* Assertions a picture cannot make                                  */
/* --------------------------------------------------------------- */

/**
 * Scoped to the AFTER medallions on purpose. The harness deliberately renders
 * the old `87/100` beside each new one — asserting over the whole sheet would
 * fail on the very thing it is there to show.
 */
const after = await page.locator('[data-testid^="medallion-"]').allInnerTexts();
const hits = after.flatMap((t) => [...t.matchAll(FRACTION)].map((m) => m[0]));
note(hits.length === 0, `no fraction inside any new medallion${hits.length ? ` — ${[...new Set(hits)].join(', ')}` : ''}`);

const wanted = ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'GOOGL', 'BRK.B', 'IONQ'];
for (const s of wanted) note(logos.get(s) === 200, `real mark fetched for ${s} (got ${logos.get(s) ?? 'no request'})`);
for (const s of ['SPY', 'QQQ', 'ARKK']) note(logos.get(s) === 404, `${s} has no mark and says so (got ${logos.get(s) ?? 'no request'})`);

note((await page.getByTestId('ticker-glyphs-SPY').count()) > 0, 'SPY falls back to the letters mark');
note((await page.getByTestId('ticker-logo-AAPL').count()) > 0, 'AAPL renders a real logo over its letters mark');
note((await page.getByTestId('grade-gauge').count()) >= 7, 'gauge arc drawn for every graded band');
note((await page.getByTestId('grade-ungraded-ring').count()) > 0, 'ungraded object draws a dotted ring, not a gauge at zero');
note((await page.getByTestId('grade-none').count()) > 0, 'ungraded object reads "No grade" in words, never a number');

/* --------------------------------------------------------------- */
/* The alert card in the real screen                                 */
/* --------------------------------------------------------------- */

console.log('\nalerts (fixtures)');
await page.setViewportSize(VIEWPORT);
await page.goto(`${BASE}/alerts`, { waitUntil: 'load', timeout: 180_000 });
await page.waitForTimeout(3500);
await shot('design-20-alerts');

// The dense row in the real product, not just the harness: the history tab is
// where GradeChip and the 22px mark actually live.
try {
  await page.getByTestId('alerts-tab-history').last().click({ timeout: 8000 });
  await page.waitForTimeout(2500);
  await shot('design-21-alerts-history');
} catch {
  console.log('  \u00b7 skipped history tab (not present in these fixtures)');
}
await page.getByTestId('alerts-tab-active').last().click({ timeout: 8000 }).catch(() => {});
await page.waitForTimeout(1200);

const alertsText = await page.locator('#root').innerText();
const alertHits = [...alertsText.matchAll(FRACTION)].map((m) => m[0]);
note(alertHits.length === 0, `alerts screen carries no fractions${alertHits.length ? ` — ${[...new Set(alertHits)].join(', ')}` : ''}`);

await browser.close();

console.log('');
if (failures.length) {
  console.log(`FAILED (${failures.length}):`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('all design assertions passed');
