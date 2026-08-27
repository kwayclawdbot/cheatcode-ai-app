/**
 * Live proof for lane MOBILE-B — community rooms, structured composer,
 * contributor profile and debriefs against the REAL stack:
 * local Supabase + apps/api on :3000 + Metro on :8081 (no fixtures).
 *
 *   node scripts/proof-live-b.mjs                 (PROOF_BASE overrides :8081)
 *
 * It signs a fresh user up through the UI, walks onboarding the same way
 * scripts/proof-live.mjs does (that file belongs to the other lane and is not
 * edited), then:
 *   · shoots the community tab and a real room read under RLS,
 *   · calls the dev-only simulate-closed-trade endpoint with the user's own
 *     JWT so there is a genuine closed position, asks the API for Kai's
 *     debrief, and shoots the list + the write-up it produced.
 * Everything lands in proof/live2b-*.png.
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
const EMAIL = `proofb+${Date.now()}@cheatcode.test`;
const PASSWORD = 'paper-money-first';

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

/** expo-router keeps earlier stack screens mounted — scope every locator. */
const on = (page, screen, testid) => page.locator(`[data-testid="${screen}"] [data-testid="${testid}"]`).last();
const tap = async (page, screen, testid) => {
  const el = on(page, screen, testid);
  await el.waitFor({ state: 'visible', timeout: 40_000 });
  await el.click();
};
const arrive = async (page, screen) => {
  await page.locator(`[data-testid="${screen}"]`).last().waitFor({ state: 'visible', timeout: 40_000 });
  await page.waitForTimeout(800);
};
const go = async (page, route, wait = 3000) => {
  await page.goto(`${BASE}${route}`, { waitUntil: 'load', timeout: 180_000 });
  await page.waitForTimeout(wait);
};

/**
 * The Supabase session lives in localStorage on web; we borrow the JWT so the
 * script can set up real state (a closed paper trade) as the signed-in user.
 * supabase-js may store it base64-prefixed and/or split across `.0`/`.1` keys,
 * and it also keeps a `-code-verifier` key that is NOT a session.
 */
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

/** base64url — '-' and '_' are not base64, Buffer would silently drop them. */
function jwtSub(token) {
  try {
    const b = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(b, 'base64').toString('utf8')).sub ?? null;
  } catch {
    return null;
  }
}

