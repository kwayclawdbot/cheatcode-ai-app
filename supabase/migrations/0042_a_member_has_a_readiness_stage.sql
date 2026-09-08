-- 0042 — A member has a readiness stage, it moves on its own, and they cannot
--        move it themselves.
--
-- =====================================================================
-- WHAT THIS CHANGES, IN ONE PARAGRAPH
-- =====================================================================
-- The owner's funnel (docs: project-ccai-stages-funnel, 7 Sept) says the app
-- serves three readiness levels without splitting the brand, and that the level
-- is NOT a permanent label a member picks once: it is a stage that EVOLVES as
-- they prove competence in Training Mode. Beginner → Developing → Trade Ready,
-- with room above. This adds that stage to `profiles`, backfills it from what
-- the app already knows about each existing member, and — because `profiles` is
-- the one table in this database a member may write to directly — makes the
-- column impossible to set from a phone. A stage a member can award themselves
-- is not a readiness signal, it is a checkbox.
--
-- Three columns, one check constraint, one trigger. No new table.
--
-- =====================================================================
-- RLS POSTURE OF EVERYTHING THIS FILE TOUCHES
-- =====================================================================
--   profiles            UNCHANGED, and that is the problem this file has to
--                       work around rather than fix. The table has RLS on with
--                       exactly one policy, `profiles_owner_all` — cmd ALL,
--                       both `using` and `with check` being `user_id =
--                       auth.uid()` — and `authenticated` holds SELECT, INSERT,
--                       UPDATE and DELETE on it. That is deliberate and long
--                       standing: onboarding, the Account board and the mode
--                       switch all write a member's own profile row straight
--                       from the client with the anon key.
--
--                       It also means that every column added to this table is
--                       client-writable by default, including this one. A
--                       column-level GRANT would be the textbook answer and it
--                       does not work here: revoking UPDATE(stage) from
--                       `authenticated` while the policy is `ALL` would still
--                       leave the column writable through an INSERT ... ON
--                       CONFLICT path, and Postgres column privileges are not
--                       consulted at all when the row is written by a function
--                       owned by a superuser. So the rule is enforced where it
--                       cannot be routed around — a BEFORE UPDATE/INSERT
--                       trigger, §4 — which is the same move 0035 §3 made for
--                       `quoted_message_id`: make it impossible rather than
--                       merely enforced by whichever route happened to run.
--
-- This file adds no policy, weakens no policy, and grants nothing to `anon` or
-- to `authenticated`. There is no `using (true)` in it.
--
-- =====================================================================
-- 1. WHY `text` + CHECK AND NOT AN ENUM
-- =====================================================================
-- Every other closed vocabulary in this schema is an `enum` — `app_mode`,
-- `room_type`, `experience_level` — so an enum is the obvious choice and it is
-- the wrong one for THIS column, for the reason 0040 §"WHY mode AND NOT room_id"
-- cites in passing: "`message_kind` is an enum, and 03 Unit 2 forbids migrating
-- enums for the reason 0035 §1 spells out."
--
-- The stage ladder is explicitly UNFINISHED. The owner's note ends the list
-- with "→ higher status later", and the training spec already names what comes
-- after graduation (Level 2: Become Consistent; Playbooks; Options; Advanced
-- TA). A column whose value set is expected to grow two or three more times
-- wants the vocabulary in a CHECK constraint, where adding a value is one
-- `alter table ... drop constraint ... add constraint` in a normal migration —
-- exactly what 0035 §1 did to grow the reaction set from four kinds to eight.
-- Growing an enum instead means `alter type ... add value`, which cannot run in
-- the same transaction as anything that then USES the new value, which is how
-- a two-statement migration becomes a two-migration deploy.
--
-- The 0035 §1 lesson also applies to the far edge of this: when a stage is one
-- day retired, its value STAYS IN THE CHECK. Members who reached it reached it,
-- and a constraint that refuses to read its own table back is worse than a
-- vocabulary with a dead word in it.
--
-- =====================================================================
-- 2. THE THREE COLUMNS, AND WHY THE SECOND TWO EXIST
-- =====================================================================
-- `stage`         — where this member is. Defaults to 'beginner' because that
--                   is the honest answer for somebody the app knows nothing
--                   about yet, and because the funnel is built to move them.
--
-- `stage_locked`  — an admin pinned this stage by hand; automatic evolution
--                   must leave it alone. Without this column a manual override
--                   is not an override, it is a value that survives until the
--                   next training write recomputes over the top of it. §4 of
--                   the API's stage service is the only thing that reads it.
--
-- `stage_changed_at` — when it last moved. This is the column that makes the
--                   claim "stage evolves automatically" auditable: if it is
--                   null for every member on the day the feature ships, nothing
--                   is evolving and the rules are dead code. Cheaper to carry
--                   one timestamp than to reconstruct that from logs.
--
-- There is deliberately NO `stage_reason` free-text column. The reason is
-- always one of a very small set (onboarding answer, day-2 gate, day-7
-- graduation, admin) and the moment it is free text nobody can group by it.

