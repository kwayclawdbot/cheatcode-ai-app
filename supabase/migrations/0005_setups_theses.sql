-- 0005_setups_theses
-- Source: docs/01_DATA_MODEL.md §5. Global (not user-scoped) objects produced by workers.

create table setups (
  id uuid primary key default gen_random_uuid(),
  symbol text not null references instruments(symbol),
  mode app_mode not null,
  intent position_effect not null,                       -- buy_to_open (long) or sell_short
  state setup_state not null default 'discovered',
  score numeric,                                         -- V5 composite, source of truth
  grade_band grade_band,                                 -- derived: A/B/C
  grade_display text,                                    -- derived: 'A-','B+',...
  score_components jsonb,
  thesis_plain text, thesis_technical text,
  entry_condition jsonb, invalidation jsonb, stop numeric, targets jsonb,
  catalyst jsonb, annotations jsonb,
  quote_snapshot jsonb not null,
  valid_until timestamptz, scanner_run_id uuid,
  discussion_room_id uuid,                               -- ⚙ FK to rooms added in 0010 (alter table)
  created_at timestamptz not null default now(), updated_at timestamptz
);
-- ⚙ index (mode, state, score desc); index (symbol)
create index setups_mode_state_score_idx on setups (mode, state, score desc);
create index setups_symbol_idx on setups (symbol);

create table setup_events (                              -- append-only ⚙
  id bigserial primary key,
  setup_id uuid not null references setups,
  seq int not null, type text not null, payload jsonb not null,
  created_at timestamptz default now(),
  unique (setup_id, seq)
);

create table theses (
  id uuid primary key default gen_random_uuid(),
  symbol text not null, mode app_mode not null, timeframe text not null,
  setup_id uuid references setups,
  intent position_effect not null,
  summary_plain text not null, evidence jsonb,
  status text not null default 'active' check (status in ('active','superseded','expired')),
  superseded_by uuid references theses,
  supersession jsonb,                                    -- {previous_view,new_evidence,why_failed,entry_passed,new_state}
  created_at timestamptz default now(), updated_at timestamptz
);

-- ⚙ SEPARATE partial unique index (not a table constraint):
create unique index one_active_thesis on theses(symbol, mode, timeframe) where status = 'active';
