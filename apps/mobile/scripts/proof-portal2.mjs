/**
 * Fixtures proof for the rebuilt Trade section — the three beats.
 *
 *   EXPO_PUBLIC_FIXTURES=1 npx expo start --web --port 8093
 *   node scripts/proof-portal2.mjs
 *
 * Everything lands in proof/p2-*.png at 390x844. A screenshot proves nothing on
 * its own, so every state is asserted by testID before it is shot, and the
 * assertions are the point: "the send button exists" is worth less than "the
 * send button exists AND the risk in dollars is above it".
 *
 * The six states it must be possible to see:
 *   1. LOOK    — the chart, full size, one action
 *   2. DECIDE  — a graded setup: grade, levels, what would prove it wrong
 *   3. DECIDE  — a symbol with NO graded setup: Kai says so and offers instead
 *   4. TAKE    — the order confirmation card
 *   5. RECEIPT — after the paper order, accepted and then filled
 *   6. FAILED  — what a person sees when Kai's read does not load
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'proof');
const BASE = process.env.PROOF_BASE ?? 'http://localhost:8093';
const VIEWPORT = { width: 390, height: 844 };

const HIDE_DEV_CHROME = `.__expo_fast_refresh { display: none !important; }`;

const settle = (page, ms = 900) => page.waitForTimeout(ms);

const shot = async (page, name) => {
  const root = page.locator('#root');
  await ((await root.count()) ? root : page).screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log(`  ✓ ${name}.png`);
};

async function open(page, route, ms = 2600) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'load', timeout: 180_000 });
  await settle(page, ms);
}

let failures = 0;
async function must(page, testid, why) {
  try {
    await page.getByTestId(testid).last().waitFor({ state: 'visible', timeout: 20_000 });
    console.log(`  · ${why}`);
  } catch {
    failures += 1;
    console.log(`  ✗ ${why} — [data-testid="${testid}"] never appeared`);
  }
}
async function mustText(page, testid, re, why) {
  try {
    const t = await page.getByTestId(testid).last().innerText();
    if (!re.test(t)) throw new Error(t);
    console.log(`  · ${why}`);
  } catch (e) {
    failures += 1;
    console.log(`  ✗ ${why} — got "${String(e.message ?? e).slice(0, 140)}"`);
  }
}
/** Present in the tree but not painted — `display:none`, so the WebView is not reloaded. */
async function mustHidden(page, testid, why) {
  const n = await page.getByTestId(testid).first().isVisible().catch(() => false);
  if (!n) { console.log(`  · ${why}`); return; }
  failures += 1;
  console.log(`  ✗ ${why} — [data-testid="${testid}"] is visible and must not be`);
}
/** Painted, and inside the 390x844 viewport without scrolling. */
async function mustInView(page, testid, why) {
  const box = await page.getByTestId(testid).last().boundingBox().catch(() => null);
  if (box && box.y >= 0 && box.y + box.height <= VIEWPORT.height) { console.log(`  · ${why}`); return; }
  failures += 1;
  console.log(`  ✗ ${why} — box ${JSON.stringify(box)}`);
}
async function mustNot(page, testid, why) {
  const n = await page.getByTestId(testid).count();
  if (n === 0) { console.log(`  · ${why}`); return; }
  failures += 1;
  console.log(`  ✗ ${why} — [data-testid="${testid}"] is on screen and must not be`);
}
const tap = async (page, testid, ms = 900) => {
  const el = page.getByTestId(testid).last();
  await el.waitFor({ state: 'visible', timeout: 30_000 });
  await el.click();
  await settle(page, ms);
};