alter table profiles
  add column if not exists stage            text        not null default 'beginner',
  add column if not exists stage_locked     boolean     not null default false,
  add column if not exists stage_changed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.profiles'::regclass and conname = 'profiles_stage_check'
  ) then
    alter table profiles
      add constraint profiles_stage_check
      check (stage in ('beginner', 'developing', 'trade_ready'));
  end if;
end $$;

comment on column profiles.stage is
  'Readiness stage: beginner | developing | trade_ready. Grows upward only, '
  'and never from the client - see 0042 sections 1 and 4. Not the same thing as '
  '`experience`, which is the self-declared answer that only ever sets the '
  'STARTING stage; this column is what the member has since proved.';

comment on column profiles.stage_locked is
  'An admin pinned this stage. Automatic evolution must skip this member.';

comment on column profiles.stage_changed_at is
  'When `stage` last moved. Null means it has never moved off its starting value.';

-- =====================================================================
-- 3. BACKFILL — EXISTING MEMBERS ARE NOT ALL BEGINNERS
-- =====================================================================
-- The column default is 'beginner' and applying it as-is would tell every
-- member already using this app that they are a beginner, which for somebody
-- who has been placing day trades in it for weeks is not a neutral default, it
-- is a visible insult attached to their name in a public room (§the stage tag
-- renders beside the handle).
--
-- `profiles.experience` is the answer these members already gave at onboarding,
-- on the same ladder in different words, so it is the honest source:
--
--     experience = 'advanced'      -> trade_ready
--     experience = 'intermediate'  -> developing
--     experience = 'beginner'      -> beginner   (already the default)
--
-- This runs ONCE, guarded on `stage_changed_at is null`, so re-applying this
-- migration cannot walk over a stage somebody has since earned or been given.
-- The backfill deliberately does NOT set `stage_changed_at`: these members did
-- not move, they were placed, and dating the move would make the audit in §2
-- read as evolution that never happened.

update profiles
   set stage = case experience
                 when 'advanced'     then 'trade_ready'
                 when 'intermediate' then 'developing'
                 else                     'beginner'
               end
 where stage_changed_at is null
   and stage = 'beginner'
   and experience in ('advanced', 'intermediate');

-- =====================================================================
-- 4. THE COLUMN IS NOT CLIENT-WRITABLE, AND THE TRIGGER IS WHY
-- =====================================================================
-- Read the RLS posture note at the top of this file first: `authenticated` can
-- UPDATE its own `profiles` row, so without this trigger a member awards
-- themselves 'trade_ready' with the publishable key and one line of JavaScript,
-- and every gate the funnel is made of becomes decorative.
--
-- The check is on `current_user` rather than `auth.role()` because migrations,
-- the SQL editor and psql all run as `postgres`/`supabase_admin` with no JWT at
-- all, and `auth.role()` is null in exactly the sessions that legitimately need
-- to write this column. The API writes it as `service_role`.
--
-- INSERT is covered as well as UPDATE. Onboarding creates the profile row from
-- the client, so an insert that simply arrives with stage='trade_ready' would
-- walk straight past an UPDATE-only guard. On insert the rule is narrower: the
-- client may create a row, it may not choose a stage other than the default.

create or replace function profiles_guard_stage()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.stage is distinct from 'beginner'
       or new.stage_locked is distinct from false
       or new.stage_changed_at is not null then
      raise exception
        '0042: a client may not choose a readiness stage. profiles.stage is set by the API (service role) from training evidence, never from the phone.';
    end if;
    return new;
  end if;

  if new.stage is distinct from old.stage
     or new.stage_locked is distinct from old.stage_locked
     or new.stage_changed_at is distinct from old.stage_changed_at then
    raise exception
      '0042: profiles.stage is not client-writable. It moves through the API (service role) on training evidence, or by an admin override.';
  end if;

  return new;
end $$;

revoke all on function profiles_guard_stage() from public, anon, authenticated;

drop trigger if exists profiles_guard_stage_trg on profiles;
create trigger profiles_guard_stage_trg
  before insert or update on profiles
  for each row execute function profiles_guard_stage();

