/**
 * Live proof for lane MOBILE-B round 3 — the paper-execution arc against the
 * REAL stack: local Supabase + apps/api on :3000 + Metro on :8081, no fixtures.
 *
 *   node scripts/proof-live-b2.mjs          (PROOF_BASE / PROOF_API override)
 *
 * It signs a fresh user up through the UI, walks onboarding, then:
 *   Trade → META → Build a plan → Review order → Place paper order
 *        → accepted (a resting limit) → paper tick crosses it → filled
 *        → position detail → Exit now → closed → debrief.
 *
 * Two things it deliberately does NOT fake: the fill and the exit. The limit is
 * placed below the market so the order genuinely rests, and it is filled by
 * calling the real `POST /internal/paper/tick` with a price override (a
 * DEV_TOOLS-only seam) rather than by pretending the status changed.
 *
 * Everything lands in proof/live2b2-*.png.
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
const EMAIL = `proofb2+${Date.now()}@cheatcode.test`;
const PASSWORD = 'paper-money-first';
const SYMBOL = process.env.PROOF_SYMBOL ?? 'META';

/** `INTERNAL_SECRET` for the paper tick, read the way smoke.sh reads it. */
async function internalSecret() {
  if (process.env.INTERNAL_SECRET) return process.env.INTERNAL_SECRET;
  try {
    const text = await fs.readFile(path.resolve(ROOT, '../api/.env.local'), 'utf8');
    return text.match(/^INTERNAL_SECRET=(.*)$/m)?.[1]?.trim() ?? null;
  } catch {
    return null;
  }
}

/**
 * Practice money.
 *
 * This used to be a service-role PATCH straight at `accounts`, because round-1
 * onboarding hard-coded `starting_balance` at $2,000 and offered no control for
 * it — and at the default 10%-per-position rule that left NOTHING in the seeded
 * universe placeable, the cheapest symbol being over $200. That workaround is
 * gone: onboarding now defaults to $10,000 and the summary screen carries a
 * chooser, so this proof picks the amount the way a person does, in the UI, and
 * touches the database with nothing but the app's own requests.
 */
const PAPER_BALANCE = 10000;

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

/** Borrow the signed-in JWT the way scripts/proof-live-b.mjs does. */
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

/**
 * The plan's edit sheets are Modals; on web they render outside the screen's
 * subtree, so these locators are deliberately unscoped.
 */
async function sheetFill(page, value) {
  const input = page.getByTestId('plan-edit-input').last();
  await input.waitFor({ state: 'visible', timeout: 20_000 });
  await input.fill(value);
  await page.getByTestId('plan-edit-save').last().click();
  await page.waitForTimeout(700);
}

const setSize = async (page, value) => {
  await tap(page, 'screen-plan', 'edit-size');
  await sheetFill(page, value);
};

const setLevel = async (page, testid, value) => {
  await tap(page, 'screen-plan', testid);
  await sheetFill(page, value);
};

