-- 0024 — Round 5: the push registry, the delivery ledger, and who owns a token.
--
-- Source: docs/BUILD-BRIEF-round-5-push.md §5. The contracts these tables serve
-- are `packages/shared/api.ts` (API-5) and `apps/api/src/lib/push/**`.
--
-- THE RULE THIS ROUND IS BUILT ON (brief §3): one notification, two transports.
-- `notify()` stays the single writer. It writes the in-app `notifications` row
-- exactly as it does today, then enqueues ONE `notification_deliveries` row per
-- outcome. The inbox and the buzz say the same thing because they are the same
-- row — nothing here duplicates a notification's copy, and there is deliberately
-- no title/body column below.
--
-- A SUPPRESSED PUSH IS A RECORD, NOT A DROP. Quiet hours, a category switched
-- off, the daily budget, no device at all — each writes a `suppressed` row with
-- its reason. That is what lets `POST /push/test` answer "you are in quiet hours
-- right now" instead of appearing broken, and what lets us answer "why did I not
-- get that" six hours later. The in-app row always survives regardless.
--
-- WHAT A CLIENT MAY DO. Read its own subscriptions, delete its own
-- subscriptions, and call the two RPCs below. It may not INSERT a subscription
-- directly (registration decides the owner — see §4), may not UPDATE one
-- (`state`/`failure_count` are the sender's bookkeeping), and may not read
-- `notification_deliveries` at all: ticket ids, receipt state and provider
-- errors are operational data about a third party, not user data.
--
-- Every function below carries its own revoke and the schema-wide function grant
-- floor is re-applied at the bottom (SCHEMA-NOTES gap 2.7).

-- =====================================================================
-- 1. push_subscriptions
-- =====================================================================
-- One row per DEVICE-AND-TRANSPORT, not per user: a person is a phone plus two
-- browsers, and each of those is a separate thing that can go stale on its own.
--
-- `handle` is whatever the transport addresses: an `ExponentPushToken[...]` for
-- expo, the endpoint URL for web push. `keys` carries the web `{p256dh, auth}`
-- pair (null for expo) — those are the browser's encryption keys, not ours, and
-- without them a web row is undeliverable (SCHEMA-NOTES gap 2.31).
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  transport text not null check (transport in ('expo', 'web')),
  handle text not null,
  keys jsonb,
  platform text check (platform in ('ios', 'android', 'web')),
  -- Shown to the user in Settings, so they can turn off the laptop they lent
  -- someone without turning off their phone. Cosmetic; never a key.
  device_label text,
  -- 'stale' is the sender's opinion (a run of failures), 'revoked' is a decision
  -- (the user turned this device off, or the provider said DeviceNotRegistered).
  -- Only 'active' rows are ever sent to.
  state text not null default 'active' check (state in ('active', 'stale', 'revoked')),
  failure_count int not null default 0,
  last_seen_at timestamptz,
  last_success_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  -- A TOKEN BELONGS TO EXACTLY ONE ROW — globally, not per user. See §4 for why
  -- that uniqueness is a security property and not merely tidiness.
  unique (transport, handle)
);

-- The send path's only question: "the active subscriptions for this user".
create index push_subscriptions_user_state_idx on push_subscriptions (user_id, state);

create trigger set_updated_at before update on public.push_subscriptions
  for each row execute function public.set_updated_at();

-- =====================================================================
-- 2. notification_deliveries
-- =====================================================================
-- The ledger. One row per (notification, outcome): queued → sent → delivered,
-- or failed, or suppressed with a reason.
--
-- `subscription_id` is NULLABLE and `on delete set null` on purpose. Two cases
-- produce a delivery row with no subscription:
--   * a user-level suppression (push off, category off, quiet hours, budget, no
--     device) is decided BEFORE any device is chosen — there is no subscription
--     to point at, and inventing one would be a lie;
--   * a subscription that has since been pruned. The receipt and the reason it
--     failed are exactly what we want to keep AFTER the token is gone.
-- `transport` therefore records what would have been used; a user-level
-- suppression records 'none' (SCHEMA-NOTES 1.53) rather than picking a transport
-- nobody selected.
create table notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references notifications on delete cascade,
  subscription_id uuid references push_subscriptions on delete set null,
  transport text not null,
  state text not null check (state in ('queued', 'sent', 'delivered', 'failed', 'suppressed')),
  -- Free text by design: the closed half is ours (quiet_hours | prefs_off |
  -- budget | no_subscription | entitlement) and the open half is the provider's
  -- (DeviceNotRegistered, http_410, MessageRateExceeded, …). Constraining a
  -- vocabulary a third party owns means a migration every time Expo adds a code.
  reason text,
  ticket_id text,
  receipt_checked_at timestamptz,
  attempts int not null default 0,
  next_attempt_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- THE DRAIN QUERY: "queued or retryable, due now". Both columns, in this order,
-- because the state is the selective half.
create index notification_deliveries_drain_idx
  on notification_deliveries (state, next_attempt_at);

