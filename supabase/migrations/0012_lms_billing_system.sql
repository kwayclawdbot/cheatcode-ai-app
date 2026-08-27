-- 0012_lms_billing_system
-- Source: docs/01_DATA_MODEL.md §12.

create table courses (
  id uuid primary key default gen_random_uuid(),
  slug text unique, title text, description text,
  mode app_mode, level experience_level, position int,
  published boolean default false, tier_required text default 'premium',
  created_at timestamptz not null default now(), updated_at timestamptz
);

create table course_modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses, title text, position int,
  created_at timestamptz not null default now(), updated_at timestamptz
);

create table lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid references course_modules,
  title text, position int, content jsonb not null,
  context_tags text[], published boolean default false,
  created_at timestamptz not null default now(), updated_at timestamptz
);

create table lesson_progress (
  user_id uuid references profiles on delete cascade, lesson_id uuid references lessons,
  state text default 'started', quiz_result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now(),
  primary key (user_id, lesson_id)
);

create table kai_explanations (
  id uuid primary key default gen_random_uuid(),
  context_key text unique, level experience_level not null,
  body jsonb not null, model text, prompt_version text,
  created_at timestamptz not null default now(), updated_at timestamptz
);

create table subscriptions (
  user_id uuid primary key references profiles on delete cascade,
  stripe_customer_id text, stripe_subscription_id text,
  tier text not null default 'free' check (tier in ('free','premium')),
  status text not null, current_period_end timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz
);

create table entitlement_flags (
  tier text, flag text, value jsonb, primary key (tier, flag),
  created_at timestamptz not null default now(), updated_at timestamptz
);

create table disclosure_templates (
  key text, version int, body text not null, active boolean default true,
  primary key (key, version),
  created_at timestamptz not null default now(), updated_at timestamptz
);

create table legacy_imports (                             -- v1.2
  id uuid primary key default gen_random_uuid(),
  phone_hash text unique, email text, source text default 'kai_sms',
  imported_at timestamptz, claimed_by uuid references profiles,
  claimed_at timestamptz, legacy_meta jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz
);

create table system_status (
  component text primary key, healthy boolean, detail jsonb, updated_at timestamptz,
  created_at timestamptz not null default now()
);
