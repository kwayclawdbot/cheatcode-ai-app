-- 0040 — A member's call knows which desk it belongs to, and remembers the post
--        it became.
--
-- =====================================================================
-- WHAT THIS CHANGES, IN ONE PARAGRAPH
-- =====================================================================
-- 0038 built `community_calls` as a free-floating object: a member published
-- one and it appeared in a feed of its own, reachable only from a toggle at the
-- top of Community. The owner has taken that toggle out. A call is now supposed
-- to arrive in the ROOM, in the conversation, in real time — and to stack up on
-- a COMMUNITY TAB on the Day Trade and Swing alert boards. Both of those need a
-- fact the table did not carry: WHICH DESK THE CALL IS FOR. This adds it, plus
-- a pointer to the message the call became, so the two objects can find each
-- other in both directions.
--
-- =====================================================================
-- WHY `mode` AND NOT `room_id`
-- =====================================================================
-- The obvious column is `room_id`, and it is the wrong one to make
-- authoritative. What a member actually chose when they published is a DESK —
-- "this is a day trade" — and the room is a consequence of that: there is
-- exactly one core room per mode (`rooms where type = 'core'`, three rows, one
-- each for day_trade, swing and invest), and the club headbar already treats
-- the mode toggle as the thing that opens that mode's room. The Community TAB
-- filters by mode, not by room, because it lives on the Day Trade board.
--
-- So `mode` is the fact and the room is derived from it at publish time. If the
-- room mapping ever changes — a second day-trade room, a room retired — the
-- calls do not need rewriting, because none of them recorded a room as their
-- meaning. Storing both as sources of truth is how they start disagreeing.
--
-- `message_id` IS NOT A SECOND SOURCE OF TRUTH, it is a receipt: the row that
-- was actually created in the conversation, so withdrawing a call can find its
-- post, and so an operator can tell a call that reached the room from one that
-- did not. It is NULLABLE and must stay nullable: the chat post can fail —
-- slow mode, a ban, a bad minute — and a call that exists on the board with no
-- message is a degraded state worth being able to see, not a reason to lose
-- the member's call.
--
-- =====================================================================
-- HOW A CALL BECOMES A MESSAGE, since the reverse pointer is not a column
-- =====================================================================
-- The message points back through `messages.refs -> 'community_call_id'`,
-- exactly as a Kai object is carried today by `messages.refs -> 'kai_object_id'`
-- and re-attached by `objectsFor()` in `lib/rooms.ts`. That is a deliberate
-- copy of an existing pattern and it buys three things:
--
--   1. NO NEW MESSAGE KIND. `message_kind` is an enum, and 03 Unit 2 forbids
--      migrating enums for the reason 0035 §1 spells out. The row is a `text`
--      message whose body is a readable sentence — "Long NVDA at 231.40, stop
--      225, target 245" — so a client that knows nothing about calls still
--      shows something true instead of an empty bubble.
--   2. NO CHANGE TO `messages_public`. That view already selects `refs`, so the
--      pointer reaches the API without the append-and-re-assert dance 0035 §5e
--      exists to police.
--   3. THE POLL CARRIES IT FOR FREE. Room chat is a five-second poll over
--      `after_seq` (`lib/realtime.ts` says so in its own header). A call that
--      is a real message with a real `seq` arrives through that cursor with no
--      second realtime stack, which is the whole reason it is a message and not
--      a parallel stream.
--
-- =====================================================================
-- RLS POSTURE OF EVERYTHING THIS FILE TOUCHES
-- =====================================================================
--   community_calls  UNCHANGED. RLS on, ZERO policies, service role only,
--                    exactly as 0038 §6 left it. Two new columns on an existing
--                    table inherit that posture: no client could read the table
--                    before and none can now. Adding a column is not a place to
--                    weaken a policy and this file does not.
--   messages         UNTOUCHED. No column, no policy, no view change. A call
--                    posts through `post_room_message` (0018) like any other
--                    message, which means the membership check, the ban check
--                    and the slow-mode check all still apply to it — a member
--                    banned from a room cannot get a post into that room by
--                    calling it a trade idea.
--
-- There is no `using (true)` in this file and no new grant to anyone.

-- =====================================================================
-- 1. THE DESK A CALL BELONGS TO
-- =====================================================================
-- Added nullable, backfilled, then made NOT NULL — the three-step, because a
-- straight `not null default` would silently stamp every existing call with a
-- desk nobody chose. There are no rows on hosted today, but local databases and
-- the next developer's branch are not hosted, and a column that is a lie over
-- old rows is the thing 0033 §9 asks migrations not to create.
alter table community_calls
  add column if not exists mode app_mode;

-- The author's own desk is the best available answer for a call published
-- before the column existed: it is what the composer would have inferred.
update community_calls c
   set mode = coalesce(p.primary_mode, 'day_trade')
  from profiles p
 where p.user_id = c.user_id
   and c.mode is null;

-- An author whose profile has since been deleted leaves nothing to infer from.
update community_calls set mode = 'day_trade' where mode is null;

do $$
begin
  if exists (select 1 from community_calls where mode is null) then
    raise exception '0040: some community_calls still have no mode after the backfill.';
  end if;
