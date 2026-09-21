-- =====================================================================
-- 0051 — A member is somewhere right now (presence for the Live Rooms strip)
-- =====================================================================
-- Written, NOT applied — the owner applies it. Safe to run more than once.
--
-- The V2 Community top rail says "146 online" under each room and "10,842
-- members online" in the header. Nothing in this database could answer that:
-- room_members is who JOINED, not who is HERE. A number on that rail computed
-- from joins would be a fake count, and "no fake data anywhere" is a standing
-- rule.
--
-- ONE ROW PER PERSON, NOT PER ROOM. A phone is on one screen at a time, so the
-- honest model is "where is this member right now": the app sends a heartbeat
-- (POST /api/v1/community/presence) every ~60s while Community is open, naming
-- the room on screen or none for the feed. "Online in War Room" = rows whose
-- room is War Room and whose last_seen_at is inside the window (5 minutes, set
-- in the API, lib/social/presence.ts). Leaving a room is simply the next
-- heartbeat naming somewhere else; closing the app is the row going stale.
-- Nothing is ever deleted by a timer and nothing needs a cron.
--
-- RLS ON, ZERO POLICIES, service role only. Who is online where is exactly the
-- kind of row that pages into surveillance if a client can read it; the API
-- hands out COUNTS and a few avatars of people who POSTED recently, never a
-- list of who is watching.
-- =====================================================================

create table if not exists community_presence (
  user_id      uuid primary key references profiles on delete cascade,
  -- Null = on the feed / Community home rather than inside a room. A room that
  -- is deleted leaves its viewers "on the feed", not pointing at nothing.
  room_id      uuid references rooms on delete set null,
  last_seen_at timestamptz not null default now()
);

create index if not exists community_presence_recent_idx
  on community_presence (last_seen_at desc);
create index if not exists community_presence_room_idx
  on community_presence (room_id, last_seen_at desc) where room_id is not null;

comment on table community_presence is
  'Where each member was last seen in Community, refreshed by a heartbeat. '
  'Online = last_seen_at within the API''s window. Service-role only; only '
  'counts leave the API.';

alter table community_presence enable row level security;
revoke all on community_presence from anon, authenticated;
grant select, insert, update, delete on community_presence to service_role;

-- Counting, done in the database so the API does not page every heartbeat
-- row into a function to add them up. Service role only.
create or replace function community_online_counts(p_since timestamptz)
returns table (room_id uuid, online bigint)
language sql
stable
security definer
set search_path = public
as $$
  select p.room_id, count(*)::bigint
    from community_presence p
   where p.last_seen_at >= p_since
   group by p.room_id;
$$;
revoke all on function community_online_counts(timestamptz) from public, anon, authenticated;
grant execute on function community_online_counts(timestamptz) to service_role;

do $$
declare v_count int; v_bad text;
begin
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and c.relname = 'community_presence' and c.relrowsecurity) then
    raise exception '0051: community_presence is missing or RLS is off.';
  end if;
  select count(*) into v_count from pg_policies
   where schemaname = 'public' and tablename = 'community_presence';
  if v_count > 0 then
    raise exception '0051: % policy(ies) on community_presence. It is service-role only.', v_count;
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
    raise exception '0051: unexpected client write grant on %.', v_bad;
  end if;
end $$;
