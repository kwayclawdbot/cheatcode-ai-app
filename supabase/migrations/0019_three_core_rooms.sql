-- 0019_three_core_rooms
-- Owner decision 2026-08-26: Community is THREE rooms, not nineteen.
--
--   #day-trade  (mode day_trade)
--   #swing      (mode swing)
--   #investing  (mode invest)
--
-- The 16 legacy per-mode sub-rooms (dt-*, sw-*, iv-*) are consolidated into the
-- room for their mode and then removed. `mode` stays on the row - a room really
-- is about one horizon - but it is no longer a filter: every member sees all
-- three rooms regardless of their primary_mode.
--
-- Idempotent by design: it can run twice, and it can run on a hosted database
-- that already carries member traffic in the legacy rooms.
--
-- SCHEMA-NOTES gap 2.7 (every migration after 0018 must re-revoke functions it
-- creates) does not bite here: this migration creates NO function. The DO block
-- below is anonymous, so there is nothing new in `public` to revoke.

-- ---------------------------------------------------------------------
-- 1. The three rooms. `on conflict (slug) do nothing` so a database that
--    already has them (a fresh seed) is left alone.
-- ---------------------------------------------------------------------
insert into rooms (type, mode, slug, name, description, config) values
  ('core','day_trade','day-trade','Day Trade','Intraday setups, confirmations, exits - today.',
   '{"intel_eligible": false}'),
  ('core','swing','swing','Swing','Ideas held for days or weeks: theses, catalysts, updates.',
   '{"intel_eligible": false}'),
  ('core','invest','investing','Investing','Building and reviewing a long-term portfolio.',
   '{"intel_eligible": false}')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------
-- 2. Move everything the legacy rooms hold, then delete them.
--
--    messages.seq is unique per (room_id, seq), so a move cannot keep the old
--    numbers. Every moved message is renumbered from the TARGET room's
--    `room_seq_counters` in chronological order (created_at, then old seq), so
--    the merged history reads in the order it was actually written. The
--    old->new mapping is kept for the read marks below.
--
--    `messages.parent_id` is an id, not a seq, so threading survives the
--    renumbering untouched.
-- ---------------------------------------------------------------------
do $$
declare
  v_mode      app_mode;
  v_target    uuid;
  v_last      bigint;
begin
  -- legacy rooms = the 16 slugs 0010/seed created, and nothing else. Matching
  -- on an explicit list rather than a `like 'dt-%'` pattern so a room someone
  -- creates later with a similar slug is never swept up by this migration.
  drop table if exists _legacy_rooms;
  drop table if exists _seq_map;

  create temp table _legacy_rooms on commit drop as
  select r.id, r.mode
  from rooms r
  where r.type = 'core'
    and r.slug in (
      'dt-market-open','dt-live-setups','dt-trade-ready','dt-active-trades',
      'dt-reviews','dt-beginner-questions',
      'sw-new-ideas','sw-entry-watch','sw-active-swings','sw-catalysts',
      'sw-position-updates','sw-weekly-review',
      'iv-portfolio-building','iv-stock-research','iv-etfs','iv-fundamentals',
      'iv-dividends','iv-beginner-investing','iv-reviews'
    );

  if not exists (select 1 from _legacy_rooms) then
    raise notice '0019: no legacy rooms present - nothing to consolidate';
    return;
  end if;

  create temp table _seq_map (
    message_id uuid primary key,
    from_room  uuid not null,
    old_seq    bigint not null,
    to_room    uuid not null,
    new_seq    bigint not null
  ) on commit drop;

  for v_mode, v_target in
    select r.mode, r.id from rooms r where r.slug in ('day-trade','swing','investing')
  loop
    -- the target's counter, created if this room has never been posted in
    insert into room_seq_counters (room_id, last_seq)
    values (v_target, coalesce((select max(m.seq) from messages m where m.room_id = v_target), 0))
    on conflict (room_id) do nothing;

    select last_seq into v_last from room_seq_counters where room_id = v_target for update;

    -- renumber every message from this mode's legacy rooms, in write order
    insert into _seq_map (message_id, from_room, old_seq, to_room, new_seq)
    select m.id, m.room_id, m.seq, v_target,
           v_last + row_number() over (order by m.created_at, m.seq, m.id)
    from messages m
    join _legacy_rooms l on l.id = m.room_id
    where l.mode = v_mode;

    update messages m
       set room_id = s.to_room,
           seq     = s.new_seq
      from _seq_map s
     where s.message_id = m.id
       and s.to_room = v_target;

    update room_seq_counters
       set last_seq = greatest(last_seq, coalesce((select max(new_seq) from _seq_map where to_room = v_target), last_seq))
     where room_id = v_target;

    -- Kai objects point back at the room they were produced in.
    update kai_objects k
       set refs = jsonb_set(k.refs, '{room_id}', to_jsonb(v_target::text), true)
     where k.refs ? 'room_id'
       and (k.refs->>'room_id')::uuid in (select id from _legacy_rooms where mode = v_mode);

    -- Memberships collapse into one row per user. A ban anywhere in the mode
    -- carries over; a mute does not (it was a mute on a room that no longer
    -- exists). The read mark is translated through the seq map: the last
    -- message the member had actually read keeps its meaning.
    insert into room_members (room_id, user_id, role, banned, last_read_seq, created_at)
    select v_target,
           rm.user_id,
           (array_agg(rm.role order by
              case rm.role::text when 'moderator' then 0 when 'educator' then 1
                                 when 'expert' then 2 else 3 end))[1],
           bool_or(coalesce(rm.banned, false)),
           coalesce(max(
             (select max(s.new_seq) from _seq_map s
               where s.from_room = rm.room_id and s.old_seq <= coalesce(rm.last_read_seq, 0))
           ), 0),
           min(rm.created_at)
      from room_members rm
      join _legacy_rooms l on l.id = rm.room_id
     where l.mode = v_mode
     group by rm.user_id
    on conflict (room_id, user_id) do update
      set banned        = room_members.banned or excluded.banned,
          last_read_seq = greatest(coalesce(room_members.last_read_seq, 0), excluded.last_read_seq),
          updated_at    = now();
  end loop;

  -- A setup pointing at a room that is about to disappear must let go first;
  -- fk_setup_room is deferrable but not ON DELETE, so this is not optional.
  update setups
     set discussion_room_id = null
   where discussion_room_id in (select id from _legacy_rooms);

  -- reports.room_id is a bare uuid with no FK (0010) - blank the pointer rather
  -- than leave a report addressed to a room nobody can open.
  update reports
     set room_id = null
   where room_id in (select id from _legacy_rooms);

  -- Nothing references the legacy rooms now. room_members and messages are
  -- ON DELETE NO ACTION, so they are cleared explicitly; room_seq_counters
  -- cascades on its own.
  delete from room_members where room_id in (select id from _legacy_rooms);
  delete from messages      where room_id in (select id from _legacy_rooms);
  delete from rooms         where id      in (select id from _legacy_rooms);
end $$;

-- ---------------------------------------------------------------------
-- 3. Any setup still pointing at a room that no longer exists (from an earlier
--    partial run, or a room deleted by hand) is nulled unconditionally.
-- ---------------------------------------------------------------------
update setups s
   set discussion_room_id = null
 where s.discussion_room_id is not null
   and not exists (select 1 from rooms r where r.id = s.discussion_room_id);
