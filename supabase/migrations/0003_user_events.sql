-- 0003_user_events
-- Source: docs/01_DATA_MODEL.md §3. Unified user event outbox (replay backbone). Append-only.

-- ⚙ per-user monotonic seq via counter table + row lock in the writing txn
create table user_event_counters (
  user_id uuid primary key references profiles on delete cascade,
  last_seq bigint not null default 0
);

create table user_events (
  user_id uuid not null references profiles on delete cascade,
  seq bigint not null,
  event_type text not null,                              -- order_status | fill | alert_trigger | plan_event | position_update | kai_result | thesis_change | recommendation | system
  entity_type text not null, entity_id uuid not null,
  payload jsonb not null,
  occurred_at timestamptz not null default now(),
  primary key (user_id, seq)
);
create index user_events_occurred_idx on user_events (user_id, occurred_at desc);
