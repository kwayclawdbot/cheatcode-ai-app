-- 0021_prototype_round4
-- Source: docs/BUILD-BRIEF-round-4.md "SCHEMA-4",
--         docs/10_ALERTS_TRADE_PORTAL_SPEC_extracted.md §3/§4/§6/§7/§9,
--         docs/01_DATA_MODEL.md §4/§8/§10/§11.
--
-- Round 4 makes four things real in the database:
--   1. an alert is a complete, versioned TRADE OBJECT (not a notification row),
--   2. the chart carries ANNOTATIONS Kai draws and the user can hide,
--   3. Community grows time-boxed CIRCLES (setup rooms with a clock),
--   4. Home's conversation drawer needs titles, pins and recency,
--   plus the Account screen's rule-adherence line.
--
-- =====================================================================
-- CONTRACT FOR THE API LANE (signatures, views, columns) — API-4 polls this
-- =====================================================================
--
-- FUNCTIONS (all SECURITY DEFINER, search_path pinned)
--
--   open_setup_circle(p_setup_id uuid, p_ttl interval default interval '3 days')
--     returns rooms
--     GRANT: service_role only
--     Opens (or returns) the time-boxed circle for a setup. IDEMPOTENT per
--     setup — a unique partial index on rooms(setup_id) makes that a database
--     guarantee, not a race. Name = '<SYM> <Pattern>' where the pattern is read
--     from setups.annotations->>'pattern', then catalyst, score_components,
--     entry_condition, falling back to '<SYM> Setup'. Sets type='setup',
--     mode = the setup's mode, expires_at = now() + p_ttl,
--     config = {"intel_eligible": false, "posting_restricted": false,
--               "origin": "setup_lifecycle"}, seeds room_seq_counters and
--     back-fills setups.discussion_room_id when it is still null.
--     A second call returns the existing row UNCHANGED — it never extends the
--     clock and never re-opens a closed circle (SCHEMA-NOTES 2.24).
--     Errors: 'setup_not_found' (42501)
--
--   create_circle(p_user_id uuid, p_symbol text, p_ttl interval default interval '3 days')
--     returns rooms
--     GRANT: service_role only. The `circles_create` entitlement is enforced in
--     the API; the database only creates.
--     Creator is inserted as room_members.role = 'moderator'. Name = '<SYM> Circle',
--     type='setup', mode = the creator's profiles.primary_mode,
--     expires_at = now() + p_ttl, config = {"intel_eligible": false,
--     "posting_restricted": false, "origin": "user", "created_by": <uuid>}.
--     Writes a user_events row ('community' / 'circle_created').
--     Errors: 'user_not_found' (42501) | 'symbol_required' (22023)
--           | 'symbol_unknown' (22023) | 'ttl_invalid' (22023)
--
--   close_expired_circles() returns setof uuid
--     GRANT: service_role only. The API tick calls it.
--     Marks every setup room whose expires_at has passed with
--     config.posting_restricted = true (post_room_message already refuses a
--     restricted room for non-moderators, 0018) and RETURNS THE CLOSED IDS —
--     only the rows this call actually flipped, so the caller can narrate them
--     once. Deletes nothing: History keeps the thread readable.
--
--   Internal trigger functions — EXECUTE granted to NOBODY (the grant floor at
--   the bottom revokes them; triggers fire regardless of EXECUTE privilege):
--     alert_events_assign_seq()            per-alert monotonic seq
--     chart_annotations_client_update_guard()  status-only client updates
--     conversations_touch_last_message()   maintains conversations.last_message_at
--
-- VIEW
--
--   rule_adherence_v(user_id uuid, sessions int, followed int)
--     security_invoker; GRANT select to authenticated, service_role (anon revoked).
--     One row per user that has at least one debrief. sessions = debriefs;
--     followed = debriefs whose process_review receipt is non-empty and every
--     item is ok. A user with no debriefs has NO ROW (read it as 0/0).
--
-- NEW TABLES
--
--   chart_annotations  — client SELECT own rows; client UPDATE only the
--                        `status` column, only to 'hidden'/'deleted'; INSERT and
--                        every other write is service_role.
--   alert_events       — append-only per-alert history (state transitions,
--                        grade versions); owner SELECT, service_role INSERT.
--
-- NEW COLUMNS
--
--   rooms.expires_at timestamptz                       (null = no clock)
--   conversations.pinned boolean not null default false
--   conversations.last_message_at timestamptz          (trigger-maintained)
--   alerts.symbol text -> instruments(symbol)
--   alerts.mode app_mode
--   alerts.direction text  (long|short|call|put|accumulate|reduce|rebalance)
--   alerts.instrument_kind instrument_kind default 'equity'
--   alerts.setup_id / alerts.plan_id / alerts.position_id
--   alerts.lifecycle_state text                        (spec §9 state machine)
--   alerts.tab text GENERATED                          (active|watching|history)
--   alerts.grade_snapshot jsonb / alerts.score_snapshot jsonb / alerts.version int
--   alerts.event jsonb / alerts.trade_plan jsonb / alerts.thesis_snapshot jsonb
--   alerts.chart_context jsonb                         (spec §6 route context)
--   alerts.state_changed_at / alerts.last_evaluated_at timestamptz
--
-- INSTRUMENT PROFILES: no new columns. instruments.meta gains a documented
-- `profile` object (see section 1).
--
-- Every function below carries its own revoke, and the whole schema's function
-- grant floor is re-applied at the bottom (SCHEMA-NOTES gap 2.7).

