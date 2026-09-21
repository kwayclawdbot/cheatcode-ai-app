/**
 * HOME AS AN AGENT — photographed (redesign V2, panel 1).
 *
 *   cd apps/mobile
 *   EXPO_PUBLIC_FIXTURES=1 npx expo start --web --port 8105
 *   PROOF_BASE=http://localhost:8105 PROOF_OUT=<dir> node scripts/proof-home-agent.mjs
 *
 * Fixtures only. Three sizes: 390×844 at 100% and 130% text, and 360×780.
 * States: the opening brief (trade-ready and beginner), a chat with a setup
 * card and its follow-ups, the mic listening (Chromium's fake microphone, so
 * the recorder genuinely runs), and Kai offline (`?kai=offline`).
 * After the shots, each one is put side by side with the V2 board's panel 1.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.PROOF_BASE ?? 'http://localhost:8105';
const OUT = process.env.PROOF_OUT ?? path.resolve(HERE, '../../../docs/home-agent-proof');
const BOARD = path.resolve(HERE, '../../../docs/design/redesign-2026-09-21/CheatCode_UI_Redesign_V2.png');
mkdirSync(OUT, { recursive: true });

const failures = [];
const note = (ok, what) => { console.log(`  ${ok ? '✓' : '✗'} ${what}`); if (!ok) failures.push(what); };

const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});

async function session({ width, height, scale = 1 }) {
  const ctx = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: 2, colorScheme: 'dark',
    permissions: ['microphone'],
  });
  await ctx.addInitScript(({ scale }) => {
    try { localStorage.setItem('ccai.a11y.v1', JSON.stringify({ textScale: scale, reducedMotion: false })); } catch {}
    const add = () => { const s = document.createElement('style'); s.textContent = '.__expo_fast_refresh{display:none!important}'; document.head.appendChild(s); };
    if (document.head) add(); else document.addEventListener('DOMContentLoaded', add);
  }, { scale });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => failures.push(`page error: ${e.message}`));
  return { ctx, page };
}

const tid = (page, id) => page.locator(`[data-testid="${id}"]`).first();
const has = async (page, id) => (await page.locator(`[data-testid="${id}"]`).count()) > 0;
const shots = [];
const shot = async (page, name) => {
  await page.waitForTimeout(700);
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  shots.push(file);
  console.log(`  · ${name}.png`);
};
const open = async (page, route) => {
  await page.goto(`${BASE}${route}`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForSelector('[data-testid="screen-home"]', { timeout: 90_000 });
  await page.waitForSelector('[data-testid="kai-opening-text"]', { timeout: 30_000 });
  await page.waitForTimeout(2200);
};
const noSideScroll = async (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const textOf = async (page, id) => (await tid(page, id).innerText()).replace(/\s+/g, ' ').trim();

/** Ask through the real composer, wait for the canned fixture turn to finish. */
async function askAndWait(page, text) {
  await tid(page, 'composer-input').fill(text);
  await tid(page, 'composer-send').click();
  await page.waitForSelector('[data-testid^="setup-card-"]', { timeout: 20_000 });
  await page.waitForSelector('[data-testid="kai-followups"]', { timeout: 20_000 });
  await page.waitForTimeout(900);
}

const SIZES = [
  { tag: '390x844-100', width: 390, height: 844, scale: 1 },
  { tag: '390x844-130', width: 390, height: 844, scale: 1.3 },
  { tag: '360x780', width: 360, height: 780, scale: 1 },
];

