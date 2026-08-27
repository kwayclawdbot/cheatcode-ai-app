-- 0010_community
-- Source: docs/01_DATA_MODEL.md §10.
-- Phase-2 tables (live_sessions, session_events, polls, DMs) are NOT created in v1.

create table rooms (
  id uuid primary key default gen_random_uuid(),
  type room_type not null, mode app_mode,
  slug text unique, name text not null, description text,
  setup_id uuid references setups,
  config jsonb not null default '{}',                    -- slow_mode_s, posting_restricted, intel_eligible (default false until terms disclosed)
  pinned jsonb not null default '[]',
  created_at timestamptz not null default now(), updated_at timestamptz
);
create index rooms_mode_type_idx on rooms (mode, type);

-- ⚙ after rooms: FK from setups.discussion_room_id
alter table setups add constraint fk_setup_room
  foreign key (discussion_room_id) references rooms deferrable initially deferred;

create table room_members (
  room_id uuid references rooms, user_id uuid references profiles on delete cascade,
  role member_role not null default 'member',
  muted_until timestamptz, banned boolean default false,
  last_read_seq bigint default 0,
  created_at timestamptz not null default now(), updated_at timestamptz,
  primary key (room_id, user_id)
);
create index room_members_user_idx on room_members (user_id);

create table messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms,
  user_id uuid references profiles,                      -- null = Kai/system
  seq bigint not null,                                   -- assigned by api-app in txn
  kind message_kind not null default 'text',
  body text, parent_id uuid references messages,
  refs jsonb, structured_idea jsonb, position_disclosure jsonb,
  edited_at timestamptz, deleted_at timestamptz,
  flags jsonb not null default '{}',
  created_at timestamptz default now(),
  unique (room_id, seq)
);
create index messages_room_created_idx on messages (room_id, created_at desc);
-- Writes: api-app ONLY (validation, rate limits, spam precheck, disclosure prompts, seq assignment, audit).
-- RLS: members select (deleted rows body-nulled via view in 0015); no client insert/update grants ⚙.

create table kai_objects (
  id uuid primary key default gen_random_uuid(),
  type kai_object_type not null, payload jsonb not null,
  disclosures text[] not null default '{}',
  model text not null, prompt_version text not null,
  refs jsonb, user_id uuid, created_at timestamptz default now()
);
create index kai_objects_user_type_idx on kai_objects (user_id, type, created_at desc);
create index kai_objects_refs_idx on kai_objects using gin (refs);

create table verifications (
  id uuid primary key default gen_random_uuid(),
  claim text not null, message_id uuid references messages,
  result verification_result not null, sources jsonb not null,
  uncertainty text, effect_on_setup text,
  kai_object_id uuid references kai_objects, created_at timestamptz default now()
);

create table community_signals (                          -- v1.2
  id uuid primary key default gen_random_uuid(),
  symbol text not null, window_start timestamptz, window_end timestamptz,
  sample_size int not null, sentiment jsonb not null,
  mentioned_levels jsonb, catalysts jsonb, open_questions jsonb,
  confidence_limits text not null, source_rooms uuid[],
  computed_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index community_signals_symbol_idx on community_signals (symbol, computed_at desc);

create table contributor_stats (
  user_id uuid primary key references profiles on delete cascade,
  role_labels text[] not null default '{}',
  ideas_posted int default 0, theses_updated int default 0,
  outcomes_disclosed int default 0, defined_risk_rate numeric,
  usefulness_score numeric, weighting numeric not null default 1.0,
  created_at timestamptz not null default now(), updated_at timestamptz
);

create table reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid, message_id uuid, room_id uuid,
  reason text not null, status text default 'open', resolution text,
  created_at timestamptz default now(), updated_at timestamptz
);

create table moderation_log (                             -- append-only ⚙
  id bigserial primary key, actor_id uuid,
  action moderation_action not null, target jsonb not null,
  reason text, created_at timestamptz default now()
);
