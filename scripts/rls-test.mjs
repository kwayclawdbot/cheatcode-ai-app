#!/usr/bin/env node
/**
 * scripts/rls-test.mjs
 *
 * Verification gate from docs/BUILD-BRIEF-v1-slice.md:
 *   "RLS test: user A cannot select user B's profile/accounts (write a small
 *    script using two anon-signed users)."
 *
 * Creates two users through the local GoTrue admin API (service role), signs
 * each in, then asserts with each user's own JWT that:
 *   - A cannot read B's profiles / accounts / alerts rows (and vice versa)
 *   - A CAN read its own rows (so we know the assertions above are meaningful)
 *   - a direct client insert into `messages` is rejected (api-app writes only)
 *
 * Round 6 (0025) adds:
 *   - the admin + CRM wall: a signed-in NON-STAFF user reads nothing from any of
 *     staff_members / crm_people / crm_identities / crm_events / crm_notes /
 *     crm_segments / invites / invite_redemptions / admin_audit_log / sync_runs,
 *     nor from the three funnel views, INCLUDING the crm_people row about them
 *   - staff_members is not readable or writable by its own holder, `profiles`
 *     (which a client CAN patch) carries no staff column, and set_staff_role
 *     refuses any actor who is not an active owner
 *   - none of the eight admin RPCs is executable with a user JWT or the anon key
 *   - invites: one call grants the entitlement, writes the redemption, moves the
 *     person and audits; a retry is the same redemption; expired / revoked /
 *     exhausted / unknown each say which; and two SIMULTANEOUS redemptions of a
 *     one-seat invite leave exactly one grant
 *   - unique(kind, value) refuses a second person for one identity;
 *     unique(source, external_id) makes a re-ingest create zero rows; merge
 *     records what it moved and unmerge moves exactly that back
 *   - admin_audit_log cannot be updated, deleted or truncated by service_role
 *
 * Round 5 (0024) adds:
 *   - push_subscriptions: owner select/delete only, no client INSERT or UPDATE
 *     anywhere; A cannot read, update or delete B's row, and cannot register a
 *     device in B's name
 *   - register_push_subscription owns the (transport, handle) upsert:
 *     re-registering a token that belongs to ANOTHER user moves that same row to
 *     the caller and leaves it active (the device changed hands), and
 *     re-registering a revoked token re-activates it
 *   - revoke_push_subscription is owner-only and answers identically for a row
 *     that is not yours and a row that does not exist
 *   - notification_deliveries is service-role only: no policy at all, so the
 *     owner of the notification still cannot read its ticket ids
 *   - notification_prefs.push_enabled / .categories are owner-read, owner-write
 *
 * Round 4 (0021) adds:
 *   - chart_annotations: owner-scoped (Kai-provenance rows included), client
 *     INSERT refused, client UPDATE limited to status hidden/deleted on own rows
 *   - circles: the seeded setup rooms are DISCOVERABLE by a non-member while the
 *     thread stays members-only; open_setup_circle is idempotent; create_circle
 *     makes the creator a moderator; close_expired_circles restricts posting and
 *     reports each id once; none of the three is client-callable
 *   - conversations: title/pinned/last_message_at are owner-read, api-app-write,
 *     and the ilike search never crosses users
 *   - alerts: lifecycle_state drives the generated `tab`, snapshots and version
 *     are readable by the owner only, alert_events is append-only
 *   - rule_adherence_v returns exactly the caller's own sessions/followed counts
 *
 * Round 3 (0020) adds:
 *   - the paper-execution objects (trade_plans / orders / order_events / fills /
 *     positions) are owner-isolated in BOTH directions
 *   - no client may INSERT into orders or positions
 *   - create_plan / plan_action / submit_paper_order / apply_paper_tick /
 *     close_position_prepare are NOT executable by a client JWT (the function
 *     grant floor, SCHEMA-NOTES gap 2.7), but work as service_role
 *   - daily_risk_v returns exactly the caller's own row
 *
 * Round 2 (0017/0018) adds:
 *   - watchlists/watchlist_items are owner-isolated in BOTH directions, while
 *     the owner keeps client-direct insert/update/delete (01 §13 row 1)
 *   - A cannot post to a room by direct insert, even after joining it
 *   - join_core_room refuses a `setup` room, is idempotent, and refuses to act
 *     for another user; post_room_message is not client-callable at all
 *
 * No dependencies - plain fetch against GoTrue + PostgREST.
 *
 * Usage:
 *   node scripts/rls-test.mjs
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/rls-test.mjs
 * Defaults are the `supabase status` values for the local stack.
 */

const URL_BASE = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const ANON =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

let failures = 0;
const pass = (m) => console.log(`  PASS  ${m}`);
const fail = (m, detail) => {
  failures++;
  console.log(`  FAIL  ${m}${detail ? `\n        ${detail}` : ''}`);
};
const assert = (cond, m, detail) => (cond ? pass(m) : fail(m, detail));

async function jsonOrText(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// ---------------------------------------------------------------- admin API
async function createUser(email, password) {
  const res = await fetch(`${URL_BASE}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const body = await jsonOrText(res);
  if (!res.ok) throw new Error(`create user ${email} failed: ${res.status} ${JSON.stringify(body)}`);
  return body.id;
}

async function deleteUser(id) {
  await fetch(`${URL_BASE}/auth/v1/admin/users/${id}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  }).catch(() => {});
}

async function signIn(email, password) {
  const res = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await jsonOrText(res);
  if (!res.ok) throw new Error(`sign in ${email} failed: ${res.status} ${JSON.stringify(body)}`);
  return body.access_token;
}

// ------------------------------------------------------------- PostgREST
function rest(token) {
  return async (path, init = {}) => {
    const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    return { status: res.status, body: await jsonOrText(res) };
  };
}

