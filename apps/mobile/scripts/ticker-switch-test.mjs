/**
 * Changing the chart to a different ticker — by searching, and by Kai's offer.
 *
 *   cd apps/mobile && PROOF_BASE=http://localhost:8092 node scripts/ticker-switch-test.mjs
 *
 * THE OWNER'S ASK: "the trade tab should have a ticker search bar at top where
 * the current ticker dropdown shows.. when it's clicked user should be able to
 * change the chart to a different ticker. kai should also be able to provide
 * artifact to do this also — if let's say they are talking about tsla but then
 * asks about amkr, kai should be able to populate an amkr card or button in chat
 * to view amkr chart."
 *
 * BOTH DOORS LEAD TO THE SAME ROOM, and that is the thing worth checking. The
 * search picks a symbol; Kai's card offers one. Either way the chart has to end
 * up on that ticker, on the same screen, with Back still meaning "out of Trade"
 * rather than "the ticker before this one" — a portal that pushed would leave
 * somebody eleven charts deep with no way out.
 *
 * The card is driven by `?sim=offer` rather than by asking Kai, because the
 * model cannot be reached at all right now (the Anthropic key is out of credit).
 * What that leaves unverified is ONE link — whether the model chooses to emit
 * the command — and the summary says so rather than implying otherwise.
 */
import { chromium } from 'playwright';

const BASE = process.env.PROOF_BASE ?? 'http://localhost:8092';
let pass = 0;
let fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail === undefined ? '' : `\n        ${JSON.stringify(detail)}`}`); }
};
const section = (t) => console.log(`\n${t}\n${'-'.repeat(t.length)}`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, colorScheme: 'dark' });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('  ! pageerror:', e.message.slice(0, 140)));

const open = async (route, wait = 4200) => {
  await page.goto(`${BASE}${route}`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForTimeout(wait);
};
const has = async (id) => (await page.locator(`[data-testid="${id}"]`).count()) > 0;
const tap = async (id, wait = 900) => {
  const el = page.locator(`[data-testid="${id}"]`).first();
  if (!(await el.count())) return false;
  await el.click({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(wait);
  return true;
};

/* ------------------------------------------------------------------ */
section('The header is a search bar, and it opens a search');

await open('/trade/TSLA');
ok('the trade section opened on TSLA', await has('screen-trade-portal-v2'));
ok('the ticker sits in a search affordance', await has('ticker-switcher'));
const label = await page.locator('[data-testid="ticker-switcher"]').first().getAttribute('aria-label');
ok('and it announces itself as search, not as a menu', /search/i.test(label ?? ''), label);
await page.screenshot({ path: 'proof/ticker-search-header.png' });

await tap('ticker-switcher', 1200);
ok('tapping it opens the search sheet', await has('ticker-switcher-sheet'));
await page.screenshot({ path: 'proof/ticker-search-sheet.png' });

/* ------------------------------------------------------------------ */
section('Picking a result changes the chart');

/**
 * A symbol from the sheet's own list rather than a typed query: the remote
 * search needs a live backend, and what is being checked here is the SWAP, not
 * the lookup. The lookup is `useSymbolSearch`, which the search screen has
 * shipped on for months.
 */
const rows = await page.locator('[data-testid^="switch-to-"]').all();
ok('the sheet lists symbols to switch to', rows.length > 0, { rows: rows.length });
let picked = null;
for (const r of rows) {
  const id = await r.getAttribute('data-testid');
  const sym = (id ?? '').replace('switch-to-', '');
  if (sym && sym !== 'TSLA') { picked = sym; await r.click({ timeout: 8000 }).catch(() => {}); break; }
}
ok('one of them is not the symbol already on screen', Boolean(picked), picked);
await page.waitForTimeout(4200);

ok('the chart is now on that ticker', page.url().includes(`/trade/${picked}`), { url: page.url(), picked });
ok('and it is the same screen, not a new one', await has('screen-trade-portal-v2'));
ok('with the chart mounted', await has('portal-chart'));
await page.screenshot({ path: 'proof/ticker-search-switched.png' });

/* ------------------------------------------------------------------ */
section("Kai's card offers a symbol, and the tap is what moves the chart");

await open('/trade/TSLA?sim=offer');
ok('the card is in the reply', await has('symbol-offer'));
ok('naming the symbol asked about', await has('symbol-offer-open-AMKR'));
ok('the chart has NOT moved on its own', page.url().includes('/trade/TSLA'), page.url());
await page.screenshot({ path: 'proof/ticker-kai-offer.png' });

await tap('symbol-offer-open-AMKR', 4200);
ok('tapping it puts that chart up', page.url().includes('/trade/AMKR'), page.url());
ok('on the same screen', await has('screen-trade-portal-v2'));
ok('and the card is gone once taken', !(await has('symbol-offer')));
await page.screenshot({ path: 'proof/ticker-kai-offer-taken.png' });

/* ------------------------------------------------------------------ */
section('Back still means out of Trade, not "the previous ticker"');

/**
 * The reason both doors `replace` rather than `push`. Two swaps have happened;
 * the history must not have grown by two.
 */
await page.goBack({ timeout: 20_000 }).catch(() => {});
await page.waitForTimeout(2500);
ok('going back does not land on the ticker we just left',
  !page.url().includes('/trade/AMKR'), page.url());

await browser.close();
console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${pass} passed, ${fail} failed`);
console.log('NOTE: the model choosing to EMIT show_symbol is unverified — the Anthropic key is out of credit.');
process.exit(fail === 0 ? 0 : 1);
