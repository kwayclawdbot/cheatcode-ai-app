-- supabase/seed.sql
-- Source: docs/BUILD-BRIEF-v1-slice.md "Seeds", docs/02_API_CONTRACTS.md §11,
-- docs/08_COMMUNITY_SPEC_extracted.md §3. Runs after migrations on `supabase db reset`.

-- =====================================================================
-- instruments (10)
-- =====================================================================
insert into instruments (symbol, name, exchange, kind, active) values
  ('SPY',  'SPDR S&P 500 ETF Trust',   'ARCA',   'etf',    true),
  ('QQQ',  'Invesco QQQ Trust',        'NASDAQ', 'etf',    true),
  ('META', 'Meta Platforms, Inc.',     'NASDAQ', 'equity', true),
  ('NVDA', 'NVIDIA Corporation',       'NASDAQ', 'equity', true),
  ('AAPL', 'Apple Inc.',               'NASDAQ', 'equity', true),
  ('TSLA', 'Tesla, Inc.',              'NASDAQ', 'equity', true),
  ('AMD',  'Advanced Micro Devices, Inc.', 'NASDAQ', 'equity', true),
  ('CRM',  'Salesforce, Inc.',         'NYSE',   'equity', true),
  ('MSFT', 'Microsoft Corporation',    'NASDAQ', 'equity', true),
  ('AMZN', 'Amazon.com, Inc.',         'NASDAQ', 'equity', true)
on conflict (symbol) do nothing;

-- =====================================================================
-- scan universe
-- =====================================================================
insert into scan_universes (name, symbols) values
  ('day_trade', array['SPY','QQQ','META','NVDA','AAPL','TSLA','AMD','CRM','MSFT','AMZN'])
on conflict (name) do update set symbols = excluded.symbols, updated_at = now();

-- =====================================================================
-- rooms - the three core rooms (owner decision 2026-08-26)
--
-- Community is three rooms, full stop: Day Trade, Swing, Investing. No
-- per-mode sub-rooms and no setup rooms are surfaced. `mode` is kept on the row
-- because the schema and the API still carry it (and a room is genuinely about
-- one horizon), but it is NOT a filter any more - every member sees all three.
-- config.intel_eligible = false until community-intelligence terms are disclosed.
-- =====================================================================
insert into rooms (type, mode, slug, name, description, config) values
  ('core','day_trade','day-trade','Day Trade','Intraday setups, confirmations, exits - today.',            '{"intel_eligible": false}'),
  ('core','swing','swing','Swing','Ideas held for days or weeks: theses, catalysts, updates.',             '{"intel_eligible": false}'),
  ('core','invest','investing','Investing','Building and reviewing a long-term portfolio.',                '{"intel_eligible": false}')
on conflict (slug) do nothing;

-- =====================================================================
-- entitlement_flags (02_API_CONTRACTS §11)
-- Free: paper, 5 active alerts, community read + beginner-room posting, Kai daily budget.
-- Premium $99/mo: full alerts, full posting, broker connect, options (v1.1), full LMS (v1.2), priority Kai budget.
-- =====================================================================
insert into entitlement_flags (tier, flag, value) values
  ('free',    'alerts_max_active',     '5'),
  ('free',    'community_post_scope',  '"beginner_rooms"'),
  ('free',    'broker_connect',        'false'),
  ('free',    'options',               'false'),
  ('free',    'lms',                   'false'),
  ('free',    'kai_daily_budget',      '50'),
  ('premium', 'alerts_max_active',     '"unlimited"'),
  ('premium', 'community_post_scope',  '"all"'),
  ('premium', 'broker_connect',        'true'),
  ('premium', 'options',               'true'),
  ('premium', 'lms',                   'true'),
  ('premium', 'kai_daily_budget',      '500')
on conflict (tier, flag) do update set value = excluded.value;

