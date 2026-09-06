-- 0031 — Community chat: who may open a Circle, and what a moderator can do
--        about what gets posted in one.
--
-- =====================================================================
-- WHAT THIS CHANGES, IN ONE PARAGRAPH
-- =====================================================================
-- Circles stop being a thing a paying member buys and become a thing the
-- Cheat Code team opens (owner instruction, 2026-09-05: "Circles should be
-- admin created based"). That decision is enforced in the ROUTE against
-- `staff_role(user_id)` — the same function 0025 wrote and the only place in
-- this app that answers "is this person staff right now". No second permission
-- system is created here, and no flag in this file grants anything.
--
-- The rest of the file is the moderation half: the columns a removal and a
-- mute need in order to be explainable afterwards, and — the part that matters
-- most — closing the hole that made "remove" a lie.
--
-- =====================================================================
-- THE HOLE. `messages` WAS DIRECTLY READABLE BY EVERY MEMBER.
-- =====================================================================
-- 0014 granted `select on messages to authenticated` with a membership policy,
-- and 0015 built `messages_public` as a security_invoker view on top of it to
-- null the body of a deleted message.
--
-- Both of those are true at once, which means the null was decoration: any
-- member of the room could ask PostgREST for `messages` itself and read the
-- body of every message a moderator had ever removed, plus (after this
-- migration) who removed it and why. A removal a reader can undo by changing
-- the table name in a URL is not a removal.
--
-- So:
--   * `messages_public` becomes a DEFINER view that carries the membership
--     test itself (`is_room_member`, 0014, security definer + auth.uid()), and
--     still nulls a deleted body and still keeps the row's place in the thread;
--   * `select on messages` is REVOKED from `authenticated`.
--
-- Net effect for a member: identical rows, identical columns, one door instead
-- of two, and the deleted body genuinely gone. Net effect for this API: none —
-- every route reads with the service role through `messages_public` already.
--
-- COST, STATED PLAINLY: Supabase Realtime `postgres_changes` on `messages`
-- needs the subscriber to hold SELECT on the base table, so this closes that
-- route for the client. Nothing loses anything today — `messages` is not in the
-- `supabase_realtime` publication, so that subscription has never worked and
-- `apps/mobile/src/lib/realtime.ts` has always fallen through to its poll. If
-- realtime is ever wanted, the honest way in is a publication plus a policy
-- written for it, not a standing grant that also hands over deleted bodies.
--
-- =====================================================================
-- RLS POSTURE OF EVERYTHING THIS FILE TOUCHES
-- =====================================================================
--   messages            RLS on. Member-scoped policy KEPT (it is what the
--                       definer view leans on for nothing — see below — but it
--                       stays as the second lock for any future grant).
--                       Client SELECT revoked. Writes: service role only.
--   reports             RLS on, ZERO policies, service role only. Unchanged
--                       posture, re-asserted here because this migration adds
--                       columns to it and a new column must never arrive on a
--                       table whose locks were assumed rather than checked.
--   moderation_log      RLS on, ZERO policies, service role INSERT + SELECT
--                       only; UPDATE/DELETE/TRUNCATE already revoked from every
--                       role including service_role (0014, 0026).
--   room_members        unchanged: members read their own row and their
--                       co-members' rows; only this API writes.
--
-- No policy in this file uses `using (true)`. No table in this file gains a
-- client write grant. The verification queries are at the bottom.

-- =====================================================================
-- 1. messages — who removed it, and why
-- =====================================================================
-- `deleted_at` already exists (0010) and is what `messages_public` reads. These
-- two say who did it and on what grounds, which is the difference between a
-- moderation record and a message that simply vanished.
--
-- They are NOT in `messages_public`. A member sees that a post was removed;
-- they do not see the moderator's name or the moderator's reasoning, because
-- that is a staff note about a member, and publishing it turns every removal
-- into an argument in the room.
alter table messages add column if not exists deleted_by     uuid;
alter table messages add column if not exists deleted_reason text;

comment on column messages.deleted_by is
  'Staff user who removed this message. Never exposed through messages_public.';
comment on column messages.deleted_reason is
  'Why it was removed, in the moderator''s words. Staff-only, same as deleted_by.';

-- =====================================================================
-- 2. messages_public — one door, and the deleted body actually gone
-- =====================================================================
-- Same column list as 0015 (create or replace requires that), plus the
-- membership predicate the view now owns.
--
-- `is_room_member` is `security definer stable` and reads `auth.uid()`, so it
-- gives the right answer inside a definer view: the view runs as its owner, the
-- function still asks who the CALLER is.
--
-- A banned member is excluded by `is_room_member` itself (it tests
-- `coalesce(banned,false) = false`), so a ban closes the reading door as well
-- as the posting one, which is what a ban has always meant in the copy.
--
-- THE `current_user` ARM IS NOT A BACK DOOR, IT IS THE API. This app reads
-- every room with the SERVICE ROLE and scopes the query in code (lib/db.ts
-- SECURITY BOUNDARY), so `auth.uid()` is null on those calls and a bare
-- membership test would hand the API an empty room every time. Inside a view —
-- unlike inside a security-definer FUNCTION — `current_user` is still the
-- INVOKING role, so this reads `service_role` for the API and `authenticated`
-- for a phone, and no client can reach the first: `authenticated` is not a
-- member of `service_role` and cannot `set role` to it. Verified on both
-- databases; the proof is query (c) at the bottom of this file.
create or replace view messages_public
with (security_invoker = false) as
  select m.id, m.room_id, m.user_id, m.seq, m.kind,
         case when m.deleted_at is null then m.body end as body,
         m.parent_id, m.refs, m.structured_idea, m.position_disclosure,
         m.edited_at, m.deleted_at,
         (m.deleted_at is not null) as deleted,
         m.flags, m.created_at
  from messages m
  where current_user = 'service_role' or is_room_member(m.room_id);

comment on view messages_public is
  'The member-facing message surface. Runs with the view owner''s rights and '
  'carries its own membership test, so `select on messages` does not have to be '
  'granted to clients. A deleted row keeps its place and loses its body.';

grant select on messages_public to authenticated;

-- The second door, closed. Everything a client legitimately reads is in the
-- view above; everything else in this table is either a removed body or a
-- moderator's note about a member.
revoke select on messages from authenticated;

-- Belt and braces: the row policy stays, so if a future migration re-grants
-- SELECT by accident the membership test is still standing behind it. Deleted
-- rows are excluded from the BASE table for the same reason — a re-grant must
-- not quietly re-open the removed bodies.
drop policy if exists messages_member_select on messages;
create policy messages_member_select on messages
  for select to authenticated
  using (is_room_member(room_id) and deleted_at is null);

-- =====================================================================
-- 3. reports — a report has to be closable
-- =====================================================================
-- 0010 gave `reports` a `status` and a `resolution` and nothing that says who
-- decided or when, so an open queue could never be aged and "resolved" could
-- not be attributed. Two columns fix that.
alter table reports add column if not exists resolved_by uuid;
alter table reports add column if not exists resolved_at timestamptz;

comment on column reports.resolved_by is 'Staff user who closed the report.';
comment on column reports.resolved_at is 'When it was closed. Null while status = open.';

-- The queue is read as "open, oldest first", every time. Partial, because a
-- resolved report is never fetched by status.
create index if not exists reports_open_idx
  on reports (created_at) where status = 'open';

-- One member may report one message once (the route checks, the index makes it
-- true). `reporter_id` is null for a report the SYSTEM files — see §6 — and
-- those are deliberately outside this constraint, because a message can be
-- flagged by the system and by a person independently.
create unique index if not exists reports_one_per_reporter_idx
  on reports (reporter_id, message_id) where reporter_id is not null;

-- =====================================================================
-- 4. room_members — a mute that can be explained
-- =====================================================================
-- `moderation_muted_until` arrived in 0018 with, in SCHEMA-NOTES' own words, no
-- writer. This migration's `POST /rooms/:id/moderate` is that writer. These two
-- columns are what makes the mute answerable at a support desk three weeks
-- later.
alter table room_members add column if not exists moderation_muted_by     uuid;
alter table room_members add column if not exists moderation_muted_reason text;

comment on column room_members.moderation_muted_by is
  'Staff user who muted this member in this room. Never shown to the member.';
comment on column room_members.moderation_muted_reason is
  'Why. Staff-only.';

-- =====================================================================
-- 5. rooms — who opened this Circle
-- =====================================================================
-- Circles were being stamped with `config.created_by`, which is a fine place
-- for a preference and a poor place for a fact you may have to answer for. It
-- gets a real column, and the existing config values are copied into it so
-- nothing that already exists loses its author.
alter table rooms add column if not exists created_by uuid;

comment on column rooms.created_by is
  'The staff user who opened this room. Null for the three core rooms and for a '
  'Circle the tick opened automatically for a ready setup — those have no author.';

update rooms
   set created_by = (config->>'created_by')::uuid
 where created_by is null
   and config ? 'created_by'
   and (config->>'created_by') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- =====================================================================
-- 6. The `circles_create` entitlement flag is no longer read
-- =====================================================================
-- It stays in `entitlement_flags` — deleting seeded config from under a running
-- deployment buys nothing and an absent row and a false row read the same — but
-- NOTHING READS IT ANY MORE. `apps/api/src/app/api/v1/circles/route.ts` asks
-- `staff_role()` instead. Recorded here so the next person who greps for the
-- flag and finds a row does not conclude the gate is still where it was.
--
-- The flag is set to false on BOTH tiers so that a database read by eye tells
-- the same story the code does: no customer tier opens a Circle.
update entitlement_flags set value = 'false'::jsonb where flag = 'circles_create';

-- =====================================================================
-- 7. RLS, re-asserted rather than assumed
-- =====================================================================
-- Both tables already carry this posture. It is repeated because §3 added
-- columns to `reports`, and the rule of this repo is that a table gaining a
-- column has its locks proved in the same file, not inherited from a migration
-- sixteen files back that nobody re-reads.
--
-- RLS ON + ZERO POLICIES = the API is the only door. There is no row in either
-- table that a member has a right to read: a report is about somebody else's
-- post and a moderation entry is a staff record.
alter table reports        enable row level security;
alter table moderation_log enable row level security;

revoke all on reports        from anon, authenticated;
revoke all on moderation_log from anon, authenticated;

grant select, insert, update on reports to service_role;
grant select, insert         on moderation_log to service_role;

-- moderation_log stays append-only for everyone including this API (0014, 0026).
-- Re-run because a `grant` above could otherwise hand back what those revoked.
revoke update, delete, truncate on moderation_log from anon, authenticated, service_role;
revoke truncate on reports from anon, authenticated, service_role;

-- Nothing may have appeared on either table since. If it has, this fails loudly
-- rather than shipping a surface nobody meant to open.
do $$
declare v_count int;
begin
  select count(*) into v_count
    from pg_policies
   where schemaname = 'public' and tablename in ('reports', 'moderation_log');
  if v_count > 0 then
    raise exception '0031: % policy(ies) exist on reports/moderation_log. Both are service-role only.', v_count;
  end if;
end $$;

-- =====================================================================
-- 8. THE VIEWS WERE WRITABLE. FOUND WHILE PROVING THE REMOVAL.
-- =====================================================================
-- Not a hypothetical, and not something this migration introduced. Measured on
-- BOTH databases on 2026-09-06, with a real signed-in account and the anon key:
--
--     member can SEE the canary: true
--     DELETE via messages_public -> accepted
--     CANARY SURVIVED: false
--
-- Any signed-in member could PERMANENTLY DELETE any message in any room they
-- belonged to. Not soft-delete: the row was gone.
--
-- HOW IT HAPPENED, because the same trap is still armed for the next view.
-- Supabase ships `alter default privileges in schema public grant all on tables
-- to anon, authenticated`. 0014 opened with a blanket `revoke all on all tables
-- ... from anon, authenticated`, which was correct for everything that existed
-- THEN — and 0015 created these views AFTER it. They were born with the default
-- ALL, and 0015's `grant select` only added to a set that already had DELETE in
-- it. A blanket revoke protects the past, never the future.
--
-- Why a view is the dangerous shape: the tables in this schema all carry RLS,
-- so a stray write grant on one still hits a policy. A view has no RLS of its
-- own, and an auto-updatable view executes the write with the VIEW OWNER's
-- rights — which is postgres. `messages_public` is auto-updatable (its
-- expression columns are simply not updatable; the view is), so DELETE went
-- straight through to `messages`. `profiles_public` refused only by luck: its
-- join makes it non-updatable. Luck is not a lock.
--
-- Four views, one rule: a client may SELECT and may do nothing else. Stated per
-- view rather than in a loop, so the next reader can see exactly which four.
revoke insert, update, delete, truncate, references, trigger
  on messages_public, profiles_public from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger
  on daily_risk_v, rule_adherence_v from anon, authenticated;

-- `anon` has no surface in this app at all (0014's own words), so it keeps
-- nothing, not even the read.
revoke all on messages_public, profiles_public from anon;

grant select on messages_public, profiles_public to authenticated;
grant select on daily_risk_v, rule_adherence_v to authenticated;

-- And the trap itself, disarmed for anything created from here on. This is the
-- line 0014 could not have written, because the defaults it had to fight are
-- applied at CREATE time, not at revoke time.
alter default privileges in schema public revoke all on tables from anon, authenticated;

-- Nothing in this schema may hand a client a write verb it did not earn. The
-- eight tables that legitimately have one are named: each is RLS'd to the
-- owner's own rows (0014 row 1, 0017 watchlists, 0023 live requests, 0024
-- push), and the list is explicit so a NINTH cannot appear unnoticed.
do $$
declare v_bad text;
begin
  select string_agg(distinct format('%s(%s)', g.table_name, g.grantee), ', ')
    into v_bad
    from information_schema.role_table_grants g
   where g.table_schema = 'public'
     and g.grantee in ('anon', 'authenticated')
     and g.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
     and g.table_name not in (
       'profiles', 'notification_prefs', 'setup_alert_prefs', 'lesson_progress',
       'watchlists', 'watchlist_items', 'live_requests', 'push_subscriptions'
     );
  if v_bad is not null then
    raise exception '0031: unexpected client write grant on %. Every one of these needs a reason and an RLS policy.', v_bad;
  end if;
end $$;

-- =====================================================================
-- 9. What "good" looks like, so it can be checked rather than believed
-- =====================================================================
-- Run these after applying, on local and on hosted.
--
-- (a) No client verb on the moderation tables, and none on `messages` either:
--
--   select table_name, grantee, privilege_type
--     from information_schema.role_table_grants
--    where table_schema = 'public'
--      and grantee in ('anon', 'authenticated')
--      and table_name in ('messages', 'reports', 'moderation_log');
--
--   -> expected: ZERO rows.
--
-- (b) RLS on, with the policies that should be there and no others:
--
--   select c.relname, c.relrowsecurity,
--          (select count(*) from pg_policies p
--            where p.schemaname = 'public' and p.tablename = c.relname) as policies
--     from pg_class c join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public'
--      and c.relname in ('messages','rooms','room_members','reports','moderation_log');
--
--   -> expected: relrowsecurity = t on all five;
--                messages 1, rooms 1, room_members 1, reports 0, moderation_log 0.
--
-- (c) A member reads through the view and only their own rooms, and cannot
--     escalate into the service role:
--
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<a member uuid>"}';
--   select count(*) from messages_public;   -- their rooms only
--   select count(*) from messages;          -- ERROR: permission denied
--   set local role service_role;            -- ERROR: permission denied to set role
--
-- (d) A removed message keeps its place and loses its words:
--
--   select seq, deleted, body from messages_public where room_id = '<room>' order by seq;
--   -> the removed row is present, `deleted` is true, `body` is null.
--
-- (e) No client may write through a view:
--
--   select c.relname, g.grantee, g.privilege_type
--     from pg_class c
--     join pg_namespace n on n.oid = c.relnamespace
--     join information_schema.role_table_grants g
--       on g.table_name = c.relname and g.table_schema = 'public'
--    where n.nspname = 'public' and c.relkind = 'v'
--      and g.grantee in ('anon', 'authenticated')
--      and g.privilege_type <> 'SELECT';
--
--   -> expected: ZERO rows.
--
-- (f) The end-to-end proof, which asks all of the above through the real API
--     with three real accounts:
--
--   cd apps/api && API=http://localhost:3000 \
--     npx tsx --env-file=.env.local scripts/community-chat-test.mts
