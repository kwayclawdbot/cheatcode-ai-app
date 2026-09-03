/**
 * SWING-5 GATE — against PRODUCTION, both halves.
 *
 *   cd apps/api
 *   KAI_SUPABASE_WRITE_KEY=$(cat /tmp/kai_srk) \
 *     ENV_FILE=.env.prod npx tsx scripts/swing5-proof.ts
 *   ... --accounting-only        # part 1 only, writes nothing anywhere
 *
 * PART 1 — THE BACK CATALOGUE IS ACCOUNTED FOR. Not "446 became 0" — the brief's
 * gate is that every card still missing a stop or a description is NAMED, by
 * family, with the reason it cannot be recovered. So this reads every setup in
 * production, buckets each incomplete one against a registry of stated reasons,
 * and FAILS if a single card lands outside that registry. An unexplained blank
 * is the thing this gate exists to make impossible.
 *
 * PART 2 — RAILWAY DELIVERS STRAIGHT INTO THE APP. It writes ONE real-shaped
 * `kai_long` row into the SMS product's `sent_alerts`, dated today, with the
 * levels the deterministic morning run actually published and NO
 * `humanized_message` — so the same call proves the push, the Active state, the
 * stored stop and target, the model-free description, and the fan-out. Then it
 * pushes a second time and runs the pull cron over the same window, and both
 * must be no-ops. Then it deletes every row it wrote, in BOTH databases,
 * including on failure. A proof that leaves litter on a live product is not a
 * proof.
 *
 * ABOUT THE WRITE CREDENTIAL. `lib/swing/source.ts` can only issue GET, and that
 * is a property of the app worth keeping. So this proof takes a SEPARATE write
 * key from the environment and never routes it through that module. The app has
 * no such credential and is not being given one; the proof does, because
 * proving "a pick arrives" requires a pick to arrive.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
for (const line of readFileSync(resolve(HERE, `../${process.env.ENV_FILE ?? '.env.local'}`), 'utf8').split('\n')) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}

// Imported after the env file is loaded above — `db.ts` reads SUPABASE_URL at
// module scope, so a static import would run before the credentials exist.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { serviceClient } = require('../src/lib/db.ts') as typeof import('../src/lib/db.ts');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { pickKey, setupIdFor, etDateFor } = require('../src/lib/swing/ingest.ts') as typeof import('../src/lib/swing/ingest.ts');

let pass = 0;
let fail = 0;
function ok(name: string, cond: unknown, detail?: unknown): void {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail === undefined ? '' : `\n        ${JSON.stringify(detail)}`}`); }
}
const eq = (n: string, got: unknown, want: unknown) =>
  ok(n, JSON.stringify(got) === JSON.stringify(want), { got, want });

const API = process.env.SWING5_API_BASE ?? 'https://cheatcode-ai-api.vercel.app';
const db = serviceClient();

/* ------------------------------------------------------------------ */
/* PART 1 — every incomplete card is named                              */
/* ------------------------------------------------------------------ */

/**
 * WHY EACH REMAINING GAP IS A GAP. Every entry is a finding, not a policy: the
 * producer either never computed the number, or computed it in a way that
 * cannot be replayed without inventing the inputs. Anything not in this map is
 * a card nobody has explained, and the run fails on it.
 */
const NO_STOP_REASONS: Record<string, string> = {
  intraday:
    '73 — the stop was max(session VWAP, day low) x 0.995 AT THE SCAN MINUTE. It '
    + 'is a function of when the scan ran, not of the session, so no as-of series '
    + 'reproduces it. A stop was on the phone; it cannot be recovered.',
  breakout:
    '30 — 24 whose alert_price matches no daily close (a mid-session snapshot of '
    + 'a partial bar whose high and low are gone, so the last true range is '
    + 'unknowable) and 6 with no alert_price at all. The other 103 were recovered.',
  premarket:
    '6 — format_premarket_alert has no stop line and no target line anywhere in '
    + 'it. The subscriber was never shown one, so there is nothing to recover.',
  breakdown:
    '4 — the breakdown scanner stores a stop whenever it computes one. On these '
    + 'four it computed none.',
  orb: '2 — same: the retired ORB scanner stored its stop when it had one.',
  kai_orb_bullish:
    '2 — BWIN and TENB are stamped 2026-04-03, which was Good Friday. Both '
    + '04-01 and 04-02 are consistent with the published price, so the session '
    + 'is not determined and a guess would be a fabricated level.',
  watchlist_swing:
    '1 — ELAB 2026-04-02 gapped 134%, so the 14-day ATR (14.96) exceeds the '
    + 'price ($14.00) and _swing_levels has no floor. The faithful replay is a '
    + 'stop of -8.45, which is what the code produced and not a number anyone '
    + 'can act on.',
};

