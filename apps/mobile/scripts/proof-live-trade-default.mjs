/**
 * Live proof: the Trade tab opens the TERMINAL, not a search request.
 *
 *   node scripts/proof-live-trade-default.mjs     (PROOF_BASE / PROOF_API override)
 *
 * Owner feedback on round 4, verbatim: "the trade page defaults to a search
 * request vs opening the trading terminal with kai integrated chat etc — should
 * have a search bar at top but it should open immediately to terminal and
 * default to either current active trade alert or spy".
 *
 * Four things are proven against the real stack (local Supabase, apps/api on
 * :3000, Metro on :8081), in the order the owner described them:
 *
 *   1. A brand-new account taps Trade and lands on /trade/SPY with the chart,
 *      Kai and the composer on screen. The words "Find a symbol" appear
 *      nowhere in the document.
 *   2. An alert on META is created AND TRIGGERED through the API (a real
 *      condition met by a real tick, not a status written by hand). On the next
 *      launch, Trade opens /trade/META?alert=<id>&ctx=alert with the alert
 *      context showing.
 *   3. The search bar in the top bar opens the switcher already focused;
 *      typing NVDA and opening it lands on /trade/NVDA.
 *   4. A query that is not a symbol is not a dead end: "why is this moving
 *      today" becomes a turn in the portal's own Kai thread.
 *
 * Step 2 reloads the page on purpose. `lastPortalSymbol()` is in-session state
 * — the symbol you were last working outranks everything while the app is
 * open, which is the correct behaviour and also why this has to be a fresh
 * launch to be a fair test of the resolver.
 *
 * Screenshots land in proof/trade-default-*.png.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'proof');
const BASE = process.env.PROOF_BASE ?? 'http://localhost:8081';
const API = process.env.PROOF_API ?? 'http://localhost:3000';
const EMAIL = `prooftd+${Date.now()}@cheatcode.test`;
const PASSWORD = 'paper-money-first';

async function internalSecret() {
  if (process.env.INTERNAL_SECRET) return process.env.INTERNAL_SECRET;
  try {
    const text = await fs.readFile(path.resolve(ROOT, '../api/.env.local'), 'utf8');
    return text.match(/^INTERNAL_SECRET=(.*)$/m)?.[1]?.trim() ?? null;
  } catch {
    return null;
  }
}

const HIDE_DEV_CHROME = `.__expo_fast_refresh { display: none !important; }`;
const installHideDevChrome = (ctx) =>
  ctx.addInitScript((css) => {
    const add = () => {
      const s = document.createElement('style');
      s.textContent = css;
      document.head.appendChild(s);
    };
    if (document.head) add();
    else document.addEventListener('DOMContentLoaded', add);
  }, HIDE_DEV_CHROME);

const shot = async (p, n) => {
  const root = p.locator('#root');
  await ((await root.count()) ? root : p).screenshot({ path: path.join(OUT, `${n}.png`) });
  console.log(`  ✓ ${n}.png`);
};

const on = (page, screen, testid) => page.locator(`[data-testid="${screen}"] [data-testid="${testid}"]`).last();
const tap = async (page, screen, testid, ms = 700) => {
  const el = on(page, screen, testid);
  await el.waitFor({ state: 'visible', timeout: 40_000 });
  await el.click();
  await page.waitForTimeout(ms);
};
const arrive = async (page, screen, ms = 900) => {
  await page.locator(`[data-testid="${screen}"]`).last().waitFor({ state: 'visible', timeout: 40_000 });
  await page.waitForTimeout(ms);
};
const go = async (page, route, wait = 3000) => {
  await page.goto(`${BASE}${route}`, { waitUntil: 'load', timeout: 180_000 });
  await page.waitForTimeout(wait);
};
const seen = async (page, screen, testid) =>
  (await page.locator(`[data-testid="${screen}"] [data-testid="${testid}"]`).count()) > 0;

async function must(page, screen, testid, why) {
  await on(page, screen, testid).waitFor({ state: 'visible', timeout: 40_000 })
    .catch(() => { throw new Error(`${why} — [${screen}] > [${testid}] never appeared`); });
  console.log(`  · ${why}`);
}

async function accessToken(page) {
  return page.evaluate(() => {
    const keys = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.includes('auth-token') && !k.includes('code-verifier')) keys.push(k);
    }
    keys.sort();
    const bases = new Set(keys.map((k) => k.replace(/\.\d+$/, '')));
    for (const base of bases) {
      const parts = keys.filter((k) => k === base || k.startsWith(base + '.'));
      let raw = parts.map((k) => window.localStorage.getItem(k) ?? '').join('');
      if (!raw) continue;
      if (raw.startsWith('base64-')) {
        try { raw = atob(raw.slice(7)); } catch { continue; }
      }
      try {
        const v = JSON.parse(raw);
        if (v?.access_token) return v.access_token;
        if (v?.currentSession?.access_token) return v.currentSession.access_token;
      } catch { /* not this one */ }
    }
    return null;
  });
}

