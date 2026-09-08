-- 0043 — Beginners is a fourth core room, and it is the one core room that is
--        not a desk.
--
-- =====================================================================
-- WHAT THIS CHANGES, IN ONE PARAGRAPH
-- =====================================================================
-- One row in `rooms`. The owner's funnel note (project-ccai-stages-funnel,
-- 7 Sept) makes the core rooms FOUR and permanent — Beginners · Investing ·
-- Swing · Day Trading — so that a novice asking what a wick is has somewhere
-- that is theirs, and the advanced rooms do not slow down to answer it. The
-- room is for simple questions, terminology, lesson discussion, "what does this
-- alert mean?", and beginner wins.
--
-- It is a CORE room and explicitly not a Circle: Circles are `type='setup'`
-- with an `expires_at` and `config.origin='user'` (0021 `create_circle()`), and
-- they close on their own. This one never closes.
--
-- =====================================================================
-- RLS POSTURE OF EVERYTHING THIS FILE TOUCHES
-- =====================================================================
--   rooms               UNCHANGED. This file inserts one row and alters no
--                       policy, no grant and no column. Membership, posting and
--                       reading are governed by exactly what governs the other
--                       three core rooms: `room_members` plus the
--                       `is_room_member(room_id)` policies from 0014, and the
--                       join route's `if (room.type !== 'core')` gate, which
--                       this row passes by being core.
--
-- This file adds no policy, weakens no policy, and grants nothing to `anon` or
-- to `authenticated`. There is no `using (true)` in it. It creates no function,
-- so SCHEMA-NOTES 2.7's grant floor has nothing to re-apply.
--
-- =====================================================================
-- 1. WHY `mode` IS NULL, AND WHY THAT IS THE ONLY SHAPE THAT WORKS
-- =====================================================================
-- `rooms.mode` is nullable and every existing core room sets it, so the
-- tempting thing is to give Beginners a mode too. It cannot have one, for two
-- separate reasons that happen to agree.
--
-- THE HARD ONE: 0040 §4(b) asserts that every value of `app_mode` has EXACTLY
-- ONE core room, because `community_calls.mode` is the authority and the room a
-- call lands in is derived from it. A Beginners room reusing 'swing' or
-- 'invest' would give that mode two core rooms and fail that assertion — which
-- runs on 0040, not here, so the failure would surface the next time anybody
-- rebuilt the database rather than today. Note the assertion iterates
-- `enum_range(null::app_mode)` and LEFT JOINs, so a null-mode row joins to
-- nothing and is correctly never counted. Null is the shape that survives.
--
-- THE TRUE ONE: a mode is a DESK — "this is a day trade" — and Beginners is not
-- a desk, it is a stage of the person. Somebody in Beginners is also investing
-- or swinging; the two facts are independent, which is exactly why `stage`
-- (0042) is a separate column from `primary_mode` and not a fourth value of it.
-- Giving this room a mode would be modelling the person as the instrument.
--
-- WHAT FOLLOWS FROM THE NULL, stated so it is a decision and not a bug report:
--   * `coreRoomForMode()` (apps/api/src/lib/social/rooms-bridge.ts) filters on
--     `.eq('mode', mode)` and therefore CANNOT return this room. A published
--     community call can never land in Beginners. That is correct: a call is a
--     trade somebody is standing behind, and the beginners' room is not where
--     it belongs.
--   * `MODE_ORDER`/`rank()` in the rooms route and in community.tsx send an
--     unknown-or-null mode to the END of the list, so this row sorts last with
--     no change to either. The mobile client orders it deliberately instead —
--     see the stage work — but the API needs no edit to be correct.
--   * `ModeSegmented` iterates the three modes and must keep doing so. It
--     writes `profiles.primary_mode`; Beginners is not a mode and must never
--     become a fourth chip in that control.
--
-- =====================================================================
-- 2. THIS IS NOT A REVIVAL OF THE 0019 SUB-ROOMS
-- =====================================================================
-- 0019 deleted nineteen per-mode sub-rooms and folded them into three core
-- rooms, and two of the names it retired were `dt-beginner-questions` and
-- `iv-beginner-investing`. Somebody reading this file later deserves to know
-- that was looked at rather than missed.
--
-- What 0019 killed was ONE BEGINNER ROOM PER DESK — a beginner's question about
-- a day trade lived somewhere different from the same person's question about a
-- fund, which split the smallest audience in the product three ways and left
-- all three rooms empty. This is the opposite move: ONE room, across all desks,
-- for the people the funnel is built to move. The 0019 header's complaint was
-- fragmentation, and a single room is the fix for fragmentation rather than
-- another instance of it.