/** Force the ticket to a resting limit for a whole number of shares. */
async function sizeTicket(page, { shares, limit }) {
  const type = on(page, 'screen-order-ticket', 'order-type-limit');
  await type.waitFor({ state: 'visible', timeout: 20_000 });
  await type.click();
  await page.waitForTimeout(300);
  await on(page, 'screen-order-ticket', 'size-mode-shares').click();
  await page.waitForTimeout(300);
  await on(page, 'screen-order-ticket', 'field-qty').fill(String(shares));
  await on(page, 'screen-order-ticket', 'field-limit').fill(String(limit));
  await page.waitForTimeout(500);
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
    // The practice balance is a real choice on this screen now.
    await tap(page, 'screen-summary', 'row-practice-money');
    await page.getByTestId('sheet-practice-money').last().waitFor({ state: 'visible', timeout: 20_000 });
    await page.waitForTimeout(500);
    await shot(page, 'live-summary-balance');
    await page.getByTestId(`balance-${PAPER_BALANCE}`).last().click();
    await page.waitForTimeout(600);
    await must(page, 'screen-summary', 'practice-money-value', `practice money is $${PAPER_BALANCE}, chosen in the UI`);
    await must(page, 'screen-summary', 'daily-cap-value', 'and the daily loss cap is derived from it');
    await shot(page, 'live-summary-balance-set');
    await tap(page, 'screen-summary', 'cta-start');
    await arrive(page, 'screen-learn');
    await tap(page, 'screen-learn', 'level-504');
    await page.waitForTimeout(400);
    await tap(page, 'screen-learn', 'cta-watch');
    await arrive(page, 'screen-home');

    const token = await accessToken(page);
    if (!token) throw new Error('no session token — the rest of this proof needs one');
    console.log('  · got a session token');

    console.log('[2] Trade — the real paper account, in the audit hierarchy');
    await go(page, '/trade', 4000);
    await must(page, 'screen-trade', 'paper-strip', 'the account strip leads the page');
    await must(page, 'screen-trade', 'account-value', 'with a real account value');
    await shot(page, 'live2b2-01-trade');

    const round2 = (n) => Math.round(n * 100) / 100;
    const sym = await apiCall(token, `/symbols/${SYMBOL}?mode=day_trade`);
    const price = sym.json?.quote?.price ?? null;
    if (price == null) throw new Error(`no quote for ${SYMBOL} — cannot size a resting limit`);
    // Below the market, so the order genuinely RESTS and `accepted` is a state
    // the user actually sees before anything fills.
    const limit = round2(price * 0.9);
    console.log(`  · ${SYMBOL} is ${price}; the limit will be ${limit}`);

    console.log('[3] Build a plan');
    await go(page, `/symbol/${SYMBOL}`, 4000);
    await shot(page, 'live2b2-02-symbol');
    await go(page, `/plan/new?symbol=${SYMBOL}`, 5000);
    await must(page, 'screen-plan', 'tile-entry', 'the plan opens on the server’s own numbers');
    await must(page, 'screen-plan', 'stop-copy', 'stop-attaches copy');
    await must(page, 'screen-plan', 'plan-quote', 'quote freshness line');
    await must(page, 'screen-plan', 'cta-review-order', 'Review order is a button, not a slide');
    if (await seen(page, 'screen-plan', 'needs-size')) {
      console.log('  · Kai sized this at zero shares — setting an amount by hand');
      await setSize(page, String(round2(limit * 1.05)));
    }
    await shot(page, 'live2b2-03-plan');

    console.log('[4] the ticket — a resting limit, three shares');
    await tap(page, 'screen-plan', 'cta-review-order');
    await arrive(page, 'screen-order-ticket', 1500);
    await sizeTicket(page, { shares: 3, limit });
    await shot(page, 'live2b2-04-order-ticket');

    console.log('[5] review — the blocker case, told honestly');
    await tap(page, 'screen-order-ticket', 'cta-review');
    await arrive(page, 'screen-order-review', 3000);
    if (await seen(page, 'screen-order-review', 'risk-verdict-blocker')) {
      await must(page, 'screen-order-review', 'blocked-line', 'the screen says which rule blocks it');
      const dis = await on(page, 'screen-order-review', 'cta-place').getAttribute('aria-disabled');
      if (dis !== 'true') throw new Error('a blocked order still has an armed primary');
      console.log('  · three shares breaks the position-size rule and the primary is disabled');
    } else {
      console.log('  ! three shares was placeable — no blocker to shoot');
    }
    await shot(page, 'live2b2-05-review-blocked');

    console.log('[6] one share — the placeable order');
    await tap(page, 'screen-order-review', 'cta-edit');
    await arrive(page, 'screen-order-ticket', 1200);
    await on(page, 'screen-order-ticket', 'field-qty').fill('1');
    await page.waitForTimeout(400);
    await tap(page, 'screen-order-ticket', 'cta-review');
    await arrive(page, 'screen-order-review', 3000);
    for (const v of ['pass', 'advisory', 'blocker']) {
      if (await seen(page, 'screen-order-review', `risk-verdict-${v}`)) console.log(`  · risk verdict rendered: ${v}`);
    }
    await must(page, 'screen-order-review', 'max-loss-line', 'the "you can lose up to" line');
    await must(page, 'screen-order-review', 'confirm-footer', 'nothing-is-sent footer with the quote clock');
    const label = await on(page, 'screen-order-review', 'cta-place').innerText();
    if (/broker/i.test(label)) throw new Error(`the primary says "${label}" — this is paper`);
    console.log(`  · primary reads "${label.trim()}"`);
    await shot(page, 'live2b2-06-review');

    // Kai in place, over the order — never a bounce back to Home.
    await on(page, 'screen-order-review', 'ask-kai').click();
    await page.waitForTimeout(3000);
    await shot(page, 'live2b2-07-review-kai-sheet');
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(800);
    if (await seen(page, 'screen-order-review', 'cta-place')) console.log('  · the sheet opened OVER the review, which is still there');

    console.log('[7] place it — accepted is not filled');
    await on(page, 'screen-order-review', 'cta-place').click();
    await arrive(page, 'screen-order-result', 1200);
    await must(page, 'screen-order-result', 'order-accepted', 'the order is accepted and resting');
    await shot(page, 'live2b2-08-accepted');

    console.log('[8] a real paper tick crosses the limit');
    if (SECRET) {
      const t = await tick(SECRET, { [SYMBOL]: round2(limit * 0.995) });
      console.log(`  · tick → ${t.status} ${String(t.json?.plain ?? '').slice(0, 140)}`);
    }
    await page.locator('[data-testid="order-filled"]').last()
      .waitFor({ state: 'visible', timeout: 30_000 })
      .catch(() => { throw new Error('the order never moved to filled'); });
    console.log('  · filled');
    await must(page, 'screen-order-result', 'view-position', 'and it offers the position');
    await shot(page, 'live2b2-09-filled');

    console.log('[9] the position it made');
    await on(page, 'screen-order-result', 'view-position').click();
    await arrive(page, 'screen-position', 2500);
    await must(page, 'screen-position', 'plan-vs-now', 'the plan sits beside the price');
    await must(page, 'screen-position', 'exit-now', 'Exit now is offered');
    await shot(page, 'live2b2-10-position');

    await go(page, '/position', 3000);
    await must(page, 'screen-positions', 'positions-pl', 'the positions list, with today’s P/L');
    await must(page, 'screen-positions', 'daily-risk', 'and the daily risk bar');
    await shot(page, 'live2b2-11-positions');

    console.log('[10] Exit now → the same review → closed');
    const positions = await apiCall(token, '/positions?status=open');
    const positionId = positions.json?.open?.[0]?.id ?? null;
    if (!positionId) throw new Error('no open position to exit');
    await go(page, `/order/review?close=${positionId}`, 5000);
    await must(page, 'screen-order-review', 'cta-place', 'the exit is confirmed like any other order');
    await shot(page, 'live2b2-12-review-exit');
    await on(page, 'screen-order-review', 'cta-place').click();
    await arrive(page, 'screen-order-result', 3000);
    await shot(page, 'live2b2-13-exit-result');

    console.log('[11] the closed trade and its debrief');
    await go(page, `/position/${positionId}`, 4000);
    const closed = await seen(page, 'screen-position', 'debrief-link');
    console.log(closed ? '  · the position reads closed and offers the debrief' : '  ! the position is still open after the exit');
    await shot(page, 'live2b2-14-position-closed');
    await go(page, '/position', 3000);
    await on(page, 'screen-positions', 'filter-closed').click();
    await page.waitForTimeout(2500);
    await shot(page, 'live2b2-15-positions-closed');

    console.log('[12] Trade again — the account moved');
    await go(page, '/trade', 4000);
    await shot(page, 'live2b2-16-trade-after');
    await go(page, '/account', 3000);
    await shot(page, 'live2b2-17-account');
  } finally {
    await ctx.close();
    await browser.close();
  }
  console.log(`\nlive proof written to ${OUT}`);
};

main().catch((e) => { console.error(e); process.exit(1); });
