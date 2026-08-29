-- 0023 — LIVE-2: the show, its segments, its frames, and who may watch.
--
-- Spec 15 §L3/§L4. The contract these tables store is `packages/shared/live.ts`.
--
-- WHAT A SHOW IS, IN THE DATABASE. A show is an ordered list of frames. The
-- worker broadcasts each frame on Supabase Realtime AND writes it here; the
-- broadcast is the fast path and this table is the truth. Everything about the
-- shape below follows from that one sentence:
--
--   * `live_frames.seq` is unique per show and gap-free, because a late joiner
--     asks for "everything after 41" and has to get exactly that. A gap is a
--     level that silently never got drawn, which on a chart is indistinguishable
--     from a level that does not exist.
--   * frames carry their annotations inline in `payload`, so a replay six hours
--     later renders what the show actually showed rather than what the row looks
--     like now.
--   * `cost_usd` sits on the SEGMENT, not the show, because the budget cap is
--     enforced one segment ahead: the director has to answer "can I afford the
--     next one" before it makes it.
--
-- MODE IS THE PAYWALL. `review` (after hours, YouTube, marketing) is free to any
-- signed-in user. `market` (in session) is premium — that is the business (spec
-- 15 §1, L28). The gate is on the SHOW because it is one question asked once,
-- rather than the same question asked again on every one of a few thousand
-- frames.
--
-- WHERE THE GATE IS ENFORCED — BOTH PLACES, DELIBERATELY.
--   * RLS (here) is the floor. A client with an anon key and a user JWT reading
--     `live_frames` directly gets review-mode rows and nothing else. This is
--     what makes the paywall a property of the data rather than of a route.
--   * `apps/api/src/app/api/v1/live/**` checks `loadEntitlements()` as well, and
--     answers ENTITLEMENT_REQUIRED with the price and the upgrade link (02 §11).
--     RLS can only return an empty set; it cannot say "this costs $99 a month",
--     and an empty set shown to a free user reads as "the show is broken".
-- Neither is redundant: RLS is the thing that holds if a route is ever wrong.
--
-- WRITES ARE SERVICE-ROLE ONLY, everywhere, with one exception: a premium user
-- may INSERT their own `live_requests` row — and even that goes through the API
-- in practice (rate limited), with the policy as the backstop.
--
-- Every function below carries its own revoke and the schema-wide function grant
-- floor is re-applied at the bottom (SCHEMA-NOTES gap 2.7).

-- =====================================================================
-- 1. live_shows
-- =====================================================================
create table live_shows (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('review', 'market')),
  status text not null default 'preparing' check (status in ('preparing', 'live', 'ended')),
  title text,
  started_at timestamptz,
  ended_at timestamptz,
  -- Operator state lives here rather than in a second table: buffer depth,
  -- spend, last error, heartbeat. It is written every few seconds by one
  -- process and read by one endpoint, so a jsonb column is the honest shape —
  -- a `live_health` table would be a table with one row per show and no
  -- history anybody wants.
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index live_shows_mode_status_idx on live_shows (mode, status, started_at desc);

-- At most one show actually on air at a time, per mode. The director is a
-- single process; two `live` shows in one mode means two directors, and the
-- audience would receive interleaved frames from both.
create unique index live_shows_one_live_per_mode_idx
  on live_shows (mode) where status = 'live';

-- =====================================================================
-- 2. live_segments
-- =====================================================================
-- One symbol, one story. `source` records WHY the router chose it, so a rundown
-- can be argued with after the fact.
create table live_segments (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references live_shows on delete cascade,
  seq int not null,
  symbol text not null,
  source text not null check (source in ('setup', 'request', 'winner', 'watchlist')),
  state text not null default 'prepared' check (state in ('prepared', 'playing', 'done')),
  prepared_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  -- Measured, not estimated: token counts x published prices, plus TTS
  -- characters. Null means "not measured", never "free".
  cost_usd numeric,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (show_id, seq)
);

create index live_segments_show_idx on live_segments (show_id, seq);

-- A symbol is presented at most once per show. The router's no-repeat rule is
-- a product rule ("we already did NVDA") and product rules that matter belong
-- in the store, not only in the process that happens to be running.
create unique index live_segments_symbol_once_per_show_idx on live_segments (show_id, symbol);

-- =====================================================================
-- 3. live_frames
-- =====================================================================
-- `payload` is the whole frame as `packages/shared/live.ts` defines it, stored
-- verbatim. NOT normalised into columns per kind: the four kinds have almost no
-- fields in common, the client parses the union anyway, and a schema change to
-- add an overlay kind would otherwise mean a migration for something that is
-- pure presentation.
--
-- The columns that ARE broken out are exactly the ones queried: show, segment,
-- seq, kind, offset.
create table live_frames (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references live_shows on delete cascade,
  segment_id uuid references live_segments on delete cascade,
  seq int not null,
  kind text not null check (kind in ('say', 'chart', 'present', 'overlay')),
  payload jsonb not null,
  t_offset_ms int not null default 0,
  created_at timestamptz not null default now(),
  -- THE IDEMPOTENCY KEY. A frame that arrives twice — broadcast and table, a
  -- retried write, a resumed director — is the same frame.
  unique (show_id, seq)
);

create index live_frames_show_seq_idx on live_frames (show_id, seq);
create index live_frames_segment_idx on live_frames (segment_id, seq);

-- =====================================================================
-- 4. live_requests
-- =====================================================================
-- "Kai, pull up NVDA." Premium only (spec 15 §L8); the API rate limits it, and
-- the source router drains it at priority 2.
create table live_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  show_id uuid references live_shows on delete set null,
  symbol text not null,
  note text,
  status text not null default 'queued' check (status in ('queued', 'presented', 'skipped')),
  presented_segment_id uuid references live_segments on delete set null,
  created_at timestamptz not null default now()
);

