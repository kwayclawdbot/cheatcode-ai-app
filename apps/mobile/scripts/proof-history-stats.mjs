/**
 * HISTORY AS A RECORD OF NUMBERS — signed in, against the hosted API.
 *
 *   cd apps/mobile
 *   npx expo start --web --port 8142            # no EXPO_PUBLIC_FIXTURES
 *   PROOF_BASE=http://localhost:8142 \
 *     PROOF_EMAIL=… PROOF_PASSWORD=… node scripts/proof-history-stats.mjs
 *
 * The owner's ruling: History rows show the numbers — what it was called at,
 * the best it got, what it did, how long it was held — and not a paragraph.
 *
 * WHAT THIS PROVES IS MOSTLY THE ABSENCES. Turning prose into a stat grid is
 * the easiest place in this app to start inventing measurements: a peak on a
 * family that never computed one, a green box with a dash in it, a hold that
 * describes a different span from the result sat beside it. Every one of those
 * is checked here by name, on the real back catalogue, against both shapes the
 * board carries — the scored swing rows and the unusual-options-activity
 * replays, which have a contract and no outcome at all.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const OUT = path.resolve(process.cwd(), 'proof');
const BASE = process.env.PROOF_BASE ?? 'http://localhost:8142';
const EMAIL = process.env.PROOF_EMAIL;
const PASSWORD = process.env.PROOF_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error('PROOF_EMAIL and PROOF_PASSWORD are required'); process.exit(1); }
const VIEWPORT = { width: 390, height: 844 };
mkdirSync(OUT, { recursive: true });

const failures = [];
const note = (ok, what, detail) => {
  console.log(`  ${ok ? '✓' : '✗'} ${what}${ok || detail === undefined ? '' : `  → ${JSON.stringify(detail)}`}`);
  if (!ok) failures.push(what);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 2 });
page.on('pageerror', (e) => failures.push(`page error: ${e.message}`));

const shot = (n) => page.screenshot({ path: path.join(OUT, `history-stats-${n}.png`), fullPage: true });
const flat = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ').trim();

/* ── sign in ──────────────────────────────────────────────────────── */
console.log('\nsigning in against the hosted stack');
await page.goto(`${BASE}/sign-in`, { waitUntil: 'domcontentloaded' });
await page.locator('[data-testid="screen-sign-in"]').waitFor({ timeout: 90_000 });
await page.locator('input[data-testid="field-email"]').first().fill(EMAIL);
await page.locator('input[data-testid="field-password"]').first().fill(PASSWORD);
await page.locator('[data-testid="cta-sign-in"]').click();
await page.waitForTimeout(9000);
note(!(await page.locator('[data-testid="screen-sign-in"]').count()), 'signed in');

