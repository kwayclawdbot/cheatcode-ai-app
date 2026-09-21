/**
 * Fixtures proof for the redesigned Trade Detail (V1 board panel 4).
 *
 *   EXPO_PUBLIC_FIXTURES=1 npx expo start --web --port 8108
 *   PROOF_OUT=/some/dir node scripts/proof-rd-trade.mjs
 *
 * Every state is asserted by testID before it is shot — a screenshot proves
 * nothing on its own. Three sizes: 390x844 at 100%, the same phone at 130%
 * (a 300x649 CSS viewport drawn at 2.6x, which is what browser zoom does), and
 * 360x780.
 *
 *   from an alert ........ grade chip, levels, R in the corner, thesis, checklist
 *   Details / Discussion . the old DECIDE beat, and the symbol's room
 *   overflow + order ..... the paper order is reachable, never orange, and the
 *                          card's R and its warning come from one source
 *   Ask Kai .............. the composer replaces the one action while it is out
 *   full screen .......... the chart stage, with its own Ask Kai / Done
 *   ticker search ........ the title opens search; a pick swaps the screen
 */
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs/promises';

const BASE = process.env.PROOF_BASE ?? 'http://localhost:8108';
const OUT = process.env.PROOF_OUT ?? path.resolve('proof', 'rd-trade');
await fs.mkdir(OUT, { recursive: true });

const HIDE_DEV = `.__expo_fast_refresh { display: none !important; }`;
let failures = 0;
const log = (s) => console.log(s);

async function must(page, id, why) {
  try {
    await page.getByTestId(id).last().waitFor({ state: 'visible', timeout: 20_000 });
    log(`  · ${why}`);
  } catch {
    failures += 1;
    log(`  ✗ ${why} — [data-testid="${id}"] never appeared`);
  }
}
async function mustText(page, id, re, why) {
  try {
    const t = await page.getByTestId(id).last().innerText();
    if (!re.test(t)) throw new Error(t);
    log(`  · ${why}`);
  } catch (e) {
    failures += 1;
    log(`  ✗ ${why} — got "${String(e.message ?? e).slice(0, 140)}"`);
  }
}
async function mustLabel(page, id, re, why) {
  const l = await page.getByTestId(id).last().getAttribute('aria-label').catch(() => null);
  if (l && re.test(l)) { log(`  · ${why}`); return; }
  failures += 1;
  log(`  ✗ ${why} — label was "${l}"`);
}
async function mustNot(page, id, why) {
  const n = await page.getByTestId(id).count();
  if (!n || !(await page.getByTestId(id).last().isVisible())) { log(`  · ${why}`); return; }
  failures += 1;
  log(`  ✗ ${why} — [data-testid="${id}"] is on screen`);
}
const tap = async (page, id, ms = 1200) => { await page.getByTestId(id).last().click(); await page.waitForTimeout(ms); };
const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); log(`  ✓ ${name}.png`); };
async function scrollMain(page, where = 'bottom') {
  await page.evaluate((w) => {
    for (const d of document.querySelectorAll('div')) {
      const s = getComputedStyle(d);
      if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && d.scrollHeight > d.clientHeight + 10) {
        d.scrollTop = w === 'bottom' ? d.scrollHeight : 0;
      }
    }
  }, where);
  await page.waitForTimeout(600);
}
async function open(page, route, ms = 6000) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'load', timeout: 240_000 });
  await page.addStyleTag({ content: HIDE_DEV }).catch(() => {});
  await page.waitForTimeout(ms);
}

const ALERT = '/trade/META?alert=alert-meta&ctx=alert';

