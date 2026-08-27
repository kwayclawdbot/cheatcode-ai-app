#!/usr/bin/env node
/**
 * refresh-seed-setups — make the seeded setups agree with real prices.
 *
 * WHY THIS EXISTS
 * The four rows in supabase/seed.sql were written with invented levels (META at
 * $504, NVDA at $128.50). Real META trades near $570 and real NVDA near $213, so
 * every screen that showed a seeded setup next to a live quote was showing a
 * contradiction — the exact failure the contradiction validator exists to stop.
 * This script is the INTERIM SCANNER until the market-intelligence worker
 * (03 Unit 2) exists. It is not a detector and does not pretend to be one.
 *
 * THE RULE (documented, deliberately simple, from BUILD-BRIEF-round-2)
 *   entry        = the last 10 sessions' high — the level a breakout must clear
 *   stop         = the last 10 sessions' low  — the swing the idea leans on
 *   target[0]    = entry + 1.5 x (entry - stop)
 *   invalidation = a daily close below the stop
 * Grade, score and state are NOT recomputed: they came from the seed and this
 * script has no detector behind it, so changing them would be inventing
 * analysis. It refreshes the LEVELS and says where they came from.
 *
 * WHAT IT STAMPS
 *   score_components.seed         = true            (still seed data)
 *   score_components.source       = 'polygon-daily'
 *   score_components.refreshed_at = ISO timestamp
 *   quote_snapshot.freshness      = 'delayed'
 *   quote_snapshot.delay_reason   = 'entitlement'   (the plan is delayed-only)
 *
 * It also writes the 30 daily bars into `candles`, which warms the cache the
 * API reads from and saves API calls later (the plan allows 5 a minute).
 *
 *   cd apps/api && node scripts/refresh-seed-setups.mjs
 *   node scripts/refresh-seed-setups.mjs --dry-run
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENV_FILE = process.env.ENV_FILE ?? resolve(HERE, '../.env.local');

for (const line of safeRead(ENV_FILE).split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const SUPABASE_URL = need('SUPABASE_URL');
const SERVICE_KEY = need('SUPABASE_SERVICE_ROLE_KEY');
const POLYGON_KEY = need('POLYGON_API_KEY');
const DRY = process.argv.includes('--dry-run');

const LOOKBACK_SESSIONS = 10;
const HISTORY_DAYS = 30;
const RR_MULTIPLE = 1.5;
/** The plan allows 5 requests a minute; 13s apart keeps us clear of it. */
const THROTTLE_MS = 13_000;

const SEED_RUN_ID = '00000000-0000-0000-0000-000000000000';

main().catch((e) => {
  console.error('refresh-seed-setups failed:', e.message);
  process.exit(1);
});

async function main() {
  const setups = await sb(
    'GET',
    `/rest/v1/setups?scanner_run_id=eq.${SEED_RUN_ID}&select=id,symbol,mode,intent,state,score,grade_band,grade_display,score_components,invalidation`
  );
  if (!setups.length) {
    console.log('No seeded setups found. Run `supabase db reset` first.');
    return;
  }
  console.log(`Refreshing ${setups.length} seeded setup(s) against Polygon daily bars.\n`);

  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - HISTORY_DAYS * 2 * 86_400_000).toISOString().slice(0, 10);

  let first = true;
  for (const setup of setups) {
    if (!first) await sleep(THROTTLE_MS);
    first = false;

    const bars = await dailyBars(setup.symbol, from, to);
    if (bars.length < LOOKBACK_SESSIONS + 1) {
      console.log(`  ${setup.symbol}: only ${bars.length} bars came back — leaving it alone.`);
      continue;
    }

    const recent = bars.slice(-HISTORY_DAYS);
    const window = recent.slice(-LOOKBACK_SESSIONS);
    const last = recent[recent.length - 1];

    const entry = round2(Math.max(...window.map((b) => b.h)));
    const stop = round2(Math.min(...window.map((b) => b.l)));
    const perShare = round2(entry - stop);
    if (!(perShare > 0)) {
      console.log(`  ${setup.symbol}: the 10-day range is degenerate — leaving it alone.`);
      continue;
    }
    const target = round2(entry + RR_MULTIPLE * perShare);
    const sourceTs = new Date(last.t).toISOString();
    const refreshedAt = new Date().toISOString();

    const invalidated = setup.state === 'invalidated';
    const patch = {
      entry_condition: { type: 'price_cross', level: entry, hold: true },
      stop,
      targets: [{ price: target, label: 'first target' }],
      invalidation: {
        type: 'close_below',
        level: stop,
        reason: `A daily close below $${stop} takes out the low this idea leans on.`,
        ...(invalidated ? { invalidated_at: setup.invalidation?.invalidated_at ?? refreshedAt } : {}),
      },
      quote_snapshot: {
        price: round2(last.c),
        source_ts: sourceTs,
        received_ts: refreshedAt,
        freshness: 'delayed',
        delay_reason: 'entitlement',
      },
      score_components: {
        ...(setup.score_components ?? {}),
        seed: true,
        source: 'polygon-daily',
        refreshed_at: refreshedAt,
        lookback_sessions: LOOKBACK_SESSIONS,
        rule: 'entry = 10-session high; stop = 10-session low; target = entry + 1.5R; invalidation = daily close below stop',
      },
      thesis_plain: thesisPlain(setup, entry, stop, last.c),
      thesis_technical: thesisTechnical(setup, entry, stop, perShare, target, last, window),
      valid_until: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    };

    console.log(
      `  ${setup.symbol.padEnd(5)} last $${round2(last.c)}  entry $${entry}  stop $${stop}  target $${target}  (risk $${perShare}/share, ${round2(
        (target - entry) / perShare
      )}R)`
    );

    if (DRY) continue;

    await sb('PATCH', `/rest/v1/setups?id=eq.${setup.id}`, patch);
    await writeCandles(setup.symbol, recent);
  }

  console.log(
    DRY
      ? '\nDry run — nothing written.'
      : '\nDone. Setups now carry real levels, labeled seed-derived and delayed.'
  );
}