/**
 * A TARGET IS A SEPARATE QUESTION FROM A STOP, and for two families the answer
 * is that none was ever published. Counting an absent target as an incomplete
 * card would be marking the product down for being honest.
 */
const NO_TARGET_REASONS: Record<string, string> = {
  ...NO_STOP_REASONS,
  breakout:
    '133 — no target was EVER published by this family. format_compact_alert '
    + 'gates its TP line on next_resistance, which the screener never sets and '
    + 'which 0 of 337 source rows carry. 103 of these now carry the recovered '
    + 'stop and an empty target list, which is the whole truth about them.',
};

const NO_THESIS_REASONS: Record<string, string> = {
  breakout:
    '6 — no narrative was ever written AND the row carries no volume, RSI, '
    + 'sector or pattern. There is no measurement to compose a sentence from, so '
    + 'the card stays blank rather than being filled with its own price.',
};

type Row = {
  id: string; symbol: string; mode: string | null; state: string | null;
  stop: number | null; targets: unknown; thesis_plain: string | null;
  entry_condition: Record<string, unknown> | null;
  score_components: Record<string, unknown> | null;
  quote_snapshot: Record<string, unknown> | null;
};

const typeOf = (r: Row) => String(r.score_components?.pick_key ?? '||unknown').split('|')[2];

async function allSetups(): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('setups')
      .select('id,symbol,mode,state,stop,targets,thesis_plain,entry_condition,score_components,quote_snapshot')
      .order('created_at', { ascending: true }).range(from, from + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    out.push(...(data as Row[]));
    if (data.length < 1000) break;
  }
  return out;
}

function tally<T>(list: T[], key: (t: T) => string): Record<string, number> {
  const o: Record<string, number> = {};
  for (const r of list) o[key(r)] = (o[key(r)] ?? 0) + 1;
  return o;
}

async function partOne(): Promise<void> {
  console.log('\nPART 1 — the back catalogue, and every card that is still incomplete');
  const rows = await allSetups();
  console.log(`  ${rows.length} setups in production`);

  const noStop = rows.filter((r) => r.stop === null || r.stop === undefined);
  const noThesis = rows.filter((r) => !r.thesis_plain?.trim());
  const noEntry = rows.filter((r) => (r.entry_condition as { price?: unknown } | null)?.price == null);

  const stopByType = tally(noStop, typeOf);
  const thesisByType = tally(noThesis, typeOf);
  console.log(`  no stop: ${noStop.length}   ·   no description: ${noThesis.length}   ·   no entry: ${noEntry.length}`);
  for (const [t, n] of Object.entries(stopByType).sort((a, b) => b[1] - a[1])) {
    console.log(`     no stop   ${String(n).padStart(4)}  ${t.padEnd(28)} ${NO_STOP_REASONS[t] ?? '*** UNEXPLAINED ***'}`);
  }
  for (const [t, n] of Object.entries(thesisByType).sort((a, b) => b[1] - a[1])) {
    console.log(`     no thesis ${String(n).padStart(4)}  ${t.padEnd(28)} ${NO_THESIS_REASONS[t] ?? '*** UNEXPLAINED ***'}`);
  }

  const noTargets = rows.filter((r) => !Array.isArray(r.targets) || r.targets.length === 0);
  const targetByType = tally(noTargets, typeOf);
  console.log(`  no target: ${noTargets.length}`);
  for (const [t, n] of Object.entries(targetByType).sort((a, b) => b[1] - a[1])) {
    console.log(`     no target ${String(n).padStart(4)}  ${t.padEnd(28)} ${NO_TARGET_REASONS[t] ?? '*** UNEXPLAINED ***'}`);
  }
  eq('every family missing a target is named, with a reason',
    Object.keys(targetByType).filter((t) => !NO_TARGET_REASONS[t]), []);

  const unexplainedStop = Object.keys(stopByType).filter((t) => !NO_STOP_REASONS[t]);
  const unexplainedThesis = Object.keys(thesisByType).filter((t) => !NO_THESIS_REASONS[t]);
  eq('every family missing a stop is named, with a reason', unexplainedStop, []);
  eq('every family missing a description is named, with a reason', unexplainedThesis, []);
  ok('nothing is missing its entry price — the trigger is what the product is held to', noEntry.length === 0, noEntry.length);

  // The families that WERE recovered must be complete, not merely improved.
  for (const t of ['kai_long', 'kai_short', 'kai_long_or_break', 'kai_long_pullback_or_break',
    'kai_orb_bearish', 'pattern', 'long_idea', 'short_idea']) {
    eq(`${t}: no card left without a stop`, stopByType[t] ?? 0, 0);
  }
  eq('kai_orb_bullish: only the two Good Friday picks remain', stopByType.kai_orb_bullish ?? 0, 2);
  eq('watchlist_swing: only ELAB remains', stopByType.watchlist_swing ?? 0, 1);
  eq('breakout: the 30 whose session cannot be identified remain', stopByType.breakout ?? 0, 30);
  ok('and the count of incomplete cards is down from 446 to 118',
    noStop.length === 118, noStop.length);

  // A recovered stop is never presented as something the scanner recorded.
  const recovered = rows.filter((r) => r.stop !== null
    && ['kai_orb_bullish', 'kai_orb_bearish', 'kai_long_or_break', 'kai_long_pullback_or_break'].includes(typeOf(r)));
  ok('every recovered family card now carries a stop and a target',
    recovered.length > 0 && recovered.every((r) => Array.isArray(r.targets) && r.targets.length > 0),
    recovered.length);

  // A pick nobody received is not history.
  eq('no shadow short is in the app — nothing was ever sent for one', tally(rows, typeOf).kai_short_shadow ?? 0, 0);

  // The description's provenance is always readable.
  const composed = rows.filter((r) => r.score_components?.thesis_source === 'composed_from_measurements');
  const published = rows.filter((r) => r.score_components?.thesis_source === 'published_sms');
  console.log(`  descriptions: ${published.length} as published to a subscriber, ${composed.length} composed from measurements, ${noThesis.length} blank`);
  ok('every card with a description says which kind it is',
    published.length + composed.length === rows.length - noThesis.length,
    { published: published.length, composed: composed.length, blank: noThesis.length, total: rows.length });
  ok('a composed description never claims a performance number',
    composed.every((r) => !/\b(wins?|won|profit|returns?|outperform\w*)\b/i.test(r.thesis_plain ?? '')));
}

