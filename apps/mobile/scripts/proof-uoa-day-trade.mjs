/**
 * THE UNUSUAL-OPTIONS-ACTIVITY DAY-TRADE CARD, signed in, against the hosted API.
 *
 *   cd apps/mobile
 *   npx expo start --web --port 8141              # no EXPO_PUBLIC_FIXTURES
 *   PROOF_BASE=http://localhost:8141 \
 *     PROOF_EMAIL=… PROOF_PASSWORD=… node scripts/proof-uoa-day-trade.mjs
 *
 * This is the proof that the pipe ends in a card. A real account whose
 * `primary_mode` is day_trade signs in, lands on the alerts board — not the
 * coming-soon screen it got before 2026-09-06 — and sees an alert produced by
 * `uw_alerts/live_stream.py`, carried by `POST /api/v1/internal/uoa-alerts`.
 *
 * IT ASSERTS THE ABSENCES, NOT JUST THE PRESENCES. Most of what makes this card
 * correct is what is NOT on it: no letter grade, no stop, no target, no exit
 * advice. Those are easy to regress into — a later change that starts deriving
 * a stop, or that falls back to a default grade, would still render a card that
 * looks fine. So they are checked here explicitly and by name.
 *
 * The account is a throwaway `@cheatcode.test` one, in the pattern the other
 * proof runs in this repo use. It is never the owner's.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const OUT = path.resolve(process.cwd(), 'proof');
const BASE = process.env.PROOF_BASE ?? 'http://localhost:8141';
const EMAIL = process.env.PROOF_EMAIL;
const PASSWORD = process.env.PROOF_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error('PROOF_EMAIL and PROOF_PASSWORD are required'); process.exit(1); }
const VIEWPORT = { width: 390, height: 844 };
mkdirSync(OUT, { recursive: true });

const failures = [];
const note = (ok, what) => { console.log(`  ${ok ? '✓' : '✗'} ${what}`); if (!ok) failures.push(what); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 2 });
page.on('pageerror', (e) => failures.push(`page error: ${e.message}`));

const shot = (n) => page.screenshot({ path: path.join(OUT, `uoa-daytrade-${n}.png`), fullPage: true });
const has = (id) => page.locator(`[data-testid="${id}"]`).count().then((n) => n > 0);
const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');

/* ── sign in ──────────────────────────────────────────────────────── */
console.log('\nsigning in against the hosted stack');
await page.goto(`${BASE}/sign-in`, { waitUntil: 'domcontentloaded' });
await page.locator('[data-testid="screen-sign-in"]').waitFor({ timeout: 90_000 });
await page.locator('input[data-testid="field-email"]').first().fill(EMAIL);
await page.locator('input[data-testid="field-password"]').first().fill(PASSWORD);
await page.locator('[data-testid="cta-sign-in"]').click();
await page.waitForTimeout(8000);
note(!(await has('screen-sign-in')), 'signed in');