/* ── History ──────────────────────────────────────────────────────── */
console.log('\nHistory');
await page.goto(`${BASE}/alerts`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(9000);
const historyTab = page.locator('[data-testid="alerts-tab-history"]').first();
await historyTab.scrollIntoViewIfNeeded();
await historyTab.click({ force: true });
await page.waitForTimeout(7000);
await shot('01-board');

const rows = page.locator('[data-testid^="alert-history-"]');
const rowCount = await rows.count();
console.log(`  · ${rowCount} rows`);
note(rowCount >= 20, 'the whole back catalogue is on the tab', rowCount);

const listText = await flat(page.locator('[data-testid="alerts-list-history"]').last());

/* ── no paragraphs anywhere ───────────────────────────────────────── */
console.log('\nthe prose is off the row');
note(!/holding the whole way/i.test(listText), 'no five-session narration');
note(!/not the result of a managed trade\./i.test(listText), 'no paragraph-length disclosure');
note(!/qualifying print/i.test(listText), 'no options-flow narration');
note(!/paid on the ask/i.test(listText), 'and none of its supporting clauses');
note(!/thesis|RSI \d+ at the alert/i.test(listText), 'no technical thesis dumped onto the row');

/* ── the numbers ──────────────────────────────────────────────────── */
console.log('\nthe numbers');
const called = await page.locator('[data-testid^="stat-called-"]').count();
const peaks = await page.locator('[data-testid^="stat-peak-"]').count();
const results = await page.locator('[data-testid^="outcome-"]').count();
const helds = await page.locator('[data-testid^="stat-held-"]').count();
console.log(`  · called ${called} · peak ${peaks} · result ${results} · held ${helds}`);
note(called === rowCount, 'every row says the price it was called at', { called, rowCount });
note(helds === rowCount, 'every row says how long it was held', { helds, rowCount });
note(results > 0 && results < rowCount, 'a result appears only on the rows that were scored', { results, rowCount });
note(peaks === results, 'and a peak appears on exactly those rows and no others', { peaks, results });

// A dash is not a measurement. This is the bug class that was fixed on the
// trade card days ago and the one a stat grid re-introduces most easily.
note(!/[—–]/.test(listText.replace(/·/g, '')), 'no cell holds a dash standing in for a number');
note(!/\b(RESULT|PEAK|CALLED|HELD)\s*(·|$|[A-Z]{3,})/.test(listText),
  'no label is printed above an empty cell');

/* ── the swing shape ──────────────────────────────────────────────── */
console.log('\na scored swing row');
const cop = page.locator('[data-testid="alert-history-COP"]').first();
if (await cop.count()) {
  const t = await flat(cop);
  console.log(`  · ${t}`);
  note(/CALLED \$124\.80/.test(t), 'the call price, as a price');
  note(/PEAK \+8\.9%/.test(t), 'the best it got');
  note(/RESULT \+8\.1%/.test(t), 'what it actually did');
  note(/HELD 5 sessions/.test(t), 'and the window that result covers');
  note(/not a managed trade/i.test(t), 'the one line still refuses the managed-trade reading');
  await cop.screenshot({ path: path.join(OUT, 'history-stats-02-swing-row.png') });
} else {
  note(false, 'the COP row is on the board');
}

/* ── a short reads as a short ─────────────────────────────────────── */
console.log('\na short');
const rddt = page.locator('[data-testid="alert-history-RDDT"]').first();
if (await rddt.count()) {
  const t = await flat(rddt);
  console.log(`  · ${t}`);
  note(/short/i.test(t), 'the direction is on the row');
  // The result on a short is the STOCK's move by decision, so the peak has to
  // be in the same frame or the two numbers contradict each other silently.
  note(/STOCK LOW/i.test(t), "the best point is labelled as the stock's low, not a peak");
  note(/the stock's move/i.test(t), 'and the line says whose move the numbers are');
  await rddt.screenshot({ path: path.join(OUT, 'history-stats-03-short-row.png') });
} else {
  note(false, 'a short is on the board');
}

/* ── the day-trade replay shape ───────────────────────────────────── */
console.log('\na day-trade replay');
const meta = page.locator('[data-testid="alert-history-META"]').first();
if (await meta.count()) {
  const t = await flat(meta);
  console.log(`  · ${t}`);
  note(/rehearsal, not an alert anyone was sent/i.test(t), 'it says it was a rehearsal');
  note(/CALLED \$609/.test(t), 'the call price');
  note(/HELD Intraday/.test(t), 'and that it was an intraday call');
  note(await meta.locator('[data-testid="contract-META"]').count() > 0, 'the contract is drawn');
  note(/607\.5/.test(t) && /Put/.test(t) && /Aug 12/.test(t) && /5\.25/.test(t),
    'strike, side, expiry and what was paid — as numerals, on one line');
  note(!/RESULT/.test(t), 'no result — this engine scores none');
  note(!/PEAK/.test(t), 'no peak — the same');
  note(await meta.locator('[data-testid="grade-chip"]').count() === 0, 'and no letter grade is invented');
  await meta.screenshot({ path: path.join(OUT, 'history-stats-04-daytrade-row.png') });
} else {
  note(false, 'the META replay is on the board');
}

/* ── the two shapes, side by side ─────────────────────────────────── */
if (await cop.count() && await meta.count()) {
  await meta.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await shot('05-daytrade-in-frame');
}

/* ── the words are one tap away, not deleted ──────────────────────── */
//
// The whole case for taking the narration off the row is that it is still
// reachable. If this fails, the change stopped being an edit to a layout and
// became a deletion of content.
console.log('\nthe record behind the row');
if (await cop.count()) {
  await cop.scrollIntoViewIfNeeded();
  await cop.click();
  await page.waitForTimeout(7000);
  await shot('06-tapped-through');
  const url = page.url();
  note(/\/trade\/COP/.test(url), 'tapping a History row opens that alert in the Trade Portal', url);
  const t = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  note(/COP|ConocoPhillips/i.test(t), 'and the portal is loaded with the right name');
}

console.log(failures.length ? `\n${failures.length} FAILED:\n  ${failures.join('\n  ')}\n` : '\nall good\n');
await browser.close();
process.exit(failures.length ? 1 : 0);