-- =====================================================================
-- 1. instruments.meta — the company profile shape
-- =====================================================================
-- The ticker page's Overview card (brief §4) and the alert card's two-sentence
-- company summary (spec §3) need name, description, sector, market cap, next
-- earnings and P/E. Kept in the EXISTING `meta` jsonb rather than six new
-- columns: the payload is a cache of a third-party reference endpoint
-- (Polygon /v3/reference/tickers/{sym}), it is refreshed wholesale on a weekly
-- cadence, none of it is ever a filter or a join key, and Polygon adds fields
-- faster than a migration can. See SCHEMA-NOTES 1.43.
--
--   instruments.meta = {
--     "profile": {
--       "description":   text,   -- <= 2 sentences; what the company does + why it matters now
--       "sector":        text,
--       "industry":      text|null,
--       "market_cap":    number|null,        -- USD, approximate
--       "next_earnings": "YYYY-MM-DD"|null,
--       "pe":            number|null,
--       "employees":     number|null,
--       "homepage":      text|null,
--       "source":        "seed"|"polygon",   -- provenance, always present
--       "as_of":         "YYYY-MM-DDTHH:MM:SSZ"
--     }
--   }
--
-- `instruments.name` stays the canonical display name (it is a column already);
-- meta.profile.description never repeats it.
comment on column instruments.meta is
  'jsonb cache. meta.profile = {description, sector, industry, market_cap, next_earnings, pe, employees, homepage, source, as_of}. See migration 0021 section 1 and docs/SCHEMA-NOTES.md 1.43.';

-- =====================================================================
-- 2. rooms.expires_at — circles are rooms with a clock
-- =====================================================================
alter table rooms add column if not exists expires_at timestamptz;

-- the circles row on Community sorts by "time left"
create index if not exists rooms_expires_idx on rooms (type, expires_at)
  where expires_at is not null;

-- ONE circle per setup: this is what makes open_setup_circle idempotent under
-- concurrency rather than only when the caller is polite.
create unique index if not exists rooms_setup_unique_idx on rooms (setup_id)
  where setup_id is not null;

-- Circles are DISCOVERABLE: the Community board shows "META · 2d left · 28
-- members" before anyone joins, so a time-boxed setup room has to be selectable
-- by any authenticated user. Membership still gates the THREAD (the messages
-- policy is untouched). Setup rooms with no clock stay member-only, which keeps
-- the round-2 behaviour for anything that is not a circle. Supersedes the
-- narrower policy in 0014 (SCHEMA-NOTES 1.10 / 1.44).
drop policy if exists rooms_member_or_core_select on rooms;
create policy rooms_member_or_core_select on rooms
  for select to authenticated
  using (
    type = 'core'
    or (type = 'setup' and expires_at is not null)
    or is_room_member(id)
  );

