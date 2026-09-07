/**
 * THE CHART INSIDE A COMMUNITY TRADE CARD, AGAINST THE REAL API.
 *
 * The owner asked for the card to "populate with a chart module in the expand
 * dropdown … already marked up with entry, target, stop levels". The thing most
 * worth proving is not that a chart appears — it is that it appears with THE
 * CALL'S OWN levels on it and with NOTHING ELSE. So this publishes two calls
 * from one account:
 *
 *   NVDA  entry + stop + target  → three rules, three tags, all three read back
 *   AMD   no levels at all       → a chart, and provably no Entry/Stop/Target
 *
 * The second is the one that would catch a card inventing a tidy-looking plan,
 * which is the failure that matters on a surface where a green line across a
 * chart IS a target to anyone who reads charts.
 *
 * It also proves the lazy-load, in the only way that is not self-congratulation:
 * the chart's testID is asserted ABSENT before the toggle is pressed.
 *
 *   cd apps/api && npm run dev                          # :3000, local stack
 *   cd apps/mobile
 *   EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
 *   EXPO_PUBLIC_SUPABASE_ANON_KEY=<local anon> \
 *   EXPO_PUBLIC_API_BASE=http://localhost:3000 npx expo start --web --port 8100
 *   PROOF_ENV_FILE=../api/.env.local node scripts/proof-call-chart.mjs
 *
 * The account is deleted in a `finally`. Publishing a call cascades with it.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'proof');
const BASE = process.env.PROOF_BASE ?? 'http://localhost:8100';
const API = process.env.PROOF_API ?? 'http://localhost:3000';
const PASSWORD = 'paper-money-first';
mkdirSync(OUT, { recursive: true });

const ENV_FILE = process.env.PROOF_ENV_FILE ?? '../api/.env.local';
const env = Object.fromEntries(
  readFileSync(path.resolve(ROOT, ENV_FILE), 'utf8')
    .split('\n').filter((l) => l.trim() && !l.trim().startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
const SUPABASE = env.SUPABASE_URL;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = env.SUPABASE_ANON_KEY;
const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail === undefined ? '' : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`); }
};

const stamp = Date.now();
const person = { email: `chart+${stamp}@cheatcode.test`, handle: `chart${stamp}`.slice(0, 15), id: null };

const has = async (page, id) => (await page.locator(`[data-testid="${id}"]`).count()) > 0;
const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); console.log(`  · ${name}.png`); };

let browser;
try {
  /* ── two calls, one with levels and one without ──────────────────────── */
  const made = await (await fetch(`${SUPABASE}/auth/v1/admin/users`, {
    method: 'POST', headers: svc,
    body: JSON.stringify({ email: person.email, password: PASSWORD, email_confirm: true }),
  })).json();
  person.id = made.id;
  await fetch(`${SUPABASE}/rest/v1/profiles?user_id=eq.${person.id}`, {
    method: 'PATCH', headers: { ...svc, Prefer: 'return=representation' },
    body: JSON.stringify({
      handle: person.handle, primary_mode: 'day_trade',
      onboarding: { completed_at: new Date().toISOString(), version: 'proof-call-chart' },
    }),
  });

  const tok = (await (await fetch(`${SUPABASE}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: person.email, password: PASSWORD }),
  })).json()).access_token;

  const publish = async (body) => (await (await fetch(`${API}/api/v1/community/calls`, {
    method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })).json());

  /**
   * THE LEVELS ARE DERIVED FROM THE REAL LAST PRICE, NOT TYPED IN.
   *
   * The first version of this proof used round numbers — 180/172/205 — against
   * an NVDA trading near 230. Every assertion passed, and the chart was still
   * useless: all three levels fell outside the bars' range, so `CandleChart`
   * clamped them to the bottom edge exactly as it is designed to. That proves
   * lines are DRAWN. It does not prove they are drawn in the right PLACE, which
   * is the entire claim being made here. Levels built around the last close sit
   * inside the window, so a wrong y-scale would be visible instead of hidden
   * behind a clamp.
   */
  const bars = await (await fetch(`${API}/api/v1/market/candles?symbol=NVDA&tf=1d`, {
    headers: { Authorization: `Bearer ${tok}` },
  })).json();
  const lastClose = bars?.candles?.length ? bars.candles[bars.candles.length - 1].c : 230;
  const round = (n) => Math.round(n * 100) / 100;
  const ENTRY = round(lastClose * 0.995);
  const STOP = round(lastClose * 0.96);
  const TARGET = round(lastClose * 1.06);
  ok('the proof has real bars to build its levels from', !!bars?.candles?.length, { lastClose });

  console.log('\n[1] publishing the two calls');
  const withLevels = await publish({
    symbol: 'NVDA', direction: 'long', entry: ENTRY, stop: STOP, target: TARGET,
    thesis: 'Reclaimed the shelf. Levels are on the chart.', mode: 'day_trade',
  });
  ok('a call with entry, stop and target published', !!withLevels?.call?.id, withLevels?.error ?? withLevels);
  const bare = await publish({
    symbol: 'AMD', direction: 'long',
    thesis: 'No levels on this one on purpose.', mode: 'day_trade',
  });
  ok('a call with NO levels published', !!bare?.call?.id, bare?.error ?? bare);
  const A = withLevels?.call?.id;
  const B = bare?.call?.id;
  ok('the levels-less call is not scoreable', bare?.call?.scoreable === false, bare?.call?.scoreable);

  /* ── sign in ─────────────────────────────────────────────────────────── */
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 1600 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => failures.push(`page error: ${e.message}`));
  await page.goto(`${BASE}/sign-in`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.locator('[data-testid="screen-sign-in"]').waitFor({ timeout: 90_000 });
  await page.locator('input[data-testid="field-email"]').first().fill(person.email);
  await page.locator('input[data-testid="field-password"]').first().fill(PASSWORD);
  await page.locator('[data-testid="cta-sign-in"]').click();
  await page.waitForTimeout(9000);

  /* ── [2] the Community tab ───────────────────────────────────────────── */
  console.log('\n[2] the board’s Community tab');
  await page.goto(`${BASE}/alerts`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  const communityTab = page.locator('text=Community').first();
  if (await communityTab.count()) { await communityTab.click(); await page.waitForTimeout(3500); }

  ok('the levelled call is on the tab', await has(page, `community-call-${A}`));
  ok('and its chart is NOT mounted before anybody asks — this is the lazy load',
     !(await has(page, `call-chart-${A}`)));
  await shot(page, 'callchart-01-collapsed');

  await page.locator(`[data-testid="call-chart-toggle-${A}"]`).click();
  await page.waitForTimeout(4500);
  ok('expanding mounts the chart', await has(page, `call-chart-${A}`));

  const board = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  ok('entry is drawn and labelled with its price', board.includes(`Entry ${ENTRY}`), board.slice(0, 200));
  ok('stop is drawn and labelled with its price', board.includes(`Stop ${STOP}`));
  ok('target is drawn and labelled with its price', board.includes(`Target ${TARGET}`));
  ok('and the direction is readable on the chart itself', /Long · daily bars/.test(board));
  await shot(page, 'callchart-02-expanded-community-tab');

  /* ── [3] a call with no levels invents none ──────────────────────────── */
  console.log('\n[3] a call published without levels');
  await page.locator(`[data-testid="call-chart-toggle-${B}"]`).click();
  await page.waitForTimeout(4500);
  ok('it expands and draws a chart', await has(page, `call-chart-${B}`));
  const bareCard = (await page.locator(`[data-testid="community-call-${B}"]`).innerText()).replace(/\s+/g, ' ');
  ok('with NO entry line', !/Entry/.test(bareCard), bareCard.slice(0, 200));
  ok('NO stop line', !/Stop/.test(bareCard));
  ok('NO target line', !/Target/.test(bareCard));
  ok('and it still says why it cannot score', /cannot score/.test(bareCard));
  await shot(page, 'callchart-03-no-levels-no-fake-lines');

  /* ── [4] the same card in the room's conversation ────────────────────── */
  console.log('\n[4] the same card, in the day-trade room chat');
  await page.goto(`${BASE}/community`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  const roomCard = page.locator(`[data-testid="community-call-${A}"]`).first();
  if (await roomCard.count()) {
    ok('the call is in the room conversation', true);
    ok('collapsed there too, until asked', !(await has(page, `call-chart-${A}`)));
    await page.locator(`[data-testid="call-chart-toggle-${A}"]`).first().click();
    await page.waitForTimeout(4500);
    ok('and it expands in chat as well', await has(page, `call-chart-${A}`));
    const chat = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    ok('with the same three levels on it',
       chat.includes(`Entry ${ENTRY}`) && chat.includes(`Stop ${STOP}`) && chat.includes(`Target ${TARGET}`));
    await shot(page, 'callchart-04-expanded-room-chat');
  } else {
    ok('the call is in the room conversation', false, 'card not found in /community');
  }
} catch (e) {
  failures.push(`threw: ${e.message}`);
  console.error(e);
} finally {
  console.log('\n[9] cleaning up');
  if (browser) await browser.close();
  if (person.id) {
    const r = await fetch(`${SUPABASE}/auth/v1/admin/users/${person.id}`, { method: 'DELETE', headers: svc });
    console.log(`  · deleted ${person.email} → ${r.status}`);
  }
  console.log(`\n${pass} passed, ${failures.length} failed`);
  failures.forEach((f) => console.log(`  · ${f}`));
  process.exit(failures.length ? 1 : 0);
}
