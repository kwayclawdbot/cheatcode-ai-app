-- =====================================================================
-- 0050 — A post can be liked, reposted and saved, and there is a feed to
--        post it in.
-- =====================================================================
-- Written, NOT applied — the owner applies it. Safe to run more than once.
--
-- WHAT THIS CHANGES, IN ONE PARAGRAPH
-- The V2 Community (docs/COMMUNITY-FEED-2026-09-21.md) puts a social feed next
-- to the rooms. A feed post is NOT a new kind of object: it is a `messages` row,
-- because a message already has everything a post needs — an author, a body,
-- pictures (media_assets, 0033), one-level threads with a live reply_count
-- (0033), reactions with denormalised counts (0033/0035), a quote (0035), an
-- embedded member call through refs->>community_call_id (0040), moderation
-- (0031), and account-deletion handling (0032). A parallel posts table would
-- have to re-grow every one of those and every rule attached to them.
--
-- So this file adds only what a message did not have:
--   1. A place for posts that belong to no chat: one core room, slug `feed`,
--      kept out of the rooms directory by config.directory = false.
--   2. `like` as a reaction kind (a like IS a reaction; the count rides on the
--      existing messages.reaction_counts).
--   3. Reposts: one row per person per post, with a denormalised
--      messages.repost_count kept by trigger, exactly as reply_count is.
--   4. Bookmarks: one row per person per post. PRIVATE — nobody else can ever
--      learn what you saved, so there is no count column anywhere.
--
-- RLS POSTURE: post_reposts and post_bookmarks are RLS ON, ZERO policies,
-- service role only — the same reading of 0033 §8 that 0038 made for follows.
-- A social write needs rate limiting, ban checks and a visibility check that a
-- PostgREST insert cannot do, and a bookmark row is private by definition.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. THE FEED ROOM
-- ---------------------------------------------------------------------
-- A core room so that every existing piece of room machinery applies to it
-- unchanged: join_core_room, post_room_message (membership, ban, mute,
-- posting_restricted, slow mode), the moderation routes, the removal cascade.
-- It is not a chat, so `directory: false` keeps GET /rooms from listing it and
-- `surface: feed` is what the feed code looks it up by (never the name).
insert into rooms (type, mode, slug, name, description, config)
values ('core', null, 'feed', 'Community Feed',
        'Posts, charts, calls and results from members.',
        '{"surface": "feed", "directory": false, "intel_eligible": false}')
on conflict (slug) do update
  set config = rooms.config || '{"surface": "feed", "directory": false}'::jsonb;

-- The feed reads top-level posts newest-first across a handful of rooms. The
-- existing (room_id, created_at desc) index serves one room; this one serves
-- "top-level, still standing" across all of them.
create index if not exists messages_feed_toplevel_idx
  on messages (created_at desc, id desc)
  where parent_id is null and deleted_at is null;

-- ---------------------------------------------------------------------
-- 2. LIKE IS A REACTION KIND
-- ---------------------------------------------------------------------
alter table message_reactions drop constraint if exists message_reactions_kind_check;
alter table message_reactions
  add constraint message_reactions_kind_check
  check (kind in ('agree', 'disagree', 'fire', 'hundred', 'chart_up', 'chart_down',
                  'watching', 'useful', 'like'));

comment on constraint message_reactions_kind_check on message_reactions is
  'Six picker kinds (0035), two retired kinds kept valid (0033), and `like` '
  '(0050) — the feed''s heart. like_count on a post is reaction_counts->>like.';

-- ---------------------------------------------------------------------
-- 3. REPOSTS
-- ---------------------------------------------------------------------
-- The primary key IS the idempotency rule: reposting twice is one row, and
-- undoing is a delete. Both sides cascade: a hard-deleted message or profile
-- takes its reposts with it. A SOFT-deleted post has its reposts removed by
-- the API in the same request (the rows would point at a gap).
create table if not exists post_reposts (
  message_id uuid not null references messages on delete cascade,
  user_id    uuid not null references profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index if not exists post_reposts_user_idx on post_reposts (user_id, created_at desc);

comment on table post_reposts is
  'Who reposted which feed post. Service-role only. The Following tab shows '
  'posts your followees reposted; the count lives on messages.repost_count.';

alter table messages add column if not exists repost_count int not null default 0;
comment on column messages.repost_count is
  'Live count of post_reposts rows. Maintained by trigger (0050), the same '
  'technique as reply_count (0033).';

create or replace function post_reposts_count_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message uuid;
begin
  v_message := coalesce(new.message_id, old.message_id);
  update messages m
     set repost_count = (select count(*) from post_reposts r where r.message_id = v_message)
   where m.id = v_message;
  return coalesce(new, old);
end;
$$;
revoke all on function post_reposts_count_sync() from public, anon, authenticated;

drop trigger if exists post_reposts_count_t on post_reposts;
create trigger post_reposts_count_t
  after insert or delete on post_reposts
  for each row execute function post_reposts_count_sync();

-- A repost of a reply is refused in the table, not only in the route: the feed
-- is made of posts, and a reply reposted into it would arrive without the post
-- it answers.
create or replace function post_reposts_toplevel_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from messages where id = new.message_id and parent_id is not null) then
    raise exception 'repost_not_top_level' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function post_reposts_toplevel_guard() from public, anon, authenticated;