-- =====================================================================
-- 3. chart_annotations — what Kai drew, and what the user hid
-- =====================================================================
-- Spec §9: "Chart annotation: geometry, semantic type, provenance, reason,
-- lifecycle and user visibility."
--
-- OWNERSHIP DECISION (brief asks for it explicitly): `user_id` is the OWNER of
-- the annotation, NOT its author. A Kai-drawn level on A's chart is
-- (user_id = A, provenance = 'kai'). The round-4 brief's parenthetical
-- "(Kai = null)" would have made every Kai annotation globally visible or
-- globally invisible, and neither is right: annotations are drawn INTO one
-- user's workspace from that user's alert/plan context, the user may hide or
-- delete them, and a nullable owner cannot express "hidden by A but not by B"
-- without a second table. Authorship is `provenance`; scoping is `user_id`.
-- See SCHEMA-NOTES 1.45.
create table chart_annotations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  symbol text not null references instruments(symbol),
  timeframe text not null default '5m',
  kind text not null check (kind in (
    'trigger','entry','stop','invalidation','target','support','resistance','note')),
  price numeric,
  price2 numeric,                                   -- zones / ranges (support band, entry area)
  ts_from timestamptz,
  ts_to timestamptz,
  text text,                                        -- the chip label the user reads
  reason text,                                      -- why it is on the chart (spec §9)
  provenance text not null default 'kai'
    check (provenance in ('kai','user','community','plan')),
  status text not null default 'valid'
    check (status in ('valid','invalidated','hidden','deleted')),
  source_alert_id uuid references alerts on delete set null,
  source_setup_id uuid references setups on delete set null,
  source_plan_id uuid references trade_plans on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index chart_annotations_user_symbol_idx
  on chart_annotations (user_id, symbol, status);
create index chart_annotations_alert_idx
  on chart_annotations (source_alert_id) where source_alert_id is not null;
create index chart_annotations_plan_idx
  on chart_annotations (source_plan_id) where source_plan_id is not null;

-- the 0013 DO-loop already ran; new tables attach their own updated_at trigger
create trigger set_updated_at before update on public.chart_annotations
  for each row execute function public.set_updated_at();

-- Column-level UPDATE (status only) already stops a client rewriting a price or
-- re-pointing an annotation at someone else's alert. This trigger is the second
-- lock: it refuses ANY client update that changes anything but `status`, and any
-- status that is not 'hidden' or 'deleted' (a client may not resurrect an
-- invalidated level or mark one 'valid'). `current_user` is the role PostgREST
-- SET ROLEs into, so service_role and the migration owner pass through.
create or replace function chart_annotations_client_update_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated','anon') then
    if new.status not in ('hidden','deleted') then
      raise exception 'annotation_status_not_allowed'
        using errcode = '22023',
              hint = 'A client may only set status to hidden or deleted.';
    end if;
    if (to_jsonb(new) - 'status' - 'updated_at')
       is distinct from (to_jsonb(old) - 'status' - 'updated_at') then
      raise exception 'annotation_client_update_status_only'
        using errcode = '42501',
              hint = 'Only chart_annotations.status is client-writable.';
    end if;
  end if;
  return new;
end;
$$;
create trigger chart_annotations_client_update_guard
  before update on chart_annotations
  for each row execute function chart_annotations_client_update_guard();

revoke all on chart_annotations from anon, authenticated;
alter table chart_annotations enable row level security;

-- SELECT: own rows only — which, per the ownership decision above, is exactly
-- "mine plus the Kai rows drawn for me".
grant select on chart_annotations to authenticated;
create policy chart_annotations_owner_select on chart_annotations
  for select to authenticated using (user_id = auth.uid());

-- UPDATE: the `status` column, nothing else, and only to hidden/deleted.
grant update (status) on chart_annotations to authenticated;
create policy chart_annotations_owner_status_update on chart_annotations
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and status in ('hidden','deleted'));

-- INSERT / DELETE: service_role only. Kai draws through the API (which records
-- the reason and provenance); a delete is the 'deleted' status, so history and
-- the "Kai marked this" audit survive.

-- =====================================================================
-- 4. alerts — the complete trade object (spec §3, §4, §6, §9)
-- =====================================================================
-- 0008's `alerts` is a monitoring row: condition + data_dependency + channels.
-- The card contract needs identity, the plan, the graded evidence and the state
-- machine. These are the minimum columns that let an Active/Watching/History
-- card render WITHOUT a join to a setup that may not exist (a Watching card is
-- "a complete trade idea" even before a setup is graded). See SCHEMA-NOTES 1.47.
alter table alerts
  add column if not exists symbol text references instruments(symbol),
  add column if not exists mode app_mode,
  add column if not exists direction text
    check (direction is null or direction in
      ('long','short','call','put','accumulate','reduce','rebalance')),
  add column if not exists instrument_kind instrument_kind not null default 'equity',
  add column if not exists setup_id uuid references setups,
  add column if not exists plan_id uuid references trade_plans on delete set null,
  add column if not exists position_id uuid references positions on delete set null,
  add column if not exists grade_snapshot jsonb,
  add column if not exists score_snapshot jsonb,
  add column if not exists version int not null default 1,
  add column if not exists event jsonb,
  add column if not exists trade_plan jsonb,
  add column if not exists thesis_snapshot jsonb,
  add column if not exists chart_context jsonb,
  add column if not exists state_changed_at timestamptz,
  add column if not exists last_evaluated_at timestamptz;