/* ------------------------------------------------------------------ */
/* PART 2 — the push, end to end                                        */
/* ------------------------------------------------------------------ */

const KAI_URL = (process.env.KAI_SUPABASE_URL ?? '').replace(/\/+$/, '');
const KAI_WRITE = process.env.KAI_SUPABASE_WRITE_KEY ?? '';
const INTERNAL = process.env.INTERNAL_SECRET ?? '';

/** The proof's own pick. A real ticker with real levels, so the row is well formed. */
const PROOF = {
  ticker: 'ALNY',
  alert_type: 'kai_long',
  alert_price: 283.24,
  stop_price: 245.6,
  pattern_target: 322.39,
  breakout_score: 71,
  volume_ratio: 1.88,
  rsi_at_alert: 74.4,
  setup_label: 'BREAKOUT',
  detected_pattern: 'BREAKOUT',
  sector: 'PHARMACEUTICAL PREPARATIONS',
  sector_stance: 'neutral',
  market_session: 'premarket',
  // DELIBERATELY EMPTY. The Anthropic balance is empty, `generate_narrative`
  // degrades to '' rather than failing the send, and the card must still read.
  humanized_message: '',
};

let sourceRowId: number | null = null;
let setupId: string | null = null;
const createdUsers: string[] = [];
const savedPrefs: Record<string, unknown>[] = [];

async function kai(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${KAI_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KAI_WRITE, Authorization: `Bearer ${KAI_WRITE}`,
      'Content-Type': 'application/json', ...(init.headers ?? {}),
    },
  });
}

async function createActor(): Promise<string> {
  const url = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const res = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `swing5proof+${Date.now()}@cheatcode.test`,
      password: `proof-${Math.random().toString(36).slice(2)}-${Date.now()}`,
      email_confirm: true,
    }),
  });
  if (!res.ok) throw new Error(`create actor: ${res.status} ${await res.text()}`);
  const user = (await res.json()) as { id: string };
  createdUsers.push(user.id);
  for (let i = 0; i < 25; i += 1) {
    const { data } = await db.from('profiles').select('user_id').eq('user_id', user.id).maybeSingle();
    if (data) return user.id;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`no profile row appeared for ${user.id}`);
}

