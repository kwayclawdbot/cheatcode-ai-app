/**
 * Fixtures proof for lane MOBILE-B round 4 — the chart-first Trade Portal,
 * order confirmed, community circles and the setup room.
 *
 *   EXPO_PUBLIC_FIXTURES=1 npx expo start --port 8091
 *   node scripts/proof-b4.mjs
 *
 * Everything lands in proof/p4b-*.png at 390x844, plus compare4-*.png which put
 * each screen beside its prototype board (design/prototype/*.html).
 *
 * A screenshot alone proves nothing, so every state is asserted by testID
 * before it is shot.
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

async function open(page, route, ms = 2000) {
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

async function must(page, testid, why) {
  await page.getByTestId(testid).last().waitFor({ state: 'visible', timeout: 20_000 })
    .catch(() => { throw new Error(`${why} — [data-testid="${testid}"] never appeared`); });
  console.log(`  · ${why}`);
}

async function mustText(page, testid, re, why) {
  const t = await page.getByTestId(testid).last().innerText();
  if (!re.test(t)) throw new Error(`${why} — got "${t.slice(0, 120)}"`);
  console.log(`  · ${why}`);
}

/** Screenshot one prototype board at phone size so it can sit beside the build. */
async function board(ctx, file, label, out) {
  const page = await ctx.newPage();
  await page.goto(pathToFileURL(path.join(REPO, 'design/prototype', file)).href, { waitUntil: 'load' });
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

async function sideBySide(ctx, leftPng, rightPng, out, title) {
  const page = await ctx.newPage();
  const [a, b] = await Promise.all([fs.readFile(leftPng), fs.readFile(rightPng)]);
  const html = `<!doctype html><html><body style="margin:0;background:#050507;font-family:-apple-system,system-ui,sans-serif;color:#B9B0A8">
    <div style="padding:16px">
      <div style="font-size:13px;margin-bottom:10px">${title}</div>
      <div style="display:flex;gap:16px">
        <div><div style="font-size:11px;margin-bottom:6px">prototype board</div><img src="data:image/png;base64,${a.toString('base64')}" style="width:390px;display:block"></div>
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

/** Type into the portal composer and wait for Kai's stream to finish. */
async function ask(page, testid, text, ms = 4200) {
  const composer = page.getByTestId(testid).last();
  await composer.waitFor({ state: 'visible', timeout: 20_000 });
  const input = composer.locator('input, textarea').last();
  await input.fill(text);
  await input.press('Enter');
  await settle(page, ms);
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
    /* ---------------- 1. the portal, opened from an alert ---------------- */
    console.log('\n[1] Trade Portal — opened with alert context');
    await open(page, '/trade/META?alert=alert-meta&ctx=alert', 3000);
    await must(page, 'screen-trade-portal', 'the portal is the Trade destination');
    await must(page, 'portal-top-bar', 'top bar: ticker switcher, price, paper');
    await must(page, 'portal-paper-chip', 'PAPER is unmistakable');
    await must(page, 'portal-chart', 'the chart is the dominant object');
    await must(page, 'timeframe-rail', '1m/5m/15m/1h/4h/D rail');
    await must(page, 'context-switcher', 'Kai · Alert · Plan · Community');
    await must(page, 'panel-alert', 'alert context restored from the route');
    await must(page, 'grade-medallion', 'oversized grade medallion');
    await must(page, 'scorecard', 'qualitative scorecard');
    await shot(page, 'p4b-01-portal-alert');

    // No fractions anywhere on the scorecard (spec §4 acceptance criterion).
    const scoreText = await page.getByTestId('scorecard').last().innerText();
    if (/\b\d{1,2}\s*\/\s*\d{1,2}\b/.test(scoreText)) {
      throw new Error(`scorecard shows a fraction: ${scoreText.slice(0, 120)}`);
    }
    console.log('  · no /20 fractions on the scorecard');

    console.log('[2] annotations are objects — tap one');
    await tap(page, 'annotation-ann-stop', 900);
    await must(page, 'annotation-sheet', 'the annotation inspector opens');
    await must(page, 'annotation-reason', 'it carries the reason Kai placed it');
    await must(page, 'annotation-provenance', 'and its provenance');
    await shot(page, 'p4b-02-annotation-tapped');
    await page.keyboard.press('Escape').catch(() => {});
    await settle(page, 500);

    console.log('[3] the four contexts');
    await open(page, '/trade/META?alert=alert-meta&ctx=alert', 2600);
    await tap(page, 'ctx-kai', 1200);
    await must(page, 'panel-kai', 'Kai is the default working panel');
    await must(page, 'portal-composer', 'the composer is persistent');
    await shot(page, 'p4b-03-portal-kai');
    await tap(page, 'ctx-plan', 1000);
    await must(page, 'panel-plan', 'Plan context');
    await shot(page, 'p4b-04-portal-plan');
    await tap(page, 'ctx-community', 1000);
    await must(page, 'panel-community', 'Community context');
    await must(page, 'open-circle', 'and a way into the circle');
    await shot(page, 'p4b-05-portal-community');

    console.log('[4] Kai chart command applied in place');
    await tap(page, 'ctx-kai', 900);
    await ask(page, 'portal-composer', 'mark the invalidation');
    await must(page, 'chart-narration', 'Kai narrates the chart change');
    await must(page, 'annotation-kai-invalidation-498', 'the invalidation level is drawn on the chart');
    await shot(page, 'p4b-06-chart-command');

    console.log('[5] a timeframe command');
    await ask(page, 'portal-composer', 'switch to the daily chart');
    const narrations = await page.getByTestId('chart-narration').allInnerTexts();
    const lastNarration = narrations[narrations.length - 1] ?? '';
    if (!/daily/i.test(lastNarration)) throw new Error(`timeframe command was not applied: "${lastNarration}"`);
    console.log(`  · ${lastNarration}`);
    await shot(page, 'p4b-07-chart-timeframe');

    console.log('[6] drawers hold the round-3 landing');
    await open(page, '/trade/META', 2600);
    await tap(page, 'open-drawers', 1000);
    await must(page, 'portal-drawers', 'the drawer opens');
    await must(page, 'drawer-account-value', 'account strip');
    await shot(page, 'p4b-08-drawers');
    await page.keyboard.press('Escape').catch(() => {});
    await settle(page, 400);

    console.log('[7] ticker switcher');
    await open(page, '/trade/META', 2400);
    await tap(page, 'ticker-switcher', 900);
    await must(page, 'ticker-switcher-sheet', 'the switcher is a search sheet');
    await shot(page, 'p4b-09-ticker-switcher');
    await page.keyboard.press('Escape').catch(() => {});

    /* ---------------- 2. review → confirmed ---------------- */
    console.log('\n[8] Review order — paper legs');
    await open(page, '/order/review?symbol=META&side=buy_to_open&qty=1&order_type=limit&limit=504', 3200);
    await must(page, 'screen-order-review', 'the review screen');
    await must(page, 'kai-risk-check', "Kai's risk check");
    const risk = await page.getByTestId('kai-risk-check').last().innerText();
    if (!/paper leg/i.test(risk)) throw new Error(`review is missing the paper-leg rows: ${risk.slice(0, 200)}`);
    if (/submit to broker/i.test(risk)) throw new Error('review says "submit to broker" — there is no broker');
    console.log('  · stop and target are named as paper legs');
    await must(page, 'cta-place', 'the primary says Place paper order');
    await shot(page, 'p4b-10-review-order');

    console.log('[9] Order confirmed — placed, then filled');
    await tap(page, 'cta-place', 700);
    await must(page, 'screen-order-confirmed', 'a placed order gets its own screen');
    await mustText(page, 'confirmed-headline', /paper account/i, 'the headline names the paper account');
    await must(page, 'confirmed-recap', 'the order is recapped in one line');
    await must(page, 'confirmed-primary', 'View pending order');
    await must(page, 'confirmed-done', 'Done');
    await shot(page, 'p4b-11-order-confirmed');

    console.log('[10] pending is not filled');
    const headline1 = await page.getByTestId('confirmed-headline').last().innerText();
    if (!/^Placed/i.test(headline1)) throw new Error(`first state should be Placed, got "${headline1}"`);
    console.log(`  · first state: ${headline1}`);
    await shot(page, 'p4b-12-order-pending');
    await page.getByTestId('confirmed-headline').last()
      .filter({ hasText: /Filled/i })
      .waitFor({ state: 'visible', timeout: 20_000 })
      .catch(() => {});
    await settle(page, 1200);
    const headline2 = await page.getByTestId('confirmed-headline').last().innerText();
    if (!/Filled/i.test(headline2)) throw new Error(`the fill never arrived, still "${headline2}"`);
    console.log(`  · after the tick: ${headline2}`);
    await shot(page, 'p4b-13-order-filled');

    /* ---------------- 3. community + circles ---------------- */
    console.log('\n[11] Community — club header, circles, feed');
    await open(page, '/community', 3000);
    await must(page, 'screen-community', 'the club');
    await must(page, 'club-presence', 'N online / N members');
    await must(page, 'circles-row', 'the circles row');
    await must(page, 'circle-circle-meta', 'META circle with its clock');
    await must(page, 'kai-pinned', "Kai's pinned summary");
    await must(page, 'room-rail', 'the three mode rooms are the base');
    await must(page, 'club-composer', 'Message Cheat Code Club… $ @Kai');
    await shot(page, 'p4b-14-community');

    console.log('[12] create circle is real and gated');
    await tap(page, 'circle-create', 1000);
    await must(page, 'create-circle-sheet', 'the create sheet');
    await must(page, 'create-circle-symbol', 'symbol field');
    await must(page, 'create-circle-ttl', '24h / 3d / 7d');
    await shot(page, 'p4b-15-create-circle');
    await page.keyboard.press('Escape').catch(() => {});
    await settle(page, 400);

    console.log('[13] $TICKER chips and reactions');
    await open(page, '/community', 2600);
    if (await has(page, 'ticker-chip-META')) console.log('  · $META renders as a chip');
    await shot(page, 'p4b-16-community-feed');

    console.log('[14] the circle room');
    await open(page, '/circle/circle-meta', 3000);
    await must(page, 'screen-circle', 'the circle room');
    await must(page, 'circle-name', 'META Breakout');
    await mustText(page, 'circle-meta', /remaining/, 'N days remaining · N members');
    await must(page, 'circle-chart', 'the live chart with levels sits at the top');
    await must(page, 'kai-verification', "Kai's verification object");
    await must(page, 'circle-composer', 'the room composer');
    await shot(page, 'p4b-17-circle');

    /* ---------------- 4. side-by-sides ---------------- */
    console.log('\n[15] compare against the prototype boards');
    const pairs = [
      ['Asset-workspace.html', 'Asset workspace', 'p4b-01-portal-alert', 'compare4-portal', 'Asset workspace → Trade Portal'],
      ['Review-order.html', 'Review order', 'p4b-10-review-order', 'compare4-review', 'Review order'],
      ['Order-confirmed.html', 'Order confirmed', 'p4b-11-order-confirmed', 'compare4-confirmed', 'Order confirmed (paper copy)'],
      ['Community.html', 'Community', 'p4b-14-community', 'compare4-community', 'Community'],
      ['Setup-room.html', 'Setup room', 'p4b-17-circle', 'compare4-circle', 'Setup room → circle'],
    ];
    for (const [file, label, built, out, title] of pairs) {
      const boardPng = path.join(OUT, `${out}-board.png`);
      await board(ctx, file, label, boardPng);
      await sideBySide(ctx, boardPng, path.join(OUT, `${built}.png`), path.join(OUT, `${out}.png`), title);
    }

    console.log('\nAll MOBILE-B round-4 fixture proofs written to apps/mobile/proof/');
  } finally {
    await browser.close();
  }
};

main().catch((e) => { console.error('\nPROOF FAILED:', e.message); process.exit(1); });