-- The spec's lifecycle. It is deliberately NOT `alerts.status` (an enum:
-- draft/active/triggered/paused/expired/cancelled) — that column is the
-- MONITORING status the alert engine owns, and 03 Unit 2 forbids enum
-- migrations. `lifecycle_state` is the CARD state the user sees.
alter table alerts
  add column if not exists lifecycle_state text not null default 'watching'
    check (lifecycle_state in (
      'watching','active','planned','order_pending','position_active',
      'invalidated','closed','expired','dismissed','cancelled','missed'));

-- Active / Watching / History are the only permanent sections (spec §1), so the
-- mapping is a stored generated column rather than a view: PostgREST can filter
-- (?tab=eq.active) and index it, and no consumer can disagree about it.
alter table alerts
  add column if not exists tab text generated always as (
    case lifecycle_state
      when 'watching' then 'watching'
      when 'active' then 'active'
      when 'planned' then 'active'
      when 'order_pending' then 'active'
      when 'position_active' then 'active'
      else 'history'
    end
  ) stored;

create index if not exists alerts_user_tab_idx on alerts (user_id, tab, updated_at desc);
create index if not exists alerts_symbol_idx on alerts (symbol);
create index if not exists alerts_setup_idx on alerts (setup_id) where setup_id is not null;

-- ---------------------------------------------------------------------
-- alert_events — "History preserves the original alert snapshot plus outcome
-- and event timeline" (spec §1) and "a later grade change creates a new version
-- rather than rewriting history" (spec §9). Append-only, like setup_events.
-- ---------------------------------------------------------------------
create table alert_events (
  id bigserial primary key,
  alert_id uuid not null references alerts on delete cascade,
  seq int not null,
  type text not null,               -- created | graded | state_change | trigger | evaluated | note | outcome
  from_state text,
  to_state text,
  source text not null default 'kai'
    check (source in ('kai','user','market','system')),
  version int,                      -- the alerts.version this event belongs to
  payload jsonb not null default '{}',   -- grade/score snapshot, quote snapshot, evidence
  created_at timestamptz not null default now(),
  unique (alert_id, seq)
);
create index alert_events_alert_idx on alert_events (alert_id, seq);

-- Per-alert monotonic seq, assigned under a lock on the parent alert row so two
-- concurrent writers cannot claim the same number (same shape as
-- user_events_assign_seq / next_room_message_seq).
create or replace function alert_events_assign_seq() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.seq is null or new.seq = 0 then
    perform 1 from alerts a where a.id = new.alert_id for update;
    select coalesce(max(e.seq), 0) + 1 into new.seq
      from alert_events e where e.alert_id = new.alert_id;
  end if;
  return new;
end;
$$;
create trigger alert_events_assign_seq
  before insert on alert_events
  for each row execute function alert_events_assign_seq();

revoke all on alert_events from anon, authenticated;
alter table alert_events enable row level security;
grant select on alert_events to authenticated;
create policy alert_events_owner_select on alert_events
  for select to authenticated using (exists (
    select 1 from alerts a where a.id = alert_events.alert_id and a.user_id = auth.uid()));

-- append-only, service_role included (01 §13 ⚙, same list as 0014)
revoke update, delete on public.alert_events from anon, authenticated, service_role;
grant insert on alert_events to service_role;
grant usage, select on sequence alert_events_id_seq to service_role;

-- =====================================================================
-- 5. conversations — the Home drawer (title / pinned / recent / search)
-- =====================================================================
alter table conversations
  add column if not exists pinned boolean not null default false,
  add column if not exists last_message_at timestamptz;

-- PINNED first, then RECENT — the drawer's exact order, in one index.
create index if not exists conversations_user_drawer_idx
  on conversations (user_id, pinned desc, coalesce(last_message_at, created_at) desc);

-- "Search conversations" is an ilike over the title. pg_trgm makes the leading
-- wildcard (%meta%) an index scan instead of a seq scan on every keystroke.
create extension if not exists pg_trgm with schema extensions;
create index if not exists conversations_title_trgm_idx
  on conversations using gin (title extensions.gin_trgm_ops);

