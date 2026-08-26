# Cheat Code AI — Data Model (v2, canonical)

**Single current schema. Supersedes all prior drafts.** Phase 0 generates ordered migration files from this document (extensions → enums → tables in dependency order → indexes → triggers → RLS policies → grants → seeds); each DDL note below marked ⚙ is a migration-relevant instruction. Conventions: `id uuid pk default gen_random_uuid()`, `created_at timestamptz default now()`, trigger-maintained `updated_at` unless noted; `user_id` references `auth.users`.

## 1. Extensions & enums

```sql
create extension if not exists vector;

create type app_mode as enum ('day_trade','swing','invest');
create type experience_level as enum ('beginner','intermediate','advanced');
create type involvement as enum ('hands_on','guided');            -- v1: two values; 'mostly_auto' reserved for a future Invest automation tier, not in this enum until it exists
create type setup_state as enum ('discovered','watching','forming','ready','invalidated','expired');
create type grade_band as enum ('A','B','C');                     -- band for logic/filters
-- display grades (A+, A, A−, B+ …) live in setups.grade_display text, derived from score; recalibration never requires enum migration
create type plan_status as enum ('draft','planned','active','exiting','closed','cancelled','invalidated');
create type order_status as enum ('draft','previewed','submitted','accepted','partially_filled','filled','rejected','cancelled');
create type position_effect as enum ('buy_to_open','sell_to_close','sell_short','buy_to_cover');
-- options orders reuse these four; instrument_kind distinguishes the asset. v1 permits only buy_to_open/sell_to_close on options.
create type order_type as enum ('market','limit','stop','stop_limit');
create type instrument_kind as enum ('equity','etf','option');
create type account_kind as enum ('paper','broker');
create type broker_conn_status as enum ('disconnected','connecting','connected','expired','permission_missing','error');
create type connection_access as enum ('read','trade');
create type alert_status as enum ('draft','active','triggered','paused','expired','cancelled');
create type freshness as enum ('live','delayed','stale');
create type room_type as enum ('core','setup','announcement');    -- 'live' rooms are Phase 2
create type member_role as enum ('member','moderator','educator','expert');
create type message_kind as enum ('text','chart','voice_note','kai_object','position_update','system');
create type kai_object_type as enum ('briefing','graded_setup','comparison','research_report','verification_card','room_summary','community_intel','alert_preview','chart_response','position_update','action_preview','debrief','thesis_change');
create type verification_result as enum ('verified','partially_verified','unverified','false','unverifiable');
create type moderation_action as enum ('remove','restrict','warn','mute','ban','lockdown','restore','label');
create type rebalance_status as enum ('proposed','previewed','confirmed','applied','dismissed');
create type notif_channel as enum ('push','in_app');
```

## 2. Identity, profile, risk

```sql
create table profiles (
  user_id uuid primary key references auth.users,
  handle text unique, display_name text, avatar_url text,
  primary_mode app_mode not null default 'day_trade',
  experience experience_level not null default 'beginner',
  involvement involvement not null default 'guided',
  explanation_level experience_level not null default 'beginner',
  onboarding jsonb not null default '{}',
  timezone text default 'America/New_York',
  memory_enabled boolean not null default true          -- personalization memory master switch
);
-- ⚙ trigger on auth.users insert creates profile + paper account + default prefs
-- ⚙ public view profiles_public(handle, display_name, avatar_url, role_labels) for community

create table risk_policies (
  user_id uuid primary key references profiles,
  daily_loss_cap_usd numeric, max_position_pct numeric,
  max_open_positions int, max_sector_concentration_pct numeric,
  min_reward_risk numeric default 1.5,
  pdt_warnings boolean default true,
  updated_by text not null default 'user'
);
create table risk_policy_events (                        -- append-only journal
  id bigserial primary key, user_id uuid not null,
  change jsonb not null, created_at timestamptz default now()
);
```
RLS: profiles owner-write; risk_policies owner-read, **API-only write**; risk_policy_events append-only (no update/delete grants ⚙).

