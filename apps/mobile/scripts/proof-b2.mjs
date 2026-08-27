/**
 * Fixtures proof for lane MOBILE-B round 3 — the paper-execution arc:
 * Trade landing in the brokerage hierarchy, positions list + detail, the trade
 * plan, the order ticket, and the review screen in all three risk verdicts plus
 * the accepted → filled states.
 *
 *   EXPO_PUBLIC_FIXTURES=1 npx expo start --port 8091
 *   node scripts/proof-b2.mjs
 *
 * Everything lands in proof/b2-*.png at 390x844, plus compare2-tr3.png and
 * compare2-p1.png which put the screen beside its artboard.
 *
 * Helpers are copied from scripts/proof-b.mjs rather than imported so this file
 * stays self-contained; scripts/proof.mjs belongs to the other lane.
 */
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const REPO = path.resolve(ROOT, '../..');
const OUT = path.join(ROOT, 'proof');
const BASE = process.env.PROOF_BASE ?? 'http://localhost:8091';
const VIEWPORT = { width: 390, height: 844 };

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

const shot = async (page, name) => {
  const root = page.locator('#root');
  await ((await root.count()) ? root : page).screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log(`  ✓ ${name}.png`);
};

const settle = (page, ms = 900) => page.waitForTimeout(ms);

async function open(page, route, ms = 1600) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'load', timeout: 180_000 });
  await settle(page, ms);
}

const tap = async (page, testid, ms = 700) => {
  const el = page.getByTestId(testid).last();
  await el.waitFor({ state: 'visible', timeout: 30_000 });
  await el.click();
  await settle(page, ms);
};

const has = async (page, testid) => (await page.getByTestId(testid).count()) > 0;

/** Assert a testID is on screen — a screenshot alone does not prove a state. */
async function must(page, testid, why) {
  await page.getByTestId(testid).last().waitFor({ state: 'visible', timeout: 20_000 })
    .catch(() => { throw new Error(`${why} — [data-testid="${testid}"] never appeared`); });
  console.log(`  · ${why}`);
}

/**
 * Screenshot one artboard at phone size so it can sit beside the built screen.
 * The canvas export is a wide page of boards; we pin the wanted board to the
 * top-left at 390x844 and shoot just that element.
 */
async function artboard(ctx, file, label, out) {
  const page = await ctx.newPage();
  await page.goto(pathToFileURL(path.join(REPO, 'design/artboards', file)).href, { waitUntil: 'load' });
  const target = page.locator(`[data-screen-label="${label}"]`).first();
  await target.waitFor({ state: 'attached', timeout: 20_000 });
  await target.evaluate((el) => {
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    el.style.position = 'fixed';
    el.style.top = '0';
    el.style.left = '0';
    el.style.width = '390px';
    el.style.height = '844px';
    el.style.zIndex = '9999';
  });
  await page.waitForTimeout(600);
  await target.screenshot({ path: out });
  await page.close();
}

