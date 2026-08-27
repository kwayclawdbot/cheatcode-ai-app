/**
 * Verification gate for the MOBILE lane.
 *
 *   npx expo start --web --port 8081        (in another shell, EXPO_PUBLIC_FIXTURES=1)
 *   node scripts/proof.mjs
 *
 * Shoots every route at 390x844 into proof/, renders the two gating artboards
 * at the same size, and writes side-by-side comparisons for Home and O0.
 */
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const REPO = path.resolve(ROOT, '../..');
const OUT = path.join(ROOT, 'proof');
const ARTBOARDS = path.join(REPO, 'design/artboards');
const BASE = process.env.PROOF_BASE ?? 'http://localhost:8081';
const VIEWPORT = { width: 390, height: 844 };

/** Hide dev-server chrome. `.__expo_fast_refresh` is Metro's Fast Refresh
 *  indicator — dev-only, pointer-events:none, absent from `expo export`. */
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
  // #root only: the expo dev-server overlay is not app UI and never ships.
  const root = page.locator('#root');
  await ((await root.count()) ? root : page).screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log(`  ✓ ${name}.png`);
};

const settle = (page, ms = 900) => page.waitForTimeout(ms);

async function open(page, route) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'load', timeout: 120_000 });
  await settle(page, 1400);
}

async function captureApp(browser) {
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, colorScheme: 'dark' });
  await installHideDevChrome(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  ! page error:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('  ! console:', m.text().slice(0, 200)); });

  console.log('\n[1] auth');
  await open(page, '/welcome');           await shot(page, '01-welcome');
  await open(page, '/sign-up');           await shot(page, '02-sign-up');
  await open(page, '/sign-in');           await shot(page, '03-sign-in');

  console.log('[2] onboarding');
  await open(page, '/kai');               await shot(page, '04-onboarding-kai');
  await page.getByTestId('mode-day_trade').click();
  await settle(page, 500);                await shot(page, '05-onboarding-kai-answered');
  await open(page, '/goal');              await shot(page, '06-onboarding-goal');
  await open(page, '/risk');              await shot(page, '07-onboarding-risk');
  await open(page, '/summary');           await shot(page, '08-onboarding-summary');
  await open(page, '/learn');             await shot(page, '09-onboarding-learn');
  await page.getByTestId('level-504').click();
  await settle(page, 500);                await shot(page, '10-onboarding-learn-answered');

  console.log('[3] tabs');
  await open(page, '/home');              await shot(page, '11-home');
  // mode is visible global context now — chip opens the sheet that PUTs /mode
  await page.getByTestId('mode-chip').click();
  await settle(page, 600);                await shot(page, '11b-home-mode-sheet');
  await page.keyboard.press('Escape').catch(() => {});
  await page.getByTestId('mode-option-day_trade').click().catch(() => {});
  await settle(page, 600);
  await page.getByTestId('composer-input').first().fill('What happens at the CPI print?');
  await page.getByTestId('composer-send').first().click();
  await settle(page, 200);                await shot(page, '12-home-typing');
  await settle(page, 4200);               await shot(page, '13-home-streamed-reply');
  await open(page, '/alerts');            await shot(page, '14-alerts');
  await open(page, '/community');         await shot(page, '15-community');
  // Community is the other mobile lane's screen and has its own proof run
  // (scripts/proof-b.mjs). Shoot whatever it renders, but never fail this run
  // because its internals moved.
  try {
    await page.getByTestId('room-market-open').click({ timeout: 4000 });
    await settle(page, 500);              await shot(page, '16-community-room');
  } catch {
    console.log('  · community room tap skipped (owned by MOBILE-B)');
  }
  await open(page, '/trade');             await shot(page, '17-trade');
  await open(page, '/account');           await shot(page, '18-account');

  console.log('[4] asset workspace (V5-W1) — the setup is a module inside it');
  await open(page, '/symbol/META');       await shot(page, '19-workspace-overview');
  await page.getByTestId('setup-see-why').click();
  await settle(page, 500);                await shot(page, '20-workspace-see-why');
  await page.getByTestId('setup-see-why').click();
  await page.getByTestId('tab-kai').click();
  await settle(page, 600);                await shot(page, '21-workspace-kai');
  await page.getByTestId('tab-plan').click();
  await settle(page, 600);                await shot(page, '22-workspace-plan');
  await page.getByTestId('tab-community').click();
  await settle(page, 600);                await shot(page, '23-workspace-community');
  await page.getByTestId('tab-overview').click();
  await settle(page, 400);
  // Watch this — the state-driven primary on a forming setup
  await page.getByTestId('setup-primary').click();
  await settle(page, 700);                await shot(page, '24-workspace-watching');
  // the global Kai sheet, opened OVER the workspace (V5-W2)
  await page.getByTestId('workspace-ask-kai').click();
  await settle(page, 700);                await shot(page, '25-kai-sheet-open');
  await page.getByTestId('composer-input').last().fill("Why hasn't it confirmed yet?");
  await page.getByTestId('composer-send').last().click();
  await settle(page, 3600);               await shot(page, '26-kai-sheet-answered');
  await page.getByTestId('kai-sheet-close').click();
  await settle(page, 500);
  // the old /setup/:id link still works — it redirects into the workspace
  await open(page, '/setup/seed-meta');   await shot(page, '27-setup-redirect');

  console.log('[5] alerts — Attention / Monitoring / History + inline composer');
  await open(page, '/alerts');             await shot(page, '28-alerts-attention');
  await page.getByTestId('filter-monitoring').click();
  await settle(page, 500);                 await shot(page, '29-alerts-monitoring');
  await page.getByTestId('filter-history').click();
  await settle(page, 500);                 await shot(page, '30-alerts-history');
  await page.getByTestId('filter-attention').click();
  await settle(page, 400);
  await page.getByTestId('alert-nl-input').fill('Tell me when TSLA drops below 170');
  await page.getByTestId('alert-nl-read').click();
  await settle(page, 900);                 await shot(page, '31-alerts-composer-preview');
  await page.getByTestId('attention-ask-kai').click();
  await settle(page, 800);                 await shot(page, '32-alerts-kai-sheet');
  await page.getByTestId('kai-sheet-close').click();
  await settle(page, 400);
  await open(page, '/alert/a2');            await shot(page, '33-alert-detail');
  await open(page, '/alert/new');           await shot(page, '34-alert-new');

  console.log('[6] search + workspace timeframes');
  await open(page, '/symbol/search');      await shot(page, '35-symbol-search');
  await page.getByTestId('search-input').fill('META');
  await settle(page, 900);                 await shot(page, '36-symbol-search-results');
  await open(page, '/symbol/META?tab=overview');
  await page.getByTestId('tf-1M').click();
  await settle(page, 900);                 await shot(page, '37-workspace-1m');

  console.log('[7] account sub-screens');
  await open(page, '/account/settings');      await shot(page, '38-account-settings');
  await open(page, '/account/notifications'); await shot(page, '39-account-notifications');
  await open(page, '/account/memory');        await shot(page, '40-account-memory');
  await open(page, '/account/paper');         await shot(page, '41-account-paper');
  await open(page, '/account/subscription');  await shot(page, '42-account-subscription');
  await page.getByTestId('cta-upgrade').click();
  await settle(page, 600);                    await shot(page, '43-account-billing-sheet');

  await ctx.close();
}