## 3. Unified user event outbox (replay backbone)

```sql
create table user_events (
  user_id uuid not null references profiles,
  seq bigint not null,                                   -- ⚙ per-user monotonic via counter table + row lock in the writing txn
  event_type text not null,                              -- order_status | fill | alert_trigger | plan_event | position_update | kai_result | thesis_change | recommendation | system
  entity_type text not null, entity_id uuid not null,
  payload jsonb not null,
  occurred_at timestamptz not null default now(),
  primary key (user_id, seq)
);
```
**Rule:** every server-authoritative mutation writes its domain row (order_events, plan_events, …) **and** its user_events row in the same transaction. `user:{user_id}` Realtime broadcasts user_events rows; replay is `GET /events/replay?scope=user&after_seq=` over this table. Global streams (`setup:{id}`, `room:{id}`) replay from their own per-entity seq tables below. Append-only ⚙.

## 4. Market reference & cache

```sql
create table instruments (
  symbol text primary key, name text, exchange text,
  kind instrument_kind not null default 'equity',
  active boolean default true, meta jsonb
);
create table option_contracts (                          -- v1.1
  occ_symbol text primary key,
  underlying text not null references instruments(symbol),
  kind text not null check (kind in ('call','put')),
  strike numeric not null, expiry date not null,
  multiplier int default 100, exercise_style text default 'american',
  active boolean default true
);
create table candles (
  symbol text not null references instruments(symbol),
  timeframe text not null, ts timestamptz not null,
  o numeric, h numeric, l numeric, c numeric, v bigint,
  primary key (symbol, timeframe, ts)
);
create table market_sessions (
  session_date date primary key, status text,
  opens_at timestamptz, closes_at timestamptz, notes text
);
create table scan_universes (
  name text primary key, symbols text[] not null, updated_at timestamptz default now()
);
```
Live quotes: Redis + Realtime only; persisted records embed `quote_snapshot jsonb` (price + ts + freshness).

## 5. Setups & theses (global)

```sql
create table setups (
  id uuid primary key default gen_random_uuid(),
  symbol text not null references instruments(symbol),
  mode app_mode not null,
  intent position_effect not null,                       -- buy_to_open (long) or sell_short
  state setup_state not null default 'discovered',
  score numeric,                                         -- V5 composite, source of truth
  grade_band grade_band,                                 -- derived: A/B/C
  grade_display text,                                    -- derived: 'A−','B+',…
  score_components jsonb,
  thesis_plain text, thesis_technical text,
  entry_condition jsonb, invalidation jsonb, stop numeric, targets jsonb,
  catalyst jsonb, annotations jsonb,
  quote_snapshot jsonb not null,
  valid_until timestamptz, scanner_run_id uuid,
  discussion_room_id uuid,                               -- ⚙ FK to rooms added after rooms exists (alter table)
  created_at timestamptz not null default now(), updated_at timestamptz
);
-- ⚙ index (mode, state, score desc); index (symbol)

create table setup_events (
  id bigserial primary key,
  setup_id uuid not null references setups,
  seq int not null, type text not null, payload jsonb not null,
  created_at timestamptz default now(),
  unique (setup_id, seq)
);                                                       -- append-only ⚙

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
-- create unique index one_active_thesis on theses(symbol, mode, timeframe) where status = 'active';
```

## 6. Accounts, broker connections

