-- 0007_plans_orders_positions
-- Source: docs/01_DATA_MODEL.md §7.
-- Position matching uses side (position_effect) directly: sell_to_close closes long lots,
-- sell_short opens short, buy_to_cover closes short - no inference from bare direction.

create table trade_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  setup_id uuid references setups,
  mode app_mode not null,                                -- originating mode, immutable after create ⚙ trigger-enforced (0013)
  status plan_status not null default 'draft',
  symbol text not null, occ_symbol text references option_contracts,
  instrument_kind instrument_kind not null default 'equity',
  intent position_effect not null,
  entry_condition jsonb, invalidation jsonb, stop numeric, targets jsonb,
  size jsonb, scenarios jsonb,
  exit_style text not null default 'auto' check (exit_style in ('auto','alert_assisted')),
  origin jsonb not null,
  created_at timestamptz default now(), updated_at timestamptz
);
create index trade_plans_user_idx on trade_plans (user_id, status);

create table plan_events (                               -- append-only ⚙
  id bigserial primary key, plan_id uuid not null references trade_plans,
  user_id uuid not null, seq int not null, type text not null, payload jsonb not null,
  created_at timestamptz default now(), unique (plan_id, seq)
);
create index plan_events_user_idx on plan_events (user_id, created_at desc);

create table orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  account_id uuid not null references accounts,
  plan_id uuid references trade_plans,
  symbol text not null, occ_symbol text references option_contracts,
  instrument_kind instrument_kind not null default 'equity',
  side position_effect not null,                         -- explicit intent, not bare buy/sell
  type order_type not null, qty numeric not null,
  limit_price numeric, stop_price numeric, duration text default 'day',
  status order_status not null default 'draft',
  idempotency_key text not null unique,
  preview jsonb, reject_reason text, reject_reason_raw text,
  driver text not null default 'paper' check (driver in ('paper','snaptrade')),
  external_ref text, bracket_group uuid,                 -- links entry/stop/target legs
  created_at timestamptz not null default now(), updated_at timestamptz
);
create index orders_user_idx on orders (user_id, status);
create index orders_account_idx on orders (account_id);

create table order_events (                              -- append-only ⚙
  id bigserial primary key, order_id uuid not null references orders,
  from_status order_status, to_status order_status, payload jsonb,
  created_at timestamptz default now()
);
create index order_events_order_idx on order_events (order_id, created_at);

create table fills (                                     -- append-only ⚙
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders,
  qty numeric not null, price numeric not null, ts timestamptz not null,
  liquidity text,
  created_at timestamptz not null default now()
);
create index fills_order_idx on fills (order_id);

create table positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null, account_id uuid not null references accounts,
  symbol text not null, occ_symbol text references option_contracts,
  instrument_kind instrument_kind not null default 'equity',
  direction text not null check (direction in ('long','short')),
  qty numeric not null, avg_cost numeric not null,
  opened_at timestamptz not null, closed_at timestamptz,
  realized_pnl numeric default 0,
  origin_plan_id uuid references trade_plans,
  origin_setup_id uuid references setups,
  origin_room_id uuid,                                   -- continuity chain (no FK per 01 §7)
  mode app_mode not null,
  source text not null default 'app' check (source in ('app','broker_sync')),
  created_at timestamptz not null default now(), updated_at timestamptz
);
create index positions_user_idx on positions (user_id, closed_at);

create table debriefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null, plan_id uuid references trade_plans,
  position_id uuid references positions,
  outcome jsonb not null, process_review jsonb,
  lesson_refs uuid[], kai_summary text,
  created_at timestamptz default now(), updated_at timestamptz
);
create index debriefs_user_idx on debriefs (user_id, created_at desc);