-- =====================================================================
-- disclosure_templates
-- =====================================================================
insert into disclosure_templates (key, version, body, active) values
  ('paper_only', 1,
   'Paper trading only. Every order here is simulated with delayed market data. Fills, slippage and costs will not match a live brokerage account.',
   true),
  ('education_not_advice', 1,
   'Cheat Code AI provides education and analysis, not investment advice. Kai prepares and explains; you decide. Nothing here is a recommendation to buy or sell any security, and no outcome is guaranteed.',
   true)
on conflict (key, version) do update set body = excluded.body, active = excluded.active;

-- =====================================================================
-- seed setups (4) - clearly marked as seed data
--   scanner_run_id = '00000000-0000-0000-0000-000000000000'
--   score_components.seed = true
--   quote_snapshot freshness = 'delayed' with a real source_ts
-- =====================================================================
insert into setups (
  id, symbol, mode, intent, state, score, grade_band, grade_display, score_components,
  thesis_plain, thesis_technical,
  entry_condition, invalidation, stop, targets,
  quote_snapshot, valid_until, scanner_run_id
) values
(
  '11111111-1111-4111-8111-000000000001', 'META', 'day_trade', 'buy_to_open', 'forming',
  72, 'B', 'B+',
  '{"rule":"entry = 10-session high; stop = 10-session low; target = entry + 1.5R; invalidation = daily close below stop","seed":true,"trend":74,"source":"polygon-daily","volume":66,"catalyst":60,"structure":78,"refreshed_at":"2026-08-27T15:10:03.810Z","lookback_sessions":10}',
  'META has to clear $601.86 before this means anything, and it is $25.72 away. It fails below $537.27.',
  '10-session high $601.86, 10-session low $537.27 — $64.59 a share between them. First target $698.75 at 1.5R. Last session traded 1.93x the 10-session average volume. Levels derived from Polygon daily bars on 2026-08-26; seed data, not a scanner result.',
  '{"hold":true,"type":"price_cross","level":601.86}',
  '{"type":"close_below","level":537.27,"reason":"A daily close below $537.27 takes out the low this idea leans on."}',
  537.27,
  '[{"label":"first target","price":698.75}]',
  jsonb_build_object(
    'price', 576.14,
    'source_ts', '2026-08-26T04:00:00.000Z'::timestamptz,
    'received_ts', now(),
    'freshness', 'delayed',
    'delay_reason', 'entitlement'
  ),
  now() + interval '7 days',
  '00000000-0000-0000-0000-000000000000'
),
(
  '11111111-1111-4111-8111-000000000002', 'NVDA', 'day_trade', 'buy_to_open', 'watching',
  66, 'B', 'B',
  '{"rule":"entry = 10-session high; stop = 10-session low; target = entry + 1.5R; invalidation = daily close below stop","seed":true,"trend":72,"source":"polygon-daily","volume":58,"catalyst":55,"structure":70,"refreshed_at":"2026-08-27T15:10:17.738Z","lookback_sessions":10}',
  'NVDA has to clear $227.92 before this means anything, and it is $18.26 away. It fails below $207.25.',
  '10-session high $227.92, 10-session low $207.25 — $20.67 a share between them. First target $258.93 at 1.5R. Last session traded 1.64x the 10-session average volume. Levels derived from Polygon daily bars on 2026-08-26; seed data, not a scanner result.',
  '{"hold":true,"type":"price_cross","level":227.92}',
  '{"type":"close_below","level":207.25,"reason":"A daily close below $207.25 takes out the low this idea leans on."}',
  207.25,
  '[{"label":"first target","price":258.93}]',
  jsonb_build_object(
    'price', 209.66,
    'source_ts', '2026-08-26T04:00:00.000Z'::timestamptz,
    'received_ts', now(),
    'freshness', 'delayed',
    'delay_reason', 'entitlement'
  ),
  now() + interval '7 days',
  '00000000-0000-0000-0000-000000000000'
),
(
  '11111111-1111-4111-8111-000000000003', 'AMD', 'day_trade', 'buy_to_open', 'forming',
  58, 'C', 'C+',
  '{"rule":"entry = 10-session high; stop = 10-session low; target = entry + 1.5R; invalidation = daily close below stop","seed":true,"trend":55,"source":"polygon-daily","volume":48,"catalyst":50,"structure":60,"refreshed_at":"2026-08-27T15:10:31.575Z","lookback_sessions":10}',
  'AMD has to clear $517.35 before this means anything, and it is $36.42 away. It fails below $451.',
  '10-session high $517.35, 10-session low $451 — $66.35 a share between them. First target $616.88 at 1.5R. Last session traded 0.77x the 10-session average volume. Levels derived from Polygon daily bars on 2026-08-26; seed data, not a scanner result.',
  '{"hold":true,"type":"price_cross","level":517.35}',
  '{"type":"close_below","level":451,"reason":"A daily close below $451 takes out the low this idea leans on."}',
  451,
  '[{"label":"first target","price":616.88}]',
  jsonb_build_object(
    'price', 480.93,
    'source_ts', '2026-08-26T04:00:00.000Z'::timestamptz,
    'received_ts', now(),
    'freshness', 'delayed',
    'delay_reason', 'entitlement'
  ),
  now() + interval '7 days',
  '00000000-0000-0000-0000-000000000000'
),
(
  '11111111-1111-4111-8111-000000000004', 'TSLA', 'day_trade', 'buy_to_open', 'invalidated',
  40, 'C', 'C',
  '{"rule":"entry = 10-session high; stop = 10-session low; target = entry + 1.5R; invalidation = daily close below stop","seed":true,"trend":38,"source":"polygon-daily","volume":44,"catalyst":45,"structure":35,"refreshed_at":"2026-08-27T15:10:45.353Z","lookback_sessions":10}',
  'This one is off the table — TSLA lost the low the idea leaned on at $325.24.',
  '10-session high $366.5, 10-session low $325.24 — $41.26 a share between them. First target $428.39 at 1.5R. Last session traded 0.8x the 10-session average volume. Levels derived from Polygon daily bars on 2026-08-26; seed data, not a scanner result.',
  '{"hold":true,"type":"price_cross","level":366.5}',
  '{"type":"close_below","level":325.24,"reason":"A daily close below $325.24 takes out the low this idea leans on.","invalidated_at":"2026-08-27T12:06:04.015245+00:00"}',
  325.24,
  '[{"label":"first target","price":428.39}]',
  jsonb_build_object(
    'price', 345.82,
    'source_ts', '2026-08-26T04:00:00.000Z'::timestamptz,
    'received_ts', now(),
    'freshness', 'delayed',
    'delay_reason', 'entitlement'
  ),
  now() + interval '7 days',
  '00000000-0000-0000-0000-000000000000'
)
on conflict (id) do nothing;

-- active thesis for the lead (META) setup
insert into theses (
  id, symbol, mode, timeframe, setup_id, intent, summary_plain, evidence, status
) values (
  '22222222-2222-4222-8222-000000000001', 'META', 'day_trade', '5m',
  '11111111-1111-4111-8111-000000000001', 'buy_to_open',
  'Buyers are defending an important level.',
  '{"seed": true, "support_tests": 3, "support_level": 480, "rvol": 1.6, "missing": "no hold above 504 yet"}',
  'active'
)
on conflict (id) do nothing;

-- market session row for today so the client has an honest market status source
insert into market_sessions (session_date, status, notes)
values (current_date, 'unknown', 'Seed row - replaced by the market-calendar worker.')
on conflict (session_date) do nothing;

insert into system_status (component, healthy, detail, updated_at) values
  ('database', true, '{"note": "local seed"}', now())
on conflict (component) do update set healthy = excluded.healthy, updated_at = now();