```sql
create table broker_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles,
  provider text not null default 'snaptrade',
  status broker_conn_status not null default 'connecting',
  access connection_access not null default 'read',      -- Robinhood connections are always 'read'; Webull may be 'trade' (v1.1)
  snaptrade_user_id text, authorization_id text,
  capabilities jsonb,                                    -- per-connection discovered: order types, options level, shortable, brackets, fractional, sync_lag_s
  data_lag text not null default 'realtime' check (data_lag in ('realtime','delayed')),  -- Robinhood: 'delayed' (≈5-min trade detection)
  last_synced_at timestamptz, error_detail text
);
create table accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles,
  kind account_kind not null default 'paper',
  broker_connection_id uuid references broker_connections,
  name text not null, currency text default 'USD',
  cash numeric, buying_power numeric, equity numeric,    -- broker kind: synced read-mirror; broker is source of truth
  starting_balance numeric,                              -- paper only; $1k–$100k
  options_level int default 0,                           -- paper defaults 2 in v1.1
  reset_count int default 0, last_reset_at timestamptz
);
```

## 7. Plans, orders, positions, debriefs

```sql
create table trade_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles,
  setup_id uuid references setups,
  mode app_mode not null,                                -- originating mode, immutable after create ⚙ trigger-enforced
  status plan_status not null default 'draft',
  symbol text not null, occ_symbol text references option_contracts,
  instrument_kind instrument_kind not null default 'equity',
  intent position_effect not null,
  entry_condition jsonb, invalidation jsonb, stop numeric, targets jsonb,
  size jsonb, scenarios jsonb,
  exit_style text not null default 'auto' check (exit_style in ('auto','alert_assisted')),  -- default from involvement; per-plan override; live non-bracket brokers force 'alert_assisted'
  origin jsonb not null,
  created_at timestamptz default now(), updated_at timestamptz
);
create table plan_events (
  id bigserial primary key, plan_id uuid not null references trade_plans,
  user_id uuid not null, seq int not null, type text not null, payload jsonb not null,
  created_at timestamptz default now(), unique (plan_id, seq)
);                                                       -- append-only ⚙

create table orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles,
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
  external_ref text, bracket_group uuid                  -- links entry/stop/target legs
);
create table order_events (
  id bigserial primary key, order_id uuid not null references orders,
  from_status order_status, to_status order_status, payload jsonb,
  created_at timestamptz default now()
);                                                       -- append-only ⚙
create table fills (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders,
  qty numeric not null, price numeric not null, ts timestamptz not null,
  liquidity text
);
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
  origin_room_id uuid,                                   -- continuity chain
  mode app_mode not null,
  source text not null default 'app' check (source in ('app','broker_sync'))  -- broker_sync = externally placed, carries connection data_lag label
);
create table debriefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null, plan_id uuid references trade_plans,
  position_id uuid references positions,
  outcome jsonb not null, process_review jsonb,
  lesson_refs uuid[], kai_summary text,
  created_at timestamptz default now()
);
```
Position matching uses `side` (position_effect) directly: `sell_to_close` closes long lots, `sell_short` opens short, `buy_to_cover` closes short — no inference from bare direction.

## 8. Alerts & notifications

```sql
create table alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles,
  status alert_status not null default 'draft',
  natural_language text, condition jsonb not null,
  data_dependency jsonb not null,
  frequency text default 'once' check (frequency in ('once','re_arm','recurring')),
  expires_at timestamptz,
  channels notif_channel[] not null default '{push,in_app}',
  refs jsonb, created_at timestamptz default now(), updated_at timestamptz
);
create table alert_triggers (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references alerts,
  triggered_at timestamptz not null, late boolean default false,
  snapshot jsonb not null, delivered jsonb
);
create table setup_alert_prefs (
  user_id uuid primary key references profiles,
  enabled boolean default true,
  min_grade grade_band default 'B',
  modes app_mode[] default '{day_trade,swing}',
  intents position_effect[] default '{buy_to_open,sell_short}',
  symbols_include text[], symbols_exclude text[],
  max_per_day int default 5, quiet_hours jsonb
);
create table notification_prefs (
  user_id uuid primary key references profiles,
  per_mode jsonb not null default '{}', quiet_hours jsonb
);
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null, channel notif_channel not null,
  kind text not null, payload jsonb not null,
  sent_at timestamptz, delivery jsonb
);
```

