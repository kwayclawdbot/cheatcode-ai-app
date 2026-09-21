/**
 * THE FIVE WORKSPACE PANELS, PHOTOGRAPHED ON HOME AT 390×844.
 *
 *   cd apps/mobile
 *   EXPO_PUBLIC_FIXTURES=1 npx expo start --web --port 8099
 *   PROOF_BASE=http://localhost:8099 PROOF_OUT=/some/dir node scripts/proof-workspace-panels.mjs
 *
 * FIXTURES MODE, ON PURPOSE. There is no model to ask (and no credit to ask it
 * with), so Kai's side is the fixtures-mode stand-in: a canned turn that carries
 * a `workspace_action` through the SAME path a live frame takes — engine →
 * bridge → store → host. The member's side is the real launcher and the real
 * close button. The numbers on screen are the example fixtures; the live data
 * path is proven separately by `apps/api/scripts/panels-test.mts` and needs a
 * deployed API to be seen on a phone.
 *
 * The screenshots go to PROOF_OUT, not to `proof/`: that folder holds signed-off
 * pixels, and these are a lane's evidence rather than a sign-off.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const BASE = process.env.PROOF_BASE ?? 'http://localhost:8096';
const OUT = process.env.PROOF_OUT ?? path.resolve(process.cwd(), 'proof-out');
mkdirSync(OUT, { recursive: true });

const failures = [];
const note = (ok, what) => { console.log(`  ${ok ? '✓' : '✗'} ${what}`); if (!ok) failures.push(what); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark' });
await ctx.addInitScript(() => {
  const add = () => { const s = document.createElement('style'); s.textContent = '.__expo_fast_refresh{display:none!important}'; document.head.appendChild(s); };
  if (document.head) add(); else document.addEventListener('DOMContentLoaded', add);
});
const page = await ctx.newPage();
page.on('pageerror', (e) => failures.push(`page error: ${e.message}`));

const tid = (id) => page.locator(`[data-testid="${id}"]`).first();
const shot = async (name) => {
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log(`  · ${name}.png`);
};

async function ask(text, expect) {
  await tid('composer-input').fill(text);
  await tid('composer-send').click();
  await page.waitForSelector(`[data-testid="${expect}"]`, { timeout: 20_000 });
  // Let the canned reply finish streaming under the panel.
  await page.waitForTimeout(2600);
}

await page.goto(`${BASE}/home`, { waitUntil: 'load', timeout: 120_000 });
await page.waitForSelector('[data-testid="screen-home"]', { timeout: 90_000 });
await page.waitForTimeout(2500);

console.log('\nresting');
note(!(await page.locator('[data-testid="workspace-host"]').count()), 'Home at rest has no workspace over it');
note(await tid('home-panels-open').count(), 'the panel launcher is in the top bar');
await shot('00-home-resting');

console.log('\nKai opens each panel (fixtures-mode canned turn → workspace_action)');
await ask("Show me NVDA's quote", 'panel-quote');
note(await tid('quote-range').count(), 'quote: the day range is drawn, labelled by session');
note((await tid('panel-quote').innerText()).includes('Today so far'), 'quote: the range says which session');
await shot('01-quote-by-kai');

await ask('What are NVDA earnings looking like', 'panel-earnings');
note(await tid('earnings-quarters').count(), 'earnings: reported quarters table');
note(await tid('earnings-no-estimates').count(), 'earnings: says there is no beat/miss');
await shot('02-earnings-by-kai');

await ask('What does the NVDA option chain look like', 'panel-options');
note(await tid('options-row-nearest').count(), 'options: the strike nearest the price is marked');
note(await tid('options-prices-source').count(), 'options: says the prices are from Unusual Whales and how fresh');
note(await tid('options-quote-cell').count(), 'options: each listed side carries a bid / ask');
note(await tid('options-flow').count(), 'options: the recorded flow contract is listed');
await shot('03-options-by-kai');

await ask("What's on my watchlist", 'panel-watchlist');
note(await page.locator('[data-testid^="watchlist-row-"]').count() > 0, 'watchlist: rows drawn');
await shot('04-watchlist-by-kai');

await ask('How are my positions doing', 'panel-portfolio');
note((await tid('panel-portfolio').innerText()).includes('Practice money'), 'portfolio: says it is paper');
await shot('05-portfolio-by-kai');

note(await tid('workspace-strip').count(), 'the strip shows the open panels');

console.log('\nThe member, without Kai');
await tid('workspace-close').click();
await page.waitForTimeout(500);
note(await tid('workspace-host').count(), 'closing one falls back to the next open panel');
await tid('home-panels-open').click();
await page.waitForSelector('[data-testid="panel-launcher"]', { timeout: 10_000 });
await tid('panel-launcher-symbol').fill('AMD');
await shot('06-launcher-sheet');
await tid('panel-launcher-options').click();
await page.waitForSelector('[data-testid="panel-options"]', { timeout: 10_000 });
note((await tid('panel-options').innerText()).includes('AMD'), 'the launcher opened AMD options in place');
await shot('07-options-opened-by-tap');

await tid('panel-jump-quote').click();
await page.waitForSelector('[data-testid="panel-quote"]', { timeout: 10_000 });
note((await tid('panel-quote').innerText()).includes('AMD'), 'a jump chip walks the quote card to the same ticker');
await shot('08-quote-by-jump');

// Close everything; Home returns to rest.
for (let i = 0; i < 6 && (await page.locator('[data-testid="workspace-close"]').count()); i += 1) {
  await tid('workspace-close').click();
  await page.waitForTimeout(250);
}
note(!(await page.locator('[data-testid="workspace-host"]').count()), 'closing the last panel gives Home back to the conversation');
await shot('09-home-after-closing');

await browser.close();
console.log(failures.length ? `\nFAIL — ${failures.length}\n${failures.join('\n')}` : '\nPASS');
process.exit(failures.length ? 1 : 0);
