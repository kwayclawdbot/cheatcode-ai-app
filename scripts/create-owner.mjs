/**
 * Create (or repair) the owner's account on the LOCAL stack and grant staff.
 *
 * `supabase db reset` wipes auth, so this is written to be re-run: it creates the
 * auth user if absent, resets the password if present, then calls the idempotent
 * `ensure_owner_staff()` from 0025, which grants `owner` and writes the audit row.
 *
 * The password is NEVER stored in this file. Pass it in:
 *   OWNER_PASSWORD='…' node scripts/create-owner.mjs
 *
 * No dependencies, `fetch` only — same shape as scripts/rls-test.mjs.
 *
 * Local only by design: it refuses to run against a non-localhost SUPABASE_URL,
 * because a service-role key plus a password reset is not a thing to point at
 * production by accident.
 */
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../apps/api/.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);

const BASE = env.SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = process.env.OWNER_EMAIL ?? 'kcoffie90@gmail.com';
const PASSWORD = process.env.OWNER_PASSWORD;

if (!PASSWORD) {
  console.error('Set OWNER_PASSWORD. It is deliberately not stored in this file.');
  process.exit(1);
}
if (!/^https?:\/\/(127\.0\.0\.1|localhost)/.test(BASE ?? '')) {
  console.error(`Refusing to run: SUPABASE_URL is ${BASE}, which is not local.`);
  process.exit(1);
}

const svc = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const j = async (res) => { const t = await res.text(); try { return t ? JSON.parse(t) : null; } catch { return t; } };

const found = await j(await fetch(`${BASE}/auth/v1/admin/users?per_page=200`, { headers: svc }));
const existing = (found?.users ?? []).find((u) => (u.email ?? '').toLowerCase() === EMAIL.toLowerCase());

let userId;
if (existing) {
  const r = await fetch(`${BASE}/auth/v1/admin/users/${existing.id}`, {
    method: 'PUT', headers: svc,
    body: JSON.stringify({ password: PASSWORD, email_confirm: true }),
  });
  const b = await j(r);
  if (!r.ok) { console.error(`password reset failed: ${JSON.stringify(b)}`); process.exit(1); }
  userId = existing.id;
  console.log(`auth user existed, password reset — ${EMAIL} ${userId}`);
} else {
  const r = await fetch(`${BASE}/auth/v1/admin/users`, {
    method: 'POST', headers: svc,
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, email_confirm: true }),
  });
  const b = await j(r);
  if (!r.ok) { console.error(`create failed: ${JSON.stringify(b)}`); process.exit(1); }
  userId = b.id;
  console.log(`auth user created — ${EMAIL} ${userId}`);
}

const rpc = await fetch(`${BASE}/rest/v1/rpc/ensure_owner_staff`, { method: 'POST', headers: svc, body: '{}' });
console.log(`ensure_owner_staff → ${rpc.status} ${JSON.stringify(await j(rpc))}`);

const staff = await j(await fetch(`${BASE}/rest/v1/staff_members?user_id=eq.${userId}&select=user_id,role,granted_at`, { headers: svc }));
console.log(`staff_members → ${staff?.[0] ? `${staff[0].role} (granted ${staff[0].granted_at})` : 'NO ROW'}`);

const prof = await j(await fetch(`${BASE}/rest/v1/profiles?user_id=eq.${userId}&select=user_id`, { headers: svc }));
console.log(`profile → ${prof?.[0] ? 'exists' : 'MISSING (handle_new_user did not fire)'}`);