/* ── the Day Trade lane is a board again ──────────────────────────── */
console.log('\nthe Day Trade tab');
await page.goto(`${BASE}/alerts`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(9000);
await shot('01-board');
{
  const t = await text();
  note(await has('screen-alerts'), 'a day-trade account lands on the alerts board');
  note(!(await has('screen-day-trade-soon')), 'and NOT on the coming-soon screen');
  note(!/not live yet/i.test(t), 'nothing still says the mode is not live');
  note(await has('alerts-tabs'), 'the Active/Community/History rail is there');
}

/* ── the card itself ──────────────────────────────────────────────── */
//
// EVERY ASSERTION IS SCOPED TO THIS ONE CARD, not to the page.
//
// The reason used to be that the board also carried swing cards, and those
// legitimately have grades, stops and targets, so a whole-page regex for "no
// target" would pass or fail on somebody else's card. The board is now filtered
// to the mode the user is in, so a day-trade account no longer sees a swing
// pick at all. The scoping stays anyway: this account can own alerts and
// positions of its own, History is still every mode, and an assertion about
// THIS card should be read off THIS card either way.
console.log('\nthe card');
const card = page.locator('[data-testid="alert-card-SYNTH"]').first();
note(await card.count() > 0, 'the day-trade alert is on the board');
const cardText = async () => (await card.innerText()).replace(/\s+/g, ' ');

{
  const t = await cardText();
  note(/Day Trade/i.test(t), 'labelled Day Trade');
  note(/No grade/i.test(t), 'the medallion says "No grade" rather than inventing a letter');
  note(await card.locator('[data-testid="grade-ungraded-ring"]').count() > 0,
    'and draws its ungraded dotted ring');
  note(await card.locator('[data-testid="grade-score"]').count() === 0,
    'no 0-100 score is shown for an ungraded alert');
}

// The detail is behind a tap, by design — "View setup details". That is where
// the bars and the contracts live, so the proof opens it rather than declaring
// them missing from a collapsed card.
console.log('\nexpanded');
await card.locator('[data-testid="alert-expand-SYNTH"]').first().click();
await page.waitForTimeout(2500);
await shot('02-card-expanded');
// The card on its own, whole — the page screenshot clips it between a sticky
// header and a sticky composer, which is fine for a regression check and no
// good at all for looking at what was built.
await card.screenshot({ path: path.join(OUT, 'uoa-daytrade-02b-card-only.png') });
{
  const t = await cardText();

  // The contract card — the whole point of the options lane.
  note(await card.locator('[data-testid="contracts-SYNTH"]').count() > 0, 'the contracts section is drawn');
  note(/607\.5/.test(t), 'the contract strike is shown');
  note(/put/i.test(t), 'and its side');
  note(/Aug 12/.test(t), 'and its expiry');
  note(/5\.25/.test(t), 'and what it costs');
  note(/Active/i.test(t), 'and its liquidity, which cleared the floor');

  // The bar this family actually measures — and, just as importantly, the two
  // it does not. A trend bar appearing here would mean something started
  // inventing a reading this engine never took.
  note(await card.locator('[data-testid="bar-options-SYNTH"]').count() > 0, 'the options-activity bar is drawn');
  note(await card.locator('[data-testid="bar-trend-SYNTH"]').count() === 0, 'no trend bar — this engine does not read trend');
  note(await card.locator('[data-testid="bar-rr-SYNTH"]').count() === 0, 'no reward:risk bar — there is no stop to compute one from');

  // What must NOT be there.
  note(!/\bStop\b/i.test(t), 'no stop — the formula produces none');
  note(!/\bTarget\b/i.test(t), 'no target — the formula produces none');
  note(!/take profit|trim|exit at|close at|sell at|scale out/i.test(t), 'no exit advice anywhere');

  // The story says which engine called it.
  note(/unusual-options-activity/i.test(t), 'the copy names the formula that fired it');
  note(/options flow and nothing else/i.test(t), 'and says plainly what it does not look at');
}

/* ── history: the replayed real alert, labelled as a rehearsal ────── */
console.log('\nhistory');
const historyTab = page.locator('[data-testid="alerts-tab-history"]').first();
if (await historyTab.count()) {
  // The rail can sit below the fold on a 390-wide viewport, and a tab that is
  // off-screen is not "missing" — scroll to it rather than failing the run on
  // a layout detail that has nothing to do with what is being proved.
  await historyTab.scrollIntoViewIfNeeded();
  await historyTab.click({ force: true });
  await page.waitForTimeout(6000);
}
await shot('03-history');
{
  const meta = page.locator('[data-testid="alert-history-META"]').first();
  const onBoard = await meta.count() > 0;
  note(onBoard, 'the replayed real alert is in History');
  if (onBoard) {
    // The row is a stat row now, so the rehearsal fact is a FIELD on the card
    // rather than the first sentence of a paragraph that happened to fit. If
    // this ever fails, the fix is the row, not the sentence — a rehearsal that
    // does not say so is the one thing this card must never be.
    const t = (await meta.innerText()).replace(/\s+/g, ' ');
    note(/rehearsal, not an alert anyone was sent/i.test(t), 'and the row says it was a rehearsal');

    // The numbers this family HAS, as numbers.
    note(/CALLED \$609/i.test(t), 'the row shows the price it was called at');
    note(/HELD Intraday/i.test(t), 'and that it was an intraday call');
    note(await meta.locator('[data-testid="contract-META"]').count() > 0, 'and the contract it named');
    note(/607\.5/.test(t) && /put/i.test(t) && /Aug 12/.test(t) && /5\.25/.test(t),
      'strike, side, expiry and what was paid, all on one compact line');

    // And the numbers it does NOT have. This family scores no outcome at all,
    // so a result or a peak appearing here would be an invention.
    note(await meta.locator('[data-testid="outcome-META"]').count() === 0,
      'no result — nothing ever measured one for this family');
    note(await meta.locator('[data-testid="stat-peak-META"]').count() === 0,
      'no peak — the same');
    note(!/\bRESULT\b/.test(t) && !/\bPEAK\b/.test(t), 'and no empty cell standing in for either');

    // The narration is off the row, not deleted — it is behind the tap.
    note(!/qualifying print/i.test(t), 'the flow narration is no longer poured onto the row');
  }
}

console.log(failures.length ? `\n${failures.length} FAILED:\n  ${failures.join('\n  ')}\n` : '\nall good\n');
await browser.close();
process.exit(failures.length ? 1 : 0);
