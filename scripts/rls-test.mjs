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

// --------------------------------------------------------------------- run
const stamp = Date.now();
const A = { email: `rls-a-${stamp}@example.com`, password: `pw-a-${stamp}!A1` };
const B = { email: `rls-b-${stamp}@example.com`, password: `pw-b-${stamp}!B1` };

let createdIds = [];

try {
  console.log(`RLS test against ${URL_BASE}\n`);

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
    const room = await serviceGet('rooms?slug=eq.dt-beginner-questions&select=id');
    const roomId = room[0]?.id;
    if (!roomId) throw new Error('seed room dt-beginner-questions missing');

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
    assert(Array.isArray(rooms.body) && rooms.body.length === 19, 'A reads the 19 core rooms', `n=${rooms.body?.length}`);
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
} catch (err) {
  failures++;
  console.error(`\n  ERROR ${err.message}`);
} finally {
  for (const id of createdIds) await deleteUser(id);
}

console.log(`\n${failures === 0 ? 'RLS TEST PASSED' : `RLS TEST FAILED (${failures} failure(s))`}`);
process.exit(failures === 0 ? 0 : 1);