async function serviceInsert(table, row) {
  const res = await fetch(`${URL_BASE}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  });
  const body = await jsonOrText(res);
  if (!res.ok) throw new Error(`service insert into ${table} failed: ${res.status} ${JSON.stringify(body)}`);
  return body[0];
}

async function serviceGet(path) {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  });
  return jsonOrText(res);
}

async function serviceDelete(path) {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  });
  return { status: res.status, body: await jsonOrText(res) };
}

// the api-app path: RPCs are granted to service_role
async function serviceRpc(fn, args) {
  const res = await fetch(`${URL_BASE}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  return { status: res.status, body: await jsonOrText(res) };
}

// temp rooms from a crashed previous run would break the "3 core rooms" and
// "no message row" assertions below.
async function sweepTempRooms() {
  const rooms = await serviceGet('rooms?slug=like.rls-tmp-%25&select=id');
  if (!Array.isArray(rooms)) return;
  for (const r of rooms) await dropRoom(r.id);
}

async function dropRoom(id) {
  if (!id) return;
  await serviceDelete(`messages?room_id=eq.${id}`);
  await serviceDelete(`room_members?room_id=eq.${id}`);
  await serviceDelete(`rooms?id=eq.${id}`);
}

// --------------------------------------------------------------------- run
const stamp = Date.now();
const A = { email: `rls-a-${stamp}@example.com`, password: `pw-a-${stamp}!A1` };
const B = { email: `rls-b-${stamp}@example.com`, password: `pw-b-${stamp}!B1` };

let createdIds = [];
const liveShowIds = [];
const notificationIds = [];
const crmPeopleIds = [];
const inviteIds = [];
let tmpCoreRoom = null;
let tmpSetupRoom = null;
let amdCircle = null;      // opened by open_setup_circle during the run
let userCircle = null;     // opened by create_circle during the run

// the AMD seed setup carries no annotations.pattern, so its circle is the
// '<SYM> Setup' fallback name; META/NVDA are already opened by the seed.
const AMD_SETUP = '11111111-1111-4111-8111-000000000003';

try {
  console.log(`RLS test against ${URL_BASE}\n`);

  await sweepTempRooms();

  A.id = await createUser(A.email, A.password);
  B.id = await createUser(B.email, B.password);
  createdIds = [A.id, B.id];
  console.log(`user A = ${A.id}`);
  console.log(`user B = ${B.id}\n`);

  A.token = await signIn(A.email, A.password);
  B.token = await signIn(B.email, B.password);
  const asA = rest(A.token);
  const asB = rest(B.token);

  // The on-auth-user-created trigger provisions profile + paper account.
  const bAccounts = await serviceGet(`accounts?user_id=eq.${B.id}&select=id`);
  if (!Array.isArray(bAccounts) || bAccounts.length !== 1) {
    throw new Error(`expected 1 provisioned paper account for B, got ${JSON.stringify(bAccounts)}`);
  }

  // Give each user one alert (api-app path = service role).
  for (const u of [A, B]) {
    await serviceInsert('alerts', {
      user_id: u.id,
      status: 'draft',
      natural_language: 'Watch 504 for me',
      condition: { type: 'price_cross', level: 504, hold: true },
      data_dependency: { symbol: 'META', field: 'price', freshness: 'delayed' },
    });
  }

  console.log('own rows are visible (control):');
  {
    const p = await asA(`profiles?select=user_id`);
    assert(Array.isArray(p.body) && p.body.length === 1 && p.body[0].user_id === A.id,
      'A sees exactly its own profiles row', JSON.stringify(p.body));

    const acc = await asA(`accounts?select=id,user_id`);
    assert(Array.isArray(acc.body) && acc.body.length === 1 && acc.body[0].user_id === A.id,
      'A sees exactly its own accounts row', JSON.stringify(acc.body));

    const al = await asA(`alerts?select=id,user_id`);
    assert(Array.isArray(al.body) && al.body.length === 1 && al.body[0].user_id === A.id,
      'A sees exactly its own alerts row', JSON.stringify(al.body));
  }

  console.log("\nA cannot read B's rows:");
  for (const [table, label] of [['profiles', 'profiles'], ['accounts', 'accounts'], ['alerts', 'alerts']]) {
    const r = await asA(`${table}?user_id=eq.${B.id}&select=*`);
    assert(Array.isArray(r.body) && r.body.length === 0,
      `A gets 0 rows from ${label} filtered to B`, `status ${r.status} body ${JSON.stringify(r.body)}`);
  }

  console.log("\nB cannot read A's rows (symmetric):");
  for (const [table, label] of [['profiles', 'profiles'], ['accounts', 'accounts'], ['alerts', 'alerts']]) {
    const r = await asB(`${table}?user_id=eq.${A.id}&select=*`);
    assert(Array.isArray(r.body) && r.body.length === 0,
      `B gets 0 rows from ${label} filtered to A`, `status ${r.status} body ${JSON.stringify(r.body)}`);
  }

  console.log("\nA cannot write B's rows:");
  {
    const r = await asA(`profiles?user_id=eq.${B.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ display_name: 'hijacked' }),
    });
    const changed = Array.isArray(r.body) && r.body.length > 0;
    assert(!changed, 'A cannot update B\'s profile', `status ${r.status} body ${JSON.stringify(r.body)}`);

    const still = await serviceGet(`profiles?user_id=eq.${B.id}&select=display_name`);
    assert(still[0]?.display_name !== 'hijacked', "B's display_name unchanged", JSON.stringify(still));
  }

  console.log('\nmessages are api-app write only:');
  {
    const room = await serviceGet('rooms?slug=eq.day-trade&select=id');
    const roomId = room[0]?.id;
    if (!roomId) throw new Error('core room day-trade missing');

    const r = await asA('messages', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ room_id: roomId, user_id: A.id, seq: 1, kind: 'text', body: 'client insert attempt' }),
    });
    assert(r.status >= 400, 'client insert into messages is rejected', `status ${r.status} body ${JSON.stringify(r.body)}`);

    const rows = await serviceGet(`messages?room_id=eq.${roomId}&select=id`);
    assert(Array.isArray(rows) && rows.length === 0, 'no message row was created', JSON.stringify(rows));
  }

  console.log('\nglobal reference data IS readable (not over-locked):');
  {
    const s = await asA('setups?select=symbol&order=score.desc');
    assert(Array.isArray(s.body) && s.body.length === 4, 'A reads the 4 seed setups', JSON.stringify(s.body));
    const rooms = await asA('rooms?select=slug&type=eq.core');
    assert(Array.isArray(rooms.body) && rooms.body.length === 3, 'A reads the 3 core rooms', `n=${rooms.body?.length}`);
    const flags = await asA('entitlement_flags?select=tier,flag');
    assert(Array.isArray(flags.body) && flags.body.length === 14, 'A reads entitlement flags (12 + the two circles_create rows)', `n=${flags.body?.length}`);
  }

  console.log('\nrisk_policies are owner-read / api-app-write:');
  {
    const own = await asA('risk_policies?select=daily_loss_cap_usd');
    assert(Array.isArray(own.body) && own.body.length === 1, 'A reads its own risk policy', JSON.stringify(own.body));
    const w = await asA(`risk_policies?user_id=eq.${A.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ daily_loss_cap_usd: 999999 }),
    });
    const changed = Array.isArray(w.body) && w.body.length > 0;
    assert(!changed, 'A cannot write its own risk policy directly', `status ${w.status} body ${JSON.stringify(w.body)}`);
  }

  // ============================================================ watchlists
  // 0017: owner select + owner WRITE, client-direct (01 §13 row 1).
  console.log('\nwatchlists are owner-isolated (client-direct writes):');
  let aWatchlistId = null;
  {
    const mine = await asA('watchlists?select=id,user_id,name,position');
    assert(
      Array.isArray(mine.body) && mine.body.length === 1 && mine.body[0].user_id === A.id,
      'A sees exactly its own auto-provisioned watchlist',
      JSON.stringify(mine.body),
    );
    aWatchlistId = mine.body?.[0]?.id ?? null;
    assert(mine.body?.[0]?.name === 'Watchlist', "the default list is named 'Watchlist'", JSON.stringify(mine.body));

    const bMine = await asB('watchlists?select=id,user_id');
    assert(
      Array.isArray(bMine.body) && bMine.body.length === 1 && bMine.body[0].user_id === B.id,
      'B sees exactly its own watchlist',
      JSON.stringify(bMine.body),
    );

    // A writes its own list directly with its own JWT (this is the point of row 1)
    const ins = await asA('watchlist_items', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ watchlist_id: aWatchlistId, symbol: 'meta', note: 'from setup detail' }),
    });
    assert(ins.status === 201, 'A can insert into its own watchlist (client-direct)', `status ${ins.status} body ${JSON.stringify(ins.body)}`);
    assert(ins.body?.[0]?.symbol === 'META', 'symbol is normalised to upper case', JSON.stringify(ins.body));

    const readOwn = await asA(`watchlist_items?select=symbol&watchlist_id=eq.${aWatchlistId}`);
    assert(Array.isArray(readOwn.body) && readOwn.body.length === 1, 'A reads its own watchlist item', JSON.stringify(readOwn.body));

    // a client-direct UPDATE also has to fire the set_updated_at trigger
    const rename = await asA(`watchlists?id=eq.${aWatchlistId}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ name: 'My list' }),
    });
    assert(
      rename.status === 200 && rename.body?.[0]?.name === 'My list' && rename.body?.[0]?.updated_at,
      'A can rename its own watchlist (trigger still fires under the function grant floor)',
      `status ${rename.status} body ${JSON.stringify(rename.body)}`,
    );
  }

  console.log("\nB cannot see or touch A's watchlist:");
  {
    const lists = await asB(`watchlists?user_id=eq.${A.id}&select=*`);
    assert(Array.isArray(lists.body) && lists.body.length === 0, "B gets 0 rows from watchlists filtered to A", JSON.stringify(lists.body));

    const items = await asB(`watchlist_items?watchlist_id=eq.${aWatchlistId}&select=*`);
    assert(Array.isArray(items.body) && items.body.length === 0, "B gets 0 rows from A's watchlist_items", JSON.stringify(items.body));

    const ins = await asB('watchlist_items', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ watchlist_id: aWatchlistId, symbol: 'NVDA' }),
    });
    assert(ins.status >= 400, "B cannot insert into A's watchlist", `status ${ins.status} body ${JSON.stringify(ins.body)}`);

    const del = await asB(`watchlist_items?watchlist_id=eq.${aWatchlistId}&symbol=eq.META`, {
      method: 'DELETE',
      headers: { Prefer: 'return=representation' },
    });
    const deleted = Array.isArray(del.body) && del.body.length > 0;
    assert(!deleted, "B cannot delete A's watchlist item", `status ${del.status} body ${JSON.stringify(del.body)}`);

    const rename = await asB(`watchlists?id=eq.${aWatchlistId}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ name: 'hijacked' }),
    });
    const renamed = Array.isArray(rename.body) && rename.body.length > 0;
    assert(!renamed, "B cannot rename A's watchlist", `status ${rename.status} body ${JSON.stringify(rename.body)}`);

    const still = await serviceGet(`watchlist_items?watchlist_id=eq.${aWatchlistId}&select=symbol`);
    assert(
      Array.isArray(still) && still.length === 1 && still[0].symbol === 'META',
      "A's watchlist still holds exactly its own item",
      JSON.stringify(still),
    );

    const own = await asA(`watchlist_items?watchlist_id=eq.${aWatchlistId}&symbol=eq.META`, {
      method: 'DELETE',
      headers: { Prefer: 'return=representation' },
    });
    assert(Array.isArray(own.body) && own.body.length === 1, 'A can delete its own watchlist item', JSON.stringify(own.body));
  }

  // ====================================================== community RPCs (0018)
  console.log('\ncommunity RPCs (0018):');
  {
    tmpCoreRoom = await serviceInsert('rooms', {
      type: 'core', mode: 'day_trade', slug: `rls-tmp-core-${stamp}`,
      name: 'RLS temp core room', config: { intel_eligible: false },
    });
    tmpSetupRoom = await serviceInsert('rooms', {
      type: 'setup', mode: 'day_trade', slug: `rls-tmp-setup-${stamp}`,
      name: 'RLS temp setup room', config: { intel_eligible: false },
    });

    const joined = await asA('rpc/join_core_room', {
      method: 'POST',
      body: JSON.stringify({ p_user_id: A.id, p_room_id: tmpCoreRoom.id }),
    });
    assert(
      joined.status === 200 && joined.body?.room_id === tmpCoreRoom.id && joined.body?.role === 'member',
      'A joins a core room through join_core_room',
      `status ${joined.status} body ${JSON.stringify(joined.body)}`,
    );

    const again = await asA('rpc/join_core_room', {
      method: 'POST',
      body: JSON.stringify({ p_user_id: A.id, p_room_id: tmpCoreRoom.id }),
    });
    const members = await serviceGet(`room_members?room_id=eq.${tmpCoreRoom.id}&select=user_id`);
    assert(
      again.status === 200 && Array.isArray(members) && members.length === 1,
      'join_core_room is idempotent (still one membership row)',
      `status ${again.status} members ${JSON.stringify(members)}`,
    );

    const setupJoin = await asA('rpc/join_core_room', {
      method: 'POST',
      body: JSON.stringify({ p_user_id: A.id, p_room_id: tmpSetupRoom.id }),
    });
    assert(
      setupJoin.status >= 400 && JSON.stringify(setupJoin.body).includes('room_not_core'),
      'join_core_room refuses a setup room',
      `status ${setupJoin.status} body ${JSON.stringify(setupJoin.body)}`,
    );
    const setupMembers = await serviceGet(`room_members?room_id=eq.${tmpSetupRoom.id}&select=user_id`);
    assert(Array.isArray(setupMembers) && setupMembers.length === 0, 'no membership row was created for the setup room', JSON.stringify(setupMembers));

    const forOther = await asA('rpc/join_core_room', {
      method: 'POST',
      body: JSON.stringify({ p_user_id: B.id, p_room_id: tmpCoreRoom.id }),
    });
    assert(
      forOther.status >= 400 && JSON.stringify(forOther.body).includes('forbidden'),
      'A cannot join a room on B\'s behalf',
      `status ${forOther.status} body ${JSON.stringify(forOther.body)}`,
    );

    // membership does NOT unlock writing: messages stay api-app only (01 §10 ⚙)
    const direct = await asA('messages', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ room_id: tmpCoreRoom.id, user_id: A.id, seq: 1, kind: 'text', body: 'direct insert as a member' }),
    });
    assert(direct.status >= 400, 'a joined member still cannot insert into messages directly', `status ${direct.status} body ${JSON.stringify(direct.body)}`);

    const viaRpc = await asA('rpc/post_room_message', {
      method: 'POST',
      body: JSON.stringify({ p_user_id: A.id, p_room_id: tmpCoreRoom.id, p_kind: 'text', p_body: 'via rpc as client' }),
    });
    assert(viaRpc.status >= 400, 'post_room_message is not executable by a client JWT', `status ${viaRpc.status} body ${JSON.stringify(viaRpc.body)}`);

    const rows = await serviceGet(`messages?room_id=eq.${tmpCoreRoom.id}&select=id`);
    assert(Array.isArray(rows) && rows.length === 0, 'no message row exists in the room yet', JSON.stringify(rows));

    // the api-app path (service role) works and assigns seq
    const posted = await serviceRpc('post_room_message', {
      p_user_id: A.id, p_room_id: tmpCoreRoom.id, p_kind: 'text', p_body: 'posted by the api-app',
    });
    assert(posted.status === 200 && posted.body?.seq === 1, 'post_room_message (service role) assigns seq 1', `status ${posted.status} body ${JSON.stringify(posted.body)}`);

    const seen = await asA(`messages_public?room_id=eq.${tmpCoreRoom.id}&select=seq,body`);
    assert(Array.isArray(seen.body) && seen.body.length === 1, 'the member reads it back through messages_public', JSON.stringify(seen.body));
    const unseen = await asB(`messages_public?room_id=eq.${tmpCoreRoom.id}&select=seq,body`);
    assert(Array.isArray(unseen.body) && unseen.body.length === 0, 'a non-member sees nothing in that room', JSON.stringify(unseen.body));

    const mute = await asA('rpc/set_room_mute', {
      method: 'POST',
      body: JSON.stringify({ p_user_id: A.id, p_room_id: tmpCoreRoom.id, p_until: new Date(Date.now() + 3600_000).toISOString() }),
    });
    assert(mute.status === 200 && mute.body?.muted_until, 'A can mute a room for itself', `status ${mute.status} body ${JSON.stringify(mute.body)}`);

    const muteOther = await asB('rpc/set_room_mute', {
      method: 'POST',
      body: JSON.stringify({ p_user_id: A.id, p_room_id: tmpCoreRoom.id, p_until: null }),
    });
    assert(muteOther.status >= 400, "B cannot change A's room mute", `status ${muteOther.status} body ${JSON.stringify(muteOther.body)}`);
  }

  // ================================================= paper execution (0020)
  console.log('\npaper execution objects are owner-isolated (0020):');
  const paper = {};
  {
    for (const u of [A, B]) {
      const accounts = await serviceGet(`accounts?user_id=eq.${u.id}&kind=eq.paper&select=id`);
      const accountId = accounts?.[0]?.id;
      if (!accountId) throw new Error(`no paper account for ${u.email}`);

      const plan = await serviceRpc('create_plan', {
        p_user_id: u.id,
        p_patch: {
          mode: 'day_trade',
          symbol: 'META',
          intent: 'buy_to_open',
          entry: 100,
          stop: 95,
          targets: [110],
        },
      });
      if (plan.status !== 200) throw new Error(`create_plan failed: ${JSON.stringify(plan.body)}`);

      const order = await serviceInsert('orders', {
        user_id: u.id,
        account_id: accountId,
        plan_id: plan.body.id,
        symbol: 'META',
        side: 'buy_to_open',
        type: 'market',
        qty: 3,
        status: 'previewed',
        idempotency_key: `rls-${u.id}-${stamp}`,
        driver: 'paper',
      });

      const submitted = await serviceRpc('submit_paper_order', {
        p_user_id: u.id,
        p_order_id: order.id,
        p_idempotency_key: `rls-${u.id}-${stamp}`,
        p_fill: {
          fill_price: 100.5,
          fill_qty: 3,
          resting: false,
          quote: { price: 100.5, freshness: 'delayed' },
          bracket: { stop: 95, target: 110, exit_style: 'auto' },
        },
      });
      if (submitted.status !== 200) {
        throw new Error(`submit_paper_order failed: ${JSON.stringify(submitted.body)}`);
      }
      paper[u.id] = {
        accountId,
        planId: plan.body.id,
        orderId: order.id,
        positionId: submitted.body?.position?.id,
      };
    }

    assert(
      paper[A.id].positionId && paper[B.id].positionId,
      'submit_paper_order (service role) opened a position for each user',
      JSON.stringify(paper),
    );

    // control: each user sees exactly its own execution rows
    for (const [u, other] of [[A, B], [B, A]]) {
      const as = rest(u.token);
      const plans = await as('trade_plans?select=id,user_id');
      assert(
        Array.isArray(plans.body) && plans.body.length === 1 && plans.body[0].user_id === u.id,
        `${u === A ? 'A' : 'B'} sees exactly its own trade_plans row`,
        JSON.stringify(plans.body),
      );

      // 1 entry + 2 bracket legs
      const orders = await as('orders?select=id,user_id,leg');
      assert(
        Array.isArray(orders.body) && orders.body.length === 3 &&
          orders.body.every((o) => o.user_id === u.id),
        `${u === A ? 'A' : 'B'} sees exactly its own 3 orders (entry + 2 legs)`,
        JSON.stringify(orders.body),
      );

      const positions = await as('positions?select=id,user_id');
      assert(
        Array.isArray(positions.body) && positions.body.length === 1 &&
          positions.body[0].user_id === u.id,
        `${u === A ? 'A' : 'B'} sees exactly its own positions row`,
        JSON.stringify(positions.body),
      );

      const fills = await as('fills?select=id');
      assert(
        Array.isArray(fills.body) && fills.body.length === 1,
        `${u === A ? 'A' : 'B'} sees exactly its own fill`,
        JSON.stringify(fills.body),
      );

      // and nothing of the other user's, even asked for by id
      for (const [path, label] of [
        [`trade_plans?id=eq.${paper[other.id].planId}&select=*`, 'trade_plans'],
        [`orders?id=eq.${paper[other.id].orderId}&select=*`, 'orders'],
        [`positions?id=eq.${paper[other.id].positionId}&select=*`, 'positions'],
        [`order_events?order_id=eq.${paper[other.id].orderId}&select=*`, 'order_events'],
        [`fills?order_id=eq.${paper[other.id].orderId}&select=*`, 'fills'],
        [`plan_events?plan_id=eq.${paper[other.id].planId}&select=*`, 'plan_events'],
      ]) {
        const r = await as(path);
        assert(
          Array.isArray(r.body) && r.body.length === 0,
          `${u === A ? 'A' : 'B'} gets 0 rows from ${label} belonging to ${other === A ? 'A' : 'B'}`,
          `status ${r.status} body ${JSON.stringify(r.body)}`,
        );
      }
    }
  }

  console.log('\nexecution tables are api-app write only:');
  {
    const o = await asA('orders', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        user_id: A.id, account_id: paper[A.id].accountId, symbol: 'META',
        side: 'buy_to_open', type: 'market', qty: 1, status: 'filled',
        idempotency_key: `hijack-${stamp}`, driver: 'paper',
      }),
    });
    assert(o.status >= 400, 'a client cannot insert into orders', `status ${o.status} body ${JSON.stringify(o.body)}`);

    const p = await asA('positions', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        user_id: A.id, account_id: paper[A.id].accountId, symbol: 'META',
        direction: 'long', qty: 999, avg_cost: 1, opened_at: new Date().toISOString(),
        mode: 'day_trade',
      }),
    });
    assert(p.status >= 400, 'a client cannot insert into positions', `status ${p.status} body ${JSON.stringify(p.body)}`);

    const u = await asA(`positions?id=eq.${paper[A.id].positionId}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ realized_pnl: 999999 }),
    });
    const changed = Array.isArray(u.body) && u.body.length > 0;
    assert(!changed, 'a client cannot rewrite its own realized_pnl', `status ${u.status} body ${JSON.stringify(u.body)}`);
  }

  console.log('\npaper-execution RPCs are closed to client JWTs (grant floor):');
  {
    const calls = [
      ['create_plan', { p_user_id: A.id, p_patch: { mode: 'day_trade', symbol: 'META', intent: 'buy_to_open', entry: 100, stop: 95, targets: [110] } }],
      ['plan_action', { p_user_id: A.id, p_plan_id: paper[A.id].planId, p_action: 'cancel', p_payload: {} }],
      ['submit_paper_order', { p_user_id: A.id, p_order_id: paper[A.id].orderId, p_idempotency_key: `client-${stamp}`, p_fill: { fill_price: 1, fill_qty: 1 } }],
      ['apply_paper_tick', { p_user_id: A.id, p_symbol: 'META', p_quote: { price: 110, freshness: 'delayed' } }],
      ['close_position_prepare', { p_user_id: A.id, p_position_id: paper[A.id].positionId }],
      ['paper_apply_fill', { p_order_id: paper[A.id].orderId, p_price: 1, p_qty: 1, p_reason: 'client' }],
      ['paper_recompute_account', { p_account_id: paper[A.id].accountId, p_cash_delta: 1000000 }],
    ];
    for (const [fn, args] of calls) {
      const r = await asA(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });
      assert(r.status >= 400, `${fn} is not executable by a client JWT`, `status ${r.status} body ${JSON.stringify(r.body)}`);
    }

    // ...and A cannot drive B's execution even through the service-shaped args
    const forOther = await asB('rpc/submit_paper_order', {
      method: 'POST',
      body: JSON.stringify({ p_user_id: A.id, p_order_id: paper[A.id].orderId, p_idempotency_key: `x-${stamp}`, p_fill: {} }),
    });
    assert(forOther.status >= 400, "B cannot submit A's order", `status ${forOther.status} body ${JSON.stringify(forOther.body)}`);

    const stillFilled = await serviceGet(`orders?id=eq.${paper[A.id].orderId}&select=status,filled_qty`);
    assert(
      stillFilled?.[0]?.status === 'filled' && Number(stillFilled[0].filled_qty) === 3,
      "A's order is untouched after the client attempts",
      JSON.stringify(stillFilled),
    );
  }

  console.log('\ndaily_risk_v shows only the caller\'s own row:');
  {
    const mine = await asA('daily_risk_v?select=user_id,day,realized_loss,open_risk,used,cap');
    assert(
      Array.isArray(mine.body) && mine.body.length === 1 && mine.body[0].user_id === A.id,
      'A sees exactly one daily_risk_v row, its own',
      JSON.stringify(mine.body),
    );
    assert(
      Number(mine.body?.[0]?.open_risk) === 16.5 && Number(mine.body?.[0]?.used) === 16.5,
      'open_risk = qty x |avg_cost - stop| (3 x 5.50 = 16.50)',
      JSON.stringify(mine.body),
    );
    assert(Number(mine.body?.[0]?.cap) === 60, 'cap comes from risk_policies.daily_loss_cap_usd', JSON.stringify(mine.body));

    const other = await asA(`daily_risk_v?user_id=eq.${B.id}&select=*`);
    assert(Array.isArray(other.body) && other.body.length === 0, "A gets 0 rows from daily_risk_v filtered to B", JSON.stringify(other.body));

    const anon = await fetch(`${URL_BASE}/rest/v1/daily_risk_v?select=*`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
    });
    assert(anon.status >= 400, 'anon cannot read daily_risk_v at all', `status ${anon.status}`);
  }


  // =========================================== chart annotations (0021)
  console.log('\nchart_annotations are owner-scoped (Kai rows included):');
  const annotations = {};
  {
    for (const u of [A, B]) {
      annotations[u.id] = await serviceInsert('chart_annotations', {
        user_id: u.id,
        symbol: 'META',
        timeframe: '5m',
        kind: 'trigger',
        price: 504,
        text: 'Trigger 504',
        reason: 'The level the alert fired on.',
        provenance: 'kai',
        status: 'valid',
      });
    }

    const mine = await asA('chart_annotations?select=id,user_id,provenance,status');
    assert(
      Array.isArray(mine.body) && mine.body.length === 1 && mine.body[0].user_id === A.id &&
        mine.body[0].provenance === 'kai',
      'A sees exactly its own annotation, and it is a Kai-provenance row',
      JSON.stringify(mine.body),
    );

    const other = await asA(`chart_annotations?id=eq.${annotations[B.id].id}&select=*`);
    assert(Array.isArray(other.body) && other.body.length === 0,
      "A gets 0 rows from B's annotations", JSON.stringify(other.body));

    const bOther = await asB(`chart_annotations?id=eq.${annotations[A.id].id}&select=*`);
    assert(Array.isArray(bOther.body) && bOther.body.length === 0,
      "B gets 0 rows from A's annotations (symmetric)", JSON.stringify(bOther.body));

    const ins = await asA('chart_annotations', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ user_id: A.id, symbol: 'META', kind: 'note', text: 'client drew this' }),
    });
    assert(ins.status >= 400, 'a client cannot insert an annotation', `status ${ins.status} body ${JSON.stringify(ins.body)}`);
  }

  console.log('\nannotation client writes are status-only (hidden/deleted):');
  {
    const hide = await asA(`chart_annotations?id=eq.${annotations[A.id].id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ status: 'hidden' }),
    });
    assert(hide.status === 200 && hide.body?.[0]?.status === 'hidden',
      'A can hide its own annotation', `status ${hide.status} body ${JSON.stringify(hide.body)}`);

    const revalidate = await asA(`chart_annotations?id=eq.${annotations[A.id].id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ status: 'valid' }),
    });
    assert(revalidate.status >= 400, "A cannot set an annotation back to 'valid'",
      `status ${revalidate.status} body ${JSON.stringify(revalidate.body)}`);

    const reprice = await asA(`chart_annotations?id=eq.${annotations[A.id].id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ price: 1 }),
    });
    assert(reprice.status >= 400, "A cannot rewrite an annotation's price",
      `status ${reprice.status} body ${JSON.stringify(reprice.body)}`);

    const retext = await asA(`chart_annotations?id=eq.${annotations[A.id].id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ status: 'deleted', reason: 'rewritten' }),
    });
    assert(retext.status >= 400, 'A cannot smuggle another column in beside status',
      `status ${retext.status} body ${JSON.stringify(retext.body)}`);

    const still = await serviceGet(`chart_annotations?id=eq.${annotations[A.id].id}&select=price,status,reason`);
    assert(
      Number(still?.[0]?.price) === 504 && still?.[0]?.status === 'hidden' &&
        still?.[0]?.reason === 'The level the alert fired on.',
      'the annotation still holds its Kai-written geometry and reason',
      JSON.stringify(still),
    );

    const hijack = await asB(`chart_annotations?id=eq.${annotations[A.id].id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ status: 'deleted' }),
    });
    const hijacked = Array.isArray(hijack.body) && hijack.body.length > 0;
    assert(!hijacked, "B cannot hide or delete A's annotation", `status ${hijack.status} body ${JSON.stringify(hijack.body)}`);

    const softDelete = await asA(`chart_annotations?id=eq.${annotations[A.id].id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ status: 'deleted' }),
    });
    assert(softDelete.status === 200 && softDelete.body?.[0]?.status === 'deleted',
      'A can delete its own annotation (soft, status only)',
      `status ${softDelete.status} body ${JSON.stringify(softDelete.body)}`);
  }

  // ==================================================== circles (0021)
  console.log('\ncircles are time-boxed setup rooms:');
  {
    const seeded = await asA('rooms?type=eq.setup&expires_at=not.is.null&select=id,name,slug,expires_at&order=name');
    assert(
      Array.isArray(seeded.body) && seeded.body.length === 2 &&
        seeded.body.map((r) => r.name).join(',') === 'META Breakout,NVDA Breakout',
      'A (a non-member) can discover the two seeded circles',
      JSON.stringify(seeded.body),
    );

    const opened = await serviceRpc('open_setup_circle', { p_setup_id: AMD_SETUP, p_ttl: '1 day' });
    assert(
      opened.status === 200 && opened.body?.type === 'setup' && opened.body?.name === 'AMD Setup' &&
        opened.body?.expires_at,
      "open_setup_circle names an unpatterned setup '<SYM> Setup' and sets the clock",
      `status ${opened.status} body ${JSON.stringify(opened.body)}`,
    );
    amdCircle = opened.body?.id ?? null;

    const again = await serviceRpc('open_setup_circle', { p_setup_id: AMD_SETUP, p_ttl: '7 days' });
    assert(
      again.status === 200 && again.body?.id === amdCircle && again.body?.expires_at === opened.body?.expires_at,
      'open_setup_circle is idempotent and does not extend the clock',
      `status ${again.status} body ${JSON.stringify(again.body)}`,
    );

    const linked = await serviceGet(`setups?id=eq.${AMD_SETUP}&select=discussion_room_id`);
    assert(linked?.[0]?.discussion_room_id === amdCircle, 'the setup now points at its circle', JSON.stringify(linked));

    // discoverable, but the thread is still members-only
    await serviceRpc('post_kai_message', { p_room_id: amdCircle, p_kai_object_id: null, p_body: 'Circle opened.' });
    const visible = await asA(`rooms?id=eq.${amdCircle}&select=id,name`);
    assert(Array.isArray(visible.body) && visible.body.length === 1, 'A can see the circle in the directory', JSON.stringify(visible.body));
    const thread = await asA(`messages_public?room_id=eq.${amdCircle}&select=seq`);
    assert(Array.isArray(thread.body) && thread.body.length === 0,
      'A cannot read the circle thread without joining', JSON.stringify(thread.body));

    const created = await serviceRpc('create_circle', { p_user_id: A.id, p_symbol: 'msft', p_ttl: '7 days' });
    assert(
      created.status === 200 && created.body?.name === 'MSFT Circle' && created.body?.type === 'setup',
      "create_circle makes '<SYM> Circle' from a lower-case symbol",
      `status ${created.status} body ${JSON.stringify(created.body)}`,
    );
    userCircle = created.body?.id ?? null;

    const mods = await serviceGet(`room_members?room_id=eq.${userCircle}&select=user_id,role`);
    assert(
      Array.isArray(mods) && mods.length === 1 && mods[0].user_id === A.id && mods[0].role === 'moderator',
      'the creator is the circle moderator',
      JSON.stringify(mods),
    );

    const unknown = await serviceRpc('create_circle', { p_user_id: A.id, p_symbol: 'ZZZZ', p_ttl: '1 day' });
    assert(
      unknown.status >= 400 && JSON.stringify(unknown.body).includes('symbol_unknown'),
      'create_circle refuses a symbol with no instrument row',
      `status ${unknown.status} body ${JSON.stringify(unknown.body)}`,
    );

    // expiry -> posting_restricted, returned once
    await fetch(`${URL_BASE}/rest/v1/rooms?id=eq.${amdCircle}`, {
      method: 'PATCH',
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expires_at: new Date(Date.now() - 3600_000).toISOString() }),
    });
    const closed = await serviceRpc('close_expired_circles', {});
    assert(
      Array.isArray(closed.body) && closed.body.includes(amdCircle),
      'close_expired_circles returns the id it closed',
      JSON.stringify(closed.body),
    );
    const closedRoom = await serviceGet(`rooms?id=eq.${amdCircle}&select=config`);
    assert(closedRoom?.[0]?.config?.posting_restricted === true,
      'the expired circle is posting_restricted (readable, not writable)', JSON.stringify(closedRoom));
    const twice = await serviceRpc('close_expired_circles', {});
    assert(Array.isArray(twice.body) && !twice.body.includes(amdCircle),
      'a circle is only reported closed once', JSON.stringify(twice.body));

    for (const [fn, args] of [
      ['open_setup_circle', { p_setup_id: AMD_SETUP, p_ttl: '1 day' }],
      ['create_circle', { p_user_id: A.id, p_symbol: 'META', p_ttl: '1 day' }],
      ['close_expired_circles', {}],
    ]) {
      const r = await asA(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });
      assert(r.status >= 400, `${fn} is not executable by a client JWT`, `status ${r.status} body ${JSON.stringify(r.body)}`);
    }
  }

  // ============================================== conversations (0021)
  console.log('\nconversations carry title/pinned/last_message_at, owner-only:');
  {
    const aConv = await serviceInsert('conversations', {
      user_id: A.id, mode: 'day_trade', title: 'Morning Briefing · Aug 28', pinned: true,
    });
    await serviceInsert('conversations', {
      user_id: B.id, mode: 'day_trade', title: 'NVDA Swing Review', pinned: false,
    });

    const mine = await asA('conversations?select=id,title,pinned,last_message_at');
    assert(
      Array.isArray(mine.body) && mine.body.length === 1 && mine.body[0].pinned === true &&
        mine.body[0].title === 'Morning Briefing · Aug 28',
      'A sees exactly its own conversation, with title and pin',
      JSON.stringify(mine.body),
    );

    const found = await asA('conversations?title=ilike.*morning*&select=id');
    assert(Array.isArray(found.body) && found.body.length === 1, 'A can search its own titles (ilike)', JSON.stringify(found.body));
    const foundOther = await asA('conversations?title=ilike.*NVDA*&select=id');
    assert(Array.isArray(foundOther.body) && foundOther.body.length === 0,
      "the search never reaches B's threads", JSON.stringify(foundOther.body));

    const rename = await asA(`conversations?id=eq.${aConv.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ title: 'renamed by the client' }),
    });
    assert(rename.status >= 400, 'title/pin stay api-app writes (no client UPDATE grant)',
      `status ${rename.status} body ${JSON.stringify(rename.body)}`);

    await serviceInsert('conversation_messages', {
      conversation_id: aConv.id, seq: 1, role: 'user', content: { text: 'what is META doing' },
    });
    const touched = await asA(`conversations?id=eq.${aConv.id}&select=last_message_at`);
    assert(touched.body?.[0]?.last_message_at, 'last_message_at is maintained by the database trigger',
      JSON.stringify(touched.body));
  }

  // ==================================== alerts as trade objects (0021)
  console.log('\nalerts carry the card state, snapshots and an event history:');
  {
    const aAlert = (await serviceGet(`alerts?user_id=eq.${A.id}&select=id`))?.[0];
    const bAlert = (await serviceGet(`alerts?user_id=eq.${B.id}&select=id`))?.[0];

    await fetch(`${URL_BASE}/rest/v1/alerts?id=eq.${aAlert.id}`, {
      method: 'PATCH',
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol: 'META', mode: 'day_trade', direction: 'long', lifecycle_state: 'active',
        version: 2, grade_snapshot: { display: 'A-', band: 'A' }, score_snapshot: { score: 87 },
      }),
    });
    await fetch(`${URL_BASE}/rest/v1/alerts?id=eq.${bAlert.id}`, {
      method: 'PATCH',
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ lifecycle_state: 'closed' }),
    });

    const active = await asA('alerts?tab=eq.active&select=id,tab,lifecycle_state,version,grade_snapshot');
    assert(
      Array.isArray(active.body) && active.body.length === 1 && active.body[0].tab === 'active' &&
        active.body[0].version === 2 && active.body[0].grade_snapshot?.display === 'A-',
      "A's alert lands in the Active tab with its graded snapshot",
      JSON.stringify(active.body),
    );
    const history = await serviceGet(`alerts?id=eq.${bAlert.id}&select=tab`);
    assert(history?.[0]?.tab === 'history', "a closed alert's generated tab is history", JSON.stringify(history));

    const noWrite = await asA(`alerts?id=eq.${aAlert.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ lifecycle_state: 'position_active' }),
    });
    const moved = Array.isArray(noWrite.body) && noWrite.body.length > 0;
    assert(!moved, 'a client cannot move its own alert through the state machine',
      `status ${noWrite.status} body ${JSON.stringify(noWrite.body)}`);

    for (const ev of [
      { alert_id: aAlert.id, type: 'created', to_state: 'watching', source: 'system', version: 1 },
      { alert_id: aAlert.id, type: 'graded', from_state: 'watching', to_state: 'active', source: 'kai', version: 2,
        payload: { grade: 'A-', score: 87 } },
    ]) {
      await serviceInsert('alert_events', ev);
    }
    await serviceInsert('alert_events', { alert_id: bAlert.id, type: 'created', to_state: 'watching', source: 'system' });

    const events = await asA('alert_events?select=seq,type,to_state&order=seq');
    assert(
      Array.isArray(events.body) && events.body.length === 2 &&
        events.body[0].seq === 1 && events.body[1].seq === 2,
      'alert_events assigns a per-alert monotonic seq and A sees only its own',
      JSON.stringify(events.body),
    );

    const insEvent = await asA('alert_events', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ alert_id: aAlert.id, type: 'note', source: 'user' }),
    });
    assert(insEvent.status >= 400, 'a client cannot append to alert_events', `status ${insEvent.status} body ${JSON.stringify(insEvent.body)}`);

    const delEvent = await serviceDelete(`alert_events?alert_id=eq.${aAlert.id}`);
    assert(delEvent.status >= 400, 'alert_events is append-only even for service_role', `status ${delEvent.status}`);
  }


  // ============================================ live shows (0023)
  console.log('\nlive shows: review is free, market-hours is premium:');
  {
    // Two shows, one of each mode. A and B are both free users at this point —
    // nothing in this script ever creates a subscription — so `market` must be
    // invisible to both, and `review` visible to both.
    const reviewShow = await serviceInsert('live_shows', {
      mode: 'review', status: 'ended', title: 'rls review show',
    });
    const marketShow = await serviceInsert('live_shows', {
      mode: 'market', status: 'ended', title: 'rls market show',
    });
    liveShowIds.push(reviewShow.id, marketShow.id);

    const reviewSeg = await serviceInsert('live_segments', {
      show_id: reviewShow.id, seq: 0, symbol: 'META', source: 'setup', state: 'done',
    });
    const marketSeg = await serviceInsert('live_segments', {
      show_id: marketShow.id, seq: 0, symbol: 'NVDA', source: 'setup', state: 'done',
    });
    await serviceInsert('live_frames', {
      show_id: reviewShow.id, segment_id: reviewSeg.id, seq: 0, kind: 'say',
      payload: { kind: 'say', text: 'free' }, t_offset_ms: 0,
    });
    await serviceInsert('live_frames', {
      show_id: marketShow.id, segment_id: marketSeg.id, seq: 0, kind: 'say',
      payload: { kind: 'say', text: 'paid' }, t_offset_ms: 0,
    });

    const freeShows = await asA(`live_shows?id=eq.${reviewShow.id}&select=id,mode`);
    assert(Array.isArray(freeShows.body) && freeShows.body.length === 1,
      'a free user can read a review-mode show', JSON.stringify(freeShows.body));

    const paidShows = await asA(`live_shows?id=eq.${marketShow.id}&select=id,mode`);
    assert(Array.isArray(paidShows.body) && paidShows.body.length === 0,
      'a free user CANNOT read a market-mode show', JSON.stringify(paidShows.body));

    const freeFrames = await asA(`live_frames?show_id=eq.${reviewShow.id}&select=seq`);
    assert(Array.isArray(freeFrames.body) && freeFrames.body.length === 1,
      'a free user can read the frames of a review show', JSON.stringify(freeFrames.body));

    // The one that matters: the paywall has to be on the FRAMES, not only on the
    // show row. A market-mode timeline readable by anyone who guessed a show id
    // would be the entire premium product, given away.
    const paidFrames = await asB(`live_frames?show_id=eq.${marketShow.id}&select=seq,payload`);
    assert(Array.isArray(paidFrames.body) && paidFrames.body.length === 0,
      'a free user CANNOT read the frames of a market-mode show', JSON.stringify(paidFrames.body));

    const paidSegs = await asB(`live_segments?show_id=eq.${marketShow.id}&select=symbol`);
    assert(Array.isArray(paidSegs.body) && paidSegs.body.length === 0,
      'nor its segments — not even the list of tickers it covered', JSON.stringify(paidSegs.body));

    // Promote A to premium and the same rows appear. This is what proves the
    // policy is reading the subscription rather than refusing everybody.
    await serviceInsert('subscriptions', {
      user_id: A.id, tier: 'premium', status: 'active',
    });
    const nowVisible = await asA(`live_frames?show_id=eq.${marketShow.id}&select=seq`);
    assert(Array.isArray(nowVisible.body) && nowVisible.body.length === 1,
      'a premium user CAN read a market-mode timeline', JSON.stringify(nowVisible.body));
    const stillHidden = await asB(`live_frames?show_id=eq.${marketShow.id}&select=seq`);
    assert(Array.isArray(stillHidden.body) && stillHidden.body.length === 0,
      "and B, still free, still cannot", JSON.stringify(stillHidden.body));

    // Writes are the worker's alone.
    const insFrame = await asA(`live_frames`, {
      method: 'POST',
      body: JSON.stringify({ show_id: reviewShow.id, seq: 99, kind: 'say', payload: {} }),
    });
    assert(insFrame.status >= 400, 'no client may write a frame', `status ${insFrame.status}`);

    const insShow = await asA(`live_shows`, {
      method: 'POST',
      body: JSON.stringify({ mode: 'review', status: 'live' }),
    });
    assert(insShow.status >= 400, 'nor start a show', `status ${insShow.status}`);

    // A request is the ONE client write, and only for a premium user. A is
    // premium now; B is not.
    const bReq = await asB(`live_requests`, {
      method: 'POST',
      body: JSON.stringify({ user_id: B.id, symbol: 'META', status: 'queued' }),
    });
    assert(bReq.status >= 400, 'a free user cannot ask Kai to pull up a ticker', `status ${bReq.status}`);

    const aReq = await asA(`live_requests`, {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ user_id: A.id, symbol: 'META', status: 'queued' }),
    });
    assert(aReq.status < 300, 'a premium user can', `status ${aReq.status} ${JSON.stringify(aReq.body)}`);

    const forOther = await asA(`live_requests`, {
      method: 'POST',
      body: JSON.stringify({ user_id: B.id, symbol: 'NVDA', status: 'queued' }),
    });
    assert(forOther.status >= 400, 'and cannot put a request in somebody else\'s name', `status ${forOther.status}`);

    const bSees = await asB('live_requests?select=id');
    assert(Array.isArray(bSees.body) && bSees.body.length === 0,
      "B cannot see A's requests", JSON.stringify(bSees.body));

    const anonFrames = await fetch(`${URL_BASE}/rest/v1/live_frames?select=seq`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
    });
    assert(anonFrames.status >= 400 || (await anonFrames.json()).length === 0,
      'anon reads no frames at all', `status ${anonFrames.status}`);

    // Put A back where the rest of the script expects to find them.
    await serviceDelete(`subscriptions?user_id=eq.${A.id}`);
  }

  // ================================================= push registry (0024)
  console.log('\npush subscriptions: one token, one owner, and the owner is the caller:');
  const pushSub = {};
  {
    const aHandle = `ExponentPushToken[rls-a-${stamp}]`;
    const bHandle = `ExponentPushToken[rls-b-${stamp}]`;

    // Registration is an RPC and not an insert, because registration is the
    // thing that decides WHO a device belongs to.
    const reg = await asA('rpc/register_push_subscription', {
      method: 'POST',
      body: JSON.stringify({
        p_transport: 'expo', p_handle: aHandle, p_platform: 'ios', p_label: "A's phone",
      }),
    });
    assert(
      reg.status < 300 && reg.body?.user_id === A.id && reg.body?.state === 'active',
      'register_push_subscription writes a row owned by the caller, active',
      `status ${reg.status} body ${JSON.stringify(reg.body)}`,
    );
    pushSub.a = reg.body?.id;

    const forOther = await asA('rpc/register_push_subscription', {
      method: 'POST',
      body: JSON.stringify({
        p_transport: 'expo', p_handle: `ExponentPushToken[rls-x-${stamp}]`, p_user_id: B.id,
      }),
    });
    assert(forOther.status >= 400,
      'a client cannot register a device in somebody else\'s name',
      `status ${forOther.status} body ${JSON.stringify(forOther.body)}`);

    const bReg = await asB('rpc/register_push_subscription', {
      method: 'POST',
      body: JSON.stringify({
        p_transport: 'expo', p_handle: bHandle, p_platform: 'android', p_label: "B's phone",
      }),
    });
    assert(bReg.status < 300 && bReg.body?.user_id === B.id, 'B registers its own device',
      `status ${bReg.status} body ${JSON.stringify(bReg.body)}`);
    pushSub.b = bReg.body?.id;

    const own = await asA(`push_subscriptions?id=eq.${pushSub.a}&select=id,handle,state`);
    assert(Array.isArray(own.body) && own.body.length === 1,
      'A can read its own subscription', JSON.stringify(own.body));

    const other = await asA(`push_subscriptions?id=eq.${pushSub.b}&select=id,handle`);
    assert(Array.isArray(other.body) && other.body.length === 0,
      "A cannot read B's subscription — a push token is a device secret",
      JSON.stringify(other.body));

    const insForB = await asA('push_subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        user_id: B.id, transport: 'expo', handle: `ExponentPushToken[rls-forge-${stamp}]`,
      }),
    });
    assert(insForB.status >= 400,
      "a client cannot insert a subscription carrying B's user_id",
      `status ${insForB.status} body ${JSON.stringify(insForB.body)}`);

    const insOwn = await asA('push_subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        user_id: A.id, transport: 'expo', handle: `ExponentPushToken[rls-own-${stamp}]`,
      }),
    });
    assert(insOwn.status >= 400,
      'nor one of its own — there is no INSERT grant at all, registration is the RPC',
      `status ${insOwn.status} body ${JSON.stringify(insOwn.body)}`);

    const updOther = await asA(`push_subscriptions?id=eq.${pushSub.b}`, {
      method: 'PATCH', body: JSON.stringify({ state: 'revoked' }),
    });
    assert(updOther.status >= 400, "A cannot update B's subscription",
      `status ${updOther.status} body ${JSON.stringify(updOther.body)}`);

    const updOwn = await asA(`push_subscriptions?id=eq.${pushSub.a}`, {
      method: 'PATCH', body: JSON.stringify({ state: 'active', failure_count: 0 }),
    });
    assert(updOwn.status >= 400,
      'nor its own — state and failure_count are the sender\'s bookkeeping',
      `status ${updOwn.status} body ${JSON.stringify(updOwn.body)}`);

    // DELETE is granted, so this is not refused — it simply matches no row. The
    // assertion has to be on the data, not on the status code.
    await asA(`push_subscriptions?id=eq.${pushSub.b}`, { method: 'DELETE' });
    const bSurvives = await serviceGet(`push_subscriptions?id=eq.${pushSub.b}&select=id,state`);
    assert(Array.isArray(bSurvives) && bSurvives.length === 1,
      "A's delete of B's subscription removes nothing", JSON.stringify(bSurvives));

    // THE ONE THAT MATTERS. The device changes hands (or the browser profile is
    // shared, or the token is recycled): the same handle is registered again
    // from A's session. The row must end up owned by A and active. Leaving it on
    // B would push B's positions and P&L to a device A is holding.
    const handover = await asA('rpc/register_push_subscription', {
      method: 'POST',
      body: JSON.stringify({
        p_transport: 'expo', p_handle: bHandle, p_platform: 'android', p_label: 'handed over',
      }),
    });
    assert(
      handover.status < 300 && handover.body?.id === pushSub.b &&
        handover.body?.user_id === A.id && handover.body?.state === 'active',
      're-registering another user\'s token moves that same row to the new owner, active',
      `status ${handover.status} body ${JSON.stringify(handover.body)}`,
    );

    const bLost = await asB(`push_subscriptions?id=eq.${pushSub.b}&select=id`);
    assert(Array.isArray(bLost.body) && bLost.body.length === 0,
      'and B no longer sees the device it handed over', JSON.stringify(bLost.body));

    const allForHandle = await serviceGet(
      `push_subscriptions?handle=eq.${encodeURIComponent(bHandle)}&select=id,user_id`);
    assert(Array.isArray(allForHandle) && allForHandle.length === 1,
      'a token is still exactly one row — the takeover is an upsert, not a second row',
      JSON.stringify(allForHandle));

    // Revoking: owner-only, and a row that is not yours answers exactly like a
    // row that does not exist.
    const revOther = await asB('rpc/revoke_push_subscription', {
      method: 'POST', body: JSON.stringify({ p_id: pushSub.a }),
    });
    assert(revOther.status >= 400, "B cannot revoke A's device",
      `status ${revOther.status} body ${JSON.stringify(revOther.body)}`);

    const revGhost = await asB('rpc/revoke_push_subscription', {
      method: 'POST', body: JSON.stringify({ p_id: '00000000-0000-4000-8000-000000000000' }),
    });
    assert(
      revGhost.status === revOther.status &&
        JSON.stringify(revGhost.body?.message) === JSON.stringify(revOther.body?.message),
      'and gets the same answer as for a subscription that does not exist',
      `${revOther.status}/${JSON.stringify(revOther.body)} vs ${revGhost.status}/${JSON.stringify(revGhost.body)}`,
    );

    const untouched = await serviceGet(`push_subscriptions?id=eq.${pushSub.a}&select=state`);
    assert(untouched?.[0]?.state === 'active', "A's device is still active after B tried",
      JSON.stringify(untouched));

    const revMine = await asA('rpc/revoke_push_subscription', {
      method: 'POST', body: JSON.stringify({ p_id: pushSub.a }),
    });
    assert(revMine.status < 300 && revMine.body?.state === 'revoked',
      'A can turn its own device off', `status ${revMine.status} body ${JSON.stringify(revMine.body)}`);

    const reReg = await asA('rpc/register_push_subscription', {
      method: 'POST', body: JSON.stringify({ p_transport: 'expo', p_handle: aHandle }),
    });
    assert(
      reReg.status < 300 && reReg.body?.id === pushSub.a && reReg.body?.state === 'active' &&
        reReg.body?.device_label === "A's phone",
      'and turning it back on re-activates that same row without losing the device label',
      `status ${reReg.status} body ${JSON.stringify(reReg.body)}`,
    );

    const anonReg = await fetch(`${URL_BASE}/rest/v1/rpc/register_push_subscription`, {
      method: 'POST',
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_transport: 'expo', p_handle: `anon-${stamp}` }),
    });
    assert(anonReg.status >= 400, 'anon cannot register a device at all', `status ${anonReg.status}`);

    const anonRead = await fetch(`${URL_BASE}/rest/v1/push_subscriptions?select=id`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
    });
    assert(anonRead.status >= 400 || (await anonRead.json()).length === 0,
      'anon reads no subscriptions', `status ${anonRead.status}`);
  }

  // ===================================== notification_deliveries (0024)
  console.log('\nnotification_deliveries is the sender\'s ledger, not user data:');
  {
    const note = await serviceInsert('notifications', {
      user_id: A.id, channel: 'push', kind: 'alert_trigger',
      payload: { route: '/alerts', title_plain: 'META crossed 604.50' },
    });
    notificationIds.push(note.id);

    const queued = await serviceInsert('notification_deliveries', {
      notification_id: note.id, subscription_id: pushSub.a, transport: 'expo',
      state: 'queued', ticket_id: `ticket-${stamp}`,
    });

    // Not owner-scoped — NOT READABLE AT ALL. The table has RLS on and no
    // policy for `authenticated`, which is the statement being made: ticket ids
    // and provider errors are operational data about a third party.
    const mine = await asA('notification_deliveries?select=id,ticket_id');
    assert(
      mine.status >= 400 || (Array.isArray(mine.body) && mine.body.length === 0),
      'even the owner of the notification cannot read its delivery rows',
      `status ${mine.status} body ${JSON.stringify(mine.body)}`,
    );

    const byId = await asA(`notification_deliveries?id=eq.${queued.id}&select=ticket_id`);
    assert(
      byId.status >= 400 || (Array.isArray(byId.body) && byId.body.length === 0),
      'not even by guessing the id', `status ${byId.status} body ${JSON.stringify(byId.body)}`,
    );

    const insDelivery = await asA('notification_deliveries', {
      method: 'POST',
      body: JSON.stringify({ notification_id: note.id, transport: 'expo', state: 'delivered' }),
    });
    assert(insDelivery.status >= 400, 'nor mark one delivered',
      `status ${insDelivery.status} body ${JSON.stringify(insDelivery.body)}`);

    // A push we decided not to send is a record with a reason, never a drop —
    // and it carries no device, because the decision was made before one was
    // chosen (brief §3).
    const suppressed = await serviceInsert('notification_deliveries', {
      notification_id: note.id, transport: 'none', state: 'suppressed', reason: 'quiet_hours',
    });
    assert(suppressed.subscription_id === null && suppressed.reason === 'quiet_hours',
      'a user-level suppression records its reason and no device', JSON.stringify(suppressed));

    // The in-app row always survives, and so does the history of what we tried:
    // pruning a dead token unlinks the ledger rather than erasing them.
    await serviceDelete(`push_subscriptions?id=eq.${pushSub.a}`);
    const orphan = await serviceGet(
      `notification_deliveries?id=eq.${queued.id}&select=subscription_id,ticket_id`);
    assert(orphan?.[0] && orphan[0].subscription_id === null && orphan[0].ticket_id === `ticket-${stamp}`,
      'deleting a device keeps its delivery history, unlinked', JSON.stringify(orphan));

    const stillThere = await asA(`notifications?id=eq.${note.id}&select=id`);
    assert(Array.isArray(stillThere.body) && stillThere.body.length === 1,
      'and the notification itself is still in the inbox', JSON.stringify(stillThere.body));
  }

  // ================================ notification_prefs push switch (0024)
  console.log('\nnotification_prefs carries the push master switch, owner-only:');
  {
    const mine = await asA(`notification_prefs?user_id=eq.${A.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ push_enabled: false, categories: { trade_alerts: false } }),
    });
    assert(
      mine.status < 300 && mine.body?.[0]?.push_enabled === false &&
        mine.body[0].categories?.trade_alerts === false,
      'a user can turn push off and switch a category off for themselves',
      `status ${mine.status} body ${JSON.stringify(mine.body)}`,
    );

    // Granted UPDATE, so RLS filters rather than refusing: assert on the data.
    await asA(`notification_prefs?user_id=eq.${B.id}`, {
      method: 'PATCH', body: JSON.stringify({ push_enabled: false }),
    });
    const bPrefs = await serviceGet(
      `notification_prefs?user_id=eq.${B.id}&select=push_enabled,categories`);
    assert(bPrefs?.[0]?.push_enabled === true,
      "and cannot turn somebody else's push off", JSON.stringify(bPrefs));
    assert(
      bPrefs?.[0] && JSON.stringify(bPrefs[0].categories) === '{}',
      'a fresh user has no category overrides, which means all on (brief §4.5)',
      JSON.stringify(bPrefs),
    );

    const bReads = await asB(`notification_prefs?user_id=eq.${A.id}&select=push_enabled`);
    assert(Array.isArray(bReads.body) && bReads.body.length === 0,
      "B cannot read A's notification prefs", JSON.stringify(bReads.body));
  }

  // ============================================ rule_adherence_v (0021)
  console.log('\nrule_adherence_v counts a user\'s own sessions only:');
  {
    await serviceInsert('debriefs', {
      user_id: A.id,
      outcome: { realized_pnl: 42 },
      process_review: { process_receipt: [{ label: 'Waited for the trigger', ok: true }, { label: 'Sized to the cap', ok: true }] },
    });
    await serviceInsert('debriefs', {
      user_id: A.id,
      outcome: { realized_pnl: -18 },
      process_review: { payload: { process_receipt: [{ label: 'Waited for the trigger', ok: false }] } },
    });
    await serviceInsert('debriefs', {
      user_id: B.id,
      outcome: { realized_pnl: 5 },
      process_review: { process_receipt: [{ label: 'Followed the plan', ok: true }] },
    });

    const mine = await asA('rule_adherence_v?select=user_id,sessions,followed');
    assert(
      Array.isArray(mine.body) && mine.body.length === 1 && mine.body[0].user_id === A.id &&
        mine.body[0].sessions === 2 && mine.body[0].followed === 1,
      'A sees 2 sessions, 1 followed (both receipt shapes are read)',
      JSON.stringify(mine.body),
    );

    const other = await asA(`rule_adherence_v?user_id=eq.${B.id}&select=*`);
    assert(Array.isArray(other.body) && other.body.length === 0,
      "A gets 0 rows from rule_adherence_v filtered to B", JSON.stringify(other.body));

    const anon = await fetch(`${URL_BASE}/rest/v1/rule_adherence_v?select=*`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
    });
    assert(anon.status >= 400, 'anon cannot read rule_adherence_v at all', `status ${anon.status}`);
  }

  // ================================= the admin + CRM wall (0025, round 6)
  // Every other block in this file asserts that a user sees THEIR OWN row and
  // not somebody else's. This one asserts something stronger and simpler: a
  // signed-in user sees NOTHING here, including the row that is about them.
  // The API is the only door (brief §3), so the tables have RLS on and no
  // policy at all for `authenticated`.
  console.log('\nthe CRM is service-role only, from every table:');
  {
    const person = await serviceInsert('crm_people', {
      display_name: `RLS subject ${stamp}`,
      primary_email: `rls-person-${stamp}@example.com`,
      status: 'lead',
      source: 'rls-test',
      app_user_id: A.id,
      first_seen_at: new Date().toISOString(),
    });
    crmPeopleIds.push(person.id);

    await serviceInsert('crm_identities', {
      person_id: person.id, kind: 'email', value: `rls-person-${stamp}@example.com`, source: 'rls-test',
    });
    await serviceInsert('crm_events', {
      person_id: person.id, type: 'sms_in', category: 'message', source: 'kai_sms',
      external_id: `rls-${stamp}-1`,
    });
    await serviceInsert('crm_notes', { person_id: person.id, body: 'staff-only note' });
    await serviceInsert('crm_segments', { name: `rls seg ${stamp}`, filter: { status: 'lead' } });
    await serviceInsert('sync_runs', { source: 'kai_sms', state: 'ok', counts: { scanned: 1 } });

    for (const table of [
      'staff_members', 'crm_people', 'crm_identities', 'crm_events', 'crm_notes',
      'crm_segments', 'invites', 'invite_redemptions', 'admin_audit_log', 'sync_runs',
    ]) {
      const r = await asA(`${table}?select=*`);
      assert(r.status >= 400 || (Array.isArray(r.body) && r.body.length === 0),
        `A reads nothing from ${table}`, `status ${r.status} body ${JSON.stringify(r.body)}`);
    }

    // The row that is ABOUT A is still not A's to read. crm_people carries
    // staff's tags, notes and a `blocked` status — it is not a copy of the
    // user's own data, which lives in tables they already own.
    const mine = await asA(`crm_people?app_user_id=eq.${A.id}&select=*`);
    assert(mine.status >= 400 || (Array.isArray(mine.body) && mine.body.length === 0),
      'not even the person row that describes A', `status ${mine.status} body ${JSON.stringify(mine.body)}`);

    for (const view of ['crm_funnel_v', 'crm_daily_signups_v', 'crm_mrr_v']) {
      const r = await asA(`${view}?select=*`);
      assert(r.status >= 400 || (Array.isArray(r.body) && r.body.length === 0),
        `and nothing from ${view} — a view is the classic way an RLS table leaks`,
        `status ${r.status} body ${JSON.stringify(r.body)}`);
    }

    for (const [table, row] of [
      ['crm_people', { display_name: 'self inserted', status: 'lead' }],
      ['crm_notes', { person_id: person.id, body: 'i am writing my own file' }],
      ['invites', { code: `SELFMADE${stamp}`, tier: 'premium' }],
      ['admin_audit_log', { action: 'nice.try', actor_user_id: A.id }],
    ]) {
      const r = await asA(table, { method: 'POST', body: JSON.stringify(row) });
      assert(r.status >= 400, `A cannot insert into ${table}`,
        `status ${r.status} body ${JSON.stringify(r.body)}`);
    }

    const anonPeople = await fetch(`${URL_BASE}/rest/v1/crm_people?select=id`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
    });
    assert(anonPeople.status >= 400, 'anon cannot reach crm_people at all', `status ${anonPeople.status}`);
  }

  // ============================================ staff_members (0025 §1)
  console.log('\nstaff is its own table, and not even staff may write it:');
  {
    // A is made staff the only way there is: service role, i.e. the API.
    await serviceInsert('staff_members', { user_id: A.id, role: 'support' });

    const read = await asA(`staff_members?user_id=eq.${A.id}&select=role`);
    assert(read.status >= 400 || (Array.isArray(read.body) && read.body.length === 0),
      'a staff member cannot read their own staff row (being staff needs no lookup)',
      `status ${read.status} body ${JSON.stringify(read.body)}`);

    const selfInsert = await asA('staff_members', {
      method: 'POST', body: JSON.stringify({ user_id: B.id, role: 'owner' }),
    });
    assert(selfInsert.status >= 400, 'and cannot grant staff to anyone by direct insert',
      `status ${selfInsert.status} body ${JSON.stringify(selfInsert.body)}`);

    const selfPromote = await asA(`staff_members?user_id=eq.${A.id}`, {
      method: 'PATCH', body: JSON.stringify({ role: 'owner' }),
    });
    const stillSupport = await serviceGet(`staff_members?user_id=eq.${A.id}&select=role`);
    assert(selfPromote.status >= 400 || stillSupport?.[0]?.role === 'support',
      'nor promote themselves from support to owner',
      `status ${selfPromote.status} row ${JSON.stringify(stillSupport)}`);

    // THE REASON THIS TABLE EXISTS. `profiles` IS client-writable (01 §13 row
    // 1) — a staff flag living there would be one PATCH away.
    const viaProfile = await asA(`profiles?user_id=eq.${A.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ display_name: 'still just a user', role: 'owner' }),
    });
    assert(viaProfile.status >= 400 || !('role' in (viaProfile.body?.[0] ?? {})),
      'and profiles — which a user CAN patch — carries no staff column to patch',
      `status ${viaProfile.status} body ${JSON.stringify(viaProfile.body)}`);

    // Only an owner grants staff, and that rule is in the function, not in the
    // route: a support member calling it as the API would still be refused.
    const bySupport = await serviceRpc('set_staff_role', {
      p_user_id: B.id, p_role: 'admin', p_actor_user_id: A.id, p_reason: 'promoting a friend',
    });
    assert(bySupport.status >= 400 && String(bySupport.body?.message).includes('not_owner'),
      'set_staff_role refuses a support member as actor (not_owner)',
      `status ${bySupport.status} body ${JSON.stringify(bySupport.body)}`);

    await serviceInsert('staff_members', { user_id: B.id, role: 'owner' });
    const byOwner = await serviceRpc('set_staff_role', {
      p_user_id: A.id, p_role: 'admin', p_actor_user_id: B.id, p_reason: 'promoted',
    });
    assert(byOwner.status < 300 && byOwner.body?.role === 'admin',
      'and accepts an owner', `status ${byOwner.status} body ${JSON.stringify(byOwner.body)}`);

    const revoked = await serviceRpc('set_staff_role', {
      p_user_id: A.id, p_role: 'revoked', p_actor_user_id: B.id, p_reason: 'left',
    });
    const after = await serviceRpc('staff_role', { p_user_id: A.id });
    assert(revoked.status < 300 && revoked.body?.revoked_at && after.body === null,
      'revoking stamps revoked_at, keeps the row, and staff_role() goes null',
      `revoke ${JSON.stringify(revoked.body)} staff_role ${JSON.stringify(after.body)}`);
  }

  // ================================== no admin RPC is client-callable (0025)
  console.log('\nno admin RPC is reachable with a user JWT:');
  {
    for (const [fn, args] of [
      ['staff_role', { p_user_id: A.id }],
      ['set_staff_role', { p_user_id: A.id, p_role: 'owner', p_actor_user_id: A.id }],
      ['ensure_owner_staff', {}],
      ['new_invite_code', {}],
      ['write_admin_audit', { p_actor_user_id: A.id, p_action: 'forged' }],
      ['redeem_invite', { p_code: 'ANYTHING1234', p_user_id: A.id }],
      ['merge_crm_people', { p_winner_id: A.id, p_loser_id: B.id, p_actor_user_id: A.id }],
      ['unmerge_crm_person', { p_loser_id: A.id, p_actor_user_id: A.id }],
    ]) {
      const r = await asA(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });
      assert(r.status >= 400, `${fn} is not executable by a client JWT`,
        `status ${r.status} body ${JSON.stringify(r.body)}`);
    }

    const anonRedeem = await fetch(`${URL_BASE}/rest/v1/rpc/redeem_invite`, {
      method: 'POST',
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_code: 'ANYTHING1234', p_user_id: A.id }),
    });
    assert(anonRedeem.status >= 400, 'and redeem_invite is not an anon endpoint either — the route is',
      `status ${anonRedeem.status}`);
  }

  // ================================================= invites (0025 §6/§12)
  console.log('\nan invite is one transaction, and a capped one is one seat:');
  {
    const codeRes = await serviceRpc('new_invite_code', {});
    const code = String(codeRes.body ?? '').replace(/"/g, '');
    assert(/^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{12}$/.test(code),
      'new_invite_code returns 12 unambiguous glyphs (no 0/O, 1/I/L, U)', code);

    const invite = await serviceInsert('invites', {
      code, label: 'rls one seat', tier: 'premium',
      entitlements: { duration_days: 30 }, max_redemptions: 1,
    });
    inviteIds.push(invite.id);

    // Case-insensitive by the lower(code) index, not by citext (SCHEMA-NOTES 1.59).
    const ok = await serviceRpc('redeem_invite', {
      p_code: code.toLowerCase(), p_user_id: A.id, p_ip: '203.0.113.7', p_request_id: `req-${stamp}`,
    });
    assert(ok.status < 300 && ok.body?.ok === true && ok.body?.granted?.tier === 'premium',
      'A redeems the code in one call and the grant comes back with it',
      `status ${ok.status} body ${JSON.stringify(ok.body)}`);
    if (ok.body?.person_id) crmPeopleIds.push(ok.body.person_id);

    const sub = await serviceGet(`subscriptions?user_id=eq.${A.id}&select=tier,status,current_period_end`);
    assert(sub?.[0]?.tier === 'premium' && sub[0].status === 'active' && sub[0].current_period_end,
      'the entitlement is real: a premium subscription with a period end',
      JSON.stringify(sub));

    const personRow = await serviceGet(`crm_people?app_user_id=eq.${A.id}&select=id,status`);
    assert(personRow?.[0]?.status === 'signed_up',
      'and the person moved to signed_up in the same transaction', JSON.stringify(personRow));

    const redemption = await serviceGet(`invite_redemptions?invite_id=eq.${invite.id}&select=user_id,granted,ip`);
    assert(redemption?.length === 1 && redemption[0].user_id === A.id && redemption[0].ip === '203.0.113.7',
      'the redemption is on the ledger with its ip and a frozen receipt', JSON.stringify(redemption));

    const audited = await serviceGet(
      `admin_audit_log?action=eq.invite.redeem&target_id=eq.${invite.id}&select=actor_user_id`);
    assert(audited?.length === 1 && audited[0].actor_user_id === A.id,
      'and the grant is in the audit log, actor = the redeemer', JSON.stringify(audited));

    // A retried POST is the SAME redemption, not a second seat.
    const retry = await serviceRpc('redeem_invite', { p_code: code, p_user_id: A.id });
    const count1 = await serviceGet(`invites?id=eq.${invite.id}&select=redeemed_count`);
    assert(retry.body?.ok === true && retry.body?.already_redeemed === true &&
      count1?.[0]?.redeemed_count === 1,
      'redeeming again returns the same grant and spends no second seat',
      `${JSON.stringify(retry.body)} count ${JSON.stringify(count1)}`);

    const exhausted = await serviceRpc('redeem_invite', { p_code: code, p_user_id: B.id });
    assert(exhausted.body?.ok === false && exhausted.body?.reason === 'invite_exhausted',
      'and B is told exactly which thing is wrong: invite_exhausted',
      JSON.stringify(exhausted.body));

    const bSub = await serviceGet(`subscriptions?user_id=eq.${B.id}&select=tier`);
    assert(!Array.isArray(bSub) || bSub.length === 0,
      'B got nothing — the refusal happened before any grant', JSON.stringify(bSub));

    // Each refusal names itself in plain words (brief §6).
    const expired = await serviceInsert('invites', {
      code: `EXP${code.slice(3)}`, tier: 'premium',
      expires_at: new Date(Date.now() - 86400000).toISOString(),
    });
    inviteIds.push(expired.id);
    const revokedInvite = await serviceInsert('invites', {
      code: `RVK${code.slice(3)}`, tier: 'premium', revoked_at: new Date().toISOString(),
    });
    inviteIds.push(revokedInvite.id);

    for (const [c, reason] of [
      [expired.code, 'invite_expired'],
      [revokedInvite.code, 'invite_revoked'],
      ['NOSUCHCODE99', 'invite_not_found'],
      ['', 'invite_code_required'],
    ]) {
      const r = await serviceRpc('redeem_invite', { p_code: c, p_user_id: B.id });
      assert(r.status < 300 && r.body?.ok === false && r.body?.reason === reason,
        `a refusal is a value, not an exception: ${reason}`,
        `status ${r.status} body ${JSON.stringify(r.body)}`);
    }

    // THE RACE (brief §6). Two people redeem the last seat at the same instant,
    // through two separate PostgREST transactions. The row lock in
    // redeem_invite decides it; exactly one grant exists afterwards.
    const raceInvite = await serviceInsert('invites', {
      code: `RACE${code.slice(4)}`, label: 'last seat', tier: 'premium', max_redemptions: 1,
    });
    inviteIds.push(raceInvite.id);

    const [r1, r2] = await Promise.all([
      serviceRpc('redeem_invite', { p_code: raceInvite.code, p_user_id: A.id }),
      serviceRpc('redeem_invite', { p_code: raceInvite.code, p_user_id: B.id }),
    ]);
    const winners = [r1, r2].filter((r) => r.body?.ok === true);
    const losers = [r1, r2].filter((r) => r.body?.reason === 'invite_exhausted');
    assert(winners.length === 1 && losers.length === 1,
      'two simultaneous redemptions of a one-seat invite: exactly one wins',
      `${JSON.stringify(r1.body)} / ${JSON.stringify(r2.body)}`);

    const raceCount = await serviceGet(`invites?id=eq.${raceInvite.id}&select=redeemed_count`);
    const raceRows = await serviceGet(`invite_redemptions?invite_id=eq.${raceInvite.id}&select=id`);
    assert(raceCount?.[0]?.redeemed_count === 1 && raceRows?.length === 1,
      'and the count and the ledger agree: one seat, one row',
      `count ${JSON.stringify(raceCount)} rows ${JSON.stringify(raceRows)}`);
  }

  // ============================== identity resolution + re-ingest (0025 §3/§4)
  console.log('\nthe constraints that make the CRM trustworthy:');
  {
    const p1 = await serviceInsert('crm_people', { display_name: `dup-a ${stamp}`, status: 'lead' });
    const p2 = await serviceInsert('crm_people', { display_name: `dup-b ${stamp}`, status: 'lead' });
    crmPeopleIds.push(p1.id, p2.id);

    const email = `shared-${stamp}@example.com`;
    await serviceInsert('crm_identities', { person_id: p1.id, kind: 'email', value: email });

    const dup = await fetch(`${URL_BASE}/rest/v1/crm_identities`, {
      method: 'POST',
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ person_id: p2.id, kind: 'email', value: email }),
    });
    assert(dup.status >= 400,
      'two people cannot hold one identity — unique(kind, value) is the resolution index',
      `status ${dup.status}`);

    // Different kinds are different namespaces: an invite code and an email
    // that happen to read the same are not the same identity.
    const otherKind = await fetch(`${URL_BASE}/rest/v1/crm_identities`, {
      method: 'POST',
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ person_id: p2.id, kind: 'invite_code', value: email }),
    });
    assert(otherKind.status < 300, 'but the same value under another kind is a different identity',
      `status ${otherKind.status}`);

    // RE-INGEST. The brief's claim is that a second sync run creates ZERO rows,
    // and this is where that is true or not.
    const ext = `kai:evt-${stamp}`;
    const before = await serviceGet(`crm_events?person_id=eq.${p1.id}&select=id`);
    await serviceInsert('crm_events', {
      person_id: p1.id, type: 'sms_in', source: 'kai_sms', external_id: ext,
    });
    const again = await fetch(`${URL_BASE}/rest/v1/crm_events?on_conflict=source,external_id`, {
      method: 'POST',
      headers: {
        apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json',
        Prefer: 'resolution=ignore-duplicates',
      },
      body: JSON.stringify({ person_id: p1.id, type: 'sms_in', source: 'kai_sms', external_id: ext }),
    });
    const after = await serviceGet(`crm_events?person_id=eq.${p1.id}&select=id`);
    assert(again.status < 300 && after.length === before.length + 1,
      're-ingesting the same (source, external_id) creates zero new rows',
      `status ${again.status} ${before.length} -> ${after.length}`);

    // The honest half of that: null is distinct from null, so an event with NO
    // external id is not idempotent and never was (SCHEMA-NOTES 1.60).
    await serviceInsert('crm_events', { person_id: p1.id, type: 'admin_note', source: 'admin' });
    await serviceInsert('crm_events', { person_id: p1.id, type: 'admin_note', source: 'admin' });
    const unkeyed = await serviceGet(`crm_events?person_id=eq.${p1.id}&type=eq.admin_note&select=id`);
    assert(unkeyed.length === 2,
      'an event with no external_id is deliberately not deduplicated — connectors must supply one',
      JSON.stringify(unkeyed));

    // A merge is reversible because it records what it moved.
    const merged = await serviceRpc('merge_crm_people', {
      p_winner_id: p1.id, p_loser_id: p2.id, p_actor_user_id: B.id, p_reason: 'same human',
    });
    assert(merged.body?.ok === true && Array.isArray(merged.body?.moved?.identities),
      'merge_crm_people moves the loser onto the winner and reports the exact ids',
      JSON.stringify(merged.body));

    const loser = await serviceGet(`crm_people?id=eq.${p2.id}&select=merged_into`);
    assert(loser?.[0]?.merged_into === p1.id,
      'the loser survives, pointing at the winner, so old ids still resolve',
      JSON.stringify(loser));

    const movedIdent = await serviceGet(`crm_identities?person_id=eq.${p1.id}&kind=eq.invite_code&select=id`);
    assert(movedIdent?.length === 1, "and the loser's identities now belong to the winner",
      JSON.stringify(movedIdent));

    const undone = await serviceRpc('unmerge_crm_person', {
      p_loser_id: p2.id, p_actor_user_id: B.id, p_reason: 'wrong person',
    });
    const backIdent = await serviceGet(`crm_identities?person_id=eq.${p2.id}&kind=eq.invite_code&select=id`);
    const restored = await serviceGet(`crm_people?id=eq.${p2.id}&select=merged_into`);
    assert(undone.body?.ok === true && backIdent?.length === 1 && restored?.[0]?.merged_into === null,
      'and unmerge moves back exactly those ids',
      `${JSON.stringify(undone.body)} ident ${JSON.stringify(backIdent)}`);

    // Two people who each hold a DIFFERENT app user are not mergeable at all:
    // `app_user_id` is unique, so somebody would have to lose their account.
    // (B may already be linked to the person the race created — take the link
    //  off that row first, since the column allows exactly one holder.)
    const svcPatch = (path, body) => fetch(`${URL_BASE}/rest/v1/${path}`, {
      method: 'PATCH',
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    await svcPatch(`crm_people?app_user_id=eq.${B.id}`, { app_user_id: null });
    await svcPatch(`crm_people?id=eq.${p1.id}`, { app_user_id: B.id });
    const holders = await serviceGet(
      `crm_people?or=(id.eq.${p1.id},id.eq.${crmPeopleIds[0]})&select=id,app_user_id`);
    assert(holders?.length === 2 && holders.every((h) => h.app_user_id),
      'two people, two different app users (the setup for the refusal below)',
      JSON.stringify(holders));
    const conflicted = await serviceRpc('merge_crm_people', {
      p_winner_id: p1.id, p_loser_id: crmPeopleIds[0], p_actor_user_id: B.id,
    });
    assert(conflicted.body?.ok === false && conflicted.body?.reason === 'conflicting_app_user',
      'and two rows each holding a different app user refuse to merge (a human decides)',
      JSON.stringify(conflicted.body));
  }

  // ================================ admin_audit_log is append-only (0025 §7)
  console.log('\nthe audit log cannot be edited by the thing it audits:');
  {
    const row = await serviceRpc('write_admin_audit', {
      p_actor_user_id: B.id, p_action: 'crm.person.view', p_target_kind: 'crm_person',
      p_target_id: crmPeopleIds[0], p_reason: 'support ticket 12', p_ip: '198.51.100.4',
    });
    assert(row.status < 300 && row.body?.action === 'crm.person.view',
      'the API can write one (reads of a person are logged too, not just writes)',
      `status ${row.status} body ${JSON.stringify(row.body)}`);

    const patched = await fetch(`${URL_BASE}/rest/v1/admin_audit_log?id=eq.${row.body.id}`, {
      method: 'PATCH',
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'nothing.happened' }),
    });
    assert(patched.status >= 400, 'service_role cannot rewrite it', `status ${patched.status}`);

    const deleted = await serviceDelete(`admin_audit_log?id=eq.${row.body.id}`);
    assert(deleted.status >= 400, 'nor delete it — the API runs as service_role, and that is the point',
      `status ${deleted.status} body ${JSON.stringify(deleted.body)}`);

    const survives = await serviceGet(`admin_audit_log?id=eq.${row.body.id}&select=action,reason`);
    assert(survives?.[0]?.action === 'crm.person.view' && survives[0].reason === 'support ticket 12',
      'and the row is still there, reason and all', JSON.stringify(survives));
  }

} catch (err) {
  failures++;
  console.error(`\n  ERROR ${err.message}`);
} finally {
  // live_segments / live_frames / live_requests all cascade from live_shows.
  for (const id of liveShowIds) await serviceDelete(`live_shows?id=eq.${id}`);
  await dropRoom(tmpCoreRoom?.id);
  await dropRoom(tmpSetupRoom?.id);
  // setups.discussion_room_id points at the circle 0021 opened, and the FK is
  // deferrable but not ON DELETE - let go of it before the room is removed.
  if (amdCircle) {
    await fetch(`${URL_BASE}/rest/v1/setups?discussion_room_id=eq.${amdCircle}`, {
      method: 'PATCH',
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ discussion_room_id: null }),
    }).catch(() => {});
  }
  await dropRoom(amdCircle);
  await dropRoom(userCircle);
  // positions / debriefs have no FK to profiles (SCHEMA-NOTES gap 2.9) and
  // positions.origin_plan_id would otherwise block the trade_plans cascade.
  for (const id of createdIds) {
    await serviceDelete(`debriefs?user_id=eq.${id}`);
    await serviceDelete(`positions?user_id=eq.${id}`);
  }
  // Round 6 (0025): invites cascade to their redemptions, and a person cascades
  // to its identities, events and notes. `merged_into` is self-referential, so
  // let go of it first. admin_audit_log rows are NOT cleaned up — they cannot
  // be: the table is append-only for service_role too, which is the property
  // this file just asserted. `supabase db reset` is what empties it.
  for (const id of inviteIds) await serviceDelete(`invites?id=eq.${id}`);
  for (const id of crmPeopleIds) {
    await fetch(`${URL_BASE}/rest/v1/crm_people?id=eq.${id}`, {
      method: 'PATCH',
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ merged_into: null }),
    }).catch(() => {});
  }
  for (const id of crmPeopleIds) await serviceDelete(`crm_people?id=eq.${id}`);
  for (const id of createdIds) await serviceDelete(`crm_people?app_user_id=eq.${id}`);
  await serviceDelete(`crm_segments?name=like.rls%20seg%20${stamp}`);
  await serviceDelete(`crm_people?display_name=like.*${stamp}`);
  // notifications has no FK to profiles either, and notification_deliveries
  // cascades from it. push_subscriptions goes with the profile.
  for (const id of notificationIds) await serviceDelete(`notifications?id=eq.${id}`);
  for (const id of createdIds) await deleteUser(id);
}

console.log(`\n${failures === 0 ? 'RLS TEST PASSED' : `RLS TEST FAILED (${failures} failure(s))`}`);
process.exit(failures === 0 ? 0 : 1);
