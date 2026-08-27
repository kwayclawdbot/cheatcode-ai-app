-- 0002_identity
-- Source: docs/01_DATA_MODEL.md §2. Conventions line adds created_at/updated_at where not listed.

create table profiles (
  user_id uuid primary key references auth.users on delete cascade,
  handle text unique, display_name text, avatar_url text,
  primary_mode app_mode not null default 'day_trade',
  experience experience_level not null default 'beginner',
  involvement involvement not null default 'guided',
  explanation_level experience_level not null default 'beginner',
  onboarding jsonb not null default '{}',
  timezone text default 'America/New_York',
  memory_enabled boolean not null default true,         -- personalization memory master switch
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table risk_policies (
  user_id uuid primary key references profiles on delete cascade,
  daily_loss_cap_usd numeric, max_position_pct numeric,
  max_open_positions int, max_sector_concentration_pct numeric,
  min_reward_risk numeric default 1.5,
  pdt_warnings boolean default true,
  updated_by text not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table risk_policy_events (                        -- append-only journal
  id bigserial primary key, user_id uuid not null,
  change jsonb not null, created_at timestamptz default now()
);
create index risk_policy_events_user_idx on risk_policy_events (user_id, created_at desc);