-- last_message_at is maintained in the database: every write path (streamed Kai
-- turn, briefing, portal panel) inserts conversation_messages, and none of them
-- should have to remember to touch the parent.
create or replace function conversations_touch_last_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update conversations c
     set last_message_at = greatest(
           coalesce(c.last_message_at, coalesce(new.created_at, now())),
           coalesce(new.created_at, now())),
         updated_at = now()
   where c.id = new.conversation_id;
  return null;
end;
$$;
create trigger conversations_touch_last_message
  after insert on conversation_messages
  for each row execute function conversations_touch_last_message();

-- backfill so existing threads sort correctly on first load
update conversations c
   set last_message_at = m.last_at
  from (
    select conversation_id, max(created_at) as last_at
      from conversation_messages group by conversation_id
  ) m
 where m.conversation_id = c.id and c.last_message_at is null;

-- Title and pin stay API writes (01 §13 row 7: conversations are owner-SELECT,
-- written by the api-app). No client UPDATE grant is added — see SCHEMA-NOTES 1.48.

-- =====================================================================
-- 6. Circles — open, create, close
-- =====================================================================
create or replace function open_setup_circle(
  p_setup_id uuid,
  p_ttl      interval default interval '3 days'
) returns rooms
language plpgsql security definer set search_path = public as $$
declare
  v_setup   setups;
  v_room    rooms;
  v_pattern text;
  v_slug    text;
  v_desc    text;
begin
  select * into v_setup from setups where id = p_setup_id;
  if not found then
    raise exception 'setup_not_found' using errcode = '42501';
  end if;

  -- idempotent: the circle for this setup already exists
  select * into v_room from rooms where setup_id = p_setup_id;
  if found then
    return v_room;
  end if;

  v_pattern := coalesce(
    nullif(btrim(v_setup.annotations      ->> 'pattern'), ''),
    nullif(btrim(v_setup.catalyst         ->> 'pattern'), ''),
    nullif(btrim(v_setup.score_components ->> 'pattern'), ''),
    nullif(btrim(v_setup.entry_condition  ->> 'pattern'), ''),
    'setup');

  v_slug := lower(v_setup.symbol) || '-' || left(replace(p_setup_id::text, '-', ''), 8);
  v_desc := left(coalesce(v_setup.thesis_plain,
                          v_setup.symbol || ' setup discussion.'), 280);

  insert into rooms (type, mode, slug, name, description, setup_id, expires_at, config)
  values (
    'setup',
    v_setup.mode,
    v_slug,
    v_setup.symbol || ' ' || initcap(v_pattern),
    v_desc,
    p_setup_id,
    now() + coalesce(p_ttl, interval '3 days'),
    jsonb_build_object(
      'intel_eligible', false,
      'posting_restricted', false,
      'origin', 'setup_lifecycle')
  )
  on conflict (setup_id) where setup_id is not null do nothing
  returning * into v_room;

  -- lost the race: another transaction opened it between the select and the insert
  if v_room.id is null then
    select * into v_room from rooms where setup_id = p_setup_id;
    return v_room;
  end if;

  insert into room_seq_counters (room_id, last_seq) values (v_room.id, 0)
    on conflict (room_id) do nothing;

  update setups set discussion_room_id = v_room.id
   where id = p_setup_id and discussion_room_id is null;

  return v_room;
end;
$$;
revoke all on function open_setup_circle(uuid, interval) from public, anon, authenticated;
grant execute on function open_setup_circle(uuid, interval) to service_role;


create or replace function create_circle(
  p_user_id uuid,
  p_symbol  text,
  p_ttl     interval default interval '3 days'
) returns rooms
language plpgsql security definer set search_path = public as $$
declare
  v_symbol text := upper(btrim(coalesce(p_symbol, '')));
  v_mode   app_mode;
  v_room   rooms;
