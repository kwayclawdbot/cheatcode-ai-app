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
-- rooms - core set per mode (08_COMMUNITY_SPEC §3)
-- config.intel_eligible = false until community-intelligence terms are disclosed
-- =====================================================================
insert into rooms (type, mode, slug, name, description, config) values
  -- Day Trade: fast, session-based, archived by trading day
  ('core','day_trade','dt-market-open',        'Market Open',        'What is moving as the session starts.',                     '{"intel_eligible": false}'),
  ('core','day_trade','dt-live-setups',        'Live Setups',        'Setups Kai and members are watching right now.',            '{"intel_eligible": false}'),
  ('core','day_trade','dt-trade-ready',        'Trade Ready',        'Setups that have met their entry condition.',                '{"intel_eligible": false}'),
  ('core','day_trade','dt-active-trades',      'Active Trades',      'Open risk, management, and exits in progress.',              '{"intel_eligible": false}'),
  ('core','day_trade','dt-reviews',            'Reviews',            'What happened and why - process before outcome.',            '{"intel_eligible": false}'),
  ('core','day_trade','dt-beginner-questions', 'Beginner Questions', 'No question is too basic here.',                             '{"intel_eligible": false}'),
  -- Swing Trade: thesis-led, persistent through the position lifecycle
  ('core','swing','sw-new-ideas',        'New Ideas',        'Fresh theses looking for confirmation.',                 '{"intel_eligible": false}'),
  ('core','swing','sw-entry-watch',      'Entry Watch',      'Ideas waiting on a level, a catalyst, or volume.',        '{"intel_eligible": false}'),
  ('core','swing','sw-active-swings',    'Active Swings',    'Positions being carried and managed.',                   '{"intel_eligible": false}'),
  ('core','swing','sw-catalysts',        'Catalysts',        'Earnings, filings, and events that change a thesis.',     '{"intel_eligible": false}'),
  ('core','swing','sw-position-updates', 'Position Updates', 'Adds, trims, stops moved, theses changed.',              '{"intel_eligible": false}'),
  ('core','swing','sw-weekly-review',    'Weekly Review',    'What the week taught us.',                               '{"intel_eligible": false}'),
  -- Investing: long-term, goal and research oriented
  ('core','invest','iv-portfolio-building', 'Portfolio Building', 'Building a portfolio on purpose, not by accident.',   '{"intel_eligible": false}'),
  ('core','invest','iv-stock-research',     'Stock Research',     'Digging into individual businesses.',                 '{"intel_eligible": false}'),
  ('core','invest','iv-etfs',               'ETFs',               'Index and sector funds, and what is inside them.',    '{"intel_eligible": false}'),
  ('core','invest','iv-fundamentals',       'Fundamentals',       'Revenue, margins, cash flow, and what they mean.',    '{"intel_eligible": false}'),
  ('core','invest','iv-dividends',          'Dividends',          'Income, payout safety, and reinvestment.',            '{"intel_eligible": false}'),
  ('core','invest','iv-beginner-investing', 'Beginner Investing', 'Start here if you are new to investing.',             '{"intel_eligible": false}'),
  ('core','invest','iv-reviews',            'Reviews',            'Portfolio check-ins and decisions revisited.',        '{"intel_eligible": false}')
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
  '{"seed": true, "structure": 78, "volume": 66, "trend": 74, "catalyst": 60}',
  'Buyers are defending an important level.',
  'Support held 3 times at 480; relative volume 1.6x average; no hold above 504 yet - the missing A.',
  '{"type": "price_cross", "level": 504, "hold": true}',
  '{"type": "close_below", "level": 460}',
  460,
  '[540]',
  jsonb_build_object(
    'price', 502.40,
    'source_ts', (now() - interval '15 minutes'),
    'received_ts', now(),
    'freshness', 'delayed'
  ),
  now() + interval '1 day',
  '00000000-0000-0000-0000-000000000000'
),
(
  '11111111-1111-4111-8111-000000000002', 'NVDA', 'day_trade', 'buy_to_open', 'watching',
  66, 'B', 'B',
  '{"seed": true, "structure": 70, "volume": 58, "trend": 72, "catalyst": 55}',
  'Price is pausing after a strong run, not breaking down.',
  'Consolidating in the upper third of the prior range; relative volume 0.9x average; needs a reclaim of 128.50 with volume to confirm continuation.',
  '{"type": "price_cross", "level": 128.50, "hold": true}',
  '{"type": "close_below", "level": 118.00}',
  118.00,
  '[136.00]',
  jsonb_build_object(
    'price', 126.85,
    'source_ts', (now() - interval '15 minutes'),
    'received_ts', now(),
    'freshness', 'delayed'
  ),
  now() + interval '1 day',
  '00000000-0000-0000-0000-000000000000'
),
(
  '11111111-1111-4111-8111-000000000003', 'AMD', 'day_trade', 'buy_to_open', 'forming',
  58, 'C', 'C+',
  '{"seed": true, "structure": 60, "volume": 48, "trend": 55, "catalyst": 50}',
  'The shape is right, but nobody has shown up to buy it yet.',
  'Higher lows into 162 resistance; relative volume 0.7x average - the base is thin and a move without volume is unreliable.',
  '{"type": "price_cross", "level": 162.00, "hold": true}',
  '{"type": "close_below", "level": 152.00}',
  152.00,
  '[172.00]',
  jsonb_build_object(
    'price', 158.20,
    'source_ts', (now() - interval '15 minutes'),
    'received_ts', now(),
    'freshness', 'delayed'
  ),
  now() + interval '1 day',
  '00000000-0000-0000-0000-000000000000'
),
(
  '11111111-1111-4111-8111-000000000004', 'TSLA', 'day_trade', 'buy_to_open', 'invalidated',
  40, 'C', 'C',
  '{"seed": true, "structure": 35, "volume": 44, "trend": 38, "catalyst": 45}',
  'This one is off the table - the level it needed to hold gave way.',
  'Lost 236 on a closing basis with relative volume 1.9x average on the break; the long thesis is invalidated until a reclaim and hold above 236.',
  '{"type": "price_cross", "level": 244.00, "hold": true}',
  jsonb_build_object(
    'type', 'close_below',
    'level', 236.00,
    'reason', 'Closed below 236 on 1.9x average volume - the support that the setup depended on failed.',
    'invalidated_at', (now() - interval '2 hours')
  ),
  236.00,
  '[258.00]',
  jsonb_build_object(
    'price', 231.10,
    'source_ts', (now() - interval '15 minutes'),
    'received_ts', now(),
    'freshness', 'delayed'
  ),
  now() + interval '1 day',
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
