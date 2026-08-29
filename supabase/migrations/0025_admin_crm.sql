-- 0025 — Round 6: the staff role, the CRM, invites, and the audit log.
--
-- Source: docs/BUILD-BRIEF-round-6-admin-crm.md §3 (security), §4 (schema),
-- §6 (invites), §8 (the three funnel views). The API this serves is
-- `/api/v1/admin/**` (lane ADMIN-2) and the connectors in
-- `apps/api/src/lib/crm/sources/**` (lane ADMIN-3).
--
-- THIS IS A PORT, NOT AN INVENTION (brief §1). `crm.contacts` in the K.AI
-- project `ryprohqthwflinadqotj` already carries 2,507 real people with exactly
-- this shape, and `crm.events` 3,320 timeline rows against it. The column list
-- below is that model, moved into this database, which becomes the one home of
-- record. The score columns come along as nullable and stay EMPTY until
-- something computes them — an empty column is honest, a fabricated score is
-- not. (The brief says six; the live `crm.contacts` has eight plus
-- `scores_updated_at`, read off information_schema on 2026-08-29 rather than
-- guessed, and all nine are below.)
--
-- THE ONE RULE THIS MIGRATION EXISTS TO ENFORCE. Every table below is
-- SERVICE-ROLE ONLY: RLS enabled, and ZERO policies for `authenticated`, on all
-- of them. That is the exact opposite of the rest of this schema, where a table
-- is owner-readable and the policy names the owner. The reason is that there is
-- no owner here: `crm_people` is every user's data plus every lead's, and the
-- question "may you read this row" is not answerable from the row. It is
-- answerable only from `staff_members`, and a policy that consulted
-- `staff_members` would still be a policy that hands a JWT holder a door. The
-- API is the only door (brief §3), `staffed()` in `lib/http.ts` is the lock, and
-- a table with RLS on and no policy is what makes a wrong route the only way in
-- rather than one of two.
--
-- `staff_members` IS ITS OWN TABLE and never a flag on `profiles`, because
-- `PATCH /settings` writes `profiles` with the user's own JWT under
-- `profiles_owner_all`. A staff bit living there is one missing field-filter
-- away from self-promotion (brief §3). It is also not readable by its own
-- holder: staff do not need to read the table to be staff, and the list of who
-- can see everything is not a thing to hand out.
--
-- Every function below is granted to `service_role` ONLY — this migration adds
-- no client-callable function at all — and the schema-wide function grant floor
-- is re-applied at the bottom (SCHEMA-NOTES gap 2.7).
--
-- =====================================================================
-- FUNCTION SIGNATURES (this block is the contract for lanes ADMIN-2/3)
-- =====================================================================
--
--   staff_role(p_user_id uuid) returns text
--     GRANT: service_role. null when there is no row or it is revoked. One
--     definition of "is staff right now", so `staffed()`, the merge RPC and the
--     staff-management RPC cannot disagree about what `revoked_at` means.
--
--   set_staff_role(p_user_id uuid, p_role text, p_actor_user_id uuid,
--                  p_reason text default null) returns staff_members
--     GRANT: service_role. p_role in (support|admin|owner|revoked). ONLY an
--     active `owner` may call it (checked here, not only in the route), and
--     'revoked' sets revoked_at rather than deleting. Writes admin_audit_log.
--     Raises 42501 'not_owner' / 'actor_required', 22023 'role_invalid'.
--
--   ensure_owner_staff() returns uuid
--     GRANT: service_role. Idempotently seeds the owner row for the app owner's
--     auth user, found BY EMAIL. Returns null (and changes nothing) when that
--     user does not exist in this database — see §1 for why this is a lookup
--     and not a hardcoded uuid.
--
--   new_invite_code(p_length int default 12) returns text
--     GRANT: service_role. 30-glyph alphabet with no ambiguous characters, drawn
--     from `gen_random_bytes` with rejection sampling — ~59 bits at the default
--     length. Uniqueness is the `lower(code)` index; the caller retries.
--
--   write_admin_audit(p_actor_user_id uuid, p_action text, p_target_kind text,
--                     p_target_id text, p_before jsonb, p_after jsonb,
--                     p_reason text, p_request_id text, p_ip inet)
--     returns admin_audit_log
--     GRANT: service_role. The single writer of the append-only log. Reads of a
--     person's detail page go through here too, not just writes (brief §3).
--
--   redeem_invite(p_code text, p_user_id uuid, p_ip inet default null,
--                 p_request_id text default null) returns jsonb
--     GRANT: service_role (POST /api/v1/invites/redeem calls it after it has
--     authenticated the user itself). ONE transaction: claim the slot, grant the
--     entitlements, write invite_redemptions, move the person forward, write the
--     crm_event, the user_events row and the audit row.
--     Returns {ok, reason, already_redeemed, invite_id, label, tier, granted,
--              person_id, redemption_id}. A refusal is a VALUE, not an
--     exception (SCHEMA-NOTES 1.25/1.29), because the public route has to render
--     "that code expired on the 4th" rather than parse an error string.
--     reason ∈ invite_code_required | invite_not_found | invite_revoked |
--              invite_expired | invite_exhausted | user_not_found.
--
--   merge_crm_people(p_winner_id uuid, p_loser_id uuid, p_actor_user_id uuid,
--                    p_reason text default null) returns jsonb
--     GRANT: service_role. Moves identities/events/notes/redemptions onto the
--     winner, stamps `merged_into` on the loser, audits, and returns the exact
--     ids it moved so the merge can be undone. Refusals are values:
--     person_not_found | same_person | already_merged | winner_is_merged |
--     conflicting_app_user.
--
--   unmerge_crm_person(p_loser_id uuid, p_actor_user_id uuid,
--                      p_reason text default null) returns jsonb
--     GRANT: service_role. Reads the last un-undone merge audit row for that
--     person and moves exactly those ids back. Refusals: person_not_found |
--     not_merged | no_merge_record.
--
-- =====================================================================

