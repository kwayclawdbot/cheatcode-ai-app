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

-- =====================================================================
-- instruments.meta — company profiles (round 4 / SCHEMA-4)
--
-- Shape is documented in migration 0021 section 1 and SCHEMA-NOTES 1.43:
--   meta.profile = {description, sector, industry, market_cap, next_earnings,
--                   pe, employees, homepage, source, as_of}
-- Every row here carries source:'seed'. The API's weekly refresh
-- (lib/market/profile.ts, Polygon /v3/reference/tickers/{sym}) overwrites the
-- object wholesale with source:'polygon' — a client that sees 'seed' is looking
-- at approximate figures, and that is the point of the field.
--
-- `description` is at most two sentences (spec §3: "The default summary is two
-- sentences maximum. It explains what the company does and why it is relevant
-- to the current event.").
-- =====================================================================
update instruments i
   set meta = coalesce(i.meta, '{}'::jsonb) || jsonb_build_object('profile', p.profile),
       updated_at = now()
  from (values
    ('SPY',  jsonb_build_object(
      'description', 'SPY is the oldest and largest US exchange-traded fund, holding the 500 companies of the S&P 500 in proportion to their market value. It is the reference for "the market" in almost every setup here, so a name moving against SPY is fighting the tape.',
      'sector', 'Index ETF', 'industry', 'Large-cap blend',
      'market_cap', 640000000000::numeric, 'next_earnings', null, 'pe', 27.4,
      'employees', null, 'homepage', 'https://www.ssga.com')),
    ('QQQ',  jsonb_build_object(
      'description', 'QQQ holds the 100 largest non-financial companies listed on the Nasdaq, which makes it roughly half big tech and semiconductors. It is the cleanest read on whether the growth side of the market is leading or lagging.',
      'sector', 'Index ETF', 'industry', 'Large-cap growth',
      'market_cap', 340000000000::numeric, 'next_earnings', null, 'pe', 32.1,
      'employees', null, 'homepage', 'https://www.invesco.com')),
    ('META', jsonb_build_object(
      'description', 'Meta Platforms owns Facebook, Instagram, WhatsApp and Threads, and earns nearly all of its money selling advertising against that attention. Its spending on AI infrastructure is what the market currently argues about.',
      'sector', 'Communication Services', 'industry', 'Interactive Media & Services',
      'market_cap', 1450000000000::numeric, 'next_earnings', '2026-10-28', 'pe', 24.6,
      'employees', 76000, 'homepage', 'https://investor.atmeta.com')),
    ('NVDA', jsonb_build_object(
      'description', 'Nvidia designs the graphics and data-centre processors that most AI models are trained and run on, and sells the software stack that locks developers to them. Its results set the tone for the whole semiconductor complex.',
      'sector', 'Information Technology', 'industry', 'Semiconductors',
      'market_cap', 5100000000000::numeric, 'next_earnings', '2026-11-18', 'pe', 43.2,
      'employees', 36000, 'homepage', 'https://investor.nvidia.com')),
    ('AAPL', jsonb_build_object(
      'description', 'Apple sells the iPhone, Mac, iPad and Watch, plus a services business — App Store, iCloud, payments — that now carries most of the profit growth. Its size means it moves the index as much as the index moves it.',
      'sector', 'Information Technology', 'industry', 'Technology Hardware',
      'market_cap', 3800000000000::numeric, 'next_earnings', '2026-10-29', 'pe', 33.8,
      'employees', 164000, 'homepage', 'https://investor.apple.com')),
    ('TSLA', jsonb_build_object(
      'description', 'Tesla builds electric vehicles, battery storage and the software that runs them, and is valued on the autonomy and energy businesses more than on cars sold. It is the most volatile large-cap on this list, which changes how a stop has to be placed.',
      'sector', 'Consumer Discretionary', 'industry', 'Automobiles',
      'market_cap', 1150000000000::numeric, 'next_earnings', '2026-10-21', 'pe', 71.5,
      'employees', 125000, 'homepage', 'https://ir.tesla.com')),
    ('AMD',  jsonb_build_object(
      'description', 'AMD makes processors and AI accelerators for data centres, PCs and gaming consoles, and is the only credible second source to Nvidia in AI compute. It trades as the high-beta expression of the same demand story.',
      'sector', 'Information Technology', 'industry', 'Semiconductors',
      'market_cap', 780000000000::numeric, 'next_earnings', '2026-11-04', 'pe', 48.9,
      'employees', 28000, 'homepage', 'https://ir.amd.com')),
    ('CRM',  jsonb_build_object(
      'description', 'Salesforce sells the software companies use to run sales, service and marketing, billed as a subscription. Its results are read as a gauge of how freely other companies are spending on software.',
      'sector', 'Information Technology', 'industry', 'Application Software',
      'market_cap', 245000000000::numeric, 'next_earnings', '2026-12-03', 'pe', 29.7,
      'employees', 76000, 'homepage', 'https://investor.salesforce.com')),
    ('MSFT', jsonb_build_object(
      'description', 'Microsoft sells Windows, Office and — the part that matters to the tape — Azure, the cloud platform it rents to companies running AI workloads. Azure growth is the number the market trades on.',
      'sector', 'Information Technology', 'industry', 'Systems Software',
      'market_cap', 3600000000000::numeric, 'next_earnings', '2026-10-27', 'pe', 34.5,
      'employees', 228000, 'homepage', 'https://www.microsoft.com/investor')),
    ('AMZN', jsonb_build_object(
      'description', 'Amazon runs the largest western online store and AWS, the cloud business that produces most of its operating profit. Retail margins and AWS growth pull the stock in different directions, which is why it often ranges.',
      'sector', 'Consumer Discretionary', 'industry', 'Broadline Retail',
      'market_cap', 2450000000000::numeric, 'next_earnings', '2026-10-30', 'pe', 36.2,
      'employees', 1550000, 'homepage', 'https://ir.aboutamazon.com'))
  ) as p(symbol, profile)
 where i.symbol = p.symbol;

-- provenance + as_of on every seeded profile, in one place so no row can forget
update instruments
   set meta = jsonb_set(
                jsonb_set(meta, '{profile,source}', '"seed"'::jsonb, true),
                '{profile,as_of}', to_jsonb(now()), true)
 where meta ? 'profile'
   and coalesce(meta -> 'profile' ->> 'source', 'seed') = 'seed';

-- =====================================================================
-- entitlement_flags — circles_create (round 4)
-- The "+ Create" circle sheet is real but gated (brief §8). The API reads this
-- flag; the create_circle RPC itself does not gate.
-- =====================================================================
insert into entitlement_flags (tier, flag, value) values
  ('free',    'circles_create', 'false'),
  ('premium', 'circles_create', 'true')
on conflict (tier, flag) do update set value = excluded.value;

-- =====================================================================
-- circles (round 4) — two time-boxed setup rooms, opened through the RPC so the
-- seed and the API take exactly the same path (name, slug, expiry, counters,
-- setups.discussion_room_id back-fill).
--
-- The pattern the room is named after lives in setups.annotations.pattern; the
-- two lead seed setups get one so the circles read "META Breakout" /
-- "NVDA Breakout" rather than "META Setup".
-- =====================================================================
update setups
   set annotations = coalesce(annotations, '{}'::jsonb) || '{"pattern":"breakout","seed":true}'::jsonb
 where id in (
   '11111111-1111-4111-8111-000000000001',   -- META
   '11111111-1111-4111-8111-000000000002'    -- NVDA
 );

select open_setup_circle('11111111-1111-4111-8111-000000000001'::uuid, interval '3 days');
select open_setup_circle('11111111-1111-4111-8111-000000000002'::uuid, interval '3 days');
