/**
 * DAY TRADE, ARCHIVED AS COMING SOON — shot in the running app.
 *
 *   cd apps/mobile
 *   EXPO_PUBLIC_FIXTURES=1 npx expo start --web --port 8131
 *   PROOF_BASE=http://localhost:8131 node scripts/proof-day-trade-soon.mjs
 *
 * The fixture profile is already `primary_mode: 'day_trade'`, so the second tab
 * lands on this screen without anything being switched first.
 *
 * A screenshot proves the screen drew. These assertions prove the things a
 * screenshot cannot: that the copy does not invent a date, does not call the
 * mode broken, does not claim it is nearly ready, and that the way out is on
 * the screen rather than in Account. It also proves the negative that matters
 * most — that the alerts board is NOT what a day trader sees, because an alerts
 * board full of swing cards under a "same-day" heading was the actual bug.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const OUT = path.resolve(process.cwd(), 'proof');
const BASE = process.env.PROOF_BASE ?? 'http://localhost:8131';
const VIEWPORT = { width: 390, height: 844 };
mkdirSync(OUT, { recursive: true });

const failures = [];
const note = (ok, what) => { console.log(`  ${ok ? '✓' : '✗'} ${what}`); if (!ok) failures.push(what); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 2 });
page.on('pageerror', (e) => failures.push(`page error: ${e.message}`));

const go = async (route) => {
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2800);
};
const shot = (n) => page.screenshot({ path: path.join(OUT, `daytrade-${n}.png`), fullPage: true });
const has = (id) => page.locator(`[data-testid="${id}"]`).count().then((n) => n > 0);
const tap = async (id) => { await page.locator(`[data-testid="${id}"]`).first().click(); await page.waitForTimeout(1200); };
const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');

/* ── 1. the second tab in Day Trade ───────────────────────────────── */
console.log('\nthe second tab, in Day Trade');
await go('/alerts');
await shot('01-tab');
{
  const t = await text();
  note(await has('screen-day-trade-soon'), 'the coming-soon screen is what draws');
  note(!(await has('screen-alerts')), 'the alerts board does NOT draw');
  note(!(await has('alerts-tabs')), 'no Active/Community/History rail to imply content');
  note(/Not live yet/i.test(t), 'it says plainly that the mode is not live');
  note(/^Day Trade\b/.test(t.trim()), 'the heading names the mode');
  // Three "Day Trade"s in the top 100px reads like a form letter.
  note((t.slice(0, 220).match(/Day Trade/g) ?? []).length <= 2, 'and does not say it three times over');
  note(!(await has('alerts-badge')), 'no alerts badge pointing at a screen with no alerts');

  // The three ways this copy could be wrong while sounding fine.
  note(!/\b(20\d\d|Q[1-4]|next week|next month|this month|coming weeks)\b/i.test(t), 'no invented date');
  note(!/\b(broken|error|failed|went wrong|unavailable)\b/i.test(t), 'it never calls itself broken');
  note(!/\b(any day now|shortly|nearly ready|almost ready|soon as)\b/i.test(t), 'it never claims it is nearly ready');

  // It must not claim the intraday scanner is off. Two families still fire —
  // they are record-only — so "nothing intraday is running" would be false.
  note(!/nothing intraday|no intraday (scan|alerts) (are|is) running/i.test(t), 'no false claim that intraday is switched off');

  note(/nothing has been deleted/i.test(t), 'it says the record is kept');
  note(await has('day-trade-soon-nodate'), 'it says out loud that there is no date');
}

/* ── 2. the way out is on the screen ──────────────────────────────── */
console.log('\nthe way out');
note(await has('day-trade-soon-mode-chip'), 'the mode chip is in the header');
note(await has('day-trade-soon-switch'), 'there is a one-tap switch to Swing');
{
  const t = await text();
  note(/Swing is live/i.test(t), 'it names the mode that IS running');
}
await tap('day-trade-soon-switch');
await page.waitForTimeout(1800);
await shot('02-after-switch');
{
  note(await has('screen-alerts'), 'switching to Swing lands on the real alerts board');
  const t = await text();
  note(/multi-day alerts/i.test(t), 'and the board describes itself as swing, not same-day');
}

/* ── 3. the mode sheet marks it ───────────────────────────────────── */
console.log('\nthe mode sheet');
await tap('alerts-mode-chip');
await page.waitForTimeout(900);
await shot('03-mode-sheet');
{
  note(await has('mode-soon-day_trade'), 'Day Trade carries a COMING SOON marker');
  note(!(await has('mode-soon-swing')), 'Swing carries none');
  note(!(await has('mode-soon-invest')), 'Invest carries none');
  note(await has('mode-option-day_trade'), 'the mode is still offered — archived, not removed');
  const t = await text();
  note(/still here and so is everything it has ever sent/i.test(t), 'the sheet says the data is kept');
}

/* ── 4. onboarding does not start anyone in it ────────────────────── */
console.log('\nonboarding');
await go('/goal');
await shot('04-onboarding');
{
  note(await has('goal-soon-day_trade'), 'Trade Today is marked COMING SOON');
  note(await has('goal-day_trade'), 'and is still selectable');
  const t = await text();
  note(/Kai is not calling these yet/i.test(t), 'the sub-line says what it means');
}

console.log(failures.length ? `\n${failures.length} FAILED:\n  ${failures.join('\n  ')}\n` : '\nall good\n');
await browser.close();
process.exit(failures.length ? 1 : 0);
