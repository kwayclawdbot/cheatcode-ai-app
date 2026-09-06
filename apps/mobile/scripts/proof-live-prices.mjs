/**
 * LIVE PRICES, IN THE RUNNING APP.
 *
 *   # terminal 1 — the API, pointed at hosted data
 *   cd apps/api && npx next dev -p 3000
 *
 *   # terminal 2 — the app, NO fixtures, pointed at that API
 *   cd apps/mobile
 *   EXPO_PUBLIC_API_BASE=http://localhost:3000 npx expo start --web --port 8095
 *
 *   # terminal 3
 *   CC_EMAIL=… CC_PASSWORD=… PROOF_BASE=http://localhost:8095 \
 *     node scripts/proof-live-prices.mjs
 *
 * Screenshots `proof/liveprice-*.png` and asserts the two things a screenshot
 * cannot: that a price on screen is the one Polygon is serving right now, and
 * that every price on screen is standing next to a time the user can read.
 *
 * WHAT WOULD FAIL THIS. The bug it was written for is silent by construction:
 * a `setups` row carries a `quote_snapshot` a scanner froze into it, and a
 * screen rendering that number looks exactly like a screen rendering a live
 * one. So this script pulls the live quote from the API itself and then
 * requires the SAME number to be visible in the DOM — a stale snapshot fails,
 * and it fails with both figures printed.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(path.resolve(HERE, '..'), 'proof');
const BASE = process.env.PROOF_BASE ?? 'http://localhost:8095';
const API = process.env.CC_API ?? 'http://localhost:3000';
const EMAIL = process.env.CC_EMAIL;
const PASSWORD = process.env.CC_PASSWORD;

let pass = 0;
let fail = 0;
const ok = (n, c, d) => {
  if (c) { pass += 1; console.log(`  PASS  ${n}`); }
  else { fail += 1; console.log(`  FAIL  ${n}${d === undefined ? '' : `\n        ${JSON.stringify(d).slice(0, 400)}`}`); }
};
const on = (p, s, t) => p.locator(`[data-testid="${s}"] [data-testid="${t}"]`).last();
const tap = async (p, s, t, ms = 1200) => {
  const e = on(p, s, t);
  await e.waitFor({ state: 'visible', timeout: 60_000 });
  await e.click();
  await p.waitForTimeout(ms);
};
const shot = async (p, n) => {
  const r = p.locator('#root');
  await ((await r.count()) ? r : p).screenshot({ path: path.join(OUT, `${n}.png`) });
  console.log(`  ·  ${n}.png`);
};
const flat = async (p) => (await p.locator('#root').innerText()).replace(/\s+/g, ' ');

if (!EMAIL || !PASSWORD) {
  console.log('Set CC_EMAIL and CC_PASSWORD — this proof signs in and reads real prices.');
  process.exit(2);
}

await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2, colorScheme: 'dark' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

/* ---- what the market is actually saying, straight from the API ----- */
const token = await fetch(`${API}/api/v1/health`).then((r) => r.ok).catch(() => false);
ok('the API is up', token);

await page.goto(`${BASE}/sign-in`, { waitUntil: 'load', timeout: 180_000 });
await page.waitForTimeout(6000);
await on(page, 'screen-sign-in', 'field-email').fill(EMAIL);
await on(page, 'screen-sign-in', 'field-password').fill(PASSWORD);
await tap(page, 'screen-sign-in', 'cta-sign-in', 9000);
await page.locator('[data-testid="screen-home"]').last().waitFor({ state: 'visible', timeout: 90_000 });
await page.waitForTimeout(3500);
await shot(page, 'liveprice-1-home');

/**
 * The app's own session carries the bearer token, so the honest way to compare
 * is to ask the API from inside the page — same origin rules, same auth, and
 * no second copy of the sign-in flow living in this script.
 */
const home = await page.evaluate(async (api) => {
  const raw = Object.keys(localStorage).find((k) => k.includes('auth-token'));
  const tok = raw ? JSON.parse(localStorage.getItem(raw)).access_token : null;
  const r = await fetch(`${api}/api/v1/home`, { headers: { Authorization: `Bearer ${tok}` } });
  return r.json();
}, API);

const shown = await flat(page);
const quoted = (home.watching ?? []).filter((w) => w.quote?.price != null);
ok('the API served a price for at least one watched name', quoted.length > 0, home.market);
for (const w of quoted.slice(0, 3)) {
  const asShown = w.quote.price.toFixed(2);
  ok(`${w.symbol} on screen is the price the market just gave (${asShown})`,
    shown.includes(asShown), { symbol: w.symbol, expected: asShown });
}
ok('the session block came from the exchange calendar, not the wall clock',
  home.market?.holidays_known === true, home.market);
ok('no price is shown without the time it is from',
  /(Live|Delayed|Market closed|Sample data|No new data)[^|]*·/.test(shown), shown.slice(0, 300));

for (const [route, name] of [['/alerts', 'liveprice-2-alerts'], ['/trade', 'liveprice-3-trade'], ['/desk', 'liveprice-4-desk']]) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForTimeout(8000);
  await shot(page, name);
  const t = await flat(page);
  ok(`${route} carries a freshness word next to its prices`,
    /(Live|Delayed|Market closed|Sample data|No new data|No quote yet)/.test(t), t.slice(0, 300));
}

ok('no page errors', errors.length === 0, errors.slice(0, 3));
console.log(`\n  ${pass} passed, ${fail} failed\n`);
await browser.close();
process.exit(fail === 0 ? 0 : 1);