async function partTwo(): Promise<void> {
  console.log('\nPART 2 — Railway delivers straight into the app');
  if (!KAI_URL || !KAI_WRITE) throw new Error('KAI_SUPABASE_URL and KAI_SUPABASE_WRITE_KEY are required for part 2');
  if (!INTERNAL) throw new Error('INTERNAL_SECRET is required to authenticate the push');

  const sentAt = new Date().toISOString();
  const etDate = etDateFor(sentAt);
  const key = pickKey({ ticker: PROOF.ticker, sent_at: sentAt, alert_type: PROOF.alert_type });
  setupId = setupIdFor(key);
  console.log(`  proof pick ${key} → ${setupId}`);

  const existing = await db.from('setups').select('id').eq('id', setupId).maybeSingle();
  ok('the app does not already hold this pick', !existing.data, existing.data);

  // A recipient who will actually accept it. `min_grade` defaults to 'B' and
  // SWING-1 measured band C at 46% of all picks, so a proof that used the
  // default would be measuring the default rather than the fan-out.
  const actor = await createActor();
  const prior = await db.from('setup_alert_prefs').select('*').eq('user_id', actor).maybeSingle();
  if (prior.data) savedPrefs.push(prior.data as Record<string, unknown>);
  await db.from('setup_alert_prefs').upsert(
    { user_id: actor, enabled: true, min_grade: 'C', modes: [], intents: [] } as never,
    { onConflict: 'user_id' },
  );

  // ── the producer writes its row, exactly as broadcast_alerts does ──
  const ins = await kai('sent_alerts', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify([{
      ...PROOF,
      sent_at: sentAt,
      scan_metadata: {
        channel: 'swing5_proof',
        note: 'Written by apps/api/scripts/swing5-proof.ts and deleted by the same run.',
      },
    }]),
  });
  ok('the producer can write its pick to the source', ins.ok, ins.ok ? '' : await ins.text());
  if (!ins.ok) return;
  sourceRowId = ((await ins.json()) as { id: number }[])[0].id;

  // ── the push ──
  const push = async () => {
    const res = await fetch(`${API}/api/v1/internal/swing/push`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-secret': INTERNAL },
      body: JSON.stringify({
        source: 'swing5_proof',
        run_id: `swing5_proof:${sentAt}`,
        picks: [{ ticker: PROOF.ticker, alert_type: PROOF.alert_type, sent_at: sentAt }],
      }),
    });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };

  const first = await push();
  eq('the push is accepted', first.status, 200);
  const r1 = (first.body.receipts as Record<string, unknown>[])?.[0] ?? {};
  console.log(`  receipt: ${JSON.stringify(r1)}`);
  ok('the app could see the row in the source', r1.in_source === true, r1);
  ok('the pick landed', r1.landed === true, r1);
  ok('and this call is what wrote it', r1.created === true, r1);
  eq('it is ACTIVE, not history', r1.state, 'ready');
  ok('it carries the stop the producer published', Number(r1.stop) === PROOF.stop_price, r1.stop);
  ok('and at least one target', Number(r1.targets) >= 1, r1.targets);
  ok('and a description, with no model anywhere in the run', r1.has_description === true, r1);
  ok('the setup id is the same one the pull would have produced', r1.setup_id === setupId, r1.setup_id);

  const { data: row } = await db.from('setups')
    .select('state,stop,targets,thesis_plain,invalidation,score_components,quote_snapshot,intent,mode,grade_band')
    .eq('id', setupId).maybeSingle();
  ok('the row is in the database', Boolean(row));
  eq('state', row?.state, 'ready');
  eq('stop', Number(row?.stop), PROOF.stop_price);
  eq('the published target is the stored target',
    (row?.targets as { price: number }[])?.[0]?.price, PROOF.pattern_target);
  eq('the invalidation names the same number',
    Number((row?.invalidation as { price: number } | null)?.price), PROOF.stop_price);
  eq('the description was composed, not published',
    (row?.score_components as Record<string, unknown>)?.thesis_source, 'composed_from_measurements');
  console.log(`  card reads: ${row?.thesis_plain}`);
  ok('and it quotes the measurements', /1\.9x its average/.test(row?.thesis_plain ?? '')
    && /RSI was 74/.test(row?.thesis_plain ?? ''), row?.thesis_plain);
  ok('it is graded, so it can be announced', Boolean(row?.grade_band), row?.grade_band);
  eq('dated to today\'s ET session', (row?.quote_snapshot as Record<string, unknown>)?.et_date, etDate);

  const notes = await db.from('notifications').select('user_id,kind')
    .eq('kind', 'setup_published').eq('payload->>setup_id', setupId);
  const told = (notes.data ?? []).map((n) => n.user_id);
  ok('the fan-out reached a real recipient', told.includes(actor), told);
  console.log(`  fan-out: ${told.length} recipient(s), including the provisioned actor`);

  // ── arriving twice ──
  const second = await push();
  const r2 = (second.body.receipts as Record<string, unknown>[])?.[0] ?? {};
  ok('a second push finds it already there', r2.landed === true && r2.created === false, r2);
  eq('and tells nobody a second time', second.body.notified, 0);

  const cron = await fetch(`${API}/api/v1/internal/swing/ingest?since=${etDate}`, {
    headers: { 'x-internal-secret': INTERNAL },
  });
  const cronBody = (await cron.json()) as Record<string, unknown>;
  eq('the pull cron over the same window inserts nothing', cronBody.inserted, 0);
  eq('and notifies nobody', cronBody.notified, 0);

  const notes2 = await db.from('notifications').select('id')
    .eq('kind', 'setup_published').eq('payload->>setup_id', setupId);
  eq('still exactly one notification per recipient',
    (notes2.data ?? []).length, (notes.data ?? []).length);

  // ── the manifest is answered honestly when it is wrong ──
  const bogus = await fetch(`${API}/api/v1/internal/swing/push`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-secret': INTERNAL },
    body: JSON.stringify({
      source: 'swing5_proof',
      picks: [
        { ticker: 'ZZZZ', alert_type: 'kai_long', sent_at: sentAt },
        { ticker: PROOF.ticker, alert_type: 'kai_short_shadow', sent_at: sentAt },
      ],
    }),
  });
  const bogusBody = (await bogus.json()) as Record<string, unknown>;
  const bogusReceipt = (bogusBody.receipts as Record<string, unknown>[])?.[0] ?? {};
  ok('a pick the app cannot find in the source is reported as such, not as a silent zero',
    bogusReceipt.in_source === false && bogusReceipt.landed === false, bogusReceipt);
  ok('a family the app does not import is rejected by name',
    JSON.stringify(bogusBody.rejected ?? '').includes('kai_short_shadow'), bogusBody.rejected);

  const unauth = await fetch(`${API}/api/v1/internal/swing/push`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ picks: [] }),
  });
  eq('an unauthenticated push is not something this app does', unauth.status, 404);
}