/* ------------------------------------------------------------------ */
/* Copy templates — plain first, technical second (07 §7)              */
/* ------------------------------------------------------------------ */

function thesisPlain(setup, entry, stop, close) {
  const long = setup.intent === 'buy_to_open' || setup.intent === 'buy_to_cover';
  if (setup.state === 'invalidated') {
    return `This one is off the table — ${setup.symbol} lost the low the idea leaned on at $${stop}.`;
  }
  const distance = round2(Math.abs(entry - close));
  if (long) {
    return `${setup.symbol} has to clear $${entry} before this means anything, and it is $${distance} away. It fails below $${stop}.`;
  }
  return `${setup.symbol} has to lose $${entry} before this means anything. It fails above $${stop}.`;
}

function thesisTechnical(setup, entry, stop, perShare, target, last, window) {
  const rr = round2((target - entry) / perShare);
  const avgVol = Math.round(window.reduce((a, b) => a + (b.v ?? 0), 0) / window.length);
  const rvol = avgVol ? round2((last.v ?? 0) / avgVol) : null;
  return [
    `${LOOKBACK_SESSIONS}-session high $${entry}, ${LOOKBACK_SESSIONS}-session low $${stop} — $${perShare} a share between them.`,
    `First target $${target} at ${rr}R.`,
    rvol ? `Last session traded ${rvol}x the ${LOOKBACK_SESSIONS}-session average volume.` : null,
    `Levels derived from Polygon daily bars on ${new Date(last.t).toISOString().slice(0, 10)}; seed data, not a scanner result.`,
  ]
    .filter(Boolean)
    .join(' ');
}

/* ------------------------------------------------------------------ */
/* IO                                                                  */
/* ------------------------------------------------------------------ */

async function dailyBars(symbol, from, to) {
  const url =
    `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/1/day/${from}/${to}` +
    `?adjusted=true&sort=asc&limit=120&apiKey=${POLYGON_KEY}`;
  const res = await fetch(url);
  if (res.status === 429) throw new Error(`Polygon rate limit hit on ${symbol} — rerun in a minute.`);
  if (!res.ok) throw new Error(`Polygon ${res.status} on ${symbol}`);
  const json = await res.json();
  if (json.status === 'NOT_AUTHORIZED') throw new Error(`Polygon plan does not cover ${symbol} daily bars.`);
  return (json.results ?? []).filter((b) => Number.isFinite(b.c));
}

async function writeCandles(symbol, bars) {
  const rows = bars.map((b) => ({
    symbol,
    timeframe: '1d',
    ts: new Date(b.t).toISOString(),
    o: b.o ?? null,
    h: b.h ?? null,
    l: b.l ?? null,
    c: b.c ?? null,
    v: b.v === undefined || b.v === null ? null : Math.round(b.v),
  }));
  await sb('POST', '/rest/v1/candles?on_conflict=symbol,timeframe,ts', rows, {
    Prefer: 'resolution=merge-duplicates,return=minimal',
  });
}

async function sb(method, path, body, extraHeaders = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: method === 'GET' ? '' : 'return=representation',
      ...extraHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${method} ${path} → ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : [];
}

/* ------------------------------------------------------------------ */

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function need(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} (put it in apps/api/.env.local)`);
  return v;
}
function safeRead(p) {
  try {
    return readFileSync(p, 'utf8');
  } catch {
    return '';
  }
}
