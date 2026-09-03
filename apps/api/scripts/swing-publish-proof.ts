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
const ENV_FILE = process.env.ENV_FILE ?? '.env.local';
for (const line of readFileSync(resolve(HERE, `../${ENV_FILE}`), 'utf8').split('\n')) {
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
/** 0028 — band C is 46% of every pick, and the default floor used to hide it. */
const TODAY_LONG_C = ID(4);

const db = serviceClient();
const savedPrefs: Record<string, unknown>[] = [];
const createdUsers: string[] = [];
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
  /* ---- actors: seven profiles, seven different answers ------------------ */
  // Five may be BORROWED from real accounts, because a proof that only ever
  // sees synthetic prefs is not testing the prefs a real user carries. The last
  // two must be PROVISIONED, because what they prove is what an untouched row
  // and a missing row do — and neither can be arranged on somebody else's
  // account without destroying the preference this proof promises to restore.
  const BORROWABLE = ['chose_B_explicitly', 'muted', 'wants_A_only', 'excludes_SPY', 'day_trade_only'];
  const PROVISIONED = ['never_touched', 'no_prefs_row'];
  const LABELS = [...BORROWABLE, ...PROVISIONED];
  const { data: profiles, error: pe } = await db.from('profiles').select('user_id').limit(BORROWABLE.length);
  if (pe) throw new Error(`read profiles: ${pe.message}`);
  const existing = (profiles as { user_id: string }[]).map((p) => p.user_id);
  // A stack that does not have five people on it yet still has to be able to
  // prove the gate — so the proof PROVISIONS the actors it is short of, and
  // deletes them again on the way out.
  while (existing.length < BORROWABLE.length) existing.push(await createActor(existing.length));
  for (let i = 0; i < PROVISIONED.length; i += 1) existing.push(await createActor(100 + i));
  actors = existing.map((id, i) => ({ id, label: LABELS[i] }));

  for (const a of actors) {
    const { data } = await db.from('setup_alert_prefs').select('*').eq('user_id', a.id).maybeSingle();
    if (data) savedPrefs.push(data as Record<string, unknown>);
  }

  // `never_touched` and `no_prefs_row` are DELIBERATELY ABSENT from this map.
  // The first keeps exactly the row 0013's signup trigger wrote, which is the
  // whole point of it; the second has that row deleted below. Writing prefs for
  // either would be the proof arranging the answer it wants.
  //
  // `chose_B_explicitly` is what `defaults` used to be. Since 0028 the floor
  // nobody chose is C, so an explicit B is now a CHOICE and has to keep being
  // honoured — the default moved, the floor did not go away.
  const wanted: Record<string, Record<string, unknown>> = {
    chose_B_explicitly: { enabled: true, min_grade: 'B', modes: ['day_trade', 'swing'], intents: ['buy_to_open', 'sell_short'], symbols_include: null, symbols_exclude: null },
    muted: { enabled: false },
    wants_A_only: { enabled: true, min_grade: 'A' },
    // These two test their own axis, so their grade floor is left unset.
    excludes_SPY: { enabled: true, min_grade: null, symbols_exclude: [SYM] },
    day_trade_only: { enabled: true, min_grade: null, modes: ['day_trade'] },
  };
  for (const a of actors) {
    if (!wanted[a.label]) continue;
    const { error } = await db.from('setup_alert_prefs').upsert(
      { user_id: a.id, ...wanted[a.label] } as never, { onConflict: 'user_id' }
    );
    if (error) throw new Error(`prefs upsert ${a.label}: ${error.message}`);
  }
  const noPrefsRow = actors.find((a) => a.label === 'no_prefs_row')!;
  await db.from('setup_alert_prefs').delete().eq('user_id', noPrefsRow.id);

  // The untouched row must actually BE untouched, or the assertion below is
  // measuring this script rather than the schema.
  const untouched = actors.find((a) => a.label === 'never_touched')!;
  const { data: virgin } = await db.from('setup_alert_prefs')
    .select('min_grade,updated_at').eq('user_id', untouched.id).maybeSingle();
  eq('the signup trigger writes a prefs row nobody has narrowed', virgin?.updated_at ?? null, null);
  eq('and 0028 makes its floor C, not B', virgin?.min_grade, 'C');
  eq('while a profile with no row at all has no preference to read',
    (await db.from('setup_alert_prefs').select('user_id').eq('user_id', noPrefsRow.id).maybeSingle()).data, null);

  /* ---- three setups: one publishable, two that must not escape ---------- */
  const { error: se } = await db.from('setups').upsert([
    setupRow(TODAY_LONG, {}),
    setupRow(YESTERDAY_LONG, { quote_snapshot: { symbol: SYM, et_date: YESTERDAY, origin: 'swing_publish_proof' } }),
    setupRow(TODAY_SHORT, { intent: 'sell_short', state: 'expired', score: null, grade_band: null, grade_display: null }),
    setupRow(TODAY_LONG_C, { score: 41, grade_band: 'C', grade_display: 'C+' }),
  ] as never, { onConflict: 'id' });
  if (se) throw new Error(`setups upsert: ${se.message}`);

  const before = await countNotifications();

  /* ---- run 1 ------------------------------------------------------------ */
  console.log('\nRun 1 — three ids in, one of them announceable');
  const r1 = await publishSetups({ ids: [TODAY_LONG, YESTERDAY_LONG, TODAY_SHORT, TODAY_LONG_C], todayEt: TODAY });
  console.log(`  considered=${r1.considered} published=${r1.published} notified=${r1.notified}`);
  console.log(`  refusals: ${JSON.stringify(r1.refusals)}`);

  eq('all four were considered', r1.considered, 4);
  eq('two got past the gate — the B and the C', r1.published, 2);
  eq("yesterday's pick was refused by date", r1.refusals.not_todays_pick, 1);
  ok('the short was refused before anything else could see it',
    (r1.refusals.not_ready ?? 0) + (r1.refusals.not_a_long ?? 0) === 1, r1.refusals);
  ok('nobody was notified about yesterday or the short',
    r1.perSetup.filter((s) => s.id === YESTERDAY_LONG || s.id === TODAY_SHORT)
      .every((s) => s.recipients === 0), r1.perSetup);

  const rows1 = await notificationsFor(TODAY_LONG);
  ok('rows were actually written', rows1.size > 0, rows1.size);
  eq('and only for the setup that passed', (await notificationsFor(YESTERDAY_LONG)).size, 0);
  eq('none for the short', (await notificationsFor(TODAY_SHORT)).size, 0);
  const rowsC = await notificationsFor(TODAY_LONG_C);
  eq('the report matches what landed in the table', r1.notified, rows1.size + rowsC.size);

  const got = (label: string) => rows1.has(actors.find((a) => a.label === label)!.id);
  ok('the user who explicitly chose B was told about the B', got('chose_B_explicitly'));
  ok('the muted user was not', !got('muted'));
  ok('the user who only wants A-band was not, for a B', !got('wants_A_only'));
  ok('the user who excluded the symbol was not', !got('excludes_SPY'));
  ok('the day-trade-only user was not', !got('day_trade_only'));

  /* ---- 0028: the C reaches the people who never chose a floor ----------- */
  console.log('\n  0028 — band C is 46% of every pick, and it now reaches a default account');
  const gotC = (label: string) => rowsC.has(actors.find((a) => a.label === label)!.id);
  ok('a C-band pick reaches the account whose prefs row nobody has ever touched',
    gotC('never_touched'), [...rowsC.keys()]);
  ok('and the account with no prefs row at all — an absent row is not silence',
    gotC('no_prefs_row'), [...rowsC.keys()]);
  ok('but NOT the person who explicitly asked for B and better',
    !gotC('chose_B_explicitly'));
  ok('nor the person who asked for A only', !gotC('wants_A_only'));
  ok('nor the muted account', !gotC('muted'));
  eq('and the refusals name the reason rather than swallowing it',
    (r1.refusals.below_min_grade ?? 0) >= 2, true);
  const cRow = rowsC.get(actors.find((a) => a.label === 'never_touched')!.id)!;
  ok('the C notification carries no letter in its copy — a band is not a forecast',
    !/\bC\+?\b/.test(String((cRow.payload as Record<string, unknown>).title ?? '')
      + String((cRow.payload as Record<string, unknown>).body ?? '')),
    cRow.payload);

  const r = rows1.get(actors[0].id)!;
  eq('the row routes to the setup', (r.payload as Record<string, unknown>).route, `/setup/${TODAY_LONG}`);
  eq('and is grouped as a change', (r.payload as Record<string, unknown>).group, 'changes');
  eq('with the kind the push policy caps', r.kind, 'setup_published');

  /* ---- run 2: the same morning, again ---------------------------------- */
  console.log('\nRun 2 — the identical call, as a cron retry would make it');
  const r2 = await publishSetups({ ids: [TODAY_LONG, YESTERDAY_LONG, TODAY_SHORT, TODAY_LONG_C], todayEt: TODAY });
  console.log(`  notified=${r2.notified} already_notified=${r2.refusals.already_notified ?? 0}`);
  eq('nobody is told twice', r2.notified, 0);
  eq('and every one of them is named as already notified',
    r2.refusals.already_notified, rows1.size + rowsC.size);
  eq('the table did not grow', (await notificationsFor(TODAY_LONG)).size, rows1.size);
  eq('nor for the C', (await notificationsFor(TODAY_LONG_C)).size, rowsC.size);

  /* ---- the empty call --------------------------------------------------- */
  const r3 = await publishSetups({ ids: [], todayEt: TODAY });
  eq('an ingest that created nothing announces nothing', r3.notified, 0);
  eq('the net change to notifications is run 1 and nothing else',
    (await countNotifications()) - before, rows1.size + rowsC.size);

  console.log(
    `\n  of ${await profileCount()} profiles on this stack: ${rows1.size} were told about `
    + `the B, ${rowsC.size} about the C. Before 0028 the C would have reached nobody.`);
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

/**
 * One throwaway account, and the `profiles` row the 0013 trigger builds from
 * it. Recorded in `createdUsers` so `cleanup` can remove it — a proof that
 * leaves accounts behind on a production stack is not a proof, it is litter.
 */
async function createActor(n: number): Promise<string> {
  const url = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const res = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `swingproof+${Date.now()}-${n}@cheatcode.test`,
      password: `proof-${Math.random().toString(36).slice(2)}-${Date.now()}`,
      email_confirm: true,
    }),
  });
  if (!res.ok) throw new Error(`create actor ${n}: ${res.status} ${await res.text()}`);
  const user = (await res.json()) as { id: string };
  createdUsers.push(user.id);
  // The profile is written by a trigger, so it lands a moment after the user.
  for (let i = 0; i < 25; i += 1) {
    const { data } = await db.from('profiles').select('user_id').eq('user_id', user.id).maybeSingle();
    if (data) return user.id;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`actor ${n}: no profile row appeared for ${user.id}`);
}

async function deleteActor(id: string): Promise<void> {
  const url = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  await fetch(`${url}/auth/v1/admin/users/${id}`, {
    method: 'DELETE',
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
}

async function cleanup(): Promise<void> {
  const ids = [TODAY_LONG, YESTERDAY_LONG, TODAY_SHORT, TODAY_LONG_C];
  for (const id of ids) {
    await db.from('notifications').delete().eq('kind', 'setup_published').eq('payload->>setup_id', id);
  }
  await db.from('setups').delete().in('id', ids);
  for (const p of savedPrefs) {
    await db.from('setup_alert_prefs').upsert(p as never, { onConflict: 'user_id' });
  }
  for (const id of createdUsers) {
    await db.from('notifications').delete().eq('user_id', id);
    await db.from('setup_alert_prefs').delete().eq('user_id', id);
    await deleteActor(id);
  }
  console.log(
    `  cleaned up: synthetic setups, their notifications, the borrowed prefs rows`
    + `${createdUsers.length ? `, and ${createdUsers.length} provisioned actor(s)` : ''}`,
  );
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