create index live_requests_queue_idx on live_requests (status, created_at);
create index live_requests_user_idx on live_requests (user_id, created_at desc);

-- =====================================================================
-- 5. Entitlement predicate
-- =====================================================================
-- One place that answers "may the caller watch a `market` show". Used by three
-- policies; a copy-pasted subquery in three places is three places to get the
-- trialing/active distinction wrong.
--
-- SECURITY DEFINER because `subscriptions` is itself RLS'd to the owner: a
-- policy body running as the caller can read the caller's own row, but making
-- that dependency implicit across three tables is how a policy quietly starts
-- returning false for everyone. STABLE, so the planner calls it once per query.
create or replace function live_can_watch_market()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from subscriptions s
    where s.user_id = auth.uid()
      and s.tier = 'premium'
      and s.status in ('active', 'trialing')
  );
$$;

revoke all on function live_can_watch_market() from public, anon, authenticated;
-- Granted back at the bottom, after the schema-wide floor: the POLICIES call it
-- as the invoking user, so `authenticated` genuinely needs EXECUTE on it.

-- =====================================================================
-- 6. RLS
-- =====================================================================
-- READ: any authenticated user for `review`; premium only for `market`.
-- WRITE: service_role only, everywhere, except a user's own `live_requests`.
-- anon gets nothing at all — the YouTube audience watches a video, not the API.

revoke all on live_shows, live_segments, live_frames, live_requests from anon, authenticated;

alter table live_shows enable row level security;
alter table live_segments enable row level security;
alter table live_frames enable row level security;
alter table live_requests enable row level security;

grant select on live_shows to authenticated;
create policy live_shows_watchable_select on live_shows
  for select to authenticated
  using (mode = 'review' or live_can_watch_market());

grant select on live_segments to authenticated;
create policy live_segments_watchable_select on live_segments
  for select to authenticated
  using (exists (
    select 1 from live_shows sh
    where sh.id = live_segments.show_id
      and (sh.mode = 'review' or live_can_watch_market())
  ));

grant select on live_frames to authenticated;
create policy live_frames_watchable_select on live_frames
  for select to authenticated
  using (exists (
    select 1 from live_shows sh
    where sh.id = live_frames.show_id
      and (sh.mode = 'review' or live_can_watch_market())
  ));

-- A user sees their own requests and nobody else's — a request is a small
-- public act on the show, but the list of who asked for what is not.
grant select on live_requests to authenticated;
create policy live_requests_owner_select on live_requests
  for select to authenticated
  using (user_id = auth.uid());

-- INSERT: premium only, own row only, and only ever `queued`. The API is the
-- real door (it rate limits and answers ENTITLEMENT_REQUIRED with a price);
-- this policy is what holds if the route is ever wrong.
grant insert on live_requests to authenticated;
create policy live_requests_premium_insert on live_requests
  for insert to authenticated
  with check (user_id = auth.uid() and status = 'queued' and live_can_watch_market());

-- No UPDATE and no DELETE grants for a client anywhere in this migration.
-- Marking a request `presented` is the director's decision, not the asker's.
revoke update, delete on live_shows, live_segments, live_frames, live_requests
  from anon, authenticated;

grant select, insert, update, delete on live_shows, live_segments, live_frames, live_requests to service_role;

-- =====================================================================
-- 7. Storage: the `live-audio` bucket
-- =====================================================================
-- Kai's voice, one object per (text, voice, model) hash — which is what makes a
-- re-run of the same show cost nothing at the TTS.
--
-- PUBLIC READ. The audio is a broadcast: the same file is played to everyone in
-- the app and streamed to YouTube by a headless browser that has no session. A
-- signed URL per listener per line would be a per-viewer secret protecting
-- something that is, by definition, being said out loud. The paywall is on the
-- FRAMES — without the timeline, a URL to a wav of a sentence is not a show.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'live-audio', 'live-audio', true, 20971520,
  array['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/aac', 'audio/opus', 'audio/webm']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Writes are the worker's alone. `storage.objects` already has RLS enabled by
-- the storage extension, so these are additive policies on it, scoped by bucket
-- so nothing here can touch another bucket's objects.
drop policy if exists live_audio_public_read on storage.objects;
create policy live_audio_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'live-audio');

drop policy if exists live_audio_service_write on storage.objects;
create policy live_audio_service_write on storage.objects
  for all to service_role
  using (bucket_id = 'live-audio')
  with check (bucket_id = 'live-audio');

-- =====================================================================
-- 8. Realtime
-- =====================================================================
-- The worker uses Realtime BROADCAST (`live:<show_id>`), not postgres_changes:
-- a broadcast is one message to N listeners, while table replication would put
-- every frame of every show through every subscriber's filter. The table is
-- added to the publication anyway so a client that prefers to tail the truth
-- can, and so LIVE-3 has the option without another migration.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table live_frames;
  end if;
exception when duplicate_object then
  null;
end;
$$;

-- =====================================================================
-- 9. FUNCTION GRANT FLOOR (SCHEMA-NOTES gap 2.7)
-- =====================================================================
-- Postgres hands EXECUTE on every new function to PUBLIC. Re-apply the floor
-- across the schema, then grant back the four functions that genuinely need to
-- be callable — the three from 0021 plus this migration's policy predicate,
-- which RLS evaluates as the invoking user and which therefore cannot work
-- without EXECUTE for `authenticated`.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end;
$$;

grant execute on function is_room_member(uuid) to authenticated;
grant execute on function join_core_room(uuid, uuid) to authenticated;
grant execute on function set_room_mute(uuid, uuid, timestamptz) to authenticated;
grant execute on function live_can_watch_market() to authenticated, service_role;