begin
  select primary_mode into v_mode from profiles where user_id = p_user_id;
  if not found then
    raise exception 'user_not_found' using errcode = '42501';
  end if;

  if v_symbol = '' then
    raise exception 'symbol_required' using errcode = '22023';
  end if;
  if not exists (select 1 from instruments i where i.symbol = v_symbol) then
    raise exception 'symbol_unknown' using errcode = '22023';
  end if;
  if coalesce(p_ttl, interval '3 days') <= interval '0' then
    raise exception 'ttl_invalid' using errcode = '22023';
  end if;

  insert into rooms (type, mode, slug, name, description, expires_at, config)
  values (
    'setup',
    v_mode,
    'circle-' || lower(v_symbol) || '-' ||
      substr(md5(p_user_id::text || clock_timestamp()::text || random()::text), 1, 8),
    v_symbol || ' Circle',
    v_symbol || ' — a member circle. It closes on its own when the clock runs out.',
    now() + coalesce(p_ttl, interval '3 days'),
    jsonb_build_object(
      'intel_eligible', false,
      'posting_restricted', false,
      'origin', 'user',
      'created_by', p_user_id)
  )
  returning * into v_room;

  insert into room_members (room_id, user_id, role)
  values (v_room.id, p_user_id, 'moderator')
  on conflict (room_id, user_id) do update set role = 'moderator';

  insert into room_seq_counters (room_id, last_seq) values (v_room.id, 0)
    on conflict (room_id) do nothing;

  perform append_user_event(
    p_user_id, 'community', 'circle_created', v_room.id,
    jsonb_build_object('symbol', v_symbol, 'expires_at', v_room.expires_at));

  return v_room;
end;
$$;
revoke all on function create_circle(uuid, text, interval) from public, anon, authenticated;
grant execute on function create_circle(uuid, text, interval) to service_role;


create or replace function close_expired_circles() returns setof uuid
language plpgsql security definer set search_path = public as $$
begin
  return query
  update rooms r
     set config = jsonb_set(
                    jsonb_set(coalesce(r.config, '{}'::jsonb),
                              '{posting_restricted}', 'true'::jsonb, true),
                    '{closed_at}', to_jsonb(now()), true),
         updated_at = now()
   where r.type = 'setup'
     and r.expires_at is not null
     and r.expires_at <= now()
     and coalesce((r.config ->> 'posting_restricted')::boolean, false) = false
  returning r.id;
end;
$$;
revoke all on function close_expired_circles() from public, anon, authenticated;
grant execute on function close_expired_circles() to service_role;

-- =====================================================================
-- 7. rule_adherence_v — Account's "you followed your rules N of M sessions"
-- =====================================================================
-- A session is a debrief. `followed` is true when the debrief's process receipt
-- exists and every item on it is ok. record_debrief (0018) is called with
-- p_process_review = {payload: {...}, process_receipt: [{label, ok, detail_plain}]},
-- and the API's fallback path writes the same shape, so both the top-level and
-- the payload-nested receipt are read. Items that carry {"status":"ok"} instead
-- of {"ok":true} are accepted too — no cast that can throw on a stray value, and
-- the comparison is coalesced to false so a receipt item with neither key counts
-- as NOT ok rather than vanishing into a NULL predicate.
--
-- security_invoker: `debriefs` is owner-select under RLS, so a client JWT gets
-- exactly its own row and service_role (BYPASSRLS) sees every user. The view
-- inlines the receipt test rather than calling a helper function, because the
-- function grant floor would otherwise make the view unreadable to a client.
drop view if exists rule_adherence_v;
create view rule_adherence_v with (security_invoker = true) as
select
  d.user_id,
  count(*)::int                              as sessions,
  count(*) filter (where f.followed)::int    as followed
from debriefs d
cross join lateral (
  select
    case
      when jsonb_typeof(items.v) = 'array' and jsonb_array_length(items.v) > 0
        then not exists (
          select 1
            from jsonb_array_elements(items.v) it
           where not coalesce(
             (jsonb_typeof(it -> 'ok') = 'boolean' and (it ->> 'ok')::boolean)
             or (it ->> 'status') = 'ok',
             false
           )
        )
      else false
    end as followed
  from (
    select coalesce(
      d.process_review -> 'process_receipt',
      d.process_review -> 'payload' -> 'process_receipt'
    ) as v
  ) items
) f
group by d.user_id;

revoke all on rule_adherence_v from anon;
grant select on rule_adherence_v to authenticated, service_role;

-- =====================================================================
-- 8. FUNCTION GRANT FLOOR (SCHEMA-NOTES gap 2.7)
-- =====================================================================
-- Postgres + Supabase default privileges hand EXECUTE on every function created
-- above to PUBLIC/anon/authenticated. Re-apply 0018's floor across the whole
-- schema, then grant back only the three genuinely client-callable functions.
-- None of round 4's functions is client-callable: annotations, circles and
-- alert history are all written through the API.
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