-- "What happened to this notification" — the inbox's own why-didn't-I-get-it.
create index notification_deliveries_notification_idx
  on notification_deliveries (notification_id);

-- Unindexed FK otherwise, and token pruning walks exactly this way: one
-- subscription came back DeviceNotRegistered, find its rows.
create index notification_deliveries_subscription_idx
  on notification_deliveries (subscription_id) where subscription_id is not null;

create trigger set_updated_at before update on public.notification_deliveries
  for each row execute function public.set_updated_at();

-- =====================================================================
-- 3. notification_prefs — the master switch and the category map
-- =====================================================================
-- `categories` is jsonb and EMPTY MEANS ALL ON (brief §4.5). Deliberately not
-- five boolean columns and not a row-per-category table: the set is a product
-- decision that will move, absence is the default rather than a value to
-- backfill, and nothing ever filters or joins on a category.
--   { "trade_alerts": true, "order_status": false, ... }  -- absent key = on
--
-- `push_enabled` is the priming screen's master switch and is a SEPARATE
-- question from OS permission. Permission lives on the device; this is the
-- user's intent, which survives a reinstall and is what we honour when the two
-- disagree.
alter table notification_prefs
  add column categories jsonb not null default '{}'::jsonb,
  add column push_enabled boolean not null default true;

-- No grant or policy changes needed: 0014 row 1 already gives the owner full
-- read/write on `notification_prefs` at table level, which covers new columns.

-- =====================================================================
-- 4. register_push_subscription — the security boundary of this migration
-- =====================================================================
-- Registration decides WHO A DEVICE BELONGS TO, so it is the one write a client
-- may not do directly. The owner is `auth.uid()`; it is never an argument a JWT
-- holder can set.
--
-- THE RE-REGISTRATION CASE, which is the whole reason this is a function.
-- `unique (transport, handle)` is global, so re-registering a handle can collide
-- with a row that:
--   (a) is the caller's own, currently 'revoked' or 'stale' — they turned
--       notifications back on, and must end 'active';
--   (b) BELONGS TO A DIFFERENT USER — a handed-down phone, a shared browser
--       profile, a demo device, a reinstall onto a recycled token.
-- Case (b) is a real security boundary and the resolution is not obvious, so:
-- the row is TAKEN OVER by the current caller. Leaving `user_id` on the previous
-- owner is the dangerous option — it would push the previous owner's alerts,
-- positions and P&L to a device the new owner is holding. Refusing the
-- registration is the second-worst option: the new owner silently gets no push
-- forever while the old owner keeps buzzing a phone they no longer have. The
-- token addresses whoever is holding the device NOW, and so must the row.
-- `last_success_at` is cleared on a change of owner because a delivery history
-- belongs to the account that earned it; `failure_count` resets either way,
-- because a token the client just produced is a working token.
-- The trade this makes: A, holding B's token, can move it to A and stop B's
-- device from buzzing. That is a denial, not a disclosure — B's next app launch
-- re-registers and takes it back — and it is strictly better than the
-- disclosure the other two options buy (SCHEMA-NOTES 1.53).
--
-- SECURITY DEFINER is required, not decorative: the conflicting row in case (b)
-- is invisible to the caller under the owner-select policy, so an
-- RLS-constrained `on conflict do update` would find nothing to update and fail
-- as a bare unique violation.
--
-- `p_user_id` is the LAST parameter, defaulted, and is only consulted when
-- `auth.uid()` is null — i.e. a service_role call from the API, which is how
-- `POST /api/v1/push/subscriptions` registers on the caller's behalf after it
-- has authenticated them itself. A JWT that passes a p_user_id other than its
-- own is refused loudly rather than silently ignored. Same shape as 0018's
-- `join_core_room`.
create or replace function register_push_subscription(
  p_transport text,
  p_handle    text,
  p_keys      jsonb default null,
  p_platform  text  default null,
  p_label     text  default null,
  p_user_id   uuid  default null
) returns push_subscriptions
language plpgsql security definer set search_path = public as $$
declare
  v_user   uuid;
  v_handle text := btrim(coalesce(p_handle, ''));
  v_row    push_subscriptions;
