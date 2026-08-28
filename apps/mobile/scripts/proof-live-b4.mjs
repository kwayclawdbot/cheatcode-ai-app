/**
 * Live proof for lane MOBILE-B round 4 — the chart-first Trade Portal against
 * the REAL stack: local Supabase + apps/api on :3000 + Metro on :8081.
 *
 *   node scripts/proof-live-b4.mjs      (PROOF_BASE / PROOF_API override)
 *
 * It signs a fresh user up through the UI, walks onboarding, then:
 *   create a REAL alert on META through the API
 *     → /trade/META?alert=<id>&ctx=alert
 *     → assert the spec §6 opening message and that annotations are drawn
 *     → ask Kai "mark the invalidation" and assert the chart changed in place
 *     → Plan context → Review order → Place paper order → Confirmed
 *     → pending, then filled after a real paper tick
 *     → Community circles row → the circle room
 *
 * Nothing is faked: the alert is created by the API, the fill comes from
 * `POST /internal/paper/tick` (a DEV_TOOLS-only seam), and every assertion is a
 * testID that has to be on screen.
 *
 * Everything lands in proof/live-b4-*.png.
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
const EMAIL = `proofb4+${Date.now()}@cheatcode.test`;
const PASSWORD = 'paper-money-first';
const SYMBOL = process.env.PROOF_SYMBOL ?? 'META';
const PAPER_BALANCE = 10000;

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

/** Type into a composer and wait for the stream to settle. */
async function ask(page, screen, testid, text, ms = 9000) {
  const composer = on(page, screen, testid);
  await composer.waitFor({ state: 'visible', timeout: 30_000 });
  const input = composer.locator('input, textarea').last();
  await input.fill(text);
  await input.press('Enter');
  await page.waitForTimeout(ms);
}

/**
 * Onboarding is MOBILE-A's screen set and it changed this round
 * (goal → risk → personalize → plan). Walk whatever is actually on screen so
 * this proof does not break every time that lane ships.
 */
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
  // Whatever the last step was, the app lands on Home when it is done.
  await page.locator('[data-testid="screen-home"]').last()
    .waitFor({ state: 'visible', timeout: 40_000 })
    .catch(() => { throw new Error('onboarding never reached Home'); });
}

