/**
 * Walks the DEPLOYED site the way a visitor would: both breakpoints, all three
 * simulations, every beat, to the plan at the end. Screenshots land in proof/.
 *
 *   node scripts/walk.mjs [url]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const BASE = process.argv[2] ?? 'https://cheatcode-ai-site.vercel.app';
const here = path.dirname(fileURLToPath(import.meta.url));
const PROOF = path.join(here, '..', 'proof');
mkdirSync(PROOF, { recursive: true });

const PATHS = [
  { id: 'learn', door: 'Learn investing and trading', beats: 7 },
  { id: 'swing', door: 'Find better swing trades', beats: 5 },
  { id: 'pro', door: 'Trade with an AI copilot', beats: 6 },
];

const shot = (page, name) => page.screenshot({ path: path.join(PROOF, `${name}.png`), fullPage: false });

const problems = [];

async function walk(page, tag, { fullPage = false } = {}) {
  for (const { id, door, beats } of PATHS) {
    await page.goto(BASE, { waitUntil: 'networkidle' });

    // Desktop starts on the landing; the selector lives further down.
    if (tag === 'desktop') {
      await page.getByRole('button', { name: 'Show me my version' }).click();
      await page.waitForTimeout(700);
    }

    await page.locator(`[data-door="${id}"]:visible`).first().click();
    await page.waitForTimeout(450);

    for (let i = 0; i < beats; i++) {
      await shot(page, `${tag}-${id}-${String(i + 1).padStart(2, '0')}`);
      const cue = page.locator('[data-cue]:visible').first();
      if (!(await cue.count())) {
        problems.push(`${tag}/${id}: no cue button at beat ${i + 1}`);
        break;
      }
      await cue.click();
      await page.waitForTimeout(420);
    }

    // The plan is the last thing.
    await shot(page, `${tag}-${id}-plan`);
    const price = await page.locator('text=/^\\$(29|59|99)$/').count();
    if (!price) problems.push(`${tag}/${id}: no price on the plan screen`);
  }
}

const browser = await chromium.launch();

// ── mobile ──────────────────────────────────────────────────────────────
const m = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const mp = await m.newPage();
await mp.goto(BASE, { waitUntil: 'networkidle' });
await shot(mp, 'mobile-00-selector');
// The landing must not exist on a phone.
const landingOnPhone = await mp.getByRole('heading', { name: /One app, seven things/ }).isVisible().catch(() => false);
if (landingOnPhone) problems.push('mobile: the desktop landing is visible on a phone');
await walk(mp, 'mobile');
await mp.goto(`${BASE}/get-the-app?path=swing`, { waitUntil: 'networkidle' });
await shot(mp, 'mobile-handoff');
await m.close();

// ── desktop ─────────────────────────────────────────────────────────────
const d = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2 });
const dp = await d.newPage();
await dp.goto(BASE, { waitUntil: 'networkidle' });
await shot(dp, 'desktop-00-hero');
await dp.evaluate(() => window.scrollTo(0, 900));
await dp.waitForTimeout(400);
await shot(dp, 'desktop-01-index');
await dp.evaluate(() => window.scrollTo(0, 1900));
await dp.waitForTimeout(400);
await shot(dp, 'desktop-02-alert');
await dp.evaluate(() => window.scrollTo(0, 3000));
await dp.waitForTimeout(400);
await shot(dp, 'desktop-03-kai');
await dp.evaluate(() => window.scrollTo(0, 4100));
await dp.waitForTimeout(400);
await shot(dp, 'desktop-04-progression');
await dp.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await dp.waitForTimeout(400);
await shot(dp, 'desktop-05-finder');
await walk(dp, 'desktop');
await dp.goto(`${BASE}/get-the-app?path=pro`, { waitUntil: 'networkidle' });
await shot(dp, 'desktop-handoff');
await d.close();

await browser.close();

if (problems.length) {
  console.log('PROBLEMS:');
  for (const p of problems) console.log(' -', p);
  process.exit(1);
}
console.log('OK — all three simulations walked at both breakpoints.');
