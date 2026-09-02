/**
 * SWING-3 GATE — the fan-out against the real database.
 *
 *   cd apps/api && npx tsx scripts/swing-publish-proof.ts
 *
 * `swing-publish-test.ts` proves the decisions. This proves the RUN: real
 * `setups` rows, the real `setup_alert_prefs` table, the real `notify()` and
 * the real push queue behind it. It answers the two questions a unit test
 * cannot:
 *
 *   1. does the gate actually hold when the ids handed in include yesterday's
 *      pick and a short — i.e. is the back catalogue really unreachable;
 *   2. does a second run of the same morning notify anyone twice.
 *
 * It writes three synthetic setups and its own prefs rows, and deletes every
 * row it created on the way out — including on failure.
 */
import { serviceClient } from '../src/lib/db.ts';
import { publishSetups } from '../src/lib/swing/publish.ts';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
for (const line of readFileSync(resolve(HERE, '../.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

let pass = 0;
let fail = 0;
function ok(name: string, cond: unknown, detail?: unknown): void {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail === undefined ? '' : `\n        ${JSON.stringify(detail)}`}`); }
}
const eq = (n: string, got: unknown, want: unknown) =>
  ok(n, JSON.stringify(got) === JSON.stringify(want), { got, want });

const TODAY = '2099-01-05';          // far future: cannot collide with ingested data
const YESTERDAY = '2099-01-04';
const SYM = 'SPY';
const ID = (n: number) => `dddddddd-0000-4000-8000-00000000000${n}`;
const TODAY_LONG = ID(1);
const YESTERDAY_LONG = ID(2);
const TODAY_SHORT = ID(3);

const db = serviceClient();
const savedPrefs: Record<string, unknown>[] = [];
let actors: { id: string; label: string }[] = [];

function setupRow(id: string, over: Record<string, unknown>): Record<string, unknown> {
  return {
    id, symbol: SYM, mode: 'swing', intent: 'buy_to_open', state: 'ready',
    score: 82, grade_band: 'B', grade_display: 'B+',
    thesis_plain: 'A synthetic pick written by swing-publish-proof.',
    quote_snapshot: { symbol: SYM, et_date: TODAY, origin: 'swing_publish_proof' },
    valid_until: '2099-02-01', created_at: '2099-01-05T13:00:00.000Z',
    ...over,
  };
}

async function main(): Promise<void> {
  /* ---- actors: five real profiles, five different answers --------------- */
  const { data: profiles, error: pe } = await db.from('profiles').select('user_id').limit(5);
  if (pe || !profiles || profiles.length < 5) throw new Error(`need 5 profiles: ${pe?.message ?? profiles?.length}`);
  actors = (profiles as { user_id: string }[]).map((p, i) => ({
    id: p.user_id,
    label: ['defaults', 'muted', 'wants_A_only', 'excludes_SPY', 'day_trade_only'][i],
  }));

  for (const a of actors) {
    const { data } = await db.from('setup_alert_prefs').select('*').eq('user_id', a.id).maybeSingle();
    if (data) savedPrefs.push(data as Record<string, unknown>);
  }

  const wanted: Record<string, Record<string, unknown>> = {
    defaults: { enabled: true, min_grade: 'B', modes: ['day_trade', 'swing'], intents: ['buy_to_open', 'sell_short'], symbols_include: null, symbols_exclude: null },
    muted: { enabled: false },
    wants_A_only: { enabled: true, min_grade: 'A' },
    excludes_SPY: { enabled: true, min_grade: 'B', symbols_exclude: [SYM] },
    day_trade_only: { enabled: true, min_grade: 'B', modes: ['day_trade'] },
  };
  for (const a of actors) {
    const { error } = await db.from('setup_alert_prefs').upsert(
      { user_id: a.id, ...wanted[a.label] } as never, { onConflict: 'user_id' }
    );
    if (error) throw new Error(`prefs upsert ${a.label}: ${error.message}`);
  }

  /* ---- three setups: one publishable, two that must not escape ---------- */
  const { error: se } = await db.from('setups').upsert([
    setupRow(TODAY_LONG, {}),
    setupRow(YESTERDAY_LONG, { quote_snapshot: { symbol: SYM, et_date: YESTERDAY, origin: 'swing_publish_proof' } }),
    setupRow(TODAY_SHORT, { intent: 'sell_short', state: 'expired', score: null, grade_band: null, grade_display: null }),
  ] as never, { onConflict: 'id' });
  if (se) throw new Error(`setups upsert: ${se.message}`);

  const before = await countNotifications();

  /* ---- run 1 ------------------------------------------------------------ */
  console.log('\nRun 1 — three ids in, one of them announceable');
  const r1 = await publishSetups({ ids: [TODAY_LONG, YESTERDAY_LONG, TODAY_SHORT], todayEt: TODAY });
  console.log(`  considered=${r1.considered} published=${r1.published} notified=${r1.notified}`);
  console.log(`  refusals: ${JSON.stringify(r1.refusals)}`);

  eq('all three were considered', r1.considered, 3);
  eq('exactly one got past the gate', r1.published, 1);
  eq("yesterday's pick was refused by date", r1.refusals.not_todays_pick, 1);
  ok('the short was refused before anything else could see it',
    (r1.refusals.not_ready ?? 0) + (r1.refusals.not_a_long ?? 0) === 1, r1.refusals);
  ok('nobody was notified about the other two',
    r1.perSetup.filter((s) => s.id !== TODAY_LONG).every((s) => s.recipients === 0), r1.perSetup);

  const rows1 = await notificationsFor(TODAY_LONG);
  ok('rows were actually written', rows1.size > 0, rows1.size);
  eq('and only for the setup that passed', (await notificationsFor(YESTERDAY_LONG)).size, 0);
  eq('none for the short', (await notificationsFor(TODAY_SHORT)).size, 0);
  eq('the report matches what landed in the table', r1.notified, rows1.size);

  const got = (label: string) => rows1.has(actors.find((a) => a.label === label)!.id);
  ok('the user on defaults was told', got('defaults'));
  ok('the muted user was not', !got('muted'));
  ok('the user who only wants A-band was not, for a B', !got('wants_A_only'));
  ok('the user who excluded the symbol was not', !got('excludes_SPY'));
  ok('the day-trade-only user was not', !got('day_trade_only'));

  const r = rows1.get(actors[0].id)!;
  eq('the row routes to the setup', (r.payload as Record<string, unknown>).route, `/setup/${TODAY_LONG}`);
  eq('and is grouped as a change', (r.payload as Record<string, unknown>).group, 'changes');
  eq('with the kind the push policy caps', r.kind, 'setup_published');

  /* ---- run 2: the same morning, again ---------------------------------- */
  console.log('\nRun 2 — the identical call, as a cron retry would make it');
  const r2 = await publishSetups({ ids: [TODAY_LONG, YESTERDAY_LONG, TODAY_SHORT], todayEt: TODAY });
  console.log(`  notified=${r2.notified} already_notified=${r2.refusals.already_notified ?? 0}`);
  eq('nobody is told twice', r2.notified, 0);
  eq('and every one of them is named as already notified', r2.refusals.already_notified, rows1.size);
  eq('the table did not grow', (await notificationsFor(TODAY_LONG)).size, rows1.size);

  /* ---- the empty call --------------------------------------------------- */
  const r3 = await publishSetups({ ids: [], todayEt: TODAY });
  eq('an ingest that created nothing announces nothing', r3.notified, 0);
  eq('the net change to notifications is run 1 and nothing else',
    (await countNotifications()) - before, rows1.size);

  console.log(`\n  ${rows1.size} of the ${await profileCount()} profiles on this stack were told.`);
}

async function notificationsFor(setupId: string): Promise<Map<string, { kind: string; payload: unknown }>> {
  const { data, error } = await db
    .from('notifications')
    .select('user_id,kind,payload')
    .eq('kind', 'setup_published')
    .eq('payload->>setup_id', setupId);
  if (error) throw new Error(`read notifications: ${error.message}`);
  const out = new Map<string, { kind: string; payload: unknown }>();
  for (const r of (data ?? []) as { user_id: string; kind: string; payload: unknown }[]) out.set(r.user_id, r);
  return out;
}
async function countNotifications(): Promise<number> {
  const { count } = await db.from('notifications').select('id', { count: 'exact', head: true });
  return count ?? 0;
}
async function profileCount(): Promise<number> {
  const { count } = await db.from('profiles').select('user_id', { count: 'exact', head: true });
  return count ?? 0;
}

async function cleanup(): Promise<void> {
  const ids = [TODAY_LONG, YESTERDAY_LONG, TODAY_SHORT];
  for (const id of ids) {
    await db.from('notifications').delete().eq('kind', 'setup_published').eq('payload->>setup_id', id);
  }
  await db.from('setups').delete().in('id', ids);
  for (const p of savedPrefs) {
    await db.from('setup_alert_prefs').upsert(p as never, { onConflict: 'user_id' });
  }
  console.log('  cleaned up: synthetic setups, their notifications, and the borrowed prefs rows');
}

main()
  .then(cleanup, async (e) => {
    fail += 1;
    console.error('\nPROOF THREW:', e instanceof Error ? e.message : e);
    await cleanup().catch(() => {});
  })
  .finally(() => {
    console.log(`\n${pass} passed, ${fail} failed\n`);
    process.exit(fail === 0 ? 0 : 1);
  });
