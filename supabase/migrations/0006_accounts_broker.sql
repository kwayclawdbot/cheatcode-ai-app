-- 0006_accounts_broker
-- Source: docs/01_DATA_MODEL.md §6.

create table broker_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  provider text not null default 'snaptrade',
  status broker_conn_status not null default 'connecting',
  access connection_access not null default 'read',      -- Robinhood connections are always 'read'; Webull may be 'trade' (v1.1)
  snaptrade_user_id text, authorization_id text,
  capabilities jsonb,                                    -- per-connection discovered capabilities
  data_lag text not null default 'realtime' check (data_lag in ('realtime','delayed')),
  last_synced_at timestamptz, error_detail text,
  created_at timestamptz not null default now(), updated_at timestamptz
);
create index broker_connections_user_idx on broker_connections (user_id);

create table accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  kind account_kind not null default 'paper',
  broker_connection_id uuid references broker_connections,
  name text not null, currency text default 'USD',
  cash numeric, buying_power numeric, equity numeric,    -- broker kind: synced read-mirror; broker is source of truth
  starting_balance numeric,                              -- paper only; $1k-$100k
  options_level int default 0,                           -- paper defaults 2 in v1.1
  reset_count int default 0, last_reset_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz
);
create index accounts_user_idx on accounts (user_id, kind);