insert into rooms (type, mode, slug, name, description, config) values
  ('core', null, 'beginners', 'Beginners',
   'Simple questions, plain answers. What a term means, what an alert is saying, and the first wins.',
   '{"intel_eligible": false}')
on conflict (slug) do nothing;

comment on table rooms is
  'Core rooms are permanent (type=core, expires_at null): three desks keyed by '
  'mode, plus Beginners which has no mode because it is a stage of the member '
  'and not an instrument - see 0043 section 1. Circles are type=setup with an '
  'expires_at and config.origin=user.';

-- =====================================================================
-- 3. WHAT "GOOD" LOOKS LIKE, ASSERTED RATHER THAN BELIEVED
-- =====================================================================
-- These run as part of the migration. A migration that says it did something
-- and a migration that proves it are different migrations, and 0033 §9/§10 set
-- the standard this follows.

-- (a) The room exists, exactly once, and is core with no mode and no expiry.
do $$
declare v record;
begin
  select count(*) as n into v from rooms where slug = 'beginners';
  if v.n <> 1 then
    raise exception '0043: expected exactly 1 room with slug beginners, found %.', v.n;
  end if;

  if not exists (
    select 1 from rooms
     where slug = 'beginners' and type = 'core' and mode is null and expires_at is null
  ) then
    raise exception
      '0043: the beginners room is not (core, mode null, no expiry). Read section 1 - a mode on this row breaks 0040 the next time the database is rebuilt.';
  end if;
end $$;

-- (b) 0040's INVARIANT STILL HOLDS. This is the whole reason the mode is null,
--     so re-run 0040 §4(b) here rather than trusting the argument above.
do $$
declare r record;
begin
  for r in
    select m.mode, count(rm.id) as n
      from unnest(enum_range(null::app_mode)) as m(mode)
      left join rooms rm on rm.type = 'core' and rm.mode = m.mode
     group by m.mode
  loop
    if r.n <> 1 then
      raise exception
        '0043: mode % now has % core room(s). 0040 requires exactly one, and this file is the most likely cause.',
        r.mode, r.n;
    end if;
  end loop;
end $$;

-- (c) FOUR CORE ROOMS, three of them desks. A count on its own would pass if
--     somebody added a fifth; the shape is what is being asserted.
do $$
declare v_core int; v_moded int; v_modeless int;
begin
  select count(*) into v_core     from rooms where type = 'core';
  select count(*) into v_moded    from rooms where type = 'core' and mode is not null;
  select count(*) into v_modeless from rooms where type = 'core' and mode is null;

  if v_core <> 4 or v_moded <> 3 or v_modeless <> 1 then
    raise exception
      '0043: core rooms are % (% with a mode, % without). Expected 4 = 3 desks + Beginners.',
      v_core, v_moded, v_modeless;
  end if;
end $$;

-- (d) IT IS NOT A CIRCLE. The single most likely way this room goes wrong later
--     is somebody giving it an expiry to "tidy up quiet rooms".
do $$
begin
  if exists (
    select 1 from rooms
     where slug = 'beginners'
       and (expires_at is not null or config ? 'origin' or setup_id is not null)
  ) then
    raise exception
      '0043: the beginners room has grown Circle properties (expiry / origin / setup_id). It is permanent - 0021 create_circle() is what builds temporary rooms.';
  end if;
end $$;

-- (e) THE POSTURE DID NOT MOVE. Inserting a row is a common place for somebody
--     to also "just open up" the rooms table so a screen can read it directly.
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
    raise exception '0043: unexpected client write grant on %.', v_bad;
  end if;
end $$;

-- =====================================================================
-- 4. WHAT TO RUN BY HAND AFTER APPLYING, on local AND on hosted
-- =====================================================================
-- (i) The four core rooms, and which one is not a desk:
--
--   select slug, name, mode, type, expires_at from rooms
--    where type = 'core' order by mode nulls last;
--   -> expected: day-trade/day_trade, swing/swing, investing/invest,
--      beginners/(null). All four with expires_at null.
--
-- (ii) The room id, which the mobile client resolves by SLUG and never by a
--      pinned uuid (ids are gen_random_uuid() and differ per environment):
--
--   select id from rooms where slug = 'beginners';
--
-- (iii) Calls still cannot route here, which is the intent of section 1:
--
--   select mode, count(*) from community_calls group by mode;
--   -> expected: only day_trade / swing / invest ever appear.
--
-- (iv) Who has actually joined it:
--
--   select count(*) from room_members m join rooms r on r.id = m.room_id
--    where r.slug = 'beginners';