drop trigger if exists post_reposts_toplevel_t on post_reposts;
create trigger post_reposts_toplevel_t
  before insert on post_reposts
  for each row execute function post_reposts_toplevel_guard();

-- ---------------------------------------------------------------------
-- 4. BOOKMARKS
-- ---------------------------------------------------------------------
create table if not exists post_bookmarks (
  user_id    uuid not null references profiles on delete cascade,
  message_id uuid not null references messages on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, message_id)
);
create index if not exists post_bookmarks_list_idx on post_bookmarks (user_id, created_at desc);

comment on table post_bookmarks is
  'What a member saved. PRIVATE: read only by the API, only for the owner, and '
  'never counted on the post. Service-role only.';

-- ---------------------------------------------------------------------
-- 5. RLS AND GRANTS
-- ---------------------------------------------------------------------
alter table post_reposts   enable row level security;
alter table post_bookmarks enable row level security;

revoke all on post_reposts   from anon, authenticated;
revoke all on post_bookmarks from anon, authenticated;

grant select, insert, delete on post_reposts   to service_role;
grant select, insert, delete on post_bookmarks to service_role;

-- ---------------------------------------------------------------------
-- 5b. ONE PAGE OF THE FEED
-- ---------------------------------------------------------------------
-- The whole visibility rule and all four tabs in one place, returning ids in
-- order; the API hydrates them with the same batched helpers a room uses.
--
-- WHAT IS IN THE FEED: top-level, standing, member-authored messages that are
--   (a) in the feed room, or
--   (b) in any core room AND carry a member call (refs->>community_call_id),
--       so a call published from a desk (POST /community/calls, 0040) is on
--       the Trade Calls tab without being posted twice,
-- minus anything in a room where the viewer is banned.
--
-- TABS
--   for_you     score in HOURS, time-invariant so a cursor stays valid:
--                 created_at (epoch hours)
--               + min(2 * log2(1 + likes + 2*replies + 3*reposts), 12)
--               + 6 if the viewer follows the author
--               + belt: white 0, blue 1, purple 2, brown 3, black 4
--               A very engaged post can climb at most 12 hours; a followed
--               black belt at most 10. Nothing else moves a post.
--   following   posts BY people the viewer follows, plus posts they REPOSTED
--               (reposted_by says who); ordered by that activity's time.
--   trade_calls posts carrying a member call, newest first.
--   media       posts with a picture or a chart attachment, newest first.
--
-- CURSOR: (score, id) strictly below the last row of the previous page.
-- Scores are rounded to 6 decimals and returned as TEXT so the pair round-trips
-- exactly (an epoch in seconds with 6 decimals is 16 digits, past what a
-- JavaScript number holds).
drop function if exists community_feed_page(uuid, text, int, numeric, uuid);
create or replace function community_feed_page(
  p_viewer       uuid,
  p_tab          text,
  p_limit        int,
  p_cursor_score numeric default null,
  p_cursor_id    uuid    default null
) returns table (message_id uuid, score text, activity_at timestamptz, reposted_by uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_feed uuid;
begin
  if p_tab not in ('for_you', 'following', 'trade_calls', 'media') then
    raise exception 'unknown_feed_tab' using errcode = '22023';
  end if;
  select id into v_feed from rooms
   where type = 'core' and config->>'surface' = 'feed' limit 1;

  return query
  with visible as (
    select m.*
      from messages m
      join rooms r on r.id = m.room_id
     where m.parent_id is null
       and m.deleted_at is null
       and m.user_id is not null
       and (m.room_id = v_feed
            or (r.type = 'core' and m.refs ? 'community_call_id'))
       and not exists (select 1 from room_members b
                        where b.room_id = m.room_id and b.user_id = p_viewer
                          and coalesce(b.banned, false))
  ),
  followees as (
    select f.followee_id from follows f where f.follower_id = p_viewer
  ),
  scored as (
    select v.id as mid,
           case p_tab
             when 'for_you' then round((
                 extract(epoch from v.created_at) / 3600.0
               + least(2 * ln(1 + coalesce((v.reaction_counts->>'like')::int, 0)
                                 + 2 * v.reply_count + 3 * v.repost_count) / ln(2), 12)
               + case when v.user_id in (select followee_id from followees) then 6 else 0 end
               + case coalesce(up.belt, 'white')
                   when 'black' then 4 when 'brown' then 3 when 'purple' then 2
                   when 'blue' then 1 else 0 end
               )::numeric, 6)
             else round(extract(epoch from v.created_at)::numeric, 6)
           end as sc,
           v.created_at as at,
           null::uuid as via
      from visible v
      left join user_points up on up.user_id = v.user_id
     where p_tab = 'for_you'
        or (p_tab = 'following' and v.user_id in (select followee_id from followees))
        or (p_tab = 'trade_calls' and v.refs ? 'community_call_id')
        or (p_tab = 'media' and (v.attachment_count > 0 or jsonb_array_length(coalesce(v.refs->'charts', '[]'::jsonb)) > 0))
    union all
    select v.id, round(extract(epoch from rp.created_at)::numeric, 6), rp.created_at, rp.user_id
      from post_reposts rp
      join visible v on v.id = rp.message_id
     where p_tab = 'following'
       and rp.user_id in (select followee_id from followees)
  ),
  one_each as (
    select distinct on (s.mid) s.mid, s.sc, s.at, s.via
      from scored s
     order by s.mid, s.sc desc
  )
  select o.mid, o.sc::text, o.at, o.via
    from one_each o
   where p_cursor_score is null
      or (o.sc, o.mid) < (p_cursor_score, p_cursor_id)
   order by o.sc desc, o.mid desc
   limit greatest(1, least(coalesce(p_limit, 20), 51));
end;
$$;
revoke all on function community_feed_page(uuid, text, int, numeric, uuid) from public, anon, authenticated;
grant execute on function community_feed_page(uuid, text, int, numeric, uuid) to service_role;

-- ---------------------------------------------------------------------
-- 6. WHAT "GOOD" LOOKS LIKE, ASSERTED
-- ---------------------------------------------------------------------

-- (a) RLS on, zero policies, on both new tables.
do $$
declare v_bad text; v_count int;
begin
  select string_agg(c.relname, ', ') into v_bad
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname in ('post_reposts', 'post_bookmarks')
     and c.relrowsecurity = false;
  if v_bad is not null then
    raise exception '0050: RLS is OFF on %.', v_bad;
  end if;
  select count(*) into v_count from pg_policies
   where schemaname = 'public' and tablename in ('post_reposts', 'post_bookmarks');
  if v_count > 0 then
    raise exception '0050: % policy(ies) exist on post_reposts/post_bookmarks. Both are service-role only.', v_count;
  end if;
end $$;

-- (b) No client write grant outside the allowlist (0033 §10, verbatim, NOT
--     extended).
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
    raise exception '0050: unexpected client write grant on %.', v_bad;
  end if;
end $$;

-- (c) POSITION SIZE IS STILL UNSTORABLE. 0038 §7(c) guards trade_shares; a feed
--     is the new place somebody would be tempted to put "I bought 500 shares",
--     so the same list is asserted absent from every table a post touches.
do $$
declare v_bad text;
begin
  select string_agg(format('%s.%s', table_name, column_name), ', ')
    into v_bad
    from information_schema.columns
   where table_schema = 'public'
     and table_name in ('trade_shares', 'messages', 'community_calls', 'post_reposts', 'post_bookmarks')
     and column_name in (
       'qty', 'quantity', 'shares', 'size', 'notional', 'avg_cost',
       'realized_pnl', 'unrealized_pnl', 'risk_dollars', 'max_loss_usd', 'pnl'
     );
  if v_bad is not null then
    raise exception '0050: size column(s) % exist. Dollar size and quantity are never shared; the rule is enforced by these columns not existing.', v_bad;
  end if;
end $$;

-- (d) Exactly one feed room, and it is out of the directory.
do $$
declare v_n int;
begin
  select count(*) into v_n from rooms
   where type = 'core' and config->>'surface' = 'feed' and config->>'directory' = 'false';
  if v_n <> 1 then
    raise exception '0050: expected exactly one core room with surface=feed and directory=false, found %.', v_n;
  end if;
end $$;

-- (e) The kind check accepts like and still refuses nonsense.
do $$
declare v_def text; v_like boolean; v_junk boolean;
begin
  select pg_get_constraintdef(con.oid) into v_def
    from pg_constraint con join pg_class cl on cl.oid = con.conrelid
   where cl.relname = 'message_reactions' and con.conname = 'message_reactions_kind_check';
  execute format('select %s from (values (%L)) as t(kind)', substring(v_def from 7), 'like') into v_like;
  execute format('select %s from (values (%L)) as t(kind)', substring(v_def from 7), 'not_a_reaction') into v_junk;
  if v_like is not true or v_junk is not false then
    raise exception '0050: the reaction kind check is wrong: %', v_def;
  end if;
end $$;

-- (f) repost_count backfill (a no-op on a fresh table, correct on a re-run).
update messages m
   set repost_count = c.n
  from (select message_id, count(*) as n from post_reposts group by message_id) c
 where m.id = c.message_id and m.repost_count is distinct from c.n;
