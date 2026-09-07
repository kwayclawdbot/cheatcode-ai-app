/**
 * SUPERSEDED ON 2026-09-06, AND KEPT AS THE RECORD OF THE ARCHIVED STATE.
 *
 * This proves Day Trade was presented as coming-soon. It is not any more:
 * `DAY_TRADE_LIVE` is true and the mode draws real cards from the
 * unusual-options-activity engine, so EVERY assertion below now fails by
 * design. It is left in place because it documents what the mode used to do and
 * would be the proof again if the mode were ever archived a second time — but
 * do not run it expecting a pass, and do not "fix" it by flipping the flag back.
 *
 * The proof that replaces it is `proof-uoa-day-trade.mjs`.
 *
 * ---------------------------------------------------------------------------
 * DAY TRADE COMING SOON — signed in, against the hosted stack.
 *
 *   cd apps/mobile
 *   npx expo start --web --port 8141                # no EXPO_PUBLIC_FIXTURES
 *   PROOF_BASE=http://localhost:8141 \
 *     PROOF_EMAIL=… PROOF_PASSWORD=… node scripts/proof-day-trade-hosted.mjs
 *
 * Fixtures prove the screen. This proves the SWITCH: that a real account whose
 * `primary_mode` is day_trade gets the coming-soon screen from real data, and
 * that one tap moves it to Swing, writes it through `PUT /mode`, and lands on
 * the actual hosted alerts board with the actual morning picks on it.
 *
 * The account is a throwaway `@cheatcode.test` one, in the pattern the earlier
 * proof runs in this repo already use. It is never the owner's.
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

/**
 * STANDING IN FOR ONE LINE THAT IS NOT DEPLOYED YET, and saying so rather than
 * quietly passing.
 *
 * The storefront lane added `X-CheatCode-Client` to every request the app
 * makes. `apps/api/src/proxy.ts` did not list it in
 * `Access-Control-Allow-Headers`, so on Expo WEB the browser refuses to send
 * any /api/v1 request at all — every call fails before it leaves the machine.
 * Native is unaffected, which is why nobody saw it.
 *
 * That is now fixed in `proxy.ts` and verified against a running server:
 *   curl -X OPTIONS … -H 'Access-Control-Request-Headers: x-cheatcode-client'
 *   → access-control-allow-headers: authorization, content-type, x-cheatcode-client
 *
 * The PRODUCTION API cannot be redeployed from this tree today — two other
 * lanes have in-flight work in it and `next build` does not currently pass — so
 * the deployed copy still has the old list. Dropping the header here puts the
 * browser in exactly the state the fixed API will be in, and nothing else about
 * the run is simulated: real account, real session, real hosted API, real data.
 */
await page.route('**://cheatcode-ai-api.vercel.app/**', async (route) => {
  const headers = { ...route.request().headers() };
  delete headers['x-cheatcode-client'];
  await route.continue({ headers });
});

const shot = (n) => page.screenshot({ path: path.join(OUT, `daytrade-hosted-${n}.png`), fullPage: true });
const has = (id) => page.locator(`[data-testid="${id}"]`).count().then((n) => n > 0);
const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');

/* ── sign in ──────────────────────────────────────────────────────── */
console.log('\nsigning in against the hosted stack');
await page.goto(`${BASE}/sign-in`, { waitUntil: 'domcontentloaded' });
await page.locator('[data-testid="screen-sign-in"]').waitFor({ timeout: 60_000 });
await page.locator('input[data-testid="field-email"]').first().fill(EMAIL);
await page.locator('input[data-testid="field-password"]').first().fill(PASSWORD);
await page.locator('[data-testid="cta-sign-in"]').click();
await page.waitForTimeout(6000);
note(!(await has('screen-sign-in')), 'signed in');

/* ── the second tab, in Day Trade, on real data ───────────────────── */
console.log('\nthe second tab');
await page.goto(`${BASE}/alerts`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);
await shot('01-tab');
{
  const t = await text();
  note(await has('screen-day-trade-soon'), 'a real day-trade account gets the coming-soon screen');
  note(!(await has('screen-alerts')), 'and not the alerts board');
  note(!(await has('alerts-tabs')), 'no Active/Community/History rail');
  note(/Not live yet/i.test(t), 'it says the mode is not live');
  // The bug this replaces: swing cards under a same-day heading.
  note(!/same-day alerts/i.test(t), 'it does not describe anything on screen as same-day alerts');
  note(!/\bA[−+-]?\b\s*\d{2}/.test(t), 'no graded cards leaked onto it');
}

/* ── one tap to a mode that is live ───────────────────────────────── */
console.log('\nthe switch, written through the API');
await page.locator('[data-testid="day-trade-soon-switch"]').first().click();
await page.waitForTimeout(6000);
await shot('02-swing');
{
  const t = await text();
  note(await has('screen-alerts'), 'it lands on the real alerts board');
  note(/multi-day alerts/i.test(t), 'described as swing, which is what it is');
  note(await has('alerts-tabs'), 'with the state rail back');
}

/* ── and it stuck: reload proves the write, not just local state ──── */
console.log('\nreload — the mode was saved, not just held in memory');
await page.goto(`${BASE}/alerts`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);
await shot('03-after-reload');
note(await has('screen-alerts'), 'still on the alerts board after a full reload');
note(!(await has('screen-day-trade-soon')), 'and not back on coming-soon');

console.log(failures.length ? `\n${failures.length} FAILED:\n  ${failures.join('\n  ')}\n` : '\nall good\n');
await browser.close();
process.exit(failures.length ? 1 : 0);
