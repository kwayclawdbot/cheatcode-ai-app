-- 0045 — Community is THREE chats: Traders · Investors · Beginners.
--
-- =====================================================================
-- WHAT THIS CHANGES, IN ONE PARAGRAPH
-- =====================================================================
-- Owner decision, 8 Sept 2026, in their words: "Just make it traders chat,
-- investors chat and beginners chat." Today there are four core rooms —
-- `day-trade` (mode day_trade), `swing` (mode swing), `investing` (mode
-- invest) from 0019, and `beginners` (no mode) from 0043. This file merges the
-- two intraday/multi-day desks into ONE Traders Chat, renames Investing to
-- Investors Chat, keeps Beginners, and takes `mode` off all three. The mapping
-- from a member's desk to the room their call lands in stops being a column
-- and becomes a NAMED MAP, in one place, mirrored here and in
-- `apps/api/src/lib/social/rooms-bridge.ts`.
--
--   day_trade ─┐
--              ├──> traders    (Traders Chat)
--   swing     ─┘
--   invest    ────> investors  (Investors Chat)
--   (nobody)  ────> beginners  (Beginners Chat)
--
-- =====================================================================
-- §0. THE INVARIANT THIS FILE RETIRES, SAID OUT LOUD
-- =====================================================================
-- 0040 §4(b) and 0043 §3(b) both assert, in SQL, that EVERY value of the
-- `app_mode` enum has EXACTLY ONE core room:
--
--     for r in select m.mode, count(rm.id) ... group by m.mode loop
--       if r.n <> 1 then raise exception ...
--
-- THREE ROOMS CANNOT SATISFY THAT and this file is what breaks it: `day_trade`
-- and `swing` now share one room, and after this runs no core room carries a
-- mode at all, so every mode would count zero. That rule is dead from here.
--
-- IT IS NOT DELETED FROM 0040 OR 0043, and that is deliberate rather than
-- squeamish. A migration that has already run is a record of what the database
-- was asked to do on the day it ran; editing one turns the history into a
-- story. Those two blocks also still PASS where they stand — migrations run in
-- order, so both execute against data that still has three desks, long before
-- this file touches anything. What they have stopped being is TRUE ABOUT THE
-- PRODUCT, and a stale assertion that still passes is the dangerous kind,
-- because the next person copies it into a new migration.
--
-- So three things happen here instead of an edit:
--   1. §4(b) below asserts the REPLACEMENT invariant, which is strictly
--      stronger: every `app_mode` must be named in the mode→room map, and the
--      room the map names must exist exactly once. That catches everything the
--      old rule caught (a mode with no room, a mode with two) and one thing it
--      could not — a NEW enum value nobody wired up.
--   2. §4(c) asserts the opposite of the old shape on purpose: no core room may
--      carry a mode. If somebody "fixes" the retired assertion by putting the
--      modes back on the rows, this fails and tells them why.
--   3. `comment on table rooms` — the one statement of the rule that lives IN
--      the database and can be read by anybody with a psql prompt — is
--      rewritten, because 0043 left it saying "three desks keyed by mode" and
--      that sentence is now false.
--
-- =====================================================================
-- ROOMS STOP BEING KEYED BY `app_mode`, AND 0040 SAID THIS WAS ALLOWED
-- =====================================================================
-- `community_calls.mode` is untouched and stays the authority. 0040's header,
-- under "WHY `mode` AND NOT `room_id`", anticipated this exact day:
--
--     "So `mode` is the fact and the room is derived from it at publish time.
--      If the room mapping ever changes — a second day-trade room, a room
--      retired — the calls do not need rewriting, because none of them
--      recorded a room as their meaning."
--
-- A room is retired here and two modes start sharing one, and not a single
-- `community_calls` row changes. That is the whole return on the decision, and
-- it is why the mapping moves into a named map rather than into a second
-- column: `rooms.mode` was a JOIN KEY pretending to be a description. Now all
-- three core rooms carry `mode = null`, which is 0043's shape for Beginners
-- generalised — and 0043's own argument generalises with it. A mode is a DESK;
-- a chat is a ROOM OF PEOPLE. "Traders" is not a horizon and "Beginners" is a
-- stage, so neither is a value of `app_mode` and neither should be stored as
-- one.
--
-- =====================================================================
-- HOW THE MERGE WORKS, AND WHY NO MESSAGE IS LOST
-- =====================================================================
-- Two rooms become one, so one of them has to give up its `seq` numbers:
-- `messages` is unique on (room_id, seq). This is 0019 §2's problem again and
-- it is solved the same way, because that way was right — RENAME ONE ROOM AND
-- RE-PARENT THE OTHER'S MESSAGES, renumbering them from the surviving room's
-- `room_seq_counters` in chronological order (created_at, then old seq, then
-- id). The merged history then reads in the order it was actually written.
--
-- WHICH ROOM SURVIVES IS DECIDED BY THE DATA, not by a name picked in advance:
-- whichever of `day-trade` and `swing` holds MORE messages keeps its row and
-- its numbering, and the smaller one moves. Ties go to the older row, then to
-- the alphabetically first slug, so the choice is deterministic on any
-- database. The reason to let the data choose is that it minimises the rows
-- rewritten and leaves the longer conversation's `seq` values alone — read
-- marks in the bigger room stay exactly where they were.
--
-- IT DOES NOT MATTER THAT DIFFERENT ENVIRONMENTS MAY KEEP DIFFERENT ROWS.
-- Room ids are `gen_random_uuid()` and already differ per environment; 0043
-- §4(ii) states the rule this depends on — the client resolves a core room by
-- SLUG and never by a pinned uuid — and after this file the slug is `traders`
-- in both cases.
--
-- WHAT SURVIVES THE MOVE FOR FREE, and is worth naming so nobody goes looking:
--   * `messages.id` never changes, so `community_calls.message_id` (0040's
--     receipt) still points at the same post, and `messages.parent_id` is an
--     id rather than a seq, so every thread survives the renumbering.
--   * `room_seq_counters` for the retired room is ON DELETE CASCADE and goes
--     with it.
--
-- WHAT IS RE-POINTED RATHER THAN NULLED, which is where this parts company
-- with 0019: `setups.discussion_room_id`, `reports.room_id` and
-- `kai_objects.refs->>'room_id'` are moved to the surviving room. 0019 blanked
-- them because the destination genuinely stopped existing — nineteen rooms
-- were being deleted. Here the conversation did not go anywhere; it merged. A
-- setup whose discussion pointer was nulled would lose its thread for no
-- reason a member could explain.
--
-- MEMBERSHIPS COLLAPSE TO ONE ROW PER MEMBER, and the two mutes are treated
-- differently on purpose:
--   * `moderation_muted_until` takes the LATER of the two. A moderation
--     action must not be shed by a merge — that would be a way to serve out a
--     mute by having the room reorganised.
--   * `muted_until` (the member's own notification mute) takes the EARLIER,
--     and a member who muted only one of the two ends up unmuted. They asked
--     to keep hearing one of these conversations; the merged room is that
--     conversation as well as the other one.
--   * A ban in either room carries. The read mark is translated through the
--     renumbering, so "the last thing I read" keeps its meaning.
--
-- =====================================================================
-- RLS POSTURE OF EVERYTHING THIS FILE TOUCHES
-- =====================================================================
--   rooms            Rows updated and one row deleted. NO policy, NO grant and
--                    NO column changes. Reading and posting are governed by
--                    exactly what governed them before: `room_members` plus
--                    the `is_room_member(room_id)` policies from 0014, and the
--                    join route's `type = 'core'` gate, which all three rooms
--                    still pass.
--   room_members     Rows merged and the retired room's rows deleted. Same
--                    posture, no policy touched.
--   messages         Rows RE-PARENTED (room_id, seq). No column, no policy, no
--                    view change; `messages_public` is untouched, so 0035
--                    §5(e)'s append-and-re-assert dance does not apply.
--   setups, reports, kai_objects
--                    One pointer each, re-aimed. No policy touched.
--   community_calls  UNTOUCHED, on purpose. See the 0040 quotation above.
--
-- There is no `using (true)` in this file, no new grant to `anon` or to
-- `authenticated`, and it creates no function — so SCHEMA-NOTES 2.7's grant
-- floor has nothing to re-apply.
--
-- =====================================================================
-- WHAT THIS FILE REFUSES TO DO
-- =====================================================================
--   * It does not touch the `app_mode` enum. `day_trade` and `swing` are still
--     two different desks with two different horizons everywhere else in the
--     product — alerts, setups, charts, risk language. They now READ THE SAME
--     ROOM. Collapsing the enum because two rooms merged would be letting a
--     chat decide what a trade is.
--   * It does not delete a single message. §1 raises rather than deletes if the
--     retired room is not empty by the time it is dropped.
--   * It does not invent a room. If a slug this file expects is missing, the
--     three inserts in §2 create it with `on conflict do nothing`; nothing is
--     silently renamed onto somebody else's row.
--
-- Idempotent by design: it can run twice, and it can run on a hosted database
-- that already carries member traffic in all four rooms.

-- =====================================================================
-- 1. THE MERGE: day-trade + swing -> one room
-- =====================================================================
do $$
declare
  v_keep        uuid;
  v_keep_slug   text;
  v_retire      uuid;
  v_retire_slug text;
  v_last        bigint;
  v_moved       bigint := 0;
  v_before      bigint := 0;
  v_after       bigint := 0;
begin
  drop table if exists _seq_map;

  -- Already merged? Then this file has run and there is nothing to move. The
  -- renames in §2 stay idempotent on their own.
  if exists (select 1 from rooms where slug = 'traders') then
    raise notice '0045: a room with slug traders already exists - the merge has already happened.';
    return;
  end if;

  -- The survivor: more messages wins, then the older row, then the slug. See
  -- the header for why the data decides this rather than a name chosen here.
  select r.id, r.slug into v_keep, v_keep_slug
    from rooms r
   where r.type = 'core'
     and r.slug in ('day-trade', 'swing')
   order by (select count(*) from messages m where m.room_id = r.id) desc,
            r.created_at asc,
            r.slug asc
   limit 1;

  if v_keep is null then
    raise notice '0045: neither day-trade nor swing is present - nothing to merge.';
    return;
  end if;

  select r.id, r.slug into v_retire, v_retire_slug
    from rooms r
   where r.type = 'core'
     and r.slug in ('day-trade', 'swing')
     and r.id <> v_keep
   limit 1;

  if v_retire is null then
    raise notice '0045: only % is present - it becomes Traders Chat with no merge.', v_keep_slug;
    return;
  end if;

  -- THE NUMBER THAT MUST NOT CHANGE. Counted before anything moves and
  -- checked again at the end of this block.
  select count(*) into v_before from messages where room_id in (v_keep, v_retire);

  -- The survivor's counter, created if this room has never been posted in.
  insert into room_seq_counters (room_id, last_seq)
  values (v_keep, coalesce((select max(m.seq) from messages m where m.room_id = v_keep), 0))
  on conflict (room_id) do nothing;

  select last_seq into v_last from room_seq_counters where room_id = v_keep for update;

  -- Every moved message gets a number ABOVE everything already in the survivor,
  -- so the renumbering cannot collide with the rows staying put. The old->new
  -- mapping is kept because the read marks below are expressed in old numbers.
  create temp table _seq_map (
    message_id uuid primary key,
    old_seq    bigint not null,
    new_seq    bigint not null
  ) on commit drop;

  insert into _seq_map (message_id, old_seq, new_seq)
  select m.id,
         m.seq,
         v_last + row_number() over (order by m.created_at, m.seq, m.id)
    from messages m
   where m.room_id = v_retire;

  get diagnostics v_moved = row_count;

  update messages m
     set room_id = v_keep,
         seq     = s.new_seq
    from _seq_map s
   where s.message_id = m.id;

  update room_seq_counters
     set last_seq = greatest(last_seq, coalesce((select max(new_seq) from _seq_map), last_seq))
   where room_id = v_keep;

  -- One membership row per member. Role keeps the more senior of the two;
  -- a ban anywhere carries; the two mutes go opposite ways (see the header).
  insert into room_members (
    room_id, user_id, role, banned, muted_until, moderation_muted_until, last_read_seq, created_at
  )
  select v_keep,
         rm.user_id,
         rm.role,
         coalesce(rm.banned, false),
         rm.muted_until,
         rm.moderation_muted_until,
         coalesce(
           (select max(s.new_seq) from _seq_map s where s.old_seq <= coalesce(rm.last_read_seq, 0)),
           0
         ),
         rm.created_at
    from room_members rm
   where rm.room_id = v_retire
  on conflict (room_id, user_id) do update
    set banned = room_members.banned or excluded.banned,
        role = case
                 when (case excluded.role::text
                         when 'moderator' then 0 when 'educator' then 1
                         when 'expert' then 2 else 3 end)
                    < (case room_members.role::text
                         when 'moderator' then 0 when 'educator' then 1
                         when 'expert' then 2 else 3 end)
                 then excluded.role
                 else room_members.role
               end,
        -- A moderator's mute survives a reorganisation of the rooms.
        moderation_muted_until = case
          when room_members.moderation_muted_until is null then excluded.moderation_muted_until
          when excluded.moderation_muted_until is null then room_members.moderation_muted_until
          else greatest(room_members.moderation_muted_until, excluded.moderation_muted_until)
        end,
        -- The member's own mute does not. `least` on its own would treat a
        -- NULL as "no opinion" and keep the mute; a NULL here means NOT MUTED
        -- and that is the answer that wins.
        muted_until = case
          when room_members.muted_until is null or excluded.muted_until is null then null
          else least(room_members.muted_until, excluded.muted_until)
        end,
        last_read_seq = greatest(coalesce(room_members.last_read_seq, 0), excluded.last_read_seq),
        created_at = least(room_members.created_at, excluded.created_at),
        updated_at = now();

  -- Re-pointed, not blanked. The conversation moved; it did not stop existing.
  update setups   set discussion_room_id = v_keep where discussion_room_id = v_retire;
  update reports  set room_id            = v_keep where room_id            = v_retire;
  update kai_objects k
     set refs = jsonb_set(k.refs, '{room_id}', to_jsonb(v_keep::text), true)
   where k.refs ? 'room_id'
     and (k.refs->>'room_id')::uuid = v_retire;

  delete from room_members where room_id = v_retire;

  -- NOT `delete from messages`. If anything is still parented to the room
  -- about to be dropped, the renumbering above missed it, and the correct
  -- response to that is to stop rather than to tidy it away.
  if exists (select 1 from messages where room_id = v_retire) then
    raise exception
      '0045: % still holds messages after the move. Nothing has been deleted and the transaction is being rolled back.',
      v_retire_slug;
  end if;

  delete from rooms where id = v_retire;

  select count(*) into v_after from messages where room_id = v_keep;
  if v_after <> v_before then
    raise exception
      '0045: % messages were in the two rooms and % are in the merged one. A message went missing in the move.',
      v_before, v_after;
  end if;

  raise notice
    '0045: merged % into % - % message(s) moved, % in the room now.',
    v_retire_slug, v_keep_slug, v_moved, v_after;
end $$;

-- =====================================================================
-- 2. THE THREE CHATS
-- =====================================================================
-- The survivor of §1 becomes Traders Chat, Investing becomes Investors Chat,
-- Beginners keeps its row and its argument (0043) and gains the word "Chat" so
-- the three read as one set. All three lose `mode`.
--
-- The `not exists` guards are not defensive decoration. A half-applied state —
-- `traders` present AND `day-trade` still hanging about — would otherwise make
-- these renames collide with the unique slug they are trying to take, and the
-- error would name a constraint rather than the problem.

update rooms
   set slug = 'traders',
       name = 'Traders Chat',
       mode = null,
       description = 'Setups, entries, stops and exits - intraday and over days.'
 where type = 'core'
   and slug in ('day-trade', 'swing')
   and not exists (select 1 from rooms x where x.slug = 'traders');

update rooms
   set slug = 'investors',
       name = 'Investors Chat',
       mode = null,
       description = 'Companies, portfolios and long-term ideas.'
 where type = 'core'
   and slug = 'investing'
   and not exists (select 1 from rooms x where x.slug = 'investors');

update rooms
   set name = 'Beginners Chat',
       mode = null,
       description = 'Simple questions, plain answers. Nothing here assumes you already know.'
 where type = 'core'
   and slug = 'beginners'
   -- Beginners keeps its slug, so unlike the two above there is nothing about
   -- it that stops matching once this has run. Without this line a re-run would
   -- silently rewrite a description an admin had since edited.
   and (mode is not null or name <> 'Beginners Chat');

-- A database missing one of the three gets it, and one that has all three is
-- left alone. Nothing is renamed onto an existing row: the slug is the key.
insert into rooms (type, mode, slug, name, description, config) values
  ('core', null, 'traders', 'Traders Chat',
   'Setups, entries, stops and exits - intraday and over days.',
   '{"intel_eligible": false}'),
  ('core', null, 'investors', 'Investors Chat',
   'Companies, portfolios and long-term ideas.',
   '{"intel_eligible": false}'),
  ('core', null, 'beginners', 'Beginners Chat',
   'Simple questions, plain answers. Nothing here assumes you already know.',
   '{"intel_eligible": false}')
on conflict (slug) do nothing;

-- =====================================================================
-- 3. WHAT THE DATABASE ITSELF SAYS ABOUT THIS TABLE
-- =====================================================================
-- 0043 left this comment saying "three desks keyed by mode, plus Beginners".
-- That sentence is now false, and it is the only statement of the rule that
-- travels with the database rather than with the repository.
comment on table rooms is
  'Core rooms are permanent (type=core, expires_at null) and there are THREE: '
  'traders, investors, beginners. None of them carries a mode - a mode is a '
  'desk and a chat is a room of people (0045, generalising 0043 section 1). '
  'Which room a desk posts into is a NAMED MAP, not a join: day_trade and '
  'swing both go to traders, invest goes to investors, and nothing routes to '
  'beginners. The map is asserted in 0045 section 4(b) and mirrored in '
  'apps/api/src/lib/social/rooms-bridge.ts. Circles are type=setup with an '
  'expires_at and config.origin=user.';

-- =====================================================================
-- 4. WHAT "GOOD" LOOKS LIKE, ASSERTED RATHER THAN BELIEVED
-- =====================================================================
-- These run as part of the migration, in the shape 0033 §9/§10 and 0043 §3 set.

-- (a) THREE CORE ROOMS, exactly these three, none of them a Circle.
do $$
declare v_core int; v_slugs text;
begin
  select count(*) into v_core from rooms where type = 'core';

  select string_agg(slug, ', ' order by slug) into v_slugs from rooms where type = 'core';

  if v_core <> 3 or coalesce(v_slugs, '') <> 'beginners, investors, traders' then
    raise exception
      '0045: the core rooms are [%] (% of them). Expected exactly beginners, investors, traders. supabase/seed.sql inserting the pre-0045 rooms after the migrations is the most likely cause.',
      coalesce(v_slugs, '<none>'), v_core;
  end if;

  if exists (
    select 1 from rooms
     where type = 'core'
       and (expires_at is not null or config ? 'origin' or setup_id is not null)
  ) then
    raise exception
      '0045: a core room has grown Circle properties (expiry / origin / setup_id). Core rooms are permanent - 0021 create_circle() is what builds temporary ones.';
  end if;
end $$;

-- (b) THE REPLACEMENT INVARIANT, and the reason §0 could retire the old one.
--
--     EVERY `app_mode` IS NAMED IN THE MAP, AND THE ROOM IT NAMES EXISTS ONCE.
--
--     This is what 0040 §4(b) and 0043 §3(b) were protecting — that a
--     published call always has exactly one conversation to land in — expressed
--     against the map instead of against a column. It is stronger than the rule
--     it replaces in one way that matters: adding a value to `app_mode` and
--     forgetting to route it now fails HERE, whereas the old version would have
--     been satisfied the moment somebody gave the new mode any room at all.
--
--     THE VALUES LIST BELOW IS A MIRROR of `MODE_TO_ROOM` in
--     apps/api/src/lib/social/rooms-bridge.ts. Duplication is the cost of the
--     database being able to check itself, and duplication drifts — so the two
--     are written in the same order with the same words, and rooms-bridge.ts
--     names this section in its header.
do $$
declare r record; v_n int;
begin
  for r in
    select m.mode::text as mode,
           (select mr.slug
              from (values ('day_trade', 'traders'),
                           ('swing',     'traders'),
                           ('invest',    'investors')) as mr(mode, slug)
             where mr.mode = m.mode::text) as slug
      from unnest(enum_range(null::app_mode)) as m(mode)
  loop
    if r.slug is null then
      raise exception
        '0045: app_mode "%" is not in the mode->room map. A call published from that desk would reach no conversation at all. Add it here and in rooms-bridge.ts MODE_TO_ROOM.',
        r.mode;
    end if;

    select count(*) into v_n from rooms where type = 'core' and slug = r.slug;
    if v_n <> 1 then
      raise exception
        '0045: the map sends "%" to the room "%", and there are % core rooms with that slug. There must be exactly one.',
        r.mode, r.slug, v_n;
    end if;
  end loop;
end $$;

-- (c) NO CORE ROOM CARRIES A MODE. The single most likely way this goes wrong
--     later is somebody meeting the retired 0040/0043 assertion in an old file,
--     believing it, and putting the modes back on these rows to "fix" it.
do $$
declare v_bad text;
begin
  select string_agg(format('%s(%s)', slug, mode), ', ' order by slug)
    into v_bad
    from rooms where type = 'core' and mode is not null;

  if v_bad is not null then
    raise exception
      '0045: core room(s) % carry a mode. Rooms are no longer keyed by app_mode - read section 0 of this file before restoring it.',
      v_bad;
  end if;
end $$;

-- (d) NOTHING IS ORPHANED. The merge re-parents messages and re-aims three
--     pointers; a mistake in any of them shows up as a row pointing at a room
--     that is not there any more.
do $$
declare v_msgs int; v_members int; v_setups int;
begin
  select count(*) into v_msgs
    from messages m left join rooms r on r.id = m.room_id where r.id is null;
  if v_msgs > 0 then
    raise exception '0045: % message(s) point at a room that does not exist.', v_msgs;
  end if;

  select count(*) into v_members
    from room_members rm left join rooms r on r.id = rm.room_id where r.id is null;
  if v_members > 0 then
    raise exception '0045: % membership row(s) point at a room that does not exist.', v_members;
  end if;

  select count(*) into v_setups
    from setups s
   where s.discussion_room_id is not null
     and not exists (select 1 from rooms r where r.id = s.discussion_room_id);
  if v_setups > 0 then
    raise exception '0045: % setup(s) point their discussion at a room that does not exist.', v_setups;
  end if;
end $$;

-- (e) THE POSTURE DID NOT MOVE. Reorganising the rooms is a plausible moment
--     for somebody to also "just open up" the table so a screen can read it.
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
    raise exception '0045: unexpected client write grant on %.', v_bad;
  end if;
end $$;

-- =====================================================================
-- 5. WHAT TO RUN BY HAND AFTER APPLYING, on local AND on hosted
-- =====================================================================
-- (i) The three chats, and the fact that none of them is a desk:
--
--   select slug, name, mode, type, expires_at from rooms
--    where type = 'core' order by slug;
--   -> expected: beginners / investors / traders, all with mode null and
--      expires_at null. Nothing else.
--
-- (ii) How much conversation ended up in the merged room, and where it came
--      from. `seq` is contiguous and the join order is the write order:
--
--   select count(*), min(created_at), max(created_at)
--     from messages m join rooms r on r.id = m.room_id where r.slug = 'traders';
--
-- (iii) The receipts still resolve — 0040's `message_id` pointer survived the
--       re-parenting because ids did not change:
--
--   select c.symbol, c.mode, m.seq, r.slug
--     from community_calls c
--     join messages m on m.id = c.message_id
--     join rooms r on r.id = m.room_id
--    order by c.published_at desc limit 10;
--   -> expected: mode still day_trade / swing / invest, slug only traders or
--      investors. A call in `beginners` means something routed there, and
--      nothing should.
--
-- (iv) Nobody lost their place. Read marks were translated through the
--      renumbering, so this should be empty:
--
--   select rm.user_id, rm.last_read_seq
--     from room_members rm join rooms r on r.id = rm.room_id
--    where r.slug = 'traders'
--      and rm.last_read_seq > (select max(m.seq) from messages m where m.room_id = r.id);
--
-- (v) THE ONE THING THIS FILE CANNOT FIX, and it needs a human:
--     `supabase/seed.sql` still inserts the four pre-0045 rooms and runs AFTER
--     the migrations on a fresh database. Until its rooms block is replaced
--     with the three above, `supabase db reset` will re-create `day-trade`,
--     `swing` and `investing` beside the new rooms — and §4(a) will say so in
--     those words the next time this file is applied.