## 9. Managed Investing (v1.1 surfaces; guidance kinds v1.2)

```sql
create table invest_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles,
  name text, target_amount numeric, horizon_years numeric,
  risk_band text check (risk_band in ('conservative','balanced','growth')),
  monthly_contribution numeric, account_id uuid references accounts
);
create table allocation_models (
  id uuid primary key default gen_random_uuid(),
  risk_band text not null, version int not null,
  sleeves jsonb not null, active boolean default false,
  approved_by uuid references profiles, approved_at timestamptz,
  unique (risk_band, version)
);
-- Kai-generated; serving requires approved_at not null AND active ⚙ enforced in query layer + check
create table invest_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null, goal_id uuid references invest_goals,
  kind text not null check (kind in ('contribution','rebalance','allocation_change','add_on_pullback','trim_at_high')),
  status rebalance_status not null default 'proposed',
  payload jsonb not null, disclosures text[] not null,
  applied_order_ids uuid[], created_at timestamptz default now()
);
```

## 10. Community

```sql
create table rooms (
  id uuid primary key default gen_random_uuid(),
  type room_type not null, mode app_mode,
  slug text unique, name text not null, description text,
  setup_id uuid references setups,
  config jsonb not null default '{}',                    -- slow_mode_s, posting_restricted, intel_eligible (default false until terms disclosed)
  pinned jsonb not null default '[]'
);
-- ⚙ after rooms: alter table setups add constraint fk_setup_room foreign key (discussion_room_id) references rooms;
create table room_members (
  room_id uuid references rooms, user_id uuid references profiles,
  role member_role not null default 'member',
  muted_until timestamptz, banned boolean default false,
  last_read_seq bigint default 0,
  primary key (room_id, user_id)
);
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
-- Writes: api-app ONLY (validation, rate limits, spam precheck, disclosure prompts, seq assignment, audit).
-- RLS: members select (deleted rows body-nulled via view); no client insert/update grants ⚙.
-- Moderation-only security-definer view exposes retained originals for market-claim audit.
create table kai_objects (
  id uuid primary key default gen_random_uuid(),
  type kai_object_type not null, payload jsonb not null,
  disclosures text[] not null default '{}',
  model text not null, prompt_version text not null,
  refs jsonb, user_id uuid, created_at timestamptz default now()
);
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
  computed_at timestamptz not null
);
create table contributor_stats (
  user_id uuid primary key references profiles,
  role_labels text[] not null default '{}',
  ideas_posted int default 0, theses_updated int default 0,
  outcomes_disclosed int default 0, defined_risk_rate numeric,
  usefulness_score numeric, weighting numeric not null default 1.0
);
create table reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid, message_id uuid, room_id uuid,
  reason text not null, status text default 'open', resolution text,
  created_at timestamptz default now()
);
create table moderation_log (
  id bigserial primary key, actor_id uuid,
  action moderation_action not null, target jsonb not null,
  reason text, created_at timestamptz default now()
);                                                       -- append-only ⚙
```
Phase-2 tables (live_sessions, session_events, polls, DMs) are **not created in v1 migrations** — they exist only in the Phase-2 design annex.

## 11. Kai memory & conversations

```sql
create table market_memory (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('news','filing','internals','setup_outcome','kai_analysis','community_signal','weekly_synthesis')),
  as_of date not null, symbols text[], entities text[],
  summary text not null, source jsonb,
  embedding vector(1536), created_at timestamptz default now()
);
-- ⚙ create index on market_memory using ivfflat (embedding vector_cosine_ops);
create table kai_user_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles,
  kind text not null check (kind in ('preference','pattern','mistake','goal','note')),
  content text not null, refs jsonb, embedding vector(1536),
  created_at timestamptz default now(), superseded_by uuid
);
-- User controls: list/delete-one/delete-all endpoints; profiles.memory_enabled gates writes+reads;
-- deletion hard-deletes rows incl. embeddings and regenerates any derived summaries ⚙ cascade job.
-- Extraction policy: no balances, position sizes, or account numbers may be written here.
create table conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles,
  mode app_mode, title text, context jsonb, created_at timestamptz default now()
);
create table conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations,
  seq int not null, role text not null check (role in ('user','kai')),
  content jsonb not null, created_at timestamptz default now(),
  unique (conversation_id, seq)
);
```

