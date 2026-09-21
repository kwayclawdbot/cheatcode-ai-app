/**
 * THE REDESIGN, ALL FOUR SCREENS IN ONE RUN (the lanes merged, 2026-09-21).
 *
 *   cd apps/mobile
 *   EXPO_PUBLIC_FIXTURES=1 npx expo start --web --port 8109   (another shell)
 *   PROOF_OUT=<dir> node scripts/proof-rd-merge.mjs
 *
 * Runs each lane's own proof against the one server — Home, Alerts (Day Trade,
 * Swing, Invest), Trade Detail, Community feed and room — at 390x844 (100% and
 * 130% text) and 360x780, each into its own folder under PROOF_OUT. Every
 * lane's assertions still count: one failing lane fails the run.
 *
 * Then it puts the 390 at 100% shot of each screen beside the board panel it
 * was drawn from (V2 panels 1–3 for Home, Alerts and Community; V1 panel 4 for
 * Trade Detail) as `side-by-side/<screen>-vs-board.png`.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.PROOF_BASE ?? 'http://localhost:8109';
const OUT = path.resolve(process.env.PROOF_OUT ?? path.join(HERE, '..', 'proof', 'rd-merge'));
const BOARDS = path.resolve(HERE, '../../../docs/design/redesign-2026-09-21');
mkdirSync(OUT, { recursive: true });

const LANES = [
  { name: 'home', script: 'proof-home-agent.mjs' },
  { name: 'alerts', script: 'proof-rd-alerts.mjs' },
  { name: 'trade', script: 'proof-rd-trade.mjs' },
  { name: 'community', script: 'proof-rd-community.mjs' },
];

const failed = [];
for (const lane of LANES) {
  console.log(`\n════ ${lane.name} (${lane.script})`);
  const r = spawnSync('node', [path.join(HERE, lane.script)], {
    stdio: 'inherit',
    env: { ...process.env, PROOF_BASE: BASE, PROOF_OUT: path.join(OUT, lane.name) },
  });
  if (r.status !== 0) failed.push(lane.name);
}

/* ── side by side with the boards, 390 at 100% ─────────────────────────── */
// Board geometry: V2 is 1536 wide in three phones, V1 is 1536 wide in four.
const PAIRS = [
  { screen: 'home', file: 'home/390x844-100-01-opening-trade-ready.png', board: 'CheatCode_UI_Redesign_V2.png', x: 20, w: 470, label: 'V2 panel 1 · Kai' },
  { screen: 'alerts', file: 'alerts/swing-390x844-100.png', board: 'CheatCode_UI_Redesign_V2.png', x: 530, w: 480, label: 'V2 panel 2 · Alerts' },
  { screen: 'community', file: 'community/390-01-feed-for-you.png', board: 'CheatCode_UI_Redesign_V2.png', x: 1040, w: 480, label: 'V2 panel 3 · Community' },
  { screen: 'trade', file: 'trade/390-01-alert-chart.png', board: 'CheatCode_UI_Redesign.png', x: 1150, w: 380, label: 'V1 panel 4 · Trade Detail' },
];

const sbs = path.join(OUT, 'side-by-side');
mkdirSync(sbs, { recursive: true });
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1000, height: 1100 }, deviceScaleFactor: 1 })).newPage();
const b64 = (f) => `data:image/png;base64,${readFileSync(f).toString('base64')}`;
console.log('\n════ side by side');
for (const p of PAIRS) {
  const ours = path.join(OUT, p.file);
  if (!existsSync(ours)) { console.log(`  ✗ missing ${p.file}`); failed.push(`side-by-side ${p.screen}`); continue; }
  await page.setContent(`<!doctype html><body style="margin:0;background:#0c0c0f;display:flex;gap:24px;align-items:flex-start;padding:24px;font:13px system-ui;color:#9a9892">
    <div><div style="margin-bottom:8px">${p.label}</div>
      <div style="width:${p.w}px;height:1024px;overflow:hidden;background:#f3efe8"><img src="${b64(path.join(BOARDS, p.board))}" style="width:1536px;margin-left:-${p.x}px"></div></div>
    <div><div style="margin-bottom:8px">Built · ${p.file}</div><img src="${b64(ours)}" style="width:430px"></div>
  </body>`);
  const out = path.join(sbs, `${p.screen}-vs-board.png`);
  await page.screenshot({ path: out, fullPage: true });
  console.log(`  · ${path.relative(OUT, out)}`);
}
await browser.close();

console.log(failed.length ? `\nFAILED: ${failed.join(', ')}` : '\nevery lane passed; side-by-sides written');
process.exit(failed.length ? 1 : 0);