/** Put two PNGs side by side with captions and shoot the pair. */
async function sideBySide(ctx, leftPng, rightPng, out, title) {
  const page = await ctx.newPage();
  const [a, b] = await Promise.all([fs.readFile(leftPng), fs.readFile(rightPng)]);
  const html = `<!doctype html><html><body style="margin:0;background:#050507;font-family:-apple-system,system-ui,sans-serif;color:#B9B0A8">
    <div style="padding:16px">
      <div style="font-size:13px;margin-bottom:10px">${title}</div>
      <div style="display:flex;gap:16px">
        <div><div style="font-size:11px;margin-bottom:6px">artboard</div><img src="data:image/png;base64,${a.toString('base64')}" style="width:390px;display:block"></div>
        <div><div style="font-size:11px;margin-bottom:6px">built</div><img src="data:image/png;base64,${b.toString('base64')}" style="width:390px;display:block"></div>
      </div>
    </div></body></html>`;
  await page.setViewportSize({ width: 844, height: 940 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  await page.screenshot({ path: out, fullPage: true });
  await page.close();
  console.log(`  ✓ ${path.basename(out)}`);
}

const main = async () => {
  await fs.mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, colorScheme: 'dark' });
  await installHideDevChrome(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  ! page error:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('  ! console:', m.text().slice(0, 240)); });

  try {
    console.log('\n[1] Trade landing — the brokerage hierarchy');
    await open(page, '/trade', 2200);
    await must(page, 'paper-strip', 'account strip leads the page');
    await must(page, 'account-value', 'account value is on screen');
    await must(page, 'buying-power', 'buying power is on screen');
    await must(page, 'position-row-pos-meta', 'positions come before the watchlist');
    await must(page, 'order-row-ord-fixture-1', 'open orders are their own region');
    await must(page, 'needs-action-na-nvda', 'items needing a decision are called out');
    await shot(page, 'b2-01-trade-landing');
    await page.mouse.wheel(0, 900); await settle(page, 700);
    await shot(page, 'b2-02-trade-watchlist-search');
    await page.mouse.wheel(0, 1100); await settle(page, 700);
    await shot(page, 'b2-03-trade-discovery-kai');

    console.log('[2] mode is global context on Trade');
    await open(page, '/trade', 1800);
    await tap(page, 'mode-chip');
    await must(page, 'mode-sheet', 'the mode sheet opens over Trade');
    await shot(page, 'b2-04-trade-mode-sheet');

    console.log('[3] positions — V3-P1');
    await open(page, '/position', 1800);
    await must(page, 'positions-pl', "today's P/L is the headline");
    await must(page, 'position-pos-meta', 'healthy position card');
    await must(page, 'kai-line-pos-meta', '"nothing to do" replaces the buttons on a healthy trade');
    await must(page, 'position-pos-nvda', 'at-risk position card');
    await must(page, 'review-pos-nvda', 'at risk gets Review');
    await must(page, 'exit-pos-nvda', 'at risk gets Exit now');
    await must(page, 'daily-risk', 'daily risk used bar closes the screen');
    await shot(page, 'b2-05-positions');
    const p1Built = path.join(OUT, 'b2-05-positions.png');

    await tap(page, 'filter-closed', 1200);
    await shot(page, 'b2-06-positions-closed');

    console.log('[4] position detail — plan vs now');
    await open(page, '/position/pos-nvda', 1800);
    await must(page, 'position-header', 'where the position is');
    await must(page, 'plan-vs-now', 'the plan sits beside the price');
    await must(page, 'exit-now', 'Exit now is present');
    await shot(page, 'b2-07-position-detail');
    await tap(page, 'adjust-stop');
    await must(page, 'adjust-sheet', 'the stop can be moved from the detail');
    await shot(page, 'b2-08-position-adjust-stop');

    await open(page, '/position/pos-crm-closed', 1800);
    await must(page, 'debrief-link', 'a closed position offers the debrief');
    await shot(page, 'b2-09-position-closed');

    console.log('[5] trade plan — V3-T1');
    await open(page, '/plan/new?symbol=META&setup=setup-meta-1', 2000);
    await must(page, 'tile-entry', 'entry tile');
    await must(page, 'tile-target', 'target tile');
    await must(page, 'tile-stop', 'stop tile');
    await must(page, 'scenario-up', 'if the target hits');
    await must(page, 'scenario-down', 'if it is stopped');
    await must(page, 'daily-cap', 'daily cap bar');
    await must(page, 'stop-copy', 'stop-attaches copy');
    await must(page, 'plan-quote', 'quote freshness line');
    await must(page, 'cta-review-order', 'the primary is a BUTTON, not a slide');
    await shot(page, 'b2-10-plan');
    await tap(page, 'edit-stop');
    await shot(page, 'b2-11-plan-edit-stop');

    console.log('[6] order ticket');
    await open(page, '/order/new?symbol=META&side=buy_to_open&amount=650&limit=504', 2000);
    await must(page, 'size-mode', 'shares or dollars');
    await must(page, 'order-type', 'market · limit · stop');
    await must(page, 'duration', 'how long it lives');
    await must(page, 'est-total', 'estimated total');
    await shot(page, 'b2-12-order-ticket');

    console.log('[7] review — the three verdicts, told honestly');
    const REVIEW = '/order/review?symbol=META&side=buy_to_open&amount=650&order_type=limit&limit=504&duration=day';
    await open(page, `${REVIEW}&setup=pass`, 2200);
    await must(page, 'risk-verdict-pass', 'a clean order says Passes');
    await shot(page, 'b2-13-review-pass');

    await open(page, `${REVIEW}&setup=advisory`, 2200);
    await must(page, 'risk-verdict-advisory', '58% sector exposure is an ADVISORY, not a green pass');
    await must(page, 'max-loss-line', 'the "you can lose up to" line');
    await must(page, 'confirm-footer', 'nothing-is-sent footer with the quote clock');
    await must(page, 'cta-place', 'the primary is Place paper order');
    const placeLabel = await page.getByTestId('cta-place').last().innerText();
    if (!/place paper order/i.test(placeLabel)) throw new Error(`primary reads "${placeLabel}" — it must be "Place paper order"`);
    console.log('  · primary reads "Place paper order"');
    await shot(page, 'b2-14-review-advisory');
    const tr3Built = path.join(OUT, 'b2-14-review-advisory.png');

    await open(page, `${REVIEW}&setup=blocker`, 2200);
    await must(page, 'risk-verdict-blocker', 'a blocked order says so');
    await must(page, 'blocked-line', 'and says which rule blocked it');
    const disabled = await page.getByTestId('cta-place').last().getAttribute('aria-disabled');
    console.log(`  · Place paper order aria-disabled=${disabled}`);
    await shot(page, 'b2-15-review-blocker');

    console.log('[8] accepted, then filled — two states, not one');
    await open(page, `${REVIEW}&setup=advisory`, 2200);
    await tap(page, 'cta-place', 900);
    await must(page, 'order-accepted', 'accepted is its own state');
    await shot(page, 'b2-16-order-accepted');
    await page.getByTestId('order-filled').last().waitFor({ state: 'visible', timeout: 25_000 });
    console.log('  · then it fills');
    await must(page, 'view-position', 'and offers the position');
    await shot(page, 'b2-17-order-filled');

    console.log('[9] exit now goes through the same review');
    await open(page, '/order/review?close=pos-nvda', 2400);
    await must(page, 'cta-place', 'an exit is confirmed like any other order');
    await shot(page, 'b2-18-review-exit');

    console.log('[10] account — mode chip and paper strip');
    await open(page, '/account', 2000);
    await must(page, 'paper-strip', 'the paper strip is on Account too');
    await shot(page, 'b2-19-account');
    await tap(page, 'mode-chip');
    await must(page, 'mode-sheet', 'the same mode sheet');
    await shot(page, 'b2-20-account-mode-sheet');

    console.log('[11] side-by-side with the artboards');
    const tr3Art = path.join(OUT, 'b2-art-tr3.png');
    const p1Art = path.join(OUT, 'b2-art-p1.png');
    await artboard(ctx, 'V4-TR3-Review-order.html', 'V4 TR3 Review order', tr3Art);
    await artboard(ctx, 'V3-P1-Positions.html', 'V3 P1 Positions', p1Art);
    await sideBySide(ctx, tr3Art, tr3Built, path.join(OUT, 'compare2-tr3.png'), 'V4-TR3 Review order — artboard vs built');
    await sideBySide(ctx, p1Art, p1Built, path.join(OUT, 'compare2-p1.png'), 'V3-P1 Positions — artboard vs built');
  } finally {
    await ctx.close();
    await browser.close();
  }
  console.log(`\nfixtures proof written to ${OUT}`);
};

main().catch((e) => { console.error(e); process.exit(1); });