-- =====================================================================
-- 1. staff_members
-- =====================================================================
-- Three roles, and the ladder is about blast radius, not seniority (brief §3):
--   support — read + notes. Cannot grant anything.
--   admin   — invites, entitlements, merges: everything but staff management.
--   owner   — grants staff.
--
-- REVOKED IS A TIMESTAMP, NOT A DELETE. "This person was staff until the 4th"
-- is the answer an audit log needs six months later; a deleted row answers
-- "they never were". `staff_role()` is the only thing that reads the two
-- columns together, so nothing can forget the `revoked_at is null` half.
create table staff_members (
  user_id uuid primary key references profiles on delete cascade,
  role text not null check (role in ('support', 'admin', 'owner')),
  -- Nullable because the migration's own seed has no human actor to name; every
  -- later grant carries one. `on delete set null` — a granter's account going
  -- away must not take the grantee's staff row with it.
  granted_by uuid references profiles on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create trigger set_updated_at before update on public.staff_members
  for each row execute function public.set_updated_at();

-- =====================================================================
-- 2. crm_people — the canonical person
-- =====================================================================
-- One row per HUMAN, not per account and not per channel. A person may have no
-- app user at all (a lead who only ever texted Kai), one app user, and any
-- number of identities in §3.
--
-- `status` is the funnel, and it is DERIVED BY THE INGEST, not written twice
-- (brief §5): signed_up → onboarded → activated → paying come from this
-- database's own rows. It is stored anyway rather than computed in a view
-- because the admin surface filters and segments on it, and because a lead has
-- no rows to derive anything from.
--
-- `merged_into` makes a merge reversible: the loser row survives, pointing at
-- the winner, so every foreign id that ever resolved to it still lands
-- somewhere. Every query in the admin surface filters
-- `merged_into is null and deleted_at is null`; the three views below do.
create table crm_people (
  id uuid primary key default gen_random_uuid(),
  display_name text,
  -- The DISPLAY copies. The resolution copies live in `crm_identities` and are
  -- what uniqueness is enforced on; these two are what a list row shows, and
  -- they are allowed to be a slightly stale pick among several.
  primary_email text,
  primary_phone_e164 text,
  status text not null default 'lead' check (status in (
    'lead', 'invited', 'signed_up', 'onboarded', 'activated', 'paying',
    'churned', 'blocked')),
  -- Free text, deliberately: `cheatcode-crm` was burned by fake Pro/VIP+ tiers
  -- (brief §8) and this column carries whatever the SOURCE says the person is
  -- on, which is not this app's `subscriptions.tier` vocabulary. What the app
  -- grants is in `subscriptions`; what a foreign system claims is here.
  primary_tier text,
  source text,
  source_detail jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz,
  last_active_at timestamptz,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  -- COUNTS AND TIMESTAMPS ONLY. 19,100 private SMS turns do not get duplicated
  -- into a marketing tool (brief §3); there is no body column here and there is
  -- not going to be one. Opening a transcript is a separate, reason-required
  -- action that writes an audit row.
  inbound_count int not null default 0,
  outbound_count int not null default 0,
  total_paid_cents bigint,
  -- In `crm.contacts` and not in the brief's abbreviated §4 list. Ported anyway:
  -- leaving it out would make the ingest drop a number it already has, and a
  -- refund is exactly the kind of thing a revenue screen must not silently miss.
  total_refunded_cents bigint,
  current_mrr_cents int,
  ltv_cents bigint,
  -- THE SCORES, PORTED EMPTY. Nothing in this app computes any of them and
  -- nothing here pretends to: they exist so the ingest can carry across whatever
  -- the K.AI side has already computed, and so a scorer later has a place to
  -- write. Until then every one of them is null on every row, which the admin UI
  -- must render as "not tracked yet" rather than as a zero (brief §8).
  score_engagement numeric,
  score_buy_propensity numeric,
  score_churn_risk numeric,
  score_upsell_propensity numeric,
  score_crosssell_propensity numeric,
  score_responsiveness numeric,
  score_predicted_ltv_cents bigint,
  score_predicted_days_to_churn int,
  scores_updated_at timestamptz,
  tags text[] not null default '{}'::text[],
  custom_fields jsonb not null default '{}'::jsonb,
  -- Null for a lead. UNIQUE: two people rows claiming one app user is exactly
  -- the double-resolution this schema exists to prevent. `on delete set null`
  -- because a person who deletes their account is still a person we talked to.
  app_user_id uuid unique references profiles on delete set null,
  merged_into uuid references crm_people on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz
);

-- The list screen's default sort and its two filters.
create index crm_people_status_idx on crm_people (status, last_active_at desc nulls last)
  where merged_into is null and deleted_at is null;
create index crm_people_source_idx on crm_people (source)
  where merged_into is null and deleted_at is null;
create index crm_people_last_active_idx on crm_people (last_active_at desc nulls last)
  where merged_into is null and deleted_at is null;
-- Segment filters are tag membership.
create index crm_people_tags_idx on crm_people using gin (tags);
-- "show me everything that merged into this person"
create index crm_people_merged_into_idx on crm_people (merged_into)
  where merged_into is not null;

create trigger set_updated_at before update on public.crm_people
  for each row execute function public.set_updated_at();

-- =====================================================================
-- 3. crm_identities — THE RESOLUTION INDEX
-- =====================================================================
-- `unique (kind, value)` is the load-bearing line of this migration. Identity
-- resolution (brief §5) matches stripe_customer → app_user → email → phone, and
-- the reason that algorithm can be trusted is not that it is written carefully
-- in TypeScript: it is that the database will not physically hold two people
-- claiming one identity. A connector that gets the order wrong gets a unique
-- violation and a `merge_conflict` for a human, which is the outcome the brief
-- asks for, instead of two half-populated people nobody notices for a year.
--
-- NORMALISATION IS THE INGEST'S JOB (lowercased, trimmed email; E.164 phone) —
-- the constraint cannot do it, because `value` holds seven different kinds of
-- thing. What the constraint does is make the ingest's normalisation the only
-- question: get it right and double-resolution is impossible, get it wrong and
-- you get a second person, never a silently shared one.
create table crm_identities (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references crm_people on delete cascade,
  kind text not null check (kind in (
    'email', 'phone', 'app_user', 'stripe_customer', 'kai_user', 'os_user',
    'invite_code')),
  value text not null,
  source text,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  unique (kind, value)
);

create index crm_identities_person_idx on crm_identities (person_id, kind);

-- =====================================================================
-- 4. crm_events — the timeline
-- =====================================================================
-- `unique (source, external_id)` is what makes re-ingest idempotent, and the
-- brief's verification (§10) is that a second sync run creates ZERO rows. That
-- is structurally true here rather than a property of the connector's
-- bookkeeping: every connector inserts with `on conflict (source, external_id)
-- do nothing`, and a resumed, retried or double-scheduled run writes nothing.
--
-- It is a table CONSTRAINT rather than a bare index because ON CONFLICT has to
-- be able to infer it: the connectors insert with `on conflict (source,
-- external_id) do nothing`, and a partial index would not be inferable from
-- that statement — the ingest would take a 409 per already-seen row instead of
-- writing nothing quietly.
--
-- Null is distinct from null, so an event with NO external id is never
-- deduplicated. That is deliberate and it is the connectors' obligation, not a
-- hole: an unkeyed event is an admin action or a redemption, written once by the
-- thing that caused it and never re-ingested (SCHEMA-NOTES 1.60).
create table crm_events (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references crm_people on delete cascade,
  type text not null,
  category text,
  source text not null check (source in ('app', 'kai_sms', 'stripe', 'admin', 'import')),
  payload jsonb not null default '{}'::jsonb,
  value_cents bigint,
  occurred_at timestamptz not null default now(),
  ingested_at timestamptz not null default now(),
  external_id text,
  unique (source, external_id)
);

-- The person detail page: one person's timeline, newest first.
create index crm_events_person_idx on crm_events (person_id, occurred_at desc);
-- The overview's day buckets and the ingest's "what did this run write".
create index crm_events_occurred_idx on crm_events (occurred_at desc);

-- =====================================================================
-- 5. crm_notes / crm_segments
-- =====================================================================
-- A note is staff writing about a user. It is not the user's data and it is
-- never shown to them, which is precisely why it lives behind the same
-- service-role-only wall as everything else here.
create table crm_notes (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references crm_people on delete cascade,
  -- `on delete set null`: a note outlives the staff member who left.
  author_user_id uuid references profiles on delete set null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index crm_notes_person_idx on crm_notes (person_id, created_at desc);

create trigger set_updated_at before update on public.crm_notes
  for each row execute function public.set_updated_at();

-- SAVED FILTERS, NOT A QUERY LANGUAGE (brief §4). `filter` is the same shape
-- the People screen's own filter state has — {status, tier, source, tags} — and
-- the API applies it with the same code path. Nothing here is ever executed as
-- SQL, and a segment that references a field the API does not know about is
-- ignored rather than a new expression evaluator.
create table crm_segments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  filter jsonb not null default '{}'::jsonb,
  created_by uuid references profiles on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create unique index crm_segments_name_uniq on crm_segments (lower(name));

create trigger set_updated_at before update on public.crm_segments
  for each row execute function public.set_updated_at();

-- =====================================================================
-- 6. invites
-- =====================================================================
-- v1 invites are codes and links (brief §2 — no email vendor is configured
-- anywhere in this app, and a code the owner sends by any channel works today).
--
-- `code` IS text WITH A `lower(code)` UNIQUE INDEX, NOT citext. citext was the
-- brief's first suggestion and it is the wrong tool HERE specifically: the
-- extension lives in the `extensions` schema, every security-definer function
-- in this schema pins `set search_path = public`, and a citext comparison with
-- the citext operators out of scope does not fail loudly — it silently falls
-- back to text equality and becomes case-SENSITIVE. Measured on the local stack
-- before choosing (SCHEMA-NOTES 1.59). A `lower()` index and an explicit
-- `lower()` in the one lookup cannot degrade quietly.
--
-- `tier` is the app's own vocabulary (`subscriptions.tier`) because that is what
-- redemption writes. `entitlements` carries the rest: `duration_days` is the
-- only key this migration reads; everything else is copied verbatim into the
-- redemption receipt for the API to interpret.
create table invites (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  label text,
  tier text not null default 'premium' check (tier in ('free', 'premium')),
  entitlements jsonb not null default '{}'::jsonb,
  -- null = uncapped (a public launch link). 1 = a personal invite.
  max_redemptions int check (max_redemptions is null or max_redemptions > 0),
  redeemed_count int not null default 0 check (redeemed_count >= 0),
  expires_at timestamptz,
  created_by uuid references profiles on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  -- THE BACKSTOP FOR THE CAPPED-INVITE RACE. `redeem_invite` takes a row lock
  -- and re-reads under it, so the count can never pass the cap through that
  -- path; this check is what holds if some future path forgets to. A constraint
  -- violation aborting a redemption is the correct failure — the alternative is
  -- an eleventh person on a ten-seat invite that nobody ever notices.
  constraint invites_within_cap check (
    max_redemptions is null or redeemed_count <= max_redemptions)
);

create unique index invites_code_lower_uniq on invites (lower(code));
create index invites_open_idx on invites (created_at desc)
  where revoked_at is null;

create trigger set_updated_at before update on public.invites
  for each row execute function public.set_updated_at();

-- One redemption per (invite, user): a retried POST is the same redemption, not
-- a second seat. `user_id` is `on delete set null` rather than cascade so the
-- ledger keeps its row when an account is deleted — otherwise `redeemed_count`
-- and the number of redemption rows drift apart and neither is believable. The
-- unique index is partial for the same reason (nulls are distinct anyway, and
-- saying so out loud is cheaper than discovering it).
create table invite_redemptions (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references invites on delete cascade,
  user_id uuid references profiles on delete set null,
  person_id uuid references crm_people on delete set null,
  -- The RECEIPT of what was actually granted, frozen at redemption time. The
  -- invite's own `tier`/`entitlements` can be edited afterwards; what this
  -- person got cannot.
  granted jsonb not null default '{}'::jsonb,
  redeemed_at timestamptz not null default now(),
  ip inet
);

create unique index invite_redemptions_once_per_user
  on invite_redemptions (invite_id, user_id) where user_id is not null;
create index invite_redemptions_invite_idx on invite_redemptions (invite_id, redeemed_at desc);
create index invite_redemptions_user_idx on invite_redemptions (user_id);

-- =====================================================================
-- 7. admin_audit_log — APPEND-ONLY, INCLUDING FOR service_role
-- =====================================================================
-- 01 §13's append-only rule, applied to the table it matters most for: an audit
-- log a compromised admin can edit is not an audit log. `revoke update, delete
-- ... from anon, authenticated, service_role` at the bottom of this file. The
-- table owner (postgres / supabase_admin) is unaffected, which is what keeps
-- `supabase db reset`, migrations and a legal hold possible (SCHEMA-NOTES 1.14).
--
-- `actor_user_id` is `on delete set null`: the row must outlive the account. A
-- staff member who deletes their user must not delete the record of what they
-- did with it.
--
-- `target_id` is TEXT, not uuid. Most targets are uuids (a person, an invite, a
-- user), but a sync target is the source name 'stripe' and an entitlement target
-- may be a flag key. A uuid column would force those to be lied about or left
-- null, and the log is the one place that must not round anything off.
create table admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references profiles on delete set null,
  action text not null,
  target_kind text,
  target_id text,
  before jsonb,
  after jsonb,
  reason text,
  request_id text,
  ip inet,
  created_at timestamptz not null default now()
);

create index admin_audit_log_created_idx on admin_audit_log (created_at desc);
create index admin_audit_log_actor_idx on admin_audit_log (actor_user_id, created_at desc);
create index admin_audit_log_target_idx on admin_audit_log (target_kind, target_id, created_at desc);

-- =====================================================================
-- 8. sync_runs — resumable ingest
-- =====================================================================
-- `cursor` is the connector's own resume point (a Stripe `starting_after`, a
-- `crm.events.occurred_at` high-water mark), opaque to this schema. `counts` is
-- what the run did — {scanned, created, resolved, conflicted, skipped} — which
-- is what the admin "Sync now" button reports and what the brief's idempotence
-- claim is measured against.
create table sync_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('app', 'kai_sms', 'stripe')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  state text not null default 'running' check (state in ('running', 'ok', 'failed')),
  cursor jsonb,
  counts jsonb not null default '{}'::jsonb,
  -- A DRY RUN IS A RUN. Brief §5 asks for a mode that reports what a sync WOULD
  -- change without writing, and the honest place to record that is here, with a
  -- flag, rather than nowhere — "what would the Stripe sync do right now" is a
  -- question whose last answer is worth keeping. It is excluded from the
  -- one-running-per-source index below: a dry run writes nothing, so it has no
  -- business blocking the real thing.
  dry_run boolean not null default false,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index sync_runs_source_idx on sync_runs (source, started_at desc);