async function cleanup(): Promise<void> {
  if (setupId) {
    await db.from('notifications').delete().eq('kind', 'setup_published').eq('payload->>setup_id', setupId);
    await db.from('setups').delete().eq('id', setupId);
  }
  if (sourceRowId !== null) {
    await kai(`sent_alerts?id=eq.${sourceRowId}`, { method: 'DELETE' });
    await kai(`alert_performance?alert_id=eq.${sourceRowId}`, { method: 'DELETE' });
  }
  for (const p of savedPrefs) await db.from('setup_alert_prefs').upsert(p as never, { onConflict: 'user_id' });
  for (const id of createdUsers) {
    await db.from('notifications').delete().eq('user_id', id);
    await db.from('setup_alert_prefs').delete().eq('user_id', id);
    const url = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
    await fetch(`${url}/auth/v1/admin/users/${id}`, {
      method: 'DELETE', headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
  }
  // Say what is gone, and PROVE the source row is gone — this one lives in the
  // live SMS product and a leftover would be a pick nobody sent.
  if (sourceRowId !== null) {
    const check = await kai(`sent_alerts?id=eq.${sourceRowId}&select=id`);
    const left = (await check.json()) as unknown[];
    ok('the proof row is gone from the SMS product', left.length === 0, left);
  }
  if (setupId) {
    const { data } = await db.from('setups').select('id').eq('id', setupId).maybeSingle();
    ok('and the setup it created is gone from the app', !data);
  }
  console.log(`  cleaned up: the source row, the setup, its notifications, and ${createdUsers.length} provisioned actor(s)`);
}

async function main(): Promise<void> {
  await partOne();
  if (!process.argv.includes('--accounting-only')) await partTwo();
}

main()
  .then(async () => { if (!process.argv.includes('--accounting-only')) await cleanup(); },
    async (e) => {
      fail += 1;
      console.error('\nPROOF THREW:', e instanceof Error ? e.stack ?? e.message : e);
      await cleanup().catch(() => {});
    })
  .finally(() => {
    console.log(`\n${pass} passed, ${fail} failed\n`);
    process.exit(fail === 0 ? 0 : 1);
  });
