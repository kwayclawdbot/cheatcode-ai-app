-- =====================================================================
-- 0052 — The Live Rooms strip: Wins and Ask Kai join the chats
-- =====================================================================
-- Written, NOT applied — the owner applies it. Safe to run more than once.
--
-- The V2 redesign suggests five rooms for the top rail of Community: War Room,
-- Swing Desk, Investors, Wins, Ask Kai. Checked against production read-only
-- on 2026-09-21: the core rooms there are exactly traders, investors and
-- beginners (0045). The map this file writes:
--
--   War Room    -> traders   (existing; the strip LABEL is "War Room", the
--                             room keeps its name "Traders Chat")
--   Swing Desk  -> NOT CREATED. 0045 merged the swing room into traders on the
--                             owner's decision of 2026-09-08 ("traders chat,
--                             investors chat and beginners chat"). Re-creating
--                             it would undo that decision without asking. If
--                             the owner wants it back it is one insert below.
--   Investors   -> investors (existing)
--   Wins        -> wins      (NEW)
--   Ask Kai     -> ask-kai   (NEW; the room where @Kai is asked — the existing
--                             POST /rooms/:id/kai route already works in any room)
--   Beginners   -> beginners (existing, and it STAYS on the strip: Beginners is a
--                             permanent core room and new members are never
--                             pushed toward day trading)
--
-- Where the strip reads its label, topic and order: rooms.config.strip. A room
-- without config.strip is not on the strip. Nothing is hard-coded in the API.
--
-- 0045 asserted "exactly three core rooms" when it ran. That assertion is not
-- re-run here and must not be: the chats are now five, plus the feed room from
-- 0050 which the directory hides.
-- =====================================================================

insert into rooms (type, mode, slug, name, description, config) values
  ('core', null, 'wins', 'Wins',
   'Trades that worked, and what made them work.',
   '{"intel_eligible": false}'),
  ('core', null, 'ask-kai', 'Ask Kai',
   'Ask Kai anything about a chart, a setup or a word you do not know.',
   '{"intel_eligible": false}')
on conflict (slug) do nothing;

update rooms set config = config || jsonb_build_object('strip', jsonb_build_object(
  'label', 'War Room', 'topic', 'Setups, entries, stops and exits', 'order', 1))
 where slug = 'traders' and type = 'core';

update rooms set config = config || jsonb_build_object('strip', jsonb_build_object(
  'label', 'Investors', 'topic', 'Companies and long-term ideas', 'order', 2))
 where slug = 'investors' and type = 'core';

update rooms set config = config || jsonb_build_object('strip', jsonb_build_object(
  'label', 'Wins', 'topic', 'Trades that worked', 'order', 3))
 where slug = 'wins' and type = 'core';

update rooms set config = config || jsonb_build_object('strip', jsonb_build_object(
  'label', 'Ask Kai', 'topic', 'Questions for Kai', 'order', 4))
 where slug = 'ask-kai' and type = 'core';

update rooms set config = config || jsonb_build_object('strip', jsonb_build_object(
  'label', 'Beginners', 'topic', 'Simple questions, plain answers', 'order', 5))
 where slug = 'beginners' and type = 'core';

-- Assertions.
do $$
declare v_missing text; v_feed_on_strip int;
begin
  select string_agg(s, ', ') into v_missing
    from unnest(array['traders', 'investors', 'wins', 'ask-kai', 'beginners']) s
   where not exists (select 1 from rooms r where r.slug = s and r.type = 'core' and r.config ? 'strip');
  if v_missing is not null then
    raise exception '0052: strip room(s) % are missing or have no config.strip.', v_missing;
  end if;

  select count(*) into v_feed_on_strip from rooms
   where config->>'surface' = 'feed' and config ? 'strip';
  if v_feed_on_strip > 0 then
    raise exception '0052: the feed room is on the strip. It is the feed, not a room people enter.';
  end if;

  -- Core rooms are permanent (0045 §4): none of the new ones may carry Circle
  -- properties.
  if exists (select 1 from rooms where slug in ('wins', 'ask-kai')
              and (expires_at is not null or config ? 'origin' or setup_id is not null)) then
    raise exception '0052: a new core room has Circle properties.';
  end if;
end $$;