-- ONE RUN PER SOURCE AT A TIME. Two concurrent `kai_sms` runs would both write
-- through the same idempotency keys and produce a correct result slowly, but
-- they would also both advance `cursor` and could leave it behind the rows they
-- wrote. The same shape as 0023's one-live-show-per-mode index: a process rule
-- that matters belongs in the store, not only in the process.
create unique index sync_runs_one_running_per_source_idx
  on sync_runs (source) where state = 'running' and not dry_run;

create trigger set_updated_at before update on public.sync_runs
  for each row execute function public.set_updated_at();

-- =====================================================================
-- 9. staff_role / set_staff_role / ensure_owner_staff
-- =====================================================================
create or replace function staff_role(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select s.role from staff_members s
   where s.user_id = p_user_id and s.revoked_at is null;
$$;

revoke all on function staff_role(uuid) from public, anon, authenticated;

-- Staff management is the `owner` role's single extra power, and the rule lives
-- here rather than only in the route: the route is one `if` away from being
-- wrong, and this function is what an `admin` hits when it is.
--
-- p_role = 'revoked' is how a grant is withdrawn. It sets `revoked_at` and
-- leaves the row, so the audit trail still answers "was X ever staff".
create or replace function set_staff_role(
  p_user_id       uuid,
  p_role          text,
  p_actor_user_id uuid,
  p_reason        text default null
) returns staff_members
language plpgsql security definer set search_path = public as $$
declare
  v_before jsonb;
  v_row    staff_members;
begin
  if p_actor_user_id is null then
    raise exception 'actor_required' using errcode = '42501';
  end if;
  if staff_role(p_actor_user_id) <> 'owner' then
    -- Includes the null case: not staff at all reads the same as not an owner.
    raise exception 'not_owner' using errcode = '42501';
  end if;
  if p_role not in ('support', 'admin', 'owner', 'revoked') then
    raise exception 'role_invalid' using errcode = '22023';
  end if;
  if not exists (select 1 from profiles where user_id = p_user_id) then
    raise exception 'user_not_found' using errcode = '42501';
  end if;

  select to_jsonb(s) into v_before from staff_members s where s.user_id = p_user_id;

  if p_role = 'revoked' then
    update staff_members
       set revoked_at = coalesce(revoked_at, now())
     where user_id = p_user_id
    returning * into v_row;
    if not found then
      raise exception 'staff_not_found' using errcode = '42501';
    end if;
  else
    insert into staff_members (user_id, role, granted_by, granted_at)
    values (p_user_id, p_role, p_actor_user_id, now())
    on conflict (user_id) do update set
      role       = excluded.role,
      granted_by = excluded.granted_by,
      granted_at = now(),
      revoked_at = null
    returning * into v_row;
  end if;

  perform write_admin_audit(
    p_actor_user_id,
    case when p_role = 'revoked' then 'staff.revoke' else 'staff.grant' end,
    'staff_member', p_user_id::text, v_before, to_jsonb(v_row), p_reason, null, null);

  return v_row;
end;
$$;

revoke all on function set_staff_role(uuid, text, uuid, text) from public, anon, authenticated;

-- THE SEED (brief §3: "seeded exactly once, by migration, for the owner's user
-- id"). It is a LOOKUP BY EMAIL rather than a literal uuid because this database
-- has no hosted instance yet (brief §11.2) and the owner's auth user does not
-- exist in any environment this migration will run in first. Inventing a uuid
-- would seed a staff row for nobody, and — worse — a row that becomes real the
-- day some unrelated user happens to be created with it.
--
-- Idempotent and re-runnable: the API calls it once at boot and after the owner
-- first signs in, at which point the row appears. Until then this migration
-- leaves `staff_members` EMPTY, which is the safe state — no staff means no
-- admin surface, not an open one.
create or replace function ensure_owner_staff()
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  -- The app owner. Deliberately a literal in the migration rather than a
  -- setting: this is the one grant that cannot come from inside the product.
  v_email constant text := 'kcoffie90@gmail.com';
  v_user  uuid;
  v_row   staff_members;
begin
  select u.id into v_user
    from auth.users u
   where lower(u.email) = v_email
   order by u.created_at asc
   limit 1;

  if v_user is null then
    return null;
  end if;
  -- handle_new_user() provisions the profile; if it somehow has not, the FK
  -- below would fail, and a migration is not the place to guess.
  if not exists (select 1 from profiles where user_id = v_user) then
    return null;
  end if;

  insert into staff_members (user_id, role, granted_by, granted_at)
  values (v_user, 'owner', v_user, now())
  on conflict (user_id) do update set
    role       = 'owner',
    revoked_at = null
  returning * into v_row;

  insert into admin_audit_log (actor_user_id, action, target_kind, target_id, after, reason)
  values (v_user, 'staff.seed_owner', 'staff_member', v_user::text, to_jsonb(v_row),
          'migration 0025 seed');

  return v_user;
end;
$$;

revoke all on function ensure_owner_staff() from public, anon, authenticated;

-- =====================================================================
-- 10. write_admin_audit — the single writer of the log
-- =====================================================================
-- A function rather than a plain insert so that every admin RPC below writes
-- the same shape, and so the append-only revoke has exactly one legitimate
-- caller to point at.
create or replace function write_admin_audit(
  p_actor_user_id uuid,
  p_action        text,
  p_target_kind   text default null,
  p_target_id     text default null,
  p_before        jsonb default null,
  p_after         jsonb default null,
  p_reason        text default null,
  p_request_id    text default null,
  p_ip            inet default null
) returns admin_audit_log
language plpgsql security definer set search_path = public as $$
declare v_row admin_audit_log;
begin
  insert into admin_audit_log (
    actor_user_id, action, target_kind, target_id, before, after,
    reason, request_id, ip)
  values (
    p_actor_user_id, p_action, p_target_kind, p_target_id, p_before, p_after,
    p_reason, p_request_id, p_ip)
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function write_admin_audit(uuid, text, text, text, jsonb, jsonb, text, text, inet)
  from public, anon, authenticated;

-- =====================================================================
-- 11. new_invite_code — unguessable, and unambiguous out loud
-- =====================================================================
-- 30-character alphabet with no 0/O, 1/I/L and no U: a code gets read down a
-- phone and typed by a human, and an O that was a zero is a support ticket.
--
-- REJECTION SAMPLING, not `byte % 30`. 256 is not a multiple of 30, so a plain
-- modulo would make the first sixteen characters of the alphabet ~7% more
-- likely than the rest — small, and exactly the kind of small that turns a
-- 59-bit code into a shorter one for anybody who bothers to measure it. Bytes
-- at or above 240 are thrown away instead, which leaves a uniform draw.
-- 12 characters ≈ 59 bits, which is not guessable at any rate this app will
-- ever serve; the route rate-limits by ip on top (brief §6).
--
-- `extensions.gen_random_bytes` is SCHEMA-QUALIFIED on purpose: pgcrypto lives
-- in `extensions` (0001) and this function pins `search_path = public`, so the
-- unqualified name would not resolve. `gen_random_uuid()` elsewhere in this
-- schema needs no qualification because it is core, not pgcrypto.
create or replace function new_invite_code(p_length int default 12)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alphabet constant text := '23456789ABCDEFGHJKMNPQRSTVWXYZ';   -- 30 glyphs
  v_len      int := greatest(coalesce(p_length, 12), 10);
  v_out      text := '';
  v_byte     int;
begin
  while length(v_out) < v_len loop
    v_byte := get_byte(extensions.gen_random_bytes(1), 0);
    if v_byte < 240 then
      v_out := v_out || substr(v_alphabet, (v_byte % 30) + 1, 1);
    end if;
  end loop;
  return v_out;
end;
$$;

revoke all on function new_invite_code(int) from public, anon, authenticated;

-- =====================================================================
-- 12. redeem_invite — one transaction, and the capped-invite race
-- =====================================================================
-- THE RACE (brief §6): two people redeem the last slot of a capped invite at the
-- same instant. Read-then-write in the API loses this every time — both read
-- `redeemed_count = 9` against `max_redemptions = 10`, both write 10, and eleven
-- people hold ten seats.
--
-- Solved with the row lock, in SQL: `select ... for update` on the invite is
-- taken BEFORE any check, so the second transaction blocks there. Under READ
-- COMMITTED, when it acquires the lock it re-reads the row as the first
-- transaction committed it — `redeemed_count = 10` — and refuses with
-- `invite_exhausted`. The count is claimed before anything is granted, so a
-- failure later in the transaction rolls the claim back with it. Nothing about
-- this depends on the API calling in a particular order, and
-- `invites_within_cap` above aborts even a caller that skips this function.
--
-- Everything else here is the "one transaction" half of brief §6: the
-- entitlement grant, the redemption row, the person's status, the CRM event, the
-- user's own outbox event and the audit row either all happen or none do.
create or replace function redeem_invite(
  p_code       text,
  p_user_id    uuid,
  p_ip         inet default null,
  p_request_id text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_code       text := upper(btrim(coalesce(p_code, '')));
  v_invite     invites;
  v_existing   invite_redemptions;
  v_person     crm_people;
  v_person_id  uuid;
  v_redemption invite_redemptions;
  v_granted    jsonb;
  v_days       int;
  v_period_end timestamptz;
  v_sub        subscriptions;
  v_rank       int;
  v_new_rank   int;
begin
  if v_code = '' then
    return jsonb_build_object('ok', false, 'reason', 'invite_code_required');
  end if;

  -- THE LOCK. Everything below runs with this row held.
  select * into v_invite from invites where lower(code) = lower(v_code) for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'invite_not_found');
  end if;

  if v_invite.revoked_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'invite_revoked',
      'invite_id', v_invite.id, 'revoked_at', v_invite.revoked_at);
  end if;
  if v_invite.expires_at is not null and v_invite.expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'invite_expired',
      'invite_id', v_invite.id, 'expires_at', v_invite.expires_at);
  end if;

  if p_user_id is null or not exists (select 1 from profiles where user_id = p_user_id) then
    return jsonb_build_object('ok', false, 'reason', 'user_not_found');
  end if;

  -- A RETRIED REDEMPTION IS THE SAME REDEMPTION. The client that got a dropped
  -- response must be able to call again and see success, not "already used" —
  -- so this returns ok with `already_redeemed`, and spends no second slot.
  select * into v_existing from invite_redemptions
   where invite_id = v_invite.id and user_id = p_user_id;
  if found then
    return jsonb_build_object(
      'ok', true, 'already_redeemed', true,
      'invite_id', v_invite.id, 'label', v_invite.label, 'tier', v_invite.tier,
      'granted', v_existing.granted, 'person_id', v_existing.person_id,
      'redemption_id', v_existing.id);
  end if;

  if v_invite.max_redemptions is not null
     and v_invite.redeemed_count >= v_invite.max_redemptions then
    return jsonb_build_object('ok', false, 'reason', 'invite_exhausted',
      'invite_id', v_invite.id, 'max_redemptions', v_invite.max_redemptions);
  end if;

  -- Claim the slot first: the rest of this transaction is only reachable by the
  -- caller that got it.
  update invites
     set redeemed_count = redeemed_count + 1
   where id = v_invite.id
  returning * into v_invite;

  ------------------------------------------------------------------ person
  -- Resolution order, same as brief §5 and stopping at the first hit:
  --   the app_user identity → crm_people.app_user_id → the invite's own person
  --   (the code is itself an identity, so a personal invite resolves to whoever
  --   it was created for) → a new person.
  select p.* into v_person from crm_people p
    join crm_identities i on i.person_id = p.id
   where i.kind = 'app_user' and i.value = p_user_id::text
   limit 1;

  if not found then
    select * into v_person from crm_people where app_user_id = p_user_id limit 1;
  end if;
  if not found then
    select p.* into v_person from crm_people p
      join crm_identities i on i.person_id = p.id
     where i.kind = 'invite_code' and lower(i.value) = lower(v_invite.code)
     limit 1;
  end if;

  if v_person.id is not null and v_person.merged_into is not null then
    -- Follow one hop to the surviving row. Merges move identities onto the
    -- winner (§14), so a second hop should be impossible; not looping is the
    -- point — a cycle here would hang a public endpoint.
    select * into v_person from crm_people where id = v_person.merged_into;
  end if;

  if v_person.id is null then
    insert into crm_people (display_name, status, source, app_user_id, first_seen_at, last_active_at)
    values (null, 'signed_up', 'invite', p_user_id, now(), now())
    returning * into v_person;
  else
    -- STATUS ONLY EVER MOVES FORWARD. Brief §6 says a redemption moves the
    -- person to `signed_up`; writing that literally would demote somebody who
    -- is already `paying` and redeems a bonus code. 'blocked' is not a funnel
    -- stage and is never overwritten by this path.
    v_rank := case v_person.status
                when 'lead' then 0 when 'invited' then 1 when 'signed_up' then 2
                when 'onboarded' then 3 when 'activated' then 4 when 'paying' then 5
                else -1 end;
    v_new_rank := 2;
    update crm_people
       set app_user_id   = coalesce(app_user_id, p_user_id),
           status        = case when v_rank >= 0 and v_new_rank > v_rank then 'signed_up'
                                else status end,
           first_seen_at = least(coalesce(first_seen_at, now()), now()),
           last_active_at = now()
     where id = v_person.id
    returning * into v_person;
  end if;
  v_person_id := v_person.id;

  -- The identities this redemption proves. Both are `do nothing` on conflict:
  -- if the app_user identity already belongs to another person, resolution
  -- above already found them, and if it belongs to a person we did not resolve
  -- to, quietly stealing it is exactly the double-resolution `unique (kind,
  -- value)` exists to prevent — the connector's `merge_conflict` path handles it.
  insert into crm_identities (person_id, kind, value, source, verified)
  values (v_person_id, 'app_user', p_user_id::text, 'invite', true)
  on conflict (kind, value) do nothing;

  insert into crm_identities (person_id, kind, value, source, verified)
  values (v_person_id, 'invite_code', upper(v_invite.code), 'invite', true)
  on conflict (kind, value) do nothing;

  ------------------------------------------------------------ entitlements
  -- `duration_days` is the only key read here; everything else in
  -- `entitlements` rides along into the receipt for ADMIN-2 to interpret.
  v_days := nullif(v_invite.entitlements ->> 'duration_days', '')::int;
  v_period_end := case when v_days is not null then now() + make_interval(days => v_days) end;

  if v_invite.tier = 'premium' then
    insert into subscriptions (user_id, tier, status, current_period_end)
    values (p_user_id, 'premium', 'active', v_period_end)
    on conflict (user_id) do update set
      tier   = 'premium',
      status = 'active',
      -- NEVER SHORTEN WHAT SOMEBODY ALREADY HAS. A 30-day invite handed to a
      -- paying annual subscriber must not move their period end backwards, and
      -- a null end (open-ended, Stripe's truth) outranks any date.
      current_period_end = case
        when subscriptions.current_period_end is null then null
        when excluded.current_period_end is null then null
        else greatest(subscriptions.current_period_end, excluded.current_period_end)
      end,
      updated_at = now()
    returning * into v_sub;
  else
    -- tier 'free' grants nothing at the subscription level; the invite is then
    -- an attribution and an entitlements envelope, which is a real use (a
    -- tracked launch link). Existing paid access is left alone.
    select * into v_sub from subscriptions where user_id = p_user_id;
  end if;

  v_granted := jsonb_build_object(
    'tier', v_invite.tier,
    'entitlements', v_invite.entitlements,
    'duration_days', v_days,
    'current_period_end', v_period_end,
    'subscription_status', coalesce(v_sub.status, 'none'));

  ------------------------------------------------------------- redemption
  insert into invite_redemptions (invite_id, user_id, person_id, granted, ip)
  values (v_invite.id, p_user_id, v_person_id, v_granted, p_ip)
  returning * into v_redemption;

  -- The CRM timeline row, with an external id in the same shape the connectors
  -- use, so a future re-ingest of this database cannot duplicate it.
  insert into crm_events (person_id, type, category, source, payload, occurred_at, external_id)
  values (
    v_person_id, 'invite_redeemed', 'lifecycle', 'app',
    jsonb_build_object(
      'invite_id', v_invite.id, 'code', upper(v_invite.code),
      'label', v_invite.label, 'granted', v_granted, 'user_id', p_user_id),
    now(), 'invite_redemption:' || v_redemption.id::text)
  on conflict do nothing;

  -- The user's own outbox: a redemption is something that happened to them, and
  -- 01 §3 says every server-authoritative mutation writes one.
  perform append_user_event(
    p_user_id, 'system', 'invite', v_invite.id,
    jsonb_build_object('event', 'invite_redeemed', 'tier', v_invite.tier,
                       'label', v_invite.label, 'granted', v_granted));

  -- The one audit row whose actor is not staff: the redeemer acted on
  -- themselves through a public route, and the log is where entitlement grants
  -- are accounted for regardless of who caused them.
  perform write_admin_audit(
    p_user_id, 'invite.redeem', 'invite', v_invite.id::text,
    null, v_granted, v_invite.label, p_request_id, p_ip);

  return jsonb_build_object(
    'ok', true, 'already_redeemed', false, 'reason', null,
    'invite_id', v_invite.id, 'label', v_invite.label, 'tier', v_invite.tier,
    'granted', v_granted, 'person_id', v_person_id,
    'redemption_id', v_redemption.id);
end;
$$;

revoke all on function redeem_invite(text, uuid, inet, text) from public, anon, authenticated;

-- =====================================================================
-- 13. merge_crm_people — and how it stays undoable
-- =====================================================================
-- A merge is the one destructive thing the admin surface does to the CRM, so it
-- records exactly which rows it moved, in the audit log, and `unmerge` moves
-- back exactly those. "Reversible" is not a property of the loser row surviving;
-- it is a property of knowing what changed.
--
-- WHAT IT REFUSES. Two people who both carry a DIFFERENT `app_user_id` cannot be
-- one person here: the column is unique, so the merge would have to drop one
-- app user's link, and which one is a decision no automatic rule should make
-- (brief §5's `merge_conflict` — a human resolves it, possibly by unlinking one
-- first). Everything else the resolver refuses to do automatically, a human may
-- still ask for through this function; that is what the function is for.
--
-- WHAT IT DOES NOT TOUCH: money. `total_paid_cents`, `current_mrr_cents` and
-- `ltv_cents` stay as the winner's. Summing them would double-count a person
-- whose two rows were fed by one Stripe customer, and the stripe_customer
-- identity moves to the winner in this same transaction, so the next sync
-- rewrites them from the source that owns them.
create or replace function merge_crm_people(
  p_winner_id     uuid,
  p_loser_id      uuid,
  p_actor_user_id uuid,
  p_reason        text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_first      uuid;
  v_second     uuid;
  v_winner     crm_people;
  v_loser      crm_people;
  v_before     jsonb;
  v_identities uuid[];
  v_events     uuid[];
  v_notes      uuid[];
  v_redeems    uuid[];
  v_moved      jsonb;
  v_audit      admin_audit_log;
begin
  if p_winner_id is null or p_loser_id is null then
    return jsonb_build_object('ok', false, 'reason', 'person_not_found');
  end if;
  if p_winner_id = p_loser_id then
    return jsonb_build_object('ok', false, 'reason', 'same_person');
  end if;

  -- Lock both rows in a FIXED ORDER, so two staff merging the same pair from
  -- opposite directions deadlock never rather than sometimes.
  v_first  := least(p_winner_id, p_loser_id);
  v_second := greatest(p_winner_id, p_loser_id);
  perform 1 from crm_people where id = v_first for update;
  perform 1 from crm_people where id = v_second for update;

  select * into v_winner from crm_people where id = p_winner_id;
  if v_winner.id is null then
    return jsonb_build_object('ok', false, 'reason', 'person_not_found');
  end if;
  select * into v_loser from crm_people where id = p_loser_id;
  if v_loser.id is null then
    return jsonb_build_object('ok', false, 'reason', 'person_not_found');
  end if;

  if v_loser.merged_into is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_merged',
      'merged_into', v_loser.merged_into);
  end if;
  if v_winner.merged_into is not null then
    return jsonb_build_object('ok', false, 'reason', 'winner_is_merged',
      'merged_into', v_winner.merged_into);
  end if;
  if v_winner.app_user_id is not null and v_loser.app_user_id is not null
     and v_winner.app_user_id <> v_loser.app_user_id then
    return jsonb_build_object('ok', false, 'reason', 'conflicting_app_user',
      'winner_app_user_id', v_winner.app_user_id,
      'loser_app_user_id', v_loser.app_user_id);
  end if;

  v_before := jsonb_build_object('winner', to_jsonb(v_winner), 'loser', to_jsonb(v_loser));

  ---------------------------------------------------------------- identities
  -- NOTHING IS DROPPED HERE, and that is a property of §3 rather than an
  -- omission: `unique (kind, value)` is GLOBAL, so two people cannot already
  -- hold the same identity and repointing the loser's rows at the winner can
  -- never collide. The usual merge headache — "they both have that email, pick
  -- one" — is a headache the resolution index makes unreachable.
  --
  -- The id lists are collected BEFORE the moves. Afterwards there is no way to
  -- tell which of the winner's rows arrived in this merge, and a list that
  -- cannot be reconstructed later is exactly what makes the undo real.
  select coalesce(array_agg(id), '{}'::uuid[]) into v_identities
    from crm_identities where person_id = p_loser_id;
  select coalesce(array_agg(id), '{}'::uuid[]) into v_events
    from crm_events where person_id = p_loser_id;
  select coalesce(array_agg(id), '{}'::uuid[]) into v_notes
    from crm_notes where person_id = p_loser_id;
  select coalesce(array_agg(id), '{}'::uuid[]) into v_redeems
    from invite_redemptions where person_id = p_loser_id;

  update crm_identities     set person_id = p_winner_id where person_id = p_loser_id;
  update crm_events         set person_id = p_winner_id where person_id = p_loser_id;
  update crm_notes          set person_id = p_winner_id where person_id = p_loser_id;
  update invite_redemptions set person_id = p_winner_id where person_id = p_loser_id;

  -- THE LOSER STANDS DOWN FIRST. `app_user_id` is unique, so both rows cannot
  -- hold it for even one statement — and the winner's update below is exactly
  -- the statement that would try. Only ever the same value moves across (a
  -- differing pair was refused above).
  update crm_people set merged_into = p_winner_id, app_user_id = null
   where id = p_loser_id;

  -- The winner keeps everything it has and fills its holes from the loser.
  update crm_people set
    display_name       = coalesce(v_winner.display_name, v_loser.display_name),
    primary_email      = coalesce(v_winner.primary_email, v_loser.primary_email),
    primary_phone_e164 = coalesce(v_winner.primary_phone_e164, v_loser.primary_phone_e164),
    primary_tier       = coalesce(v_winner.primary_tier, v_loser.primary_tier),
    source             = coalesce(v_winner.source, v_loser.source),
    app_user_id        = coalesce(v_winner.app_user_id, v_loser.app_user_id),
    first_seen_at      = least(v_winner.first_seen_at, v_loser.first_seen_at),
    last_active_at     = greatest(v_winner.last_active_at, v_loser.last_active_at),
    last_inbound_at    = greatest(v_winner.last_inbound_at, v_loser.last_inbound_at),
    last_outbound_at   = greatest(v_winner.last_outbound_at, v_loser.last_outbound_at),
    inbound_count      = v_winner.inbound_count + v_loser.inbound_count,
    outbound_count     = v_winner.outbound_count + v_loser.outbound_count,
    tags               = (select coalesce(array_agg(distinct t), '{}'::text[])
                            from unnest(v_winner.tags || v_loser.tags) t),
    custom_fields      = v_loser.custom_fields || v_winner.custom_fields,
    source_detail      = v_loser.source_detail || v_winner.source_detail
  where id = p_winner_id
  returning * into v_winner;

  v_moved := jsonb_build_object(
    'identities', to_jsonb(v_identities),
    'events', to_jsonb(v_events),
    'notes', to_jsonb(v_notes),
    'redemptions', to_jsonb(v_redeems));

  v_audit := write_admin_audit(
    p_actor_user_id, 'crm.person.merge', 'crm_person', p_loser_id::text,
    v_before,
    jsonb_build_object('winner_id', p_winner_id, 'loser_id', p_loser_id, 'moved', v_moved),
    p_reason, null, null);

  return jsonb_build_object(
    'ok', true, 'reason', null,
    'winner_id', p_winner_id, 'loser_id', p_loser_id,
    'audit_id', v_audit.id, 'moved', v_moved, 'winner', to_jsonb(v_winner));
end;
$$;

revoke all on function merge_crm_people(uuid, uuid, uuid, text) from public, anon, authenticated;

-- =====================================================================
-- 14. unmerge_crm_person
-- =====================================================================
-- Reads the last merge audit row for this person that has not already been
-- undone, and moves back exactly the ids it lists. What it cannot restore is
-- named in the answer rather than glossed over:
--   * the app_user link, which stays with the winner — the loser gave it up so
--     the unique column could move, and handing it back would be choosing which
--     of the two rows the actual account belongs to all over again;
--   * the winner's coalesced fields and summed counts — the connectors re-derive
--     those on the next sync, and guessing which half of a sum belonged to whom
--     would be inventing data.
create or replace function unmerge_crm_person(
  p_loser_id      uuid,
  p_actor_user_id uuid,
  p_reason        text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_loser  crm_people;
  v_merge  admin_audit_log;
  v_moved  jsonb;
  v_ids    uuid[];
  v_n_id   int := 0;
  v_n_ev   int := 0;
  v_n_no   int := 0;
  v_n_rd   int := 0;
begin
  select * into v_loser from crm_people where id = p_loser_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'person_not_found');
  end if;
  if v_loser.merged_into is null then
    return jsonb_build_object('ok', false, 'reason', 'not_merged');
  end if;

  select * into v_merge from admin_audit_log
   where action = 'crm.person.merge'
     and target_kind = 'crm_person'
     and target_id = p_loser_id::text
   order by created_at desc, id desc
   limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_merge_record');
  end if;

  v_moved := v_merge.after -> 'moved';

  select coalesce(array_agg((value #>> '{}')::uuid), '{}'::uuid[]) into v_ids
    from jsonb_array_elements(coalesce(v_moved -> 'identities', '[]'::jsonb));
  update crm_identities set person_id = p_loser_id where id = any (v_ids);
  get diagnostics v_n_id = row_count;

  select coalesce(array_agg((value #>> '{}')::uuid), '{}'::uuid[]) into v_ids
    from jsonb_array_elements(coalesce(v_moved -> 'events', '[]'::jsonb));
  update crm_events set person_id = p_loser_id where id = any (v_ids);
  get diagnostics v_n_ev = row_count;

  select coalesce(array_agg((value #>> '{}')::uuid), '{}'::uuid[]) into v_ids
    from jsonb_array_elements(coalesce(v_moved -> 'notes', '[]'::jsonb));
  update crm_notes set person_id = p_loser_id where id = any (v_ids);
  get diagnostics v_n_no = row_count;

  select coalesce(array_agg((value #>> '{}')::uuid), '{}'::uuid[]) into v_ids
    from jsonb_array_elements(coalesce(v_moved -> 'redemptions', '[]'::jsonb));
  update invite_redemptions set person_id = p_loser_id where id = any (v_ids);
  get diagnostics v_n_rd = row_count;

  update crm_people set merged_into = null where id = p_loser_id
  returning * into v_loser;

  perform write_admin_audit(
    p_actor_user_id, 'crm.person.unmerge', 'crm_person', p_loser_id::text,
    v_merge.after,
    jsonb_build_object(
      'restored', jsonb_build_object('identities', v_n_id, 'events', v_n_ev,
                                     'notes', v_n_no, 'redemptions', v_n_rd),
      'not_restored', jsonb_build_object(
        'note', 'the app_user link stays with the winner, and its coalesced fields and summed counts are re-derived by the next sync')),
    p_reason, null, null);

  return jsonb_build_object(
    'ok', true, 'person_id', p_loser_id,
    'restored', jsonb_build_object('identities', v_n_id, 'events', v_n_ev,
                                   'notes', v_n_no, 'redemptions', v_n_rd),
    'not_restored', 'the app_user link and the winner''s coalesced fields');
end;
$$;

revoke all on function unmerge_crm_person(uuid, uuid, text) from public, anon, authenticated;

-- =====================================================================
-- 15. The three funnel views (brief §8)
-- =====================================================================
-- All three are OWNER-RIGHTS views (no `security_invoker`) granted to
-- `service_role` only and revoked from anon + authenticated — the same wall as
-- the tables, stated twice on purpose: a view is the classic way an
-- RLS-protected table leaks, and these read every person in the system.
--
-- Every one of them excludes merged and soft-deleted people. A merged row still
-- exists so that foreign ids resolve; counting it would report the same human
-- twice in the funnel.

-- Every status gets a row, including the ones with nobody in them: a funnel with
-- a missing rung reads as a bug, and zero here is measured, not assumed.
create view crm_funnel_v as
  select s.status,
         s.position,
         count(p.id)::bigint as people
  from (values
      ('lead', 1), ('invited', 2), ('signed_up', 3), ('onboarded', 4),
      ('activated', 5), ('paying', 6), ('churned', 7), ('blocked', 8)
    ) as s(status, position)
  left join crm_people p
    on p.status = s.status and p.merged_into is null and p.deleted_at is null
  group by s.status, s.position;

revoke all on crm_funnel_v from anon, authenticated;
grant select on crm_funnel_v to service_role;

-- Signups and leads per day, split, because they are different acts: `signups`
-- is people who now have an app user, `leads` is people we have only ever
-- reached on another channel. `first_seen_at` is the ingest's own timestamp for
-- when the person entered the system, so a person with no first_seen_at is
-- deliberately in neither count rather than bucketed into today.
create view crm_daily_signups_v as
  select (p.first_seen_at at time zone 'UTC')::date as day,
         count(*) filter (where p.app_user_id is not null)::bigint as signups,
         count(*) filter (where p.app_user_id is null)::bigint as leads
  from crm_people p
  where p.merged_into is null
    and p.deleted_at is null
    and p.first_seen_at is not null
  group by 1;

revoke all on crm_daily_signups_v from anon, authenticated;
grant select on crm_daily_signups_v to service_role;

-- MRR FROM STRIPE ONLY (brief §8), and that is structural rather than a
-- convention: the view counts a person only if they carry a `stripe_customer`
-- identity. A number typed into `current_mrr_cents` by an importer, or a tier
-- somebody set by hand, cannot get in here.
--
-- CHURN IS NOT IN THIS VIEW. §8 asks for churn in the last 30 days and there is
-- no churn timestamp and no agreed event type for it yet — the `stripe`
-- connector (ADMIN-3) decides that vocabulary. A metric with no data source
-- renders as "not tracked yet", never as a zero somebody trusts, so it is
-- absent here rather than invented (SCHEMA-NOTES gap 2.36).
create view crm_mrr_v as
  select count(*) filter (where coalesce(p.current_mrr_cents, 0) > 0)::bigint as paying_people,
         coalesce(sum(p.current_mrr_cents) filter (where coalesce(p.current_mrr_cents, 0) > 0), 0)::bigint as mrr_cents,
         coalesce(sum(p.total_paid_cents), 0)::bigint as total_paid_cents,
         coalesce(sum(p.ltv_cents), 0)::bigint as ltv_cents
  from crm_people p
  where p.merged_into is null
    and p.deleted_at is null
    and exists (select 1 from crm_identities i
                 where i.person_id = p.id and i.kind = 'stripe_customer');

revoke all on crm_mrr_v from anon, authenticated;
grant select on crm_mrr_v to service_role;

-- =====================================================================
-- 16. RLS — service role only, everywhere, no exceptions
-- =====================================================================
-- 0014's "enable RLS on every table" DO-loop ran once, before these tables
-- existed. Enable it here, explicitly, and grant nothing to the client roles.
--
-- There is deliberately NO POLICY of any kind for `authenticated` on any table
-- in this migration — not an owner-select one on `crm_people` for the person it
-- describes, not a self-read on `staff_members`. RLS with no policy returns
-- nothing to any role that does not bypass it, which is the statement being
-- made (brief §4: "no `authenticated` policy at all, on any of them. The API is
-- the only door.").
--
-- A user's right to see their own data is real and is served by the tables they
-- already own — `profiles`, `user_events`, `notifications`. `crm_people` is not
-- a copy of that; it is staff's working notes about them, including tags,
-- scores and a `blocked` status, and handing a JWT the row would hand it those.

revoke all on
  staff_members, crm_people, crm_identities, crm_events, crm_notes, crm_segments,
  invites, invite_redemptions, admin_audit_log, sync_runs
from anon, authenticated;

alter table staff_members      enable row level security;
alter table crm_people         enable row level security;
alter table crm_identities     enable row level security;
alter table crm_events         enable row level security;
alter table crm_notes          enable row level security;
alter table crm_segments       enable row level security;
alter table invites            enable row level security;
alter table invite_redemptions enable row level security;
alter table admin_audit_log    enable row level security;
alter table sync_runs          enable row level security;

grant select, insert, update, delete on
  staff_members, crm_people, crm_identities, crm_events, crm_notes, crm_segments,
  invites, invite_redemptions, sync_runs
to service_role;

-- APPEND-ONLY (01 §13 ⚙, the same shape as 0014's block). INSERT only, and the
-- revoke includes service_role: the API runs as service_role, so an audit log
-- that service_role can UPDATE is an audit log the admin surface can rewrite.
-- The table owner is unaffected, which keeps `supabase db reset` and a legal
-- hold possible (SCHEMA-NOTES 1.14).
grant insert, select on admin_audit_log to service_role;
revoke update, delete on admin_audit_log from anon, authenticated, service_role;
-- TRUNCATE TOO. Supabase's default privileges hand service_role every privilege
-- on a new table, and `revoke update, delete` leaves the one verb that empties
-- the whole log in a single statement. 0014's append-only block predates that
-- realisation and still leaves TRUNCATE on `user_events` and friends
-- (SCHEMA-NOTES gap 2.37); this table is the one where it is not survivable.
revoke truncate on admin_audit_log from anon, authenticated, service_role;

-- =====================================================================
-- 17. Seed the owner (brief §3)
-- =====================================================================
do $$
declare v_user uuid;
begin
  v_user := ensure_owner_staff();
  if v_user is null then
    raise notice '0025: owner staff row NOT seeded — no auth user for the owner email exists in this database yet. Call ensure_owner_staff() after they sign in.';
  else
    raise notice '0025: owner staff row seeded for %', v_user;
  end if;
end;
$$;

-- =====================================================================
-- 18. FUNCTION GRANT FLOOR (SCHEMA-NOTES gap 2.7)
-- =====================================================================
-- Postgres hands EXECUTE on every new function to PUBLIC, and Supabase's default
-- privileges add anon + authenticated. Re-apply the floor across the schema,
-- then grant back exactly the client-callable set — which this migration does
-- not extend by one: every function above is `service_role` only, because every
-- one of them either reads other people's data or grants something.
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

-- The client-callable surface, unchanged from 0024:
grant execute on function is_room_member(uuid) to authenticated;
grant execute on function join_core_room(uuid, uuid) to authenticated;
grant execute on function set_room_mute(uuid, uuid, timestamptz) to authenticated;
grant execute on function live_can_watch_market() to authenticated, service_role;
grant execute on function register_push_subscription(text, text, jsonb, text, text, uuid)
  to authenticated, service_role;
grant execute on function revoke_push_subscription(uuid) to authenticated, service_role;

-- This migration's own surface: the API, and nothing else.
grant execute on function staff_role(uuid) to service_role;
grant execute on function set_staff_role(uuid, text, uuid, text) to service_role;
grant execute on function ensure_owner_staff() to service_role;
grant execute on function new_invite_code(int) to service_role;
grant execute on function write_admin_audit(uuid, text, text, text, jsonb, jsonb, text, text, inet)
  to service_role;
grant execute on function redeem_invite(text, uuid, inet, text) to service_role;
grant execute on function merge_crm_people(uuid, uuid, uuid, text) to service_role;
grant execute on function unmerge_crm_person(uuid, uuid, text) to service_role;
