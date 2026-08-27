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
  await page.getByTestId('composer-input').fill('What happens at the CPI print?');
  await page.getByTestId('composer-send').click();
  await settle(page, 200);                await shot(page, '12-home-typing');
  await settle(page, 4200);               await shot(page, '13-home-streamed-reply');
  await open(page, '/alerts');            await shot(page, '14-alerts');
  await open(page, '/community');         await shot(page, '15-community');
  await page.getByTestId('room-market-open').click();
  await settle(page, 500);                await shot(page, '16-community-sheet');
  await open(page, '/trade');             await shot(page, '17-trade');
  await open(page, '/account');           await shot(page, '18-account');

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
    console.log('\n[4] artboards + compare');
    await captureArtboard(browser, 'V3-H1-Glance-home.html', 'ab-home');
    await captureArtboard(browser, 'V3-O0-Conversational-onboarding.html', 'ab-onboarding-kai');
    // the artboard draws a conversation in progress, so compare against the same state
    await compare(browser, 'ab-home', '12-home-typing', 'compare-home', 'V3-H1 Glance home — artboard vs build');
    await compare(browser, 'ab-onboarding-kai', '05-onboarding-kai-answered', 'compare-onboarding-kai', 'V3-O0 Conversational onboarding — artboard vs build');
  } finally {
    await browser.close();
  }
  console.log(`\nproof written to ${OUT}`);
};

main().catch((e) => { console.error(e); process.exit(1); });