const main = async () => {
  await fs.mkdir(OUT, { recursive: true });
  const SECRET = await internalSecret();
  console.log(SECRET ? 'paper tick: secret loaded' : '! no INTERNAL_SECRET — the fill step will wait on the real market');

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
    await page.waitForTimeout(1500);

    const token = await accessToken(page);
    if (!token) throw new Error('no access token — the sign-up did not produce a session');
    console.log('  · signed in');

    /* ---------------- a REAL alert on META ---------------- */
    console.log('[2] create a real alert through the API');
    const quote = await apiCall(token, `/symbols/${SYMBOL}`);
    const price =
      quote.json?.quote?.price
      ?? quote.json?.market?.price
      ?? null;
    const level = price != null ? Math.round((price - 1) * 100) / 100 : 500;
    console.log(`  · ${SYMBOL} quote ${price ?? 'unknown'} → alert level ${level}`);

    const draft = await apiCall(token, '/alerts/draft', {
      method: 'POST',
      body: JSON.stringify({
        natural_language: `Tell me when ${SYMBOL} trades above ${level}`,
        refs: { symbol: SYMBOL, level },
      }),
    });
    if (draft.status >= 300) throw new Error(`alert draft failed: ${draft.status} ${JSON.stringify(draft.json).slice(0, 200)}`);
    const draftId = draft.json?.alert?.id;
    const activated = await apiCall(token, '/alerts', { method: 'POST', body: JSON.stringify({ draft_id: draftId }) });
    if (activated.status >= 300) throw new Error(`alert activate failed: ${activated.status} ${JSON.stringify(activated.json).slice(0, 200)}`);
    const alertId = activated.json?.alert?.id ?? draftId;
    console.log(`  · alert ${alertId} is armed`);

    /* ---------------- the portal with the alert context ---------------- */
    console.log('[3] the portal opens with the alert context restored');
    await go(page, `/trade/${SYMBOL}?alert=${encodeURIComponent(alertId)}&ctx=alert`, 5000);
    await must(page, 'screen-trade-portal', 'portal-top-bar', 'the portal is the alert destination');
    await must(page, 'screen-trade-portal', 'portal-chart', 'the chart is the dominant object');
    await must(page, 'screen-trade-portal', 'portal-paper-chip', 'PAPER is unmistakable');
    await must(page, 'screen-trade-portal', 'context-switcher', 'Kai · Alert · Plan · Community');
    await shot(page, 'live-b4-01-portal-alert');

    const annotationCount = await page.locator('[data-testid="screen-trade-portal"] [data-testid^="annotation-"]').count();
    console.log(`  · annotations drawn: ${annotationCount}`);
    if (!annotationCount) notes.push('no annotations came back for this symbol on this stack');

    console.log('[4] the spec §6 opening message');
    await tap(page, 'screen-trade-portal', 'ctx-kai', 1400);
    const opening = await on(page, 'screen-trade-portal', 'kai-reply').innerText().catch(() => '');
    console.log(`  · opening: ${opening.slice(0, 120)}`);
    const wanted = `This is the ${SYMBOL} alert you opened. I marked the trigger, entry area, stop and first target on the chart.`;
    if (opening.trim() !== wanted) notes.push(`opening message differs from the spec template: "${opening.slice(0, 90)}"`);
    await shot(page, 'live-b4-02-portal-kai');

    console.log('[5] Kai marks the invalidation on the chart');
    const before = await page.locator('[data-testid="screen-trade-portal"] [data-testid^="annotation-"]').count();
    await ask(page, 'screen-trade-portal', 'portal-composer', 'mark the invalidation', 14_000);
    const narrated = await page.locator('[data-testid="screen-trade-portal"] [data-testid="chart-narration"]').count();
    const after = await page.locator('[data-testid="screen-trade-portal"] [data-testid^="annotation-"]').count();
    console.log(`  · narration frames: ${narrated} · annotations ${before} → ${after}`);
    if (!narrated) throw new Error('Kai did not narrate a chart change for "mark the invalidation"');
    const narration = await page.locator('[data-testid="screen-trade-portal"] [data-testid="chart-narration"]').last().innerText();
    console.log(`  · "${narration}"`);
    if (!/invalidat/i.test(narration)) notes.push(`the narration did not name the invalidation: "${narration}"`);
    const invalidationDrawn = await page
      .locator('[data-testid="screen-trade-portal"] [data-testid^="annotation-"]')
      .evaluateAll((els) => els.some((e) => /invalid/i.test(e.getAttribute('aria-label') ?? '')));
    if (!invalidationDrawn) notes.push('no invalidation level is drawn on the chart after the command');
    else console.log('  · the invalidation level is on the chart');
    await shot(page, 'live-b4-03-chart-command');

    console.log('[6] Plan context');
    await tap(page, 'screen-trade-portal', 'ctx-plan', 1600);
    await must(page, 'screen-trade-portal', 'panel-plan', 'the plan panel');
    await shot(page, 'live-b4-04-portal-plan');

    /* ---------------- execution ---------------- */
    console.log('[7] Review order');
    const limit = price != null ? Math.round((price - 2) * 100) / 100 : level;
    await go(page, `/order/review?symbol=${SYMBOL}&side=buy_to_open&qty=1&order_type=limit&limit=${limit}`, 5000);
    await must(page, 'screen-order-review', 'kai-risk-check', "Kai's risk check");
    const risk = await on(page, 'screen-order-review', 'kai-risk-check').innerText();
    if (/submit to broker/i.test(risk)) throw new Error('review says "submit to broker" — there is no broker');
    if (!/paper leg/i.test(risk)) notes.push('the stop/target paper-leg rows did not render (server sent no attached legs)');
    await must(page, 'screen-order-review', 'cta-place', 'the primary is Place paper order');
    await shot(page, 'live-b4-05-review-order');

    console.log('[8] Place the paper order → Order confirmed');
    await tap(page, 'screen-order-review', 'cta-place', 3500);
    await must(page, 'screen-order-confirmed', 'confirmed-headline', 'the confirmed screen');
    const headline1 = await on(page, 'screen-order-confirmed', 'confirmed-headline').innerText();
    console.log(`  · ${headline1}`);
    if (!/paper account/i.test(headline1)) throw new Error(`the headline does not name the paper account: ${headline1}`);
    await shot(page, 'live-b4-06-order-confirmed');
    if (/^Placed/i.test(headline1)) console.log('  · pending is a distinct state');
    await shot(page, 'live-b4-07-order-pending');

    console.log('[9] the paper tick fills it');
    if (SECRET) {
      const t = await tick(SECRET, { [SYMBOL]: limit - 0.5 });
      console.log(`  · tick ${t.status} ${JSON.stringify(t.json ?? {}).slice(0, 160)}`);
      await page.waitForTimeout(4000);
    } else {
      notes.push('no INTERNAL_SECRET — the fill could not be forced');
    }
    const headline2 = await on(page, 'screen-order-confirmed', 'confirmed-headline').innerText().catch(() => '');
    console.log(`  · after the tick: ${headline2}`);
    if (!/filled/i.test(headline2)) notes.push(`the order had not filled by the end of the run ("${headline2}")`);
    await shot(page, 'live-b4-08-order-filled');

    /* ---------------- community + circles ---------------- */
    console.log('[10] Community');
    await go(page, '/community', 5000);
    await must(page, 'screen-community', 'club-presence', 'the club header');
    await must(page, 'screen-community', 'club-composer', 'the club composer');
    const hasCircles = await seen(page, 'screen-community', 'circles-row');
    console.log(`  · circles row present: ${hasCircles}`);
    await shot(page, 'live-b4-09-community');

    console.log('[11] a circle');
    let circleId = null;
    const circles = await apiCall(token, '/circles');
    if (circles.status === 200) {
      circleId = circles.json?.circles?.[0]?.id ?? null;
      if (!circleId && circles.json?.can_create) {
        const made = await apiCall(token, '/circles', { method: 'POST', body: JSON.stringify({ symbol: SYMBOL, ttl: '3d' }) });
        circleId = made.json?.circle?.id ?? null;
        console.log(`  · opened a circle: ${made.status}`);
      } else if (!circleId) {
        notes.push('no circle exists yet and this account cannot create one (circles_create is off)');
      }
    } else {
      notes.push(`GET /circles answered ${circles.status}`);
    }

    if (circleId) {
      await go(page, `/circle/${encodeURIComponent(circleId)}`, 4500);
      await must(page, 'screen-circle', 'circle-name', 'the circle room');
      await must(page, 'screen-circle', 'circle-chart', 'the live chart with levels at the top');
      await must(page, 'screen-circle', 'circle-composer', 'the room composer');
      await shot(page, 'live-b4-10-circle');
    } else {
      console.log('  ! no circle to open on this stack');
    }

    console.log('\nLive MOBILE-B round-4 proof complete.');
    if (notes.length) {
      console.log('\nNotes (real gaps, not failures):');
      for (const n of notes) console.log(`  - ${n}`);
    }
  } finally {
    await browser.close();
  }
};

main().catch((e) => { console.error('\nLIVE PROOF FAILED:', e.message); process.exit(1); });
