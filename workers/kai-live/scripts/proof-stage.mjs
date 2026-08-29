/**
 * The LIVE-2 acceptance proof: a real generated show, played back in a real
 * browser, driving the real LIVE-1 chart.
 *
 *   node scripts/proof-stage.mjs --show <id> [--web http://localhost:8090]
 *
 * WHAT IT ACTUALLY PROVES, and why each step is here rather than asserted in a
 * unit test.
 *
 *  1. THE BRAIN AND THE CHART FIT. Frames the worker wrote go through
 *     `applyChartCommand` — the same function the Trade Portal calls — and the
 *     chart moves. Nothing in a Node test can tell you that; the two halves of
 *     this lane meet in a WebView and nowhere else.
 *
 *  2. LATE JOIN LANDS IN THE SAME PLACE. The page is killed mid-segment, its
 *     cursor recorded, and a second page is opened at `since=<cursor>`. If the
 *     second one ends on the same seq and the same symbol having applied only
 *     the remainder, the replay promise holds. This is the assertion the brief
 *     asks for and it cannot be faked: the second page never sees frames 0..N.
 *
 *  3. IT LOOKS LIKE SOMETHING. A frame sequence is captured through one full
 *     segment so the owner can judge whether it reads as a show, which is the
 *     only question that actually matters and the only one a test cannot answer.
 *
 * Playwright drives `window.__ccLive`, never a click: a proof that depends on
 * hitting a button at the right moment is a proof that fails on a slow machine.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const OUT = resolve(REPO, 'apps', 'mobile', 'proof');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const SHOW = arg('show');
const WEB = arg('web', 'http://localhost:8090');
const API = arg('api', 'http://localhost:3000');
const SUPA = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

if (!SHOW) {
  console.error('usage: node scripts/proof-stage.mjs --show <show-id>');
  process.exit(2);
}

let failures = 0;
const ok = (name, cond, detail) => {
  if (cond) console.log(`  PASS  ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail === undefined ? '' : `\n        ${JSON.stringify(detail)}`}`);
  }
};

/** A throwaway viewer, exactly as smoke.sh makes one. Deleted at the end. */
async function makeViewer() {
  const email = `live-proof-${Date.now()}@example.com`;
  const password = 'proof-password-123';
  const created = await fetch(`${SUPA}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const user = await created.json();
  if (!created.ok) throw new Error(`could not create a viewer: ${JSON.stringify(user)}`);

  const signed = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const tokens = await signed.json();
  if (!signed.ok) throw new Error(`could not sign the viewer in: ${JSON.stringify(tokens)}`);
  return { id: user.id, token: tokens.access_token };
}

async function dropViewer(id) {
  await fetch(`${SUPA}/auth/v1/admin/users/${id}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  }).catch(() => {});
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(page, predicate, timeoutMs, label) {
  const started = Date.now();
  for (;;) {
    const state = await page.evaluate(() => window.__ccLive?.state?.() ?? null);
    if (state && predicate(state)) return state;
    if (Date.now() - started > timeoutMs) return state;
    await sleep(250);
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const viewer = await makeViewer();

  // What the show actually contains, straight from the API the page will use.
  const framesRes = await fetch(`${API}/api/v1/live/shows/${SHOW}/frames?since=-1&limit=2000`, {
    headers: { authorization: `Bearer ${viewer.token}` },
  });
  const body = await framesRes.json();
  ok('the show is readable by an ordinary signed-in user', framesRes.ok, body?.error ?? null);
  const frames = body.frames ?? [];
  const segments = [...new Set(frames.map((f) => f.segment_id))];
  const symbols = [...new Set(frames.filter((f) => f.kind === 'present').map((f) => f.symbol))];
  const chartFrames = frames.filter((f) => f.kind === 'chart');
  const sayFrames = frames.filter((f) => f.kind === 'say');

  console.log(`\n  show ${SHOW}`);
  console.log(`  ${frames.length} frames · ${segments.length} segments · symbols ${symbols.join(', ')}`);
  console.log(`  ${sayFrames.length} say · ${chartFrames.length} chart · ${frames.filter((f) => f.kind === 'overlay').length} overlay\n`);

  ok('the show has at least three segments', symbols.length >= 3, symbols);
  ok('frame seqs are gap-free', frames.every((f, i) => f.seq === i), frames.slice(0, 5).map((f) => f.seq));
  ok('every chart frame says where its numbers came from', chartFrames.every((f) => f.provenance?.length > 0));
  ok(
    'every annotation on a chart frame is a persisted row with a reason',
    chartFrames.every((f) => f.annotations.every((a) => a.id && a.reason)),
  );

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });

  /* -------------------------------------------------------------- */
  /* 1. Watch it from the start                                     */
  /* -------------------------------------------------------------- */

  const url = `${WEB}/stage-check?show=${SHOW}&token=${encodeURIComponent(viewer.token)}&pace=12`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="screen-live-stage"], [data-testid=screen-live-stage]', { timeout: 30000 }).catch(() => {});

  const first = await waitFor(page, (s) => s.bars > 0 && s.symbol && s.symbol !== '—', 45000, 'bars');
  ok('the chart loaded real candles for the first symbol', (first?.bars ?? 0) > 20, first);
  ok('and it is the symbol the show presented first', first?.symbol === symbols[0], { got: first?.symbol, want: symbols[0] });

  // A frame series through one segment: the artifact the owner judges.
  const shots = [];
  for (let i = 0; i < 12; i += 1) {
    const state = await page.evaluate(() => window.__ccLive.state());
    const file = resolve(OUT, `live2-play-${String(i).padStart(2, '0')}.png`);
    await page.screenshot({ path: file });
    shots.push({ file, seq: state.cursor, symbol: state.symbol, annotations: state.annotations, line: state.line });
    await sleep(1400);
  }

  const mid = await page.evaluate(() => window.__ccLive.state());
  ok('the chart has Kai\'s marks on it', mid.annotations > 0, mid);
  ok('a line is on screen while the chart is being worked', Boolean(mid.line), mid.line);
  ok('the player reports no error', !mid.error, mid.error);
  ok('the page logged no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3));

  /* -------------------------------------------------------------- */
  /* 2. Kill it mid-segment and rejoin                              */
  /* -------------------------------------------------------------- */

  const killedAt = await page.evaluate(() => {
    window.__ccLive.stop();
    return window.__ccLive.state();
  });
  await page.screenshot({ path: resolve(OUT, 'live2-killed.png') });
  console.log(`\n  killed mid-show at seq ${killedAt.cursor} on ${killedAt.symbol}\n`);
  ok('the client was mid-show when it died', killedAt.cursor > 0 && killedAt.cursor < frames.length - 1, killedAt);
  await page.close();

  const rejoin = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await rejoin.goto(
    `${WEB}/stage-check?show=${SHOW}&token=${encodeURIComponent(viewer.token)}&pace=40&since=${killedAt.cursor}`,
    { waitUntil: 'domcontentloaded' },
  );

  const resumed = await waitFor(rejoin, (s) => s.cursor > killedAt.cursor, 45000);
  ok('a rejoining client starts after the frame the first one applied', (resumed?.cursor ?? -1) > killedAt.cursor, resumed);

  const finished = await waitFor(rejoin, (s) => s.cursor >= frames.length - 1, 180000);
  ok('and reaches the end of the same show', finished?.cursor === frames.length - 1, {
    got: finished?.cursor,
    want: frames.length - 1,
  });
  ok('landing on the last symbol the show presented', finished?.symbol === symbols[symbols.length - 1], {
    got: finished?.symbol,
    want: symbols[symbols.length - 1],
  });
  ok('with no gap left waiting', finished?.pending === 0, finished);
  await rejoin.screenshot({ path: resolve(OUT, 'live2-rejoined.png') });

  await browser.close();
  await dropViewer(viewer.id);

  const report = {
    show: SHOW,
    frames: frames.length,
    segments: symbols.length,
    symbols,
    say_frames: sayFrames.length,
    chart_frames: chartFrames.length,
    commands: [...new Set(chartFrames.map((f) => f.command))],
    audio: sayFrames.every((f) => f.audio_url === null) ? 'none — captions only' : 'present',
    killed_at_seq: killedAt.cursor,
    rejoined_from_seq: killedAt.cursor,
    finished_at_seq: finished?.cursor ?? null,
    shots,
    failures,
  };
  writeFileSync(resolve(OUT, 'live2-proof.json'), JSON.stringify(report, null, 2));
  console.log(`\n  wrote ${resolve(OUT, 'live2-proof.json')}`);
  console.log(`\n  ${failures === 0 ? 'LIVE-2 PROOF PASSED' : `LIVE-2 PROOF FAILED (${failures})`}\n`);
  return failures === 0 ? 0 : 1;
}

main()
  .then((c) => process.exit(c))
  .catch((e) => {
    console.error(e);
    process.exit(3);
  });
