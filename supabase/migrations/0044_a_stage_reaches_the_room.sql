-- 0044 — A member's stage reaches the room they are posting in.
--
-- =====================================================================
-- WHAT THIS CHANGES, IN ONE PARAGRAPH
-- =====================================================================
-- One column on one view. 0042 put `stage` on `profiles`, and the app's own
-- profile read picks it up — but every OTHER member's stage reaches the client
-- through `profiles_public`, which has a fixed column list and therefore does
-- not carry it. The result is a tag that renders correctly on your own name and
-- is silently absent on everybody else's, which is the half-built version of
-- the owner's "visible stage on profile AND community identity".
--
-- The view is recreated rather than altered, because Postgres will not add a
-- column to a view in place. That means its grants have to be re-applied by
-- hand — `create or replace view` drops them — and asserted afterwards, which
-- is what 0035 §5(e) exists to police for `messages_public`.
--
-- =====================================================================
-- RLS POSTURE OF EVERYTHING THIS FILE TOUCHES
-- =====================================================================
--   profiles_public     RECREATED with one appended column and NOTHING else
--                       changed: same select list in the same order, same left
--                       join to `contributor_stats`, same absence of
--                       `security_invoker` (so it keeps running as its owner,
--                       exactly as before). `authenticated` gets its `select`
--                       back explicitly below rather than assumed to have
--                       survived the recreate.
--
--   profiles            UNTOUCHED. This file reads it through a view and writes
--                       nothing. The 0042 guard trigger on `stage` is still the
--                       only thing that may move that column, and this changes
--                       nothing about who may write it — only who may SEE it.
--
-- =====================================================================
-- IS A STAGE PUBLIC? YES, AND DELIBERATELY.
-- =====================================================================
-- This view is the public face of a member and the question deserves answering
-- rather than assuming, because "beginner" is the kind of label somebody might
-- reasonably not want broadcast.
--
-- The owner's design puts the tag in the room on purpose: the Beginners room
-- works because experienced members can SEE who is new and answer accordingly,
-- and a novice who looks identical to a veteran gets veteran-pitched replies.
-- It is the same argument the belt already makes — `user_points.belt` is on this
-- exact surface and is a far sharper ranking than this is.
--
-- What is NOT exposed is everything that would make it a judgement:
-- `stage_locked` stays off the view, because whether a staff member pinned
-- somebody's stage is nobody else's business, and `stage_changed_at` stays off
-- because how long somebody has been stuck on a rung is not a fact the room
-- needs. The word, and nothing behind it.

drop view if exists profiles_public;

create view profiles_public as
  select
    p.user_id,
    p.handle,
    p.display_name,
    p.avatar_url,
    coalesce(cs.role_labels, '{}'::text[]) as role_labels,
    -- Appended LAST so that any caller doing `select *` and reading by position
    -- keeps working. There are none today and there should not be one tomorrow,
    -- but a view's column ORDER is part of its contract whether or not anybody
    -- meant it to be.
    p.stage
  from profiles p
  left join contributor_stats cs on cs.user_id = p.user_id;

comment on view profiles_public is
  'The public face of a member: name, handle, avatar, evidence-based role '
  'labels, and readiness stage. Deliberately NOT stage_locked or '
  'stage_changed_at - see 0044. Belt is not here; it lives in user_points and '
  'is loaded beside this by beltsFor().';

-- The recreate dropped these. 0014 granted the select and 0031/0033 have had to
-- re-apply grants after a view rebuild before; this is the same dance.
grant select on profiles_public to authenticated;
grant select, insert, update, delete on profiles_public to service_role;

-- =====================================================================
-- WHAT "GOOD" LOOKS LIKE, ASSERTED RATHER THAN BELIEVED
-- =====================================================================

-- (a) The column arrived, and the ones that must NOT be here did not.
do $$
declare v_stage int; v_leaked text;
begin
  select count(*) into v_stage
    from information_schema.columns
   where table_schema = 'public' and table_name = 'profiles_public'
     and column_name = 'stage';
  if v_stage <> 1 then
    raise exception
      '0044: profiles_public.stage is missing. Every member other than yourself would render with no stage at all.';
  end if;

  select string_agg(column_name, ', ') into v_leaked
    from information_schema.columns
   where table_schema = 'public' and table_name = 'profiles_public'
     and column_name in ('stage_locked', 'stage_changed_at');
  if v_leaked is not null then
    raise exception
      '0044: profiles_public exposes %. Whether staff pinned a stage, and how long somebody has sat on one, are not public facts.', v_leaked;
  end if;
end $$;

-- (b) NOTHING ELSE MOVED. The recreate is the risky part of this file: it is
--     one typo away from dropping a column the whole community feed reads.
do $$
declare v_missing text;
begin
  select string_agg(c, ', ') into v_missing
    from unnest(array['user_id', 'handle', 'display_name', 'avatar_url', 'role_labels']) as c
   where c not in (
     select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'profiles_public'
   );
  if v_missing is not null then
    raise exception '0044: the recreate lost %. profiles_public is what every author line reads.', v_missing;
  end if;
end $$;

-- (c) THE GRANT CAME BACK. A view that exists and cannot be selected is the
--     specific failure mode of recreating one, and it is invisible until a
--     member opens a room.
do $$
begin
  if not exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'profiles_public'
       and grantee = 'authenticated' and privilege_type = 'SELECT'
  ) then
    raise exception
      '0044: authenticated lost SELECT on profiles_public. Recreating a view drops its grants and this one was not re-applied.';
  end if;

  if exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'profiles_public'
       and grantee in ('anon', 'authenticated')
       and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
  ) then
    raise exception '0044: profiles_public became client-writable. It is a read surface.';
  end if;
end $$;

-- (d) It still returns rows, and they still carry a stage. A view can satisfy
--     every check above and return nothing because the join went wrong.
do $$
declare v_rows int; v_staged int;
begin
  select count(*) into v_rows from profiles_public;
  select count(*) into v_staged from profiles_public where stage is not null;
  if v_rows > 0 and v_staged <> v_rows then
    raise exception
      '0044: % of % public profiles have a null stage. The column is NOT NULL on profiles, so the join lost rows.',
      v_rows - v_staged, v_rows;
  end if;
  raise notice '0044: profiles_public returns % row(s), all carrying a stage.', v_rows;
end $$;

-- =====================================================================
-- WHAT TO RUN BY HAND AFTER APPLYING, on local AND on hosted
-- =====================================================================
-- (i) The public face of a member, with the new column:
--
--   select handle, display_name, role_labels, stage from profiles_public
--    order by handle nulls last limit 10;
--
-- (ii) The two columns that must never appear here:
--
--   select column_name from information_schema.columns
--    where table_name = 'profiles_public' order by ordinal_position;
--   -> expected: user_id, handle, display_name, avatar_url, role_labels, stage.
--
-- (iii) A member can actually read it as themselves, not just as postgres:
--
--   set local role authenticated;
--   select count(*) from profiles_public;
--   reset role;
