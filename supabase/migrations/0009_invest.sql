-- 0009_invest
-- Source: docs/01_DATA_MODEL.md §9. Managed Investing (v1.1 surfaces; guidance kinds v1.2).

create table invest_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  name text, target_amount numeric, horizon_years numeric,
  risk_band text check (risk_band in ('conservative','balanced','growth')),
  monthly_contribution numeric, account_id uuid references accounts,
  created_at timestamptz not null default now(), updated_at timestamptz
);
create index invest_goals_user_idx on invest_goals (user_id);

create table allocation_models (
  id uuid primary key default gen_random_uuid(),
  risk_band text not null, version int not null,
  sleeves jsonb not null, active boolean default false,
  approved_by uuid references profiles, approved_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz,
  unique (risk_band, version)
);
-- Kai-generated; serving requires approved_at not null AND active ⚙ enforced in query layer + check
alter table allocation_models
  add constraint allocation_models_serving_check
  check (active is not true or approved_at is not null);

create table invest_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null, goal_id uuid references invest_goals,
  kind text not null check (kind in ('contribution','rebalance','allocation_change','add_on_pullback','trim_at_high')),
  status rebalance_status not null default 'proposed',
  payload jsonb not null, disclosures text[] not null,
  applied_order_ids uuid[], created_at timestamptz default now(), updated_at timestamptz
);
create index invest_recommendations_user_idx on invest_recommendations (user_id, status);