for (const size of SIZES) {
  console.log(`\n── ${size.tag}`);
  const { ctx, page } = await session(size);

  // 1 — the opening brief, trade-ready
  await open(page, '/home?stage=trade_ready');
  note(await has(page, 'today-brief'), `${size.tag}: Today's Brief is in Kai's opening`);
  note(!(await has(page, 'warroom-brain')), `${size.tag}: no war-room brain`);
  const status = await textOf(page, 'home-app-bar');
  note(/Monitoring 2 positions/.test(status), `${size.tag}: status line reads the positions (${status})`);
  note(await noSideScroll(page), `${size.tag}: no sideways scroll`);
  await shot(page, `${size.tag}-01-opening-trade-ready`);

  // 2 — beginner
  await open(page, '/home?stage=beginner');
  const b = await textOf(page, 'kai-opening-text');
  note(!/cleanest setup/i.test(b) && /asks you to trade/.test(b), `${size.tag}: beginner opening does not sell a trade`);
  note(await has(page, 'learning-path'), `${size.tag}: beginner sees the learning path`);
  await shot(page, `${size.tag}-02-opening-beginner`);

  // 3 — a chat with a setup card and follow-ups (voice preview on, so the violet mic is drawn)
  await open(page, '/home?stage=trade_ready&voice=on');
  await askAndWait(page, 'What should I watch first?');
  note(await has(page, 'kai-followups'), `${size.tag}: follow-up chips under the reply`);
  note(await has(page, 'kai-monitoring'), `${size.tag}: monitoring line (META has an armed alert)`);
  // The question and the start of Kai's answer, then the card and its follow-ups.
  await page.evaluate(() => {
    const wall = document.querySelector('[data-testid="kai-wall"]');
    const q = [...document.querySelectorAll('[data-testid="kai-wall"] div')].find((d) => d.textContent === 'What should I watch first?');
    if (wall && q) wall.scrollTop += q.getBoundingClientRect().top - wall.getBoundingClientRect().top - 40;
  });
  await shot(page, `${size.tag}-03a-chat-question`);
  await tid(page, 'kai-wall').evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await shot(page, `${size.tag}-03b-chat-setup-card`);

  // 4 — voice listening
  if (await has(page, 'kai-mic')) {
    await tid(page, 'kai-mic').click();
    try {
      await page.waitForSelector('[data-testid="kai-voice-listening"]', { timeout: 8000 });
      note(true, `${size.tag}: mic listening`);
    } catch { note(false, `${size.tag}: mic listening`); }
    await shot(page, `${size.tag}-04-voice-listening`);
    await tid(page, 'kai-mic').click().catch(() => {});
  } else {
    note(false, `${size.tag}: mic drawn with ?voice=on`);
  }

  // 5 — Kai offline
  await open(page, '/home?stage=trade_ready&kai=offline');
  note(/Kai offline/.test(await textOf(page, 'home-app-bar')), `${size.tag}: status says Kai offline`);
  note(await has(page, 'today-brief'), `${size.tag}: the brief still renders offline`);
  await tid(page, 'composer-input').fill('Is META still good?');
  await tid(page, 'composer-send').click();
  await page.waitForTimeout(700);
  const wall = await textOf(page, 'kai-wall');
  note(wall.includes("I'm offline right now"), `${size.tag}: the reply is the honest offline line`);
  await tid(page, 'kai-wall').evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await shot(page, `${size.tag}-05-kai-offline`);

  await ctx.close();
}

/* ── side by side with the board's panel 1 ───────────────────────────── */
console.log('\n── side by side with V2 panel 1');
{
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const { readFileSync } = await import('node:fs');
  const board = `data:image/png;base64,${readFileSync(BOARD).toString('base64')}`;
  for (const file of shots) {
    const ours = `data:image/png;base64,${readFileSync(file).toString('base64')}`;
    // Panel 1 of the 1536-wide board is its left third.
    await page.setContent(`<!doctype html><body style="margin:0;background:#0c0c0f;display:flex;gap:24px;align-items:flex-start;padding:24px;font:13px system-ui;color:#9a9892">
      <div><div style="margin-bottom:8px">V2 board · panel 1</div>
        <div style="width:470px;height:1024px;overflow:hidden;background:#f3efe8"><img src="${board}" style="width:1536px;margin-left:-20px"></div></div>
      <div><div style="margin-bottom:8px">Built · ${path.basename(file)}</div><img src="${ours}" style="width:430px"></div>
    </body>`);
    await page.setViewportSize({ width: 1000, height: 1100 });
    const out = file.replace(/\.png$/, '-vs-board.png');
    await page.screenshot({ path: out, fullPage: true });
    console.log(`  · ${path.basename(out)}`);
  }
  await ctx.close();
}

await browser.close();
console.log(failures.length ? `\n${failures.length} problem(s):\n  ${failures.join('\n  ')}` : '\nall shots taken, all checks passed');
process.exit(failures.length ? 1 : 0);