const apiCall = async (token, path, init = {}) => {
  const res = await fetch(`${API}/api/v1${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-json */ }
  return { status: res.status, json };
};

const main = async () => {
  await fs.mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  await installHideDevChrome(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  ! page error:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('  ! console:', m.text().slice(0, 200)); });

  try {
    console.log(`live user: ${EMAIL}`);
    await go(page, '/welcome', 2500);
    await tap(page, 'screen-welcome', 'cta-get-started');
    await arrive(page, 'screen-sign-up');
    await on(page, 'screen-sign-up', 'field-email').fill(EMAIL);
    await on(page, 'screen-sign-up', 'field-password').fill(PASSWORD);
    await tap(page, 'screen-sign-up', 'cta-create');

    console.log('[1] onboarding');
    await arrive(page, 'screen-onboarding-kai');
    await tap(page, 'screen-onboarding-kai', 'mode-day_trade');
    await page.waitForTimeout(500);
    await tap(page, 'screen-onboarding-kai', 'funding-paper');
    await arrive(page, 'screen-goal');
    await tap(page, 'screen-goal', 'cta-continue');
    await arrive(page, 'screen-risk');
    await tap(page, 'screen-risk', 'cta-continue');
    await arrive(page, 'screen-summary');
    await tap(page, 'screen-summary', 'cta-start');
    await arrive(page, 'screen-learn');
    await tap(page, 'screen-learn', 'level-504');
    await page.waitForTimeout(400);
    await tap(page, 'screen-learn', 'cta-watch');
    await arrive(page, 'screen-home');

    const token = await accessToken(page);
    console.log(token ? '  · got a session token' : '  ! no session token — API-backed steps will be skipped');

    console.log('[2] community, real rooms');
    await go(page, '/community', 3500);
    await shot(page, 'live2b-01-community');

    // Take whichever room the real data offers, in the tab's own order.
    const roomIds = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid^="room-"]')).map((n) => n.getAttribute('data-testid')));
    console.log(`  · ${roomIds.length} rooms on screen`);
    const firstRoom = roomIds[0] ?? null;

    if (firstRoom) {
      console.log('[3] post a real message, then ask Kai');
      await page.locator(`[data-testid="${firstRoom}"]`).last().click();
      await page.waitForTimeout(3500);
      await shot(page, 'live2b-02-room');

      const input = page.getByTestId('composer-input').last();
      if (await input.count()) {
        await input.fill('First question here: what does "waiting for confirmation" actually mean?');
        await page.getByTestId('composer-send').last().click();
        await page.waitForTimeout(4000);
        await shot(page, 'live2b-03-room-posted');
      }

      const kai = page.getByTestId('composer-kai').last();
      if (await kai.count()) {
        await kai.click();
        await page.waitForTimeout(700);
        await shot(page, 'live2b-04-room-kai-sheet');
        await page.getByTestId('kai-cmd-summarize').last().click();
        await page.waitForTimeout(25_000);           // Kai runs inline, no worker
        await shot(page, 'live2b-05-room-kai-summary');
      }

      console.log('[4] structured composer, real post');
      const plus = page.getByTestId('composer-structured').last();
      if (await plus.count()) {
        await plus.click();
        await page.waitForTimeout(2500);
        const fill = async (id, text) => {
          const el = page.getByTestId(id).last();
          if (await el.count()) await el.fill(text);
        };
        await fill('field-direction_thesis', 'Long META — buyers have defended 480 three times.');
        await fill('field-entry_condition', 'Break and hold above 504 on above-average volume.');
        await fill('field-invalidation', 'A daily close below 460.');
        await fill('field-risk_size', '$58 at my planned size — inside my daily cap.');
        await fill('field-target_horizon', '540 within two or three sessions.');
        await page.waitForTimeout(400);
        const ask = page.getByTestId('ask-kai-review').last();
        if (await ask.count()) {
          await ask.click();
          await page.waitForTimeout(20_000);
          await shot(page, 'live2b-06-compose-kai-feedback');
        }
        const disc = page.getByTestId('disclosure-no-position').last();
        if (await disc.count()) await disc.click();
        await page.waitForTimeout(500);
        await shot(page, 'live2b-07-compose-ready');
        const post = page.getByTestId('post-idea').last();
        if (await post.count()) {
          await post.click();
          await page.waitForTimeout(6000);
          await page.mouse.wheel(0, 4000);
          await page.waitForTimeout(1200);
          await shot(page, 'live2b-08-room-structured-idea');
        }
      }
    }

    console.log('[5] contributor — the real signed-in member');
    const uid = token ? jwtSub(token) : null;
    await go(page, `/contributor/${uid ?? 'u-jordan'}`, 3500);
    await shot(page, 'live2b-09-contributor');

    console.log('[6] debriefs — real closed trade via the dev endpoint');
    let positionId = null;
    if (token) {
      const sim = await apiCall(token, '/dev/simulate-closed-trade', {
        method: 'POST',
        body: JSON.stringify({ symbol: 'META', outcome: 'win' }),
      });
      console.log(`  · simulate-closed-trade → ${sim.status}${sim.status >= 400 ? ' ' + JSON.stringify(sim.json).slice(0, 160) : ''}`);
      positionId = sim.json?.position_id ?? sim.json?.position?.id ?? sim.json?.id ?? null;
    }

    await go(page, '/debrief', 3500);
    await shot(page, 'live2b-10-debriefs-awaiting');

    // Ask for the write-up through the UI so the button itself is proven.
    const getBtn = page.locator('[data-testid^="get-debrief-"]').last();
    if (await getBtn.count()) {
      await getBtn.click();
      await page.waitForTimeout(20_000);
      await shot(page, 'live2b-11-debrief');
      const save = page.getByTestId('save-lesson').last();
      if (await save.count()) {
        await save.click();
        await page.waitForTimeout(3000);
        await shot(page, 'live2b-12-debrief-saved');
      }
      await page.mouse.wheel(0, 900);
      await page.waitForTimeout(800);
      await shot(page, 'live2b-13-debrief-scrolled');
    } else if (positionId && token) {
      const made = await apiCall(token, `/positions/${positionId}/debrief`, { method: 'POST', body: '{}' });
      console.log(`  · POST /positions/:id/debrief → ${made.status}`);
      await go(page, '/debrief', 3000);
      await shot(page, 'live2b-11-debriefs');
    }
  } finally {
    await ctx.close();
    await browser.close();
  }
  console.log(`\nlive proof written to ${OUT}`);
};

main().catch((e) => { console.error(e); process.exit(1); });
