-- 0008_alerts_notifications
-- Source: docs/01_DATA_MODEL.md §8.

create table alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  status alert_status not null default 'draft',
  natural_language text, condition jsonb not null,
  data_dependency jsonb not null,
  frequency text default 'once' check (frequency in ('once','re_arm','recurring')),
  expires_at timestamptz,
  channels notif_channel[] not null default '{push,in_app}',
  refs jsonb, created_at timestamptz default now(), updated_at timestamptz
);
create index alerts_user_idx on alerts (user_id, status);

create table alert_triggers (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references alerts,
  triggered_at timestamptz not null, late boolean default false,
  snapshot jsonb not null, delivered jsonb,
  created_at timestamptz not null default now()
);
create index alert_triggers_alert_idx on alert_triggers (alert_id, triggered_at desc);

create table setup_alert_prefs (
  user_id uuid primary key references profiles on delete cascade,
  enabled boolean default true,
  min_grade grade_band default 'B',
  modes app_mode[] default '{day_trade,swing}',
  intents position_effect[] default '{buy_to_open,sell_short}',
  symbols_include text[], symbols_exclude text[],
  max_per_day int default 5, quiet_hours jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz
);

create table notification_prefs (
  user_id uuid primary key references profiles on delete cascade,
  per_mode jsonb not null default '{}', quiet_hours jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null, channel notif_channel not null,
  kind text not null, payload jsonb not null,
  sent_at timestamptz, delivery jsonb,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on notifications (user_id, created_at desc);