async function run(browser, tag, viewport, scale) {
  log(`\n== ${tag} (${viewport.width}x${viewport.height} @${scale}x)`);
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: scale, colorScheme: 'dark' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { failures += 1; log(`  ✗ page error: ${e.message}`); });

  /* ---- from an alert ------------------------------------------------ */
  await open(page, ALERT, 9000);
  await must(page, 'trade-grade-chip', 'the grade arrives with the alert');
  await mustText(page, 'trade-grade-chip', /A.? setup/, 'and reads as "A− setup"');
  await mustText(page, 'trade-title', /META · Day Trade Long/, 'the title names the setup type');
  await mustText(page, 'summary-triplet-entry', /504\.00/, 'the entry arrives');
  await mustText(page, 'summary-triplet-stop', /498\.00/, 'the stop arrives');
  await mustText(page, 'summary-triplet-target', /520\.00/, 'the target arrives');
  await mustText(page, 'trade-r-now', /R$/, 'the R right now is in the corner');
  await must(page, 'tab-trade', 'the dock is on the Trade screen');
  // Fixture META is already on the watchlist; one tap takes it off so the
  // board's orange state is what gets shot, a second would put it back.
  const cta = await page.getByTestId('cta-watchlist').last().innerText();
  if (/On your watchlist/.test(cta)) await tap(page, 'cta-watchlist', 600);
  await mustText(page, 'cta-watchlist', /Add to watchlist/, 'the one orange action is Add to watchlist');
  await shot(page, `${tag}-01-alert-chart`);

  await scrollMain(page);
  await must(page, 'kai-thesis-text', "Kai's thesis is the alert's own write-up");
  await mustLabel(page, 'check-trend', /Trend: passes/, 'Trend is ticked from the trend leg');
  await mustLabel(page, 'check-catalyst', /Catalyst: not measured/, 'Catalyst is unknown on a day trade — not ticked');
  await mustLabel(page, 'check-volume', /Volume: passes/, 'Volume is ticked from the volume leg');
  await mustLabel(page, 'check-risk', /Risk: passes/, 'Risk is ticked from the reward-against-risk leg');
  await shot(page, `${tag}-02-thesis-checklist`);
  await tap(page, 'check-catalyst', 500);
  await must(page, 'check-why', 'a line says why when tapped');
  await shot(page, `${tag}-03-checklist-why`);

  /* ---- Details -------------------------------------------------------- */
  await scrollMain(page, 'top');
  await tap(page, 'trade-tabs-details');
  await must(page, 'decide-verdict', 'Details carries the verdict');
  await must(page, 'decide-because', 'and the levels that say so');
  await mustNot(page, 'portal-chart', 'the chart steps aside (mounted, hidden)');
  await shot(page, `${tag}-04-details`);
  await scrollMain(page);
  await must(page, 'details-paper-trade', 'the paper order is offered, as an outline');
  await shot(page, `${tag}-05-details-bottom`);

  /* ---- Discussion ----------------------------------------------------- */
  await scrollMain(page, 'top');
  await tap(page, 'trade-tabs-discussion', 1800);
  await must(page, 'discussion-summary', "the members' line, labelled as members");
  await must(page, 'discussion-room', "the symbol's room");
  await shot(page, `${tag}-06-discussion`);

  /* ---- overflow + the paper order ------------------------------------ */
  await tap(page, 'trade-tabs-chart');
  await tap(page, 'trade-more', 900);
  await must(page, 'more-paper', 'the overflow leads with the paper order');
  await shot(page, `${tag}-07-more`);
  await tap(page, 'more-paper', 3200);
  await must(page, 'order-confirmation-card', 'the order prices itself and asks to be confirmed');
  await mustText(page, 'confirm-r', /to 1|not known/, 'the reward is said the way the warning says it');
  await mustNot(page, 'cta-watchlist', 'the watchlist button steps aside while the order is open');
  await shot(page, `${tag}-08-paper-order`);
  await tap(page, 'take-back', 900);

  /* ---- Ask Kai --------------------------------------------------------- */
  await scrollMain(page);
  await tap(page, 'kai-thesis-ask', 900);
  await must(page, 'portal-composer', 'Ask Kai opens the composer');
  await mustNot(page, 'cta-watchlist', 'and the one action steps aside for it');
  await shot(page, `${tag}-09-ask-kai`);
  await tap(page, 'kai-thesis-ask', 600);

  /* ---- full screen ----------------------------------------------------- */
  await scrollMain(page, 'top');
  await tap(page, 'portal-chart-expand', 2400);
  await must(page, 'stage-chart', 'the chart goes full screen');
  await shot(page, `${tag}-10-fullscreen`);
  await tap(page, 'stage-close', 1200);

  /* ---- ticker search --------------------------------------------------- */
  await open(page, '/trade/SPY', 8000);
  await mustText(page, 'trade-grade-chip', /Not graded/, 'a symbol with no setup says so');
  await must(page, 'setup-summary', 'the summary says there is no plan');
  await mustLabel(page, 'check-trend', /not measured/, 'and nothing on the checklist is ticked');
  await shot(page, `${tag}-11-search-spy`);
  await tap(page, 'ticker-switcher', 900);
  await page.getByTestId('ticker-search-input').last().fill('META');
  await page.waitForTimeout(1200);
  await shot(page, `${tag}-12-search-sheet`);
  await tap(page, 'switch-to-META', 6000);
  await mustText(page, 'trade-ticker', /META/, 'the pick swaps the screen to META');
  await shot(page, `${tag}-13-search-result`);

  await ctx.close();
}

const browser = await chromium.launch();
const only = process.env.ONLY;
if (!only || only === '390') await run(browser, '390', { width: 390, height: 844 }, 2);
if (!only || only === '130') await run(browser, '390z130', { width: 300, height: 649 }, 2.6);
if (!only || only === '360') await run(browser, '360', { width: 360, height: 780 }, 2);
await browser.close();

log(failures ? `\n${failures} assertion(s) failed\n` : '\nall assertions passed\n');
process.exit(failures ? 1 : 0);