(async () => {
  await fs.mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, colorScheme: 'dark' });
  await ctx.addInitScript((css) => {
    const add = () => { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); };
    if (document.head) add(); else document.addEventListener('DOMContentLoaded', add);
  }, HIDE_DEV_CHROME);
  const page = await ctx.newPage();

  console.log('\n1. LOOK — the chart is the screen, and one thing is asked of you');
  await open(page, '/trade/META?v=2', 4200);
  await must(page, 'screen-trade-portal-v2', 'the rebuilt section opened');
  await must(page, 'portal2-spine', 'the spine is the navigation');
  await must(page, 'beat-look', 'beat one is what is on screen');
  await must(page, 'portal-chart', 'the chart is mounted');
  await must(page, 'look-read-chart', 'Kai can be asked to read it');
  await mustNot(page, 'beat-decide', 'beat two is NOT also on screen');
  await mustNot(page, 'beat-take', 'beat three is NOT also on screen');
  await mustNot(page, 'context-switcher', 'the old context switcher is gone');
  await mustNot(page, 'panel-alert', 'the alert panel is not stacked under the chart');
  await mustNot(page, 'panel-plan', 'the plan panel is not stacked under the chart');
  await shot(page, 'p2-1-look');

  console.log('\n   the levels list is one tap, not a permanent column');
  await tap(page, 'look-levels-toggle');
  await shot(page, 'p2-1b-look-levels');

  console.log('\n   and the one action beat one asks for takes Kai to the chart');
  await open(page, '/trade/META?v=2', 4200);
  await tap(page, 'look-read-chart', 2600);
  await must(page, 'stage-chart', 'the stage takes the screen so Kai has room to work');
  await shot(page, 'p2-1c-look-kai-reading');
  await tap(page, 'stage-close', 900).catch(() => {});

  console.log('\n2. DECIDE — a graded setup');
  await open(page, '/trade/META?v=2&beat=decide', 4200);
  await must(page, 'beat-decide', 'beat two is on screen');
  await must(page, 'grade-medallion', 'the grade is the first thing');
  await mustText(page, 'decide-headline', /A−|A-/, 'and the headline names it');
  await must(page, 'decide-because', 'the levels that say so are listed');
  await must(page, 'decide-level-entry', 'entry');
  await must(page, 'decide-level-stop', 'stop');
  await must(page, 'decide-level-target', 'target');
  await mustText(page, 'decide-wrong-if', /498/, 'and what would prove it wrong names the stop');
  await must(page, 'decide-kai-read', 'Kai’s own read is there');
  await must(page, 'spine-next-take', 'and Take is reachable');
  await mustNot(page, 'decide-scorecard', 'the scorecard is folded away — it is evidence, not the answer');
  await shot(page, 'p2-2-decide-graded');

  console.log('\n   and the evidence is one tap');
  await tap(page, 'decide-evidence-toggle');
  await must(page, 'decide-scorecard', 'the five components open');
  await shot(page, 'p2-2b-decide-evidence');

  console.log('\n3. DECIDE — a symbol with NO graded setup');
  await open(page, '/trade/SPY?v=2&beat=decide', 4200);
  await must(page, 'decide-no-setup', 'the honest block is what renders');
  await mustText(page, 'decide-headline', /no graded setup on SPY/i, 'Kai says he has none');
  await mustText(page, 'decide-headline', /not going to hand you a plan/i, 'and that he is not going to make one up');
  await mustText(page, 'decide-offer', /previous session|VWAP/i, 'he offers what he can actually mark');
  await must(page, 'decide-mark-chart', 'with a button that asks him to');
  await mustNot(page, 'decide-because', 'NO levels are offered as reasons');
  await mustNot(page, 'decide-wrong-if', 'and no invalidation is invented');
  await mustNot(page, 'spine-next-take', 'Take is not offered');
  await mustText(page, 'spine-next-take-blocked', /entry and a level that says it was wrong/i, 'the reason is written out instead');
  await must(page, 'grade-ungraded-ring', 'the medallion shows the ungraded ring, not a gauge at zero');
  await must(page, 'grade-none', 'and reads "No grade" in words');
  await mustNot(page, 'grade-score', 'with no 0-100 score, because there is nothing to score');
  await mustText(page, 'grade-letter', /^—$/, 'the letter is an em dash, not a letter');
  await shot(page, 'p2-3-decide-no-setup');

  console.log('\n4. TAKE — the order confirmation card');
  await open(page, '/trade/META?v=2&beat=decide', 4200);
  await tap(page, 'spine-next-take', 2600);
  await must(page, 'order-confirmation-card', 'the card materialised');
  await mustText(page, 'confirm-recap', /Buy META/i, 'it names the order');
  await must(page, 'confirm-entry', 'entry');
  await must(page, 'confirm-stop', 'stop');
  await must(page, 'confirm-target', 'target');
  await must(page, 'confirm-size', 'size');
  await must(page, 'confirm-risk', 'the dollars at risk');
  await must(page, 'confirm-r', 'and the R-multiple');
  await mustHidden(page, 'portal-chart', 'the chart is out of the way in beat three');
  await mustText(page, 'confirm-size-plain', /share/i, 'the size says how it was arrived at');
  await mustInView(page, 'confirm-send', 'SEND is on screen without scrolling');
  await mustInView(page, 'confirm-risk', 'and so is the money at risk, above it');
  await must(page, 'confirm-cancel', 'CANCEL is there too');
  await mustText(page, 'confirm-venue', /PAPER/i, 'and it is unmistakably the paper account');
  await shot(page, 'p2-4-confirm-card');

  console.log('\n5. RECEIPT — no tap-to-send is ever silent');
  await tap(page, 'confirm-send', 2400);
  await must(page, 'order-receipt', 'a receipt replaced the card');
  await mustText(page, 'receipt-plain', /Sent/i, 'it says the order was sent');
  await mustText(page, 'receipt-status', /Accepted|waiting/i, 'and that accepted is not filled');
  await shot(page, 'p2-5a-receipt-accepted');

  await settle(page, 6000);
  await mustText(page, 'receipt-plain', /filled/i, 'and it updates itself when the fill lands');
  await must(page, 'receipt-avg', 'with the average fill price');
  await must(page, 'receipt-primary', 'and a way into the position');
  await shot(page, 'p2-5b-receipt-filled');

  console.log('\n6. FAILED — what a person sees when Kai’s read does not load');
  await open(page, '/trade/META?v=2&beat=decide&sim=readfail', 4200);
  await must(page, 'decide-kai-failed', 'the failure is stated, not hidden');
  await mustText(page, 'decide-kai-failed', /could not load my read/i, 'in Kai’s own words');
  await mustText(page, 'decide-kai-failed', /grade and the levels above.*still good/i, 'and it says what IS still trustworthy');
  await must(page, 'decide-kai-retry', 'with a way to try again');
  await must(page, 'decide-because', 'the levels are still on screen');
  await must(page, 'grade-medallion', 'and so is the grade');
  // The failure sits UNDER the grade and the levels, because those are the part
  // that did not fail. Scroll to it so the shot shows what a person reads.
  await page.getByTestId('decide-kai-failed').last().scrollIntoViewIfNeeded();
  await settle(page, 700);
  await shot(page, 'p2-6-kai-read-failed');

  console.log('\n7. The old portal is untouched on the same route');
  await open(page, '/trade/META?v=1', 4200);
  await must(page, 'screen-trade-portal', 'v1 still opens');
  await must(page, 'context-switcher', 'with its context switcher');
  await must(page, 'portal-chart', 'and its chart');
  await shot(page, 'p2-7-v1-still-works');

  await browser.close();
  console.log(failures ? `\n${failures} assertion(s) FAILED\n` : '\nevery state asserted and shot\n');
  process.exit(failures ? 1 : 0);
})();