end $$;

alter table community_calls
  alter column mode set not null;

comment on column community_calls.mode is
  'Which desk the call is for. The authority; the room it posts into is derived '
  'from this (one core room per mode), never the other way round.';

-- =====================================================================
-- 2. THE POST IT BECAME
-- =====================================================================
-- `on delete set null`: a moderator removing the message must not take the
-- member's call and their scoring record with it. The call outlives its post,
-- the same way 0039's ledger outlives the thing it scored.
alter table community_calls
  add column if not exists message_id uuid references messages on delete set null;

comment on column community_calls.message_id is
  'The room message this call became, or null when it never reached one. A '
  'receipt, not a second source of truth — nullable on purpose so a failed chat '
  'post degrades the call rather than losing it.';

-- =====================================================================
-- 3. THE TWO READS THIS EXISTS TO SERVE
-- =====================================================================
-- The Community tab on a mode's alert board: newest first, for one desk.
create index if not exists community_calls_mode_feed_idx
  on community_calls (mode, published_at desc);

-- Finding a call from its message, for the room renderer's batch attach.
create index if not exists community_calls_message_idx
  on community_calls (message_id) where message_id is not null;

-- =====================================================================
-- 4. WHAT "GOOD" LOOKS LIKE, ASSERTED RATHER THAN BELIEVED
-- =====================================================================

-- (a) BOTH COLUMNS LANDED, WITH THE NULLABILITY EACH IS SUPPOSED TO HAVE. The
--     pair is the point: `mode` NOT NULL because a call without a desk cannot
--     be shown anywhere, `message_id` NULLABLE because a call whose post failed
--     is a state the system must be able to hold.
do $$
declare v_mode_null text; v_msg_null text;
begin
  select is_nullable into v_mode_null from information_schema.columns
   where table_schema = 'public' and table_name = 'community_calls' and column_name = 'mode';
  select is_nullable into v_msg_null from information_schema.columns
   where table_schema = 'public' and table_name = 'community_calls' and column_name = 'message_id';

  if v_mode_null is null then
    raise exception '0040: community_calls.mode is missing.';
  end if;
  if v_mode_null <> 'NO' then
    raise exception '0040: community_calls.mode is nullable. A call with no desk cannot be shown anywhere.';
  end if;
  if v_msg_null is null then
    raise exception '0040: community_calls.message_id is missing.';
  end if;
  if v_msg_null <> 'YES' then
    raise exception '0040: community_calls.message_id is NOT NULL. A call whose chat post failed must still exist.';
  end if;
end $$;

-- (b) EVERY MODE HAS EXACTLY ONE CORE ROOM TO DERIVE. This is the assumption
--     the whole "derive the room from the mode" decision rests on, and it is
--     data rather than schema, so nothing else would catch it changing. Two
--     core rooms for one mode would make the destination ambiguous; zero would
--     mean a published call silently reaches no conversation at all.
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
        '0040: mode % has % core room(s). A call derives its room from its mode, so there must be exactly one.',
        r.mode, r.n;
    end if;
  end loop;
end $$;

-- (c) THE POSTURE DID NOT MOVE. 0038 §6 left this table service-role only with
--     zero policies, and adding columns is a common place for somebody to
--     "just add a read policy" so a screen can query it directly.
do $$
declare v_count int; v_bad text;
begin
  select count(*) into v_count
    from pg_policies where schemaname = 'public' and tablename = 'community_calls';
  if v_count > 0 then
    raise exception '0040: % policy(ies) appeared on community_calls. It is service-role only (0038 §6).', v_count;
  end if;

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
    raise exception '0040: unexpected client write grant on %.', v_bad;
  end if;
end $$;

-- (d) `messages` STILL HAS NO COLUMN FOR THIS. The pointer lives in `refs`, and
--     the moment somebody adds `messages.community_call_id` there are two
--     places to look and one of them will be stale.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'messages'
       and column_name in ('community_call_id', 'call_id')
  ) then
    raise exception
      '0040: messages grew a call column. The pointer belongs in refs->>community_call_id, like refs->>kai_object_id.';
  end if;
end $$;

-- =====================================================================
-- 5. WHAT TO RUN BY HAND AFTER APPLYING, on local AND on hosted
-- =====================================================================
-- (i) The room each desk's calls will land in:
--
--   select mode, id, name from rooms where type = 'core' order by mode;
--   -> expected: exactly three rows, one per mode.
--
-- (ii) A call, its desk, and the post it became:
--
--   select c.symbol, c.mode, c.message_id, m.seq, m.kind, left(m.body, 40)
--     from community_calls c left join messages m on m.id = c.message_id
--    order by c.published_at desc limit 5;
--   -> expected: kind 'text', a real seq, and a body that reads as a sentence.
--
-- (iii) The reverse pointer resolves, and is where it is supposed to be:
--
--   select id, seq, refs->>'community_call_id' from messages
--    where refs ? 'community_call_id' order by seq desc limit 5;
--
-- (iv) Calls that never reached a room — the degraded state this schema can
--      hold on purpose. Should normally be empty:
--
--   select id, symbol, mode, published_at from community_calls
--    where message_id is null and status <> 'withdrawn';