-- SCHEMA-NOTES 2.7: 0018's function grant floor runs once, so every migration
-- that creates a function must re-apply it. The `create or replace function`
-- above is followed by its own revoke; this is the sweep that catches a future
-- edit which forgets one.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('profiles_guard_stage')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

-- =====================================================================
-- 5. ASSERTIONS — the file refuses to have half-applied
-- =====================================================================

-- (a) The three columns exist, with the types and defaults §2 describes.
do $$
declare v record;
begin
  select count(*) as n into v
    from information_schema.columns
   where table_schema = 'public' and table_name = 'profiles'
     and column_name in ('stage', 'stage_locked', 'stage_changed_at');
  if v.n <> 3 then
    raise exception '0042: expected 3 stage columns on profiles, found %.', v.n;
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles'
       and column_name = 'stage' and is_nullable = 'NO'
       and column_default like '%beginner%'
  ) then
    raise exception '0042: profiles.stage must be NOT NULL defaulting to beginner.';
  end if;
end $$;

-- (b) The vocabulary is a CHECK and not an enum — §1 is a decision, not a
--     preference, and the next person to "tidy this up" should trip on it.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.profiles'::regclass and conname = 'profiles_stage_check'
  ) then
    raise exception '0042: profiles_stage_check is missing.';
  end if;

  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles'
       and column_name = 'stage' and data_type <> 'text'
  ) then
    raise exception
      '0042: profiles.stage stopped being text. The ladder is unfinished and grows by amending a CHECK - read section 1 before making it an enum.';
  end if;
end $$;

-- (c) Every row holds a value the constraint allows. A backfill that silently
--     did nothing and a backfill that did the wrong thing look identical from
--     the outside, so count them.
do $$
declare v_bad int; v_dist text;
begin
  select count(*) into v_bad from profiles
   where stage not in ('beginner', 'developing', 'trade_ready');
  if v_bad > 0 then
    raise exception '0042: % profile(s) hold a stage outside the vocabulary.', v_bad;
  end if;

  select string_agg(format('%s=%s', stage, n), ', ' order by stage)
    into v_dist
    from (select stage, count(*) as n from profiles group by stage) s;
  raise notice '0042: stage distribution after backfill -> %', coalesce(v_dist, '(no profiles)');
end $$;

-- (d) THE GUARD IS ARMED. This is the assertion that matters most in this file:
--     everything else here is a column, and a column with no trigger on it is a
--     column any member can set to anything.
do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.profiles'::regclass
       and tgname = 'profiles_guard_stage_trg'
       and not tgisinternal
  ) then
    raise exception '0042: the stage guard trigger is not on profiles. The column is self-award-able without it.';
  end if;
end $$;

-- (e) THE POSTURE DID NOT MOVE. Adding columns is a common place for somebody
--     to "just add a policy" so a screen can write the row more directly.
do $$
declare v_count int;
begin
  select count(*) into v_count
    from pg_policies where schemaname = 'public' and tablename = 'profiles';
  if v_count <> 1 then
    raise exception
      '0042: profiles has % policies, expected exactly 1 (profiles_owner_all).', v_count;
  end if;
end $$;

-- (f) THE CLIENT WRITE GRANTS DID NOT MOVE. Carried verbatim from 0033/0038/
--     0039/0040 with this file's number. `profiles` is on the allowlist and has
--     to be — see the RLS posture note at the top — which is precisely why the
--     guard in §4 exists instead of a grant.
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
    raise exception '0042: unexpected client write grant on %.', v_bad;
  end if;
end $$;

-- =====================================================================
-- 6. WHAT TO RUN BY HAND AFTER APPLYING, on local AND on hosted
-- =====================================================================
-- (i) The ladder, and how many members are on each rung:
--
--   select stage, count(*) from profiles group by stage order by stage;
--   -> expected: mostly 'beginner', with 'developing'/'trade_ready' matching
--      the intermediate/advanced counts of `experience`.
--
-- (ii) The backfill agreed with the answer these members already gave:
--
--   select experience, stage, count(*) from profiles
--    group by experience, stage order by experience, stage;
--   -> expected: advanced/trade_ready, intermediate/developing, beginner/beginner.
--
-- (iii) THE GUARD ACTUALLY BITES. Run this as `authenticated`, not as postgres,
--       or it will pass for the wrong reason:
--
--   set local role authenticated;
--   update profiles set stage = 'trade_ready' where user_id = auth.uid();
--   -> expected: ERROR 0042: profiles.stage is not client-writable.
--   reset role;
--
-- (iv) Nobody has moved yet, which is correct on day one:
--
--   select count(*) from profiles where stage_changed_at is not null;
--   -> expected: 0 immediately after this migration. A non-zero number here
--      later is the proof that evolution is running.
