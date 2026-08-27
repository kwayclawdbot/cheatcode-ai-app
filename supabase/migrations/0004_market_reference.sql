-- 0004_market_reference
-- Source: docs/01_DATA_MODEL.md §4. Live quotes are never persisted; records embed quote_snapshot jsonb.

create table instruments (
  symbol text primary key, name text, exchange text,
  kind instrument_kind not null default 'equity',
  active boolean default true, meta jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table option_contracts (                          -- v1.1
  occ_symbol text primary key,
  underlying text not null references instruments(symbol),
  kind text not null check (kind in ('call','put')),
  strike numeric not null, expiry date not null,
  multiplier int default 100, exercise_style text default 'american',
  active boolean default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index option_contracts_underlying_idx on option_contracts (underlying, expiry);

create table candles (
  symbol text not null references instruments(symbol),
  timeframe text not null, ts timestamptz not null,
  o numeric, h numeric, l numeric, c numeric, v bigint,
  primary key (symbol, timeframe, ts)
);

create table market_sessions (
  session_date date primary key, status text,
  opens_at timestamptz, closes_at timestamptz, notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table scan_universes (
  name text primary key, symbols text[] not null, updated_at timestamptz default now(),
  created_at timestamptz not null default now()
);