const apiCall = async (token, p, init = {}) => {
  const res = await fetch(`${API}/api/v1${p}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-json */ }
  return { status: res.status, json };
};

const tick = async (secret, quotes) => {
  const res = await fetch(`${API}/api/v1/internal/paper/tick`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
    body: JSON.stringify({ quotes }),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-json */ }
  return { status: res.status, json };
};

/** Onboarding belongs to another lane and moves; walk whatever is on screen. */
async function walkOnboarding(page) {
  const visible = async (screen) =>
    page.locator(`[data-testid="${screen}"]`).last()
      .waitFor({ state: 'visible', timeout: 12_000 }).then(() => true).catch(() => false);

  const step = async (screen, ids) => {
    if (!(await visible(screen))) return false;
    console.log(`  · ${screen}`);
    for (const id of ids) {
      if (await seen(page, screen, id)) await tap(page, screen, id, 700);
    }
    return true;
  };

  await step('screen-onboarding-kai', ['mode-day_trade', 'funding-paper']);
  await step('screen-goal', ['mode-day_trade', 'goal-day_trade', 'cta-continue']);
  await step('screen-risk', ['cta-continue']);
  await step('screen-personalize', ['experience-some', 'exp-some', 'focus-big_tech', 'cta-continue']);
  await step('screen-summary', ['cta-start', 'cta-continue']);
  await step('screen-kai-plan', ['cta-start']);
  await step('screen-learn', ['level-504', 'cta-watch', 'cta-continue']);
  await page.locator('[data-testid="screen-home"]').last()
    .waitFor({ state: 'visible', timeout: 40_000 })
    .catch(() => { throw new Error('onboarding never reached Home'); });
}

/** The one sentence that must never be on this screen again. */
async function assertNoSearchPrompt(page, where) {
  const body = await page.locator('body').innerText();
  for (const banned of ['Find a symbol', 'Pick a symbol']) {
    if (body.includes(banned)) throw new Error(`${where}: "${banned}" is still on the Trade tab`);
  }
  console.log(`  · ${where}: no search prompt anywhere in the document`);
}

const main = async () => {
  await fs.mkdir(OUT, { recursive: true });
  const SECRET = await internalSecret();
  if (!SECRET) throw new Error('no INTERNAL_SECRET — the alert cannot be triggered by a real tick');

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  await installHideDevChrome(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  ! page error:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('  ! console:', m.text().slice(0, 200)); });

  const notes = [];

  try {
    console.log(`live user: ${EMAIL}`);
    await go(page, '/welcome', 2500);
    await tap(page, 'screen-welcome', 'cta-get-started');
    await arrive(page, 'screen-sign-up');
    await on(page, 'screen-sign-up', 'field-email').fill(EMAIL);
    await on(page, 'screen-sign-up', 'field-password').fill(PASSWORD);
    await tap(page, 'screen-sign-up', 'cta-create');

    console.log('[1] onboarding');
    await walkOnboarding(page);
    await page.waitForTimeout(1200);

    const token = await accessToken(page);
    if (!token) throw new Error('no access token — the sign-up did not produce a session');

    /* -------- (a) an account that owns nothing opens on SPY -------- */
    console.log('[2] tap Trade on a brand-new account');
    const def = await apiCall(token, '/trade/default');
    console.log(`  · /trade/default → ${JSON.stringify(def.json)}`);
    if (def.json?.symbol !== 'SPY' || def.json?.reason !== 'fallback') {
      throw new Error(`an empty account did not resolve to SPY: ${JSON.stringify(def.json)}`);
    }

    await tap(page, 'tab-bar', 'tab-trade', 2500);
    await arrive(page, 'screen-trade-portal', 3500);
    const url1 = page.url();
    console.log(`  · url: ${url1}`);
    if (!/\/trade\/SPY/i.test(url1)) throw new Error(`Trade did not open SPY: ${url1}`);
    await must(page, 'screen-trade-portal', 'portal-top-bar', 'the terminal top bar');
    await must(page, 'screen-trade-portal', 'portal-search', 'the search bar sits in the top bar');
    await must(page, 'screen-trade-portal', 'portal-chart', 'the chart is on screen');
    await must(page, 'screen-trade-portal', 'panel-kai', 'the Kai panel is on screen');
    await must(page, 'screen-trade-portal', 'portal-composer', 'the composer is on screen');
    await assertNoSearchPrompt(page, 'SPY');

    // The chart must still dominate: measure it against the 844pt viewport.
    const geometry = await page.evaluate(() => {
      const q = (id) => document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect() ?? null;
      const chart = q('portal-chart');
      const search = q('portal-search');
      return {
        chartTop: chart?.top ?? null,
        chartHeight: chart?.height ?? null,
        searchBottom: search?.bottom ?? null,
        viewport: window.innerHeight,
      };
    });
    console.log(`  · geometry: search ends at ${geometry.searchBottom}, chart ${geometry.chartHeight}px tall starting at ${geometry.chartTop} of ${geometry.viewport}`);
    if (geometry.chartTop === null) throw new Error('the chart has no box — it is not laid out');
    if (geometry.chartTop > geometry.viewport * 0.35) {
      throw new Error(`the search bar pushed the chart below the fold (top ${geometry.chartTop} of ${geometry.viewport})`);
    }
    await shot(page, 'trade-default-01-spy');

    /* -------- (b) an alert that triggers takes the tab over -------- */
    console.log('[3] a real alert on META, triggered by a real tick');
    const quote = await apiCall(token, '/symbols/META');
    const price = quote.json?.quote?.price ?? null;
    const level = price != null ? Math.round((price + 1) * 100) / 100 : 500;
    const draft = await apiCall(token, '/alerts/draft', {
      method: 'POST',
      body: JSON.stringify({
        natural_language: `Tell me when META breaks above ${level}`,
        refs: { symbol: 'META', level },
      }),
    });
    if (draft.status >= 300) throw new Error(`alert draft failed: ${draft.status}`);
    const armed = await apiCall(token, '/alerts', {
      method: 'POST',
      body: JSON.stringify({ draft_id: draft.json?.alert?.id }),
    });
    if (armed.status >= 300) throw new Error(`alert activate failed: ${armed.status}`);
    const alertId = armed.json?.alert?.id ?? draft.json?.alert?.id;
    const fired = await tick(SECRET, { META: Math.round((level + 1) * 100) / 100 });
    console.log(`  · alert ${alertId} armed at ${level}; tick triggered ${fired.json?.alerts_triggered ?? 0}`);
    if (!fired.json?.alerts_triggered) throw new Error('the tick did not trigger the META alert');

    const def2 = await apiCall(token, '/trade/default');
    console.log(`  · /trade/default → ${JSON.stringify(def2.json)}`);
    if (def2.json?.symbol !== 'META' || def2.json?.reason !== 'alert' || def2.json?.alert_id !== alertId) {
      throw new Error(`the triggered alert did not become the default: ${JSON.stringify(def2.json)}`);
    }

    // A fresh launch: `lastPortalSymbol()` is in-session, and SPY is what this
    // session last worked. This is the app being opened again, not a reset.
    console.log('[4] relaunch → Home → tap Trade');
    await go(page, '/home', 3500);
    await arrive(page, 'screen-home', 1500);
    await tap(page, 'tab-bar', 'tab-trade', 2500);
    await arrive(page, 'screen-trade-portal', 4000);
    const url2 = page.url();
    console.log(`  · url: ${url2}`);
    if (!/\/trade\/META/i.test(url2)) throw new Error(`Trade did not open the alert's symbol: ${url2}`);
    if (!url2.includes(`alert=${alertId}`)) throw new Error(`the alert id was not carried into the portal: ${url2}`);
    if (!/ctx=alert/.test(url2)) throw new Error(`the alert context was not carried into the portal: ${url2}`);
    await must(page, 'screen-trade-portal', 'portal-chart', 'the chart opened on META');
    if (await seen(page, 'screen-trade-portal', 'panel-alert')) {
      console.log('  · the alert context is the open panel');
    } else {
      await tap(page, 'screen-trade-portal', 'ctx-alert', 1200);
      notes.push('the portal opened on Kai rather than the alert panel; ctx-alert was tapped to show it');
    }
    await must(page, 'screen-trade-portal', 'panel-alert', 'the alert this chart was opened from');
    await assertNoSearchPrompt(page, 'META');
    await shot(page, 'trade-default-02-alert');

    /* -------- (c) the search bar -------- */
    console.log('[5] the search bar opens the switcher, focused');
    await tap(page, 'screen-trade-portal', 'portal-search', 1200);
    await page.locator('[data-testid="ticker-switcher-sheet"]').last()
      .waitFor({ state: 'visible', timeout: 20_000 })
      .catch(() => { throw new Error('tapping search did not open the ticker switcher') });
    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      return el?.getAttribute('data-testid') ?? el?.tagName ?? null;
    });
    console.log(`  · focused element: ${focused}`);
    if (focused !== 'ticker-search-input') {
      throw new Error(`the search sheet did not open focused (active element: ${focused})`);
    }
    const input = page.locator('[data-testid="ticker-search-input"]').last();
    await input.fill('NVDA');
    await page.waitForTimeout(1400);
    await shot(page, 'trade-default-03-search');

    const hit = page.locator('[data-testid="switch-to-NVDA"]').last();
    if (await hit.count()) {
      await hit.click();
    } else {
      notes.push('no NVDA row came back from /trade/search; opened it with the keyboard instead');
      await input.press('Enter');
    }
    await page.waitForTimeout(3500);
    await arrive(page, 'screen-trade-portal', 2500);
    const url3 = page.url();
    console.log(`  · url: ${url3}`);
    if (!/\/trade\/NVDA/i.test(url3)) throw new Error(`the search did not open NVDA: ${url3}`);
    await must(page, 'screen-trade-portal', 'portal-chart', 'NVDA opened as a chart');
    await shot(page, 'trade-default-04-nvda');

    /* -------- (d) a query that is not a symbol becomes a question -------- */
    console.log('[6] a search that matches no symbol becomes a question for Kai');
    await tap(page, 'screen-trade-portal', 'portal-search', 1200);
    const asked = 'why is this moving today';
    const input2 = page.locator('[data-testid="ticker-search-input"]').last();
    await input2.fill(asked);
    await page.waitForTimeout(1200);
    await page.locator('[data-testid="ticker-ask-kai"]').last().click();
    await page.waitForTimeout(2500);
    if (await page.locator('[data-testid="ticker-switcher-sheet"]').count()) {
      throw new Error('the search sheet stayed open after handing the question to Kai');
    }
    const thread = await on(page, 'screen-trade-portal', 'panel-kai').innerText();
    if (!thread.toLowerCase().includes('why is this moving')) {
      throw new Error(`the question never reached the Kai thread: ${thread.slice(0, 160)}`);
    }
    console.log('  · the question is a turn in the portal thread');
    await shot(page, 'trade-default-05-ask-kai');

    console.log('\nPROOF PASSED');
    if (notes.length) {
      console.log('notes:');
      for (const n of notes) console.log(`  - ${n}`);
    }
  } catch (e) {
    console.error('\nPROOF FAILED:', e.message);
    await shot(page, 'trade-default-FAILED').catch(() => {});
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
};

main();