begin
  if auth.uid() is not null and p_user_id is not null and p_user_id <> auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_user := coalesce(auth.uid(), p_user_id);
  if v_user is null then
    raise exception 'user_required' using errcode = '42501';
  end if;

  if p_transport not in ('expo', 'web') then
    raise exception 'transport_invalid' using errcode = '22023';
  end if;
  if v_handle = '' then
    raise exception 'handle_required' using errcode = '22023';
  end if;
  if p_platform is not null and p_platform not in ('ios', 'android', 'web') then
    raise exception 'platform_invalid' using errcode = '22023';
  end if;

  insert into push_subscriptions (
    user_id, transport, handle, keys, platform, device_label,
    state, failure_count, last_seen_at)
  values (
    v_user, p_transport, v_handle, p_keys, p_platform, p_label,
    'active', 0, now())
  on conflict (transport, handle) do update set
    user_id         = excluded.user_id,
    -- A re-register that omits the optional fields keeps what we knew, rather
    -- than blanking a device label because one client sends fewer arguments.
    keys            = coalesce(excluded.keys, push_subscriptions.keys),
    platform        = coalesce(excluded.platform, push_subscriptions.platform),
    device_label    = coalesce(excluded.device_label, push_subscriptions.device_label),
    state           = 'active',
    failure_count   = 0,
    last_seen_at    = now(),
    last_success_at = case
                        when push_subscriptions.user_id = excluded.user_id
                        then push_subscriptions.last_success_at
                        else null
                      end,
    updated_at      = now()
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function register_push_subscription(text, text, jsonb, text, text, uuid)
  from public, anon, authenticated;
-- Granted back at the bottom, after the floor: a client genuinely calls this.

-- =====================================================================
-- 5. revoke_push_subscription — "turn this device off"
-- =====================================================================
-- Owner-only for a JWT; service_role may revoke any row, which is how a
-- `DeviceNotRegistered` ticket or a 410 from a web endpoint retires a token
-- nobody asked us to retire.
--
-- A row that is not yours and a row that does not exist give the SAME answer.
-- Distinguishing them would turn this function into an oracle for which push
-- tokens exist in the system.
--
-- Revoke rather than delete: the delivery ledger points here, the state is the
-- honest record ("this device was turned off", not "this device never existed"),
-- and a re-register through §4 brings the same row back to 'active'.
create or replace function revoke_push_subscription(p_id uuid)
returns push_subscriptions
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_row  push_subscriptions;
begin
  update push_subscriptions
     set state = 'revoked', updated_at = now()
   where id = p_id
     and (v_user is null or user_id = v_user)
  returning * into v_row;

  if not found then
    raise exception 'subscription_not_found' using errcode = '42501';
  end if;

  return v_row;
end;
$$;

revoke all on function revoke_push_subscription(uuid) from public, anon, authenticated;

-- =====================================================================
-- 6. RLS
-- =====================================================================
-- 0014's "enable RLS on every table" DO-loop ran once, before these tables
-- existed. Enable it here, explicitly.
revoke all on push_subscriptions, notification_deliveries from anon, authenticated;

alter table push_subscriptions enable row level security;
alter table notification_deliveries enable row level security;

grant select on push_subscriptions to authenticated;
create policy push_subscriptions_owner_select on push_subscriptions
  for select to authenticated
  using (user_id = auth.uid());

-- Deleting a device is the user's own decision and needs no server round trip.
-- (The API's DELETE route revokes instead, so the ledger keeps its FK; a client
-- that deletes outright simply loses the join, which is why `subscription_id`
-- is `on delete set null` rather than cascading the history away.)
grant delete on push_subscriptions to authenticated;
create policy push_subscriptions_owner_delete on push_subscriptions
  for delete to authenticated
  using (user_id = auth.uid());

-- No INSERT: registration decides the owner (§4), and an insert policy with
-- `check (user_id = auth.uid())` would still let a client claim a handle that
-- collides with another user's row and get a raw unique violation instead of
-- the takeover semantics. No UPDATE: `state`, `failure_count` and
-- `last_success_at` are the sender's bookkeeping, and a client that could write
-- `state` could un-revoke a device an admin retired.
revoke insert, update on push_subscriptions from anon, authenticated;

-- notification_deliveries: SERVICE ROLE ONLY. No grant and NO POLICY AT ALL for
-- `authenticated` — not an owner-select one either. There is no user-facing
-- question this table answers that the notification row does not, and it carries
-- provider ticket ids and error strings. The absence of a policy is the
-- statement; a table with RLS on and no policy returns nothing to anyone but a
-- role that bypasses RLS.

grant select, insert, update, delete on push_subscriptions, notification_deliveries
  to service_role;

-- =====================================================================
-- 7. FUNCTION GRANT FLOOR (SCHEMA-NOTES gap 2.7)
-- =====================================================================
-- Postgres hands EXECUTE on every new function to PUBLIC, and Supabase's default
-- privileges add anon + authenticated. Re-apply the floor across the schema,
-- then grant back exactly the client-callable set: the three from 0021, 0023's
-- policy predicate (RLS evaluates it as the invoking user, so it cannot work
-- without EXECUTE for `authenticated`), and this migration's two.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end;
$$;

grant execute on function is_room_member(uuid) to authenticated;
grant execute on function join_core_room(uuid, uuid) to authenticated;
grant execute on function set_room_mute(uuid, uuid, timestamptz) to authenticated;
grant execute on function live_can_watch_market() to authenticated, service_role;
grant execute on function register_push_subscription(text, text, jsonb, text, text, uuid)
  to authenticated, service_role;
grant execute on function revoke_push_subscription(uuid) to authenticated, service_role;