## 12. LMS (v1.2), billing, system

```sql
create table courses (
  id uuid primary key default gen_random_uuid(),
  slug text unique, title text, description text,
  mode app_mode, level experience_level, position int,
  published boolean default false, tier_required text default 'premium'
);
create table course_modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses, title text, position int
);
create table lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid references course_modules,
  title text, position int, content jsonb not null,
  context_tags text[], published boolean default false
);
create table lesson_progress (
  user_id uuid references profiles, lesson_id uuid references lessons,
  state text default 'started', quiz_result jsonb,
  updated_at timestamptz default now(),
  primary key (user_id, lesson_id)
);
create table kai_explanations (
  id uuid primary key default gen_random_uuid(),
  context_key text unique, level experience_level not null,
  body jsonb not null, model text, prompt_version text
);

create table subscriptions (
  user_id uuid primary key references profiles,
  stripe_customer_id text, stripe_subscription_id text,
  tier text not null default 'free' check (tier in ('free','premium')),
  status text not null, current_period_end timestamptz
);
create table entitlement_flags (
  tier text, flag text, value jsonb, primary key (tier, flag)
);
create table disclosure_templates (
  key text, version int, body text not null, active boolean default true,
  primary key (key, version)
);
create table legacy_imports (                             -- v1.2
  id uuid primary key default gen_random_uuid(),
  phone_hash text unique, email text, source text default 'kai_sms',
  imported_at timestamptz, claimed_by uuid references profiles,
  claimed_at timestamptz, legacy_meta jsonb
);
create table system_status (
  component text primary key, healthy boolean, detail jsonb, updated_at timestamptz
);
```

## 13. RLS & grants matrix (⚙ policy generation source)

| Tables | Client select | Client write | Writer |
|---|---|---|---|
| profiles, notification_prefs, setup_alert_prefs (non-financial fields), watchlist tables, lesson_progress | owner | owner (RLS) | client direct |
| risk_policies, exit_style-affecting prefs | owner | none | api-app |
| setups, setup_events, theses, kai_objects(public), verifications, community_signals, courses/lessons(published), instruments, candles | authenticated | none | workers |
| trade_plans, plan_events, orders, order_events, fills, positions, debriefs, accounts, alerts, alert_triggers, user_events, invest_* | owner | none | execution worker / api-app |
| rooms, room_members, messages | members | none | api-app |
| moderation_log, reports resolution, admin tables | staff roles | none | api-app (admin) |
| kai_user_memory, conversations | owner | none (delete via API) | kai worker |

Append-only tables (`*_events`, `user_events`, `moderation_log`, `risk_policy_events`, `fills`): revoke UPDATE/DELETE from every role including service paths ⚙.

## 14. Retention & privacy

| Data | Policy |
|---|---|
| Audit records (orders, events, financial kai_objects, moderation_log) | Audit retention policy (legal-set); not user-deletable |
| kai_user_memory | User-controlled; hard-delete cascades to embeddings + derived summaries |
| Raw prompts / tool results | 30 days (config), then purged |
| Deleted messages | Body nulled in surfaces; market-claim originals retained in moderation audit only |
| market_memory | 24 months raw, monthly compaction into weekly_synthesis |
| Quotes | Never persisted beyond embedded snapshots |
| Portfolio data → community | Only via explicit position_disclosure or user-published structured share |