/** Render one artboard HTML at exactly 390x844 so it can be compared 1:1. */
async function captureArtboard(browser, file, name) {
  const ctx = await browser.newContext({ viewport: { width: 470, height: 1000 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(pathToFileURL(path.join(ARTBOARDS, file)).href, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  const el = await page.$('div[data-screen-label]');
  await page.evaluate(() => {
    document.body.style.padding = '0';
    const d = document.querySelector('div[data-screen-label]');
    d.style.width = '390px';
    d.style.height = '844px';
  });
  await page.waitForTimeout(400);
  await el.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log(`  ✓ ${name}.png`);
  await ctx.close();
}

/** Artboard on the left, our build on the right, at the same scale. */
async function compare(browser, artboard, build, out, title) {
  const ctx = await browser.newContext({ viewport: { width: 860, height: 940 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  // file:// images are blocked in a setContent page — inline them.
  const enc = async (n) => `data:image/png;base64,${(await fs.readFile(path.join(OUT, `${n}.png`))).toString('base64')}`;
  const a = await enc(artboard);
  const b = await enc(build);
  await page.setContent(`
    <style>
      body{margin:0;background:#050507;color:#B9B0A8;font:12px -apple-system,system-ui,sans-serif;padding:16px}
      h1{font-size:13px;color:#C8FF00;margin:0 0 12px;font-weight:600}
      .r{display:flex;gap:24px;align-items:flex-start}
      figure{margin:0}
      figcaption{margin-bottom:6px;letter-spacing:.06em;text-transform:uppercase;font-size:10px}
      img{width:390px;height:844px;display:block;border:1px solid #1C1C22}
    </style>
    <h1>${title}</h1>
    <div class="r">
      <figure><figcaption>Artboard (design/artboards)</figcaption><img src="${a}"></figure>
      <figure><figcaption>Build (expo web, 390&times;844)</figcaption><img src="${b}"></figure>
    </div>`);
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, `${out}.png`), fullPage: true });
  console.log(`  ✓ ${out}.png`);
  await ctx.close();
}

const main = async () => {
  await fs.mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  try {
    await captureApp(browser);
    console.log('\n[8] artboards + compare');
    await captureArtboard(browser, 'V5-H1-Home-priority.html', 'ab2-home');
    await captureArtboard(browser, 'V5-W1-Asset-workspace.html', 'ab2-workspace');
    await captureArtboard(browser, 'V5-A1-Alerts-simple.html', 'ab2-alerts');
    await captureArtboard(browser, 'V5-W2-Kai-sheet.html', 'ab2-kai-sheet');
    await compare(browser, 'ab2-home', '11-home', 'compare2-home', 'V5-H1 Home priority — artboard vs build');
    await compare(browser, 'ab2-workspace', '19-workspace-overview', 'compare2-workspace', 'V5-W1 Asset workspace — artboard vs build');
    await compare(browser, 'ab2-alerts', '28-alerts-attention', 'compare2-alerts', 'V5-A1 Alerts simple — artboard vs build');
    // the artboard draws an answered thread, so compare against the same state
    await compare(browser, 'ab2-kai-sheet', '26-kai-sheet-answered', 'compare2-kai-sheet', 'V5-W2 Kai contextual sheet — artboard vs build');
  } finally {
    await browser.close();
  }
  console.log(`\nproof written to ${OUT}`);
};

main().catch((e) => { console.error(e); process.exit(1); });
