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
let tmpCoreRoom = null;
let tmpSetupRoom = null;

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
    assert(Array.isArray(flags.body) && flags.body.length === 12, 'A reads entitlement flags', `n=${flags.body?.length}`);
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

} catch (err) {
  failures++;
  console.error(`\n  ERROR ${err.message}`);
} finally {
  await dropRoom(tmpCoreRoom?.id);
  await dropRoom(tmpSetupRoom?.id);
  // positions / debriefs have no FK to profiles (SCHEMA-NOTES gap 2.9) and
  // positions.origin_plan_id would otherwise block the trade_plans cascade.
  for (const id of createdIds) {
    await serviceDelete(`debriefs?user_id=eq.${id}`);
    await serviceDelete(`positions?user_id=eq.${id}`);
  }
  for (const id of createdIds) await deleteUser(id);
}

console.log(`\n${failures === 0 ? 'RLS TEST PASSED' : `RLS TEST FAILED (${failures} failure(s))`}`);
process.exit(failures === 0 ? 0 : 1);
