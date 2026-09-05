/**
 * Fixtures mode (EXPO_PUBLIC_FIXTURES=1).
 * Mirrors the four seed `setups` the SCHEMA lane plants (META B+ forming,
 * NVDA watching, AMD C, TSLA invalidated) and the artboard copy verbatim, so
 * the owner can preview and Playwright can shoot every screen with no network.
 */
import type {
  AlertDetail, AlertLifecycle, AlertsPayload, AlertsSimple, Briefing, Candle, GradedSetup,
  HomePayload, HomeV5, Instrument, MarketStatus, Me, MemoryRow, NotificationRow, Profile,
  RiskPolicy, RoomRow, SearchResult, SetupDetail, SymbolDetail, SymbolWorkspace,
  TradeLanding, WatchingItem,
} from './types';
import type {
  DeskPickResponse, DeskThemeResponse, DeskThemesResponse, DeskWatchlistResponse,
} from '@shared/desk';
import {
  REAL_AAOI_META, REAL_AAOI_THESIS, REAL_PDYN_META, REAL_PDYN_THESIS,
} from './fixtures-desk-real';

const SOURCE_TS = '2026-08-26T13:41:00.000Z';

export const fixtureMarket: MarketStatus = {
  status: 'open',
  label: 'Market open · 9:41 ET',
  session_ts: SOURCE_TS,
  freshness: 'delayed',
};

export const fixtureBriefing: Briefing = {
  id: 'brief-seed',
  title: 'MORNING REPORT · 9:41',
  headline: "Morning, Kway. Here's your market report — **one setup is worth your attention**.",
  lines: [
    { tone: 'market', text: 'Futures flat · CPI print at 10:00 is the day’s risk' },
    { tone: 'attention', text: 'NVDA position 1% from invalidation', action: 'Review' },
    { tone: 'quiet', text: 'Watchlist quiet · AMD `B−` TSLA `C`' },
  ],
};

export const fixtureSetups: GradedSetup[] = [
  {
    id: 'seed-meta',
    symbol: 'META',
    grade_display: 'B+',
    state: 'forming',
    state_label: 'Forming',
    direction: 'long',
    entry: '> 504',
    target: '540',
    invalid: '< 460',
    risk_line: 'Waiting for volume · risk $58 if wrong',
    next_action: 'Open setup',
    quote: { symbol: 'META', price: 508.4, source_ts: SOURCE_TS, freshness: 'delayed' },
  },
  {
    id: 'seed-nvda',
    symbol: 'NVDA',
    grade_display: 'B−',
    state: 'watching',
    state_label: 'Watching',
    direction: 'short',
    entry: '< 902',
    target: '860',
    invalid: '> 912',
    risk_line: '1% from invalidation · risk $44 if wrong',
    next_action: 'Review setup',
    quote: { symbol: 'NVDA', price: 921, source_ts: SOURCE_TS, freshness: 'delayed' },
  },
  {
    id: 'seed-amd',
    symbol: 'AMD',
    grade_display: 'C',
    state: 'forming',
    state_label: 'Forming',
    direction: 'long',
    entry: '> 168',
    target: '178',
    invalid: '< 161',
    risk_line: 'Weak volume · Kai is not acting on this one',
    next_action: 'Open setup',
    quote: { symbol: 'AMD', price: 165.2, source_ts: SOURCE_TS, freshness: 'delayed' },
  },
  {
    id: 'seed-tsla',
    symbol: 'TSLA',
    grade_display: 'C',
    state: 'invalidated',
    state_label: 'Invalidated',
    direction: 'long',
    entry: '> 182',
    target: '196',
    invalid: '< 177',
    risk_line: 'Lost 177 — the idea is done for today',
    next_action: 'See what changed',
    quote: { symbol: 'TSLA', price: 177.5, source_ts: SOURCE_TS, freshness: 'delayed' },
  },
];

export const fixtureWatching: WatchingItem[] = [
  { id: 'w1', symbol: 'META', label: 'META confirms', value: '508.40', kind: 'level', quote: { symbol: 'META', price: 508.4, source_ts: SOURCE_TS, freshness: 'delayed' } },
  { id: 'w2', symbol: 'AAPL', label: 'AAPL earnings', value: '9 days', kind: 'event' },
];

export const fixtureHome: HomePayload = {
  market: fixtureMarket,
  briefing: fixtureBriefing,
  lead_setup: fixtureSetups[0],
  watching: fixtureWatching,
  daily_risk: { cap: 60, used: 0, remaining: 60 },
};

export const fixtureAlerts: AlertsPayload = {
  needs_attention: [
    {
      id: 'a1', symbol: 'NVDA', title: 'NVDA', status: 'triggered',
      grade_change: 'B → B−', age: '4m ago', value: '921.00',
      entry_label: 'Entry 902',
      detail: 'Invalid 912 · 1% away',
      quote: { symbol: 'NVDA', price: 921, source_ts: SOURCE_TS, freshness: 'delayed' },
    },
  ],
  watching: [
    { id: 'a2', symbol: 'META', title: 'META confirms', status: 'active', condition_label: '> 504', value: '508.40', quote: { symbol: 'META', price: 508.4, source_ts: SOURCE_TS, freshness: 'delayed' } },
    { id: 'a3', symbol: 'AAPL', title: 'AAPL earnings', status: 'active', meta: '9 days' },
  ],
  resolved: [
    { id: 'a4', symbol: 'META', title: 'META closed in target zone', status: 'resolved', value: '+$86.40' },
  ],
};

export const fixtureRooms: RoomRow[] = [
  { id: 'r1', slug: 'market-open', name: 'market-open', topic: 'What matters before the bell', mode: 'day_trade', member_hint: '124' },
  { id: 'r2', slug: 'live-setups', name: 'live-setups', topic: 'Setups as they form', mode: 'day_trade', member_hint: '87' },
  { id: 'r3', slug: 'beginner-questions', name: 'beginner-questions', topic: 'No question is too basic', mode: null, member_hint: '36' },
  { id: 'r4', slug: 'swing-ideas', name: 'swing-ideas', topic: 'Multi-day theses', mode: 'swing', member_hint: '52' },
];

export const fixtureInstruments: Instrument[] = [
  { symbol: 'NVDA', name: 'NVIDIA Corporation', last: 1158.07, change_pct: 3.25, quote: { symbol: 'NVDA', price: 1158.07, change_pct: 3.25, source_ts: SOURCE_TS, freshness: 'delayed', delay_reason: 'entitlement' } },
  { symbol: 'AAPL', name: 'Apple Inc.', last: 195.42, change_pct: 1.08, quote: { symbol: 'AAPL', price: 195.42, change_pct: 1.08, source_ts: SOURCE_TS, freshness: 'delayed', delay_reason: 'entitlement' } },
  { symbol: 'TSLA', name: 'Tesla, Inc.', last: 177.5, change_pct: -0.64, quote: { symbol: 'TSLA', price: 177.5, change_pct: -0.64, source_ts: SOURCE_TS, freshness: 'delayed', delay_reason: 'entitlement' } },
  { symbol: 'META', name: 'Meta Platforms, Inc.', last: 508.4, change_pct: 0.92, quote: { symbol: 'META', price: 508.4, change_pct: 0.92, source_ts: SOURCE_TS, freshness: 'delayed', delay_reason: 'entitlement' } },
];

export const fixtureProfile: Profile = {
  user_id: 'fixture-user',
  display_name: 'Kway',
  primary_mode: 'day_trade',
  involvement: 'hands_on',
  memory_enabled: true,
  onboarding: { completed: false },
};

export const fixtureRiskPolicy: RiskPolicy = { daily_loss_cap: 60, max_position_pct: 10, involvement: 'hands_on' };

/** A canned Kai reply, streamed word by word, so fixtures Home shows the real
 *  streaming path (deltas + object frame) without an API. */
export const fixtureReply =
  "The CPI print lands at 10:00. Meaning: the number tells the market how fast prices are rising, and it moves everything at once. " +
  "Decision: I don't want you entering META in the two minutes before it — spreads widen and the level stops being honest. " +
  "Risk: if 504 breaks on the print and then fails back under it, that's the fake move, and this idea is done below 460. " +
  "Prices here are delayed, not live.";

/* ==================================================================== */
/* Round 2 fixtures — setup detail, alerts lifecycle, trade, account.    */
/* Numbers stay coherent with the four seed setups above so a fixtures    */
/* screenshot and a live screenshot tell the same story.                 */
/* ==================================================================== */

/** Deterministic 5-minute bars walking META from 496 to 508.40. */
function makeCandles(start: number, end: number, n: number, stepMs: number, from: number): Candle[] {
  const out: Candle[] = [];
  let price = start;
  const drift = (end - start) / n;
  for (let i = 0; i < n; i += 1) {
    // fixed pseudo-noise: no Math.random, so every screenshot is identical
    const wobble = Math.sin(i * 0.9) * 1.6 + Math.cos(i * 0.37) * 0.9;
    const o = price;
    const c = price + drift + wobble * 0.45;
    const h = Math.max(o, c) + Math.abs(wobble) * 0.4 + 0.3;
    const l = Math.min(o, c) - Math.abs(wobble) * 0.35 - 0.3;
    out.push({
      t: new Date(from + i * stepMs).toISOString(),
      o: +o.toFixed(2), h: +h.toFixed(2), l: +l.toFixed(2), c: +c.toFixed(2),
      v: Math.round(180000 + Math.abs(wobble) * 90000),
    });
    price = c;
  }
  return out;
}

const SESSION_START = Date.parse('2026-08-26T13:30:00.000Z'); // 9:30 ET

export const fixtureCandles: Candle[] = makeCandles(494.2, 508.4, 48, 5 * 60_000, SESSION_START);
export const fixtureCandlesDaily: Candle[] = makeCandles(452, 508.4, 60, 24 * 3600_000, SESSION_START - 60 * 24 * 3600_000);

export const fixtureSetupDetail: SetupDetail = {
  id: 'seed-meta',
  symbol: 'META',
  name: 'Meta Platforms, Inc.',
  grade_display: 'B+',
  state: 'forming',
  state_label: 'Forming',
  direction: 'long',
  quote: { symbol: 'META', price: 508.4, change: 10.56, change_pct: 2.14, source_ts: SOURCE_TS, freshness: 'delayed', delay_reason: 'entitlement' },
  live: {
    stepper: [
      { label: 'Support held', state: 'done' },
      { label: 'Higher lows', state: 'done' },
      { label: 'Reclaimed VWAP', state: 'done' },
      { label: 'Volume 1.4×', state: 'active' },
      { label: 'Close above 504', state: 'todo' },
      { label: 'Entry', state: 'todo' },
    ],
    narration: [
      { text: 'Buyers defended 480 for the third time this week. That is the level this whole idea rests on.', time: '9:22' },
      { text: 'Price reclaimed the volume-weighted average at 9:36 — sellers are no longer in control of the session.', time: '9:36' },
      { text: 'Volume is 1.3× normal. I want 1.4× before I call this confirmed, so I am still waiting.', time: '9:41' },
    ],
    confirmations: [
      { label: 'Support held 3 times at 480', ok: true },
      { label: 'Relative volume 1.6× average', ok: true },
      { label: 'No hold above 504 yet — the missing A', ok: false },
    ],
    technical: 'VWAP reclaimed at 9:36 · RVOL 1.3× (needs 1.4×) · 5m higher lows since 9:15 · ORB high 504.10 · ATR(14) 6.2',
  },
  plan: {
    entry_condition: '5-minute close above 504 with volume',
    entry_zone: '$500.00–504.00',
    entry: 504,
    stop: 478.5,
    invalidation: 'Daily close below $460.00',
    targets: [{ price: 520, label: 'First' }, { price: 540, label: 'Second' }],
    size_suggestion: '$500 · 1 share · risks $24',
    scenarios: [
      { label: 'If it works', amount: '+$18', plain: 'at first target $520', tone: 'good' },
      { label: 'If it fails', amount: '−$24', plain: 'at stop $478.50', tone: 'bad' },
      { label: 'If nothing happens', amount: null, plain: 'the setup expires at the close and costs you nothing', tone: 'neutral' },
    ],
    risk_reward: '1.5 : 1',
  },
  learn: {
    why_plain:
      'When buyers defend the same price twice, sellers who bet against it start giving up. If volume rises as price pushes back above the old breakout level, the crowd that sold often has to buy back — which fuels the move.',
    evidence: [
      { label: 'Support held 3 times at 480', ok: true },
      { label: 'Relative volume 1.6× average', ok: true },
      { label: 'No hold above 504 yet', ok: false },
    ],
    similar_example: 'NVDA · May 12 — same support-reclaim shape, graded B+. Reached its first target in 3 hours.',
    quiz: {
      q: 'What would make this setup invalid?',
      options: ['A close below $460', 'Price touching $504', 'Volume increasing'],
      answer_idx: 0,
    },
  },
  explain: {
    beginner:
      'META keeps bouncing off $480. If it can close above $504 with more people trading than usual, that is the signal buyers have taken over. Below $460 the idea is wrong and you walk away.',
    intermediate:
      'Support at 480 has been tested three times and held. Price reclaimed VWAP at 9:36 on rising relative volume. A 5-minute close above the 504 breakout level with RVOL ≥ 1.4× confirms; a daily close under 460 invalidates.',
    advanced:
      'Triple-tap at 480 into a VWAP reclaim, ORB high 504.10, ATR(14) 6.2. Entry on 5m close > 504 with RVOL ≥ 1.4×; stop 478.50 under the swing; first target 520 (1.5R), second 540. Invalidation on daily close < 460.',
    family:
      'Think of $480 as the floor of a room. People keep testing the floor and it holds. If enough of them push up through the ceiling at $504, the room gets taller. If the floor breaks at $460, the room was never safe.',
  },
  fit: {
    ok: true,
    reasons: ['Risk per trade $24 is inside your $60 daily cap', 'Day-trade horizon matches your mode'],
  },
  next_action: 'Watch it',
  discussion_room_id: null,
};

export const fixtureAlertLifecycle: AlertLifecycle = {
  needs_attention: fixtureAlerts.needs_attention,
  watching: [
    { id: 'a2', symbol: 'META', title: 'Watch META for a break above 504', status: 'active', condition_label: '> 504', value: '508.40', monitoring: 'armed_no_feed', quote: { symbol: 'META', price: 508.4, source_ts: SOURCE_TS, freshness: 'delayed', delay_reason: 'entitlement' } },
    { id: 'a3', symbol: 'AAPL', title: 'Tell me when AAPL reports earnings', status: 'draft', meta: '9 days' },
  ],
  active_trades: [],
  triggered: [
    { id: 'a5', symbol: 'NVDA', title: 'NVDA crossed below 902', status: 'triggered', value: '901.20', age: '4m ago' },
  ],
  history: fixtureAlerts.resolved,
  empty_copy: "Kai isn't watching anything for you yet.",
};

export const fixtureAlertDetail: AlertDetail = {
  id: 'a2',
  symbol: 'META',
  natural_language: 'Watch META for a break above 504',
  summary_plain: "I'll tell you when META trades above $504.",
  status: 'active',
  monitoring: 'armed_no_feed',
  condition_label: '> 504',
  structured: [
    { label: 'META last price', value: 'above 504' },
    { label: 'Confirmed by', value: '5-minute close' },
    { label: 'Fires', value: 'once' },
  ],
  data_dependency: [
    { label: 'Feed', value: 'Delayed 15m (your plan)' },
    { label: 'Timeframe', value: '5m bars' },
    { label: 'Session', value: 'Regular hours only' },
  ],
  history: [
    { at: '2026-08-26T13:15:00.000Z', label: 'Drafted from the META setup' },
    { at: '2026-08-26T13:16:00.000Z', label: 'Activated by you' },
  ],
  trace: [
    { label: 'META B+ setup', route: '/setup/seed-meta' },
    { label: 'Tap-to-learn', route: null },
  ],
  quote: { symbol: 'META', price: 508.4, source_ts: SOURCE_TS, freshness: 'delayed', delay_reason: 'entitlement' },
  created_at: '2026-08-26T13:15:00.000Z',
  expires_at: null,
};

export const fixtureTradeLanding: TradeLanding = {
  account_strip: { equity: 10000, buying_power: 10000, change_pct: 0, label: 'PAPER' },
  continue_items: [
    { id: 'c1', title: 'META is 4.40 above 504', detail: 'Your draft alert is ready to activate', cta: 'Continue', route: '/alert/a2' },
    { id: 'c2', title: 'META B+ setup', detail: 'Waiting for volume · risk $58 if wrong', cta: 'Open', route: '/setup/seed-meta' },
  ],
  kai_opportunities: fixtureSetups.slice(0, 2),
  watchlist: fixtureInstruments,
  movers: [
    { symbol: 'NVDA', name: 'NVIDIA Corporation', last: 1158.07, change_pct: 3.25, quote: { symbol: 'NVDA', price: 1158.07, source_ts: SOURCE_TS, freshness: 'delayed', delay_reason: 'entitlement' } },
    { symbol: 'AMD', name: 'Advanced Micro Devices', last: 165.2, change_pct: -1.42, quote: { symbol: 'AMD', price: 165.2, source_ts: SOURCE_TS, freshness: 'delayed', delay_reason: 'entitlement' } },
    { symbol: 'TSLA', name: 'Tesla, Inc.', last: 177.5, change_pct: -0.64, quote: { symbol: 'TSLA', price: 177.5, source_ts: SOURCE_TS, freshness: 'delayed', delay_reason: 'entitlement' } },
  ],
  catalysts: [{ label: 'CPI print', when: '10:00 ET' }],
};

export const fixtureSearch: SearchResult[] = [
  { kind: 'instrument', symbol: 'META', name: 'Meta Platforms, Inc.', exchange: 'NASDAQ' },
  { kind: 'instrument', symbol: 'MSFT', name: 'Microsoft Corporation', exchange: 'NASDAQ' },
  { kind: 'kai_question', text: 'safe AI stock under $200' },
];

export const fixtureSymbolDetail: SymbolDetail = {
  symbol: 'META',
  name: 'Meta Platforms, Inc.',
  exchange: 'NASDAQ',
  quote: { symbol: 'META', price: 508.4, change: 10.56, change_pct: 2.14, source_ts: SOURCE_TS, freshness: 'delayed', delay_reason: 'entitlement' },
  setup: fixtureSetups[0],
  levels: { entry: 504, target: 540, invalid: 460, support: 480 },
  kai_interpretation: {
    text: 'B+ quality · Forming · Moderate risk — waiting for stronger volume.',
    grade: 'B+',
    last_updated: SOURCE_TS,
  },
  your_context: {
    watchlisted: true,
    alerts: [{ id: 'a2', label: 'Break above 504' }],
    plans: [],
  },
  evidence: {
    news: [
      { id: 'n1', title: 'Meta expands its AI assistant to more markets', source: 'Reuters', published_utc: '2026-08-26T11:02:00.000Z' },
      { id: 'n2', title: 'Ad spend holds up through the quarter, analysts say', source: 'Bloomberg', published_utc: '2026-08-25T20:41:00.000Z' },
      { id: 'n3', title: 'Reality Labs losses narrow for a second quarter', source: 'CNBC', published_utc: '2026-08-25T14:12:00.000Z' },
    ],
  },
  community: { room_id: null, thread_summary: null },
  lenses: [
    { mode: 'day_trade', label: 'Day Trade', text: 'B+ · reclaim of 504 with volume is the trade. Risk $24 to the 478.50 stop.' },
    { mode: 'swing', label: 'Swing', text: 'No active swing setup. The weekly range is 460–540 and price sits near the top.' },
    { mode: 'invest', label: 'Invest', text: 'Managed investing arrives in a later release.' },
  ],
  candles: fixtureCandles,
};

export const fixtureMe: Me = {
  profile: fixtureProfile,
  risk_policy: fixtureRiskPolicy,
  paper: { equity: 10000, cash: 10000, buying_power: 10000, starting_balance: 10000, reset_count: 0, last_reset_at: null, can_reset: true },
  subscription: {
    tier: 'free',
    status: 'none',
    renews_at: null,
    plain: 'Free. Paper trading, five watches at a time, and the beginner rooms.',
  },
  entitlements: [
    { key: 'alerts_max_active', label: 'Alerts Kai watches at once', value_plain: '5 at a time', included: true },
    { key: 'community_post_scope', label: 'Where you can post', value_plain: 'Beginner rooms', included: true },
    { key: 'paper_trading', label: 'Paper trading', value_plain: 'Included', included: true },
    { key: 'live_market_data', label: 'Real-time prices', value_plain: 'Premium', included: false },
    { key: 'broker_connect', label: 'Connect a real broker', value_plain: 'Premium', included: false },
    { key: 'lms', label: 'Course library', value_plain: 'Premium', included: false },
  ],
  memory_enabled: true,
  settings: {
    explanation_level: 'beginner',
    quiet_hours: { enabled: true, start: '21:00', end: '07:00' },
    notifications: { per_mode: { day_trade: true, swing: true, invest: false } },
    accessibility: { reduced_motion: false, text_scale: 1 },
    // Round 5: the master switch defaults on, and no category is switched off
    // — an absent key means on, exactly as the server reads it.
    push_enabled: true,
    notification_categories: {},
  },
  // Round 6. THE SAMPLE ACCOUNT IS NOT STAFF, and never will be: fixtures mode
  // is the owner-preview and Playwright path, and an operator's board rendered
  // over sample people would show sample revenue and a sample audit trail that
  // look exactly like real ones. Staff is a fact about a database row.
  staff: { is_staff: false, role: null, plain: 'You do not have staff access.' },
};

export const fixtureNotifications: NotificationRow[] = [
  { id: 'n1', group: 'action_required', title: 'META alert is ready to activate', body: 'You drafted "break above 504" during the walkthrough.', route: '/alert/a2', created_at: '2026-08-26T13:16:00.000Z', read_at: null },
  { id: 'n2', group: 'changes', title: 'NVDA slipped from B to B−', body: 'Volume fell away from the level.', route: '/setup/seed-nvda', created_at: '2026-08-26T13:37:00.000Z', read_at: null },
  { id: 'n3', group: 'fyi', title: 'Your morning report is ready', body: 'One setup is worth your attention.', route: '/home', created_at: '2026-08-26T13:41:00.000Z', read_at: '2026-08-26T13:42:00.000Z' },
];

export const fixtureMemory: MemoryRow[] = [
  { id: 'm1', kind: 'preference', content: 'You prefer plain English before the technical read.', created_at: '2026-08-20T15:00:00.000Z' },
  { id: 'm2', kind: 'pattern', content: 'You size down when a setup is graded below B.', created_at: '2026-08-22T18:30:00.000Z' },
];

/* ==================================================================== */
/* V5 fixtures                                                           */
/* ==================================================================== */

/** The contextual sheet's canned answer (V5-W2 artboard copy). */
export const fixtureSheetReply = (symbol: string) =>
  `Volume faded on both pushes at 504 — buyers haven't committed yet. I've marked both attempts on your chart. ` +
  `${symbol} is still inside the range, so nothing has invalidated; it just hasn't confirmed. Prices here are delayed, not live.`;

/** V5-H1 — one opening line, one priority, three "also watching" rows. */
export const fixtureHomeV5: HomeV5 = {
  mode: 'day_trade',
  market: fixtureMarket,
  opening_line: 'Good morning, Kway. One setup needs your attention.',
  priority: {
    kind: 'setup',
    id: 'seed-meta',
    symbol: 'META',
    grade_display: 'B+',
    state_label: 'Approaching entry',
    state_tone: 'market',
    title: null,
    detail: 'Buyers holding 480 · volume 1.6× · risk $58 if wrong',
    chart_note: 'Entry 504 · 0.4% away',
    levels: { entry: 504, target: 540, invalid: 460 },
    quote: { symbol: 'META', price: 508.4, change: 10.56, change_pct: 2.14, source_ts: SOURCE_TS, freshness: 'delayed', delay_reason: 'entitlement' },
    candles: fixtureCandles,
    primary_action: { label: 'Review setup', route: '/symbol/META?tab=overview&setup=seed-meta' },
  },
  also_watching: [
    { id: 'aw1', symbol: 'NVDA', text: '1% from invalidation · B−', tone: 'attention', action: { label: 'Review', route: '/symbol/NVDA?tab=overview&setup=seed-nvda' } },
    { id: 'aw2', symbol: 'AAPL', text: 'Earnings in 9 days · reminder set', tone: 'neutral', action: null },
    { id: 'aw3', symbol: 'CPI', text: "10:00 print · the day's main risk", tone: 'neutral', action: null },
  ],
  briefing: fixtureBriefing,
  daily_risk: { cap: 60, used: 0, remaining: 60 },
};

/**
 * The honest-nothing day.
 *
 * Nothing is close, nothing moved on the names the user cares about, and Kai's
 * report says so. This is a real state the product has to render well — the
 * wake-up must say "there is nothing" rather than invent a reason to sound
 * busy. Reachable in fixtures preview at `/home?fixture=quiet`.
 */
export const fixtureHomeV5Quiet: HomeV5 = {
  mode: 'day_trade',
  market: { status: 'closed', label: 'Market closed · 6:12 ET', session_ts: SOURCE_TS, freshness: 'closed' },
  opening_line: 'Nothing needs you right now, Kway.',
  priority: null,
  also_watching: [],
  briefing: null,
  daily_risk: { cap: 60, used: 0, remaining: 60 },
};

/** V5-W1 — the one META workspace, setup as a module inside it. */
export const fixtureWorkspace: SymbolWorkspace = {
  symbol: 'META',
  name: 'Meta Platforms, Inc.',
  exchange: 'NASDAQ',
  quote: { symbol: 'META', price: 504.18, change: 10.56, change_pct: 2.14, source_ts: SOURCE_TS, freshness: 'delayed', delay_reason: 'entitlement' },
  context_line: 'Watching · no position',
  watchlisted: true,
  candles: fixtureCandles,
  overview: {
    setup_module: {
      id: 'seed-meta',
      state: 'forming',
      state_label: 'Setup forming',
      grade_display: 'B+',
      distance_label: '0.4% from entry',
      entry: '> 504',
      target: '540',
      invalid: '< 460',
      primary_action: { label: 'Watch this', route: '/symbol/META?tab=overview&setup=seed-meta' },
      note: 'Waiting for volume · risk $58 if wrong',
      following: false,
    },
    position: null,
    key_levels: { entry: 504, target: 540, invalid: 460, support: 480 },
    what_changed: [
      'Reclaimed 480 on the second attempt',
      'Volume 1.6× the 20-day average',
      'Two rejections at 504 — buyers have not committed yet',
    ],
    volume_note: 'Vol 1.6× avg',
  },
  kai: {
    interpretation: 'B+ quality · forming · moderate risk. Price is holding above the 480 shelf, but the two pushes into 504 both faded on volume. A clean 5-minute close above 504 is what turns this from an idea into a trade.',
    grade: 'B+',
    last_updated: SOURCE_TS,
    scenarios: [
      { label: 'If it works', amount: '+$174', plain: 'A close above 504 opens the run to 540.', tone: 'good' },
      { label: 'If it fails', amount: '−$58', plain: 'Losing 460 ends the idea — the stop takes you out.', tone: 'bad' },
    ],
    research_refs: [
      { id: 'n1', title: 'Meta expands its AI assistant to more markets', source: 'Reuters', url: null, published_utc: '2026-08-26T11:02:00.000Z' },
      { id: 'n2', title: 'Ad spend holds up through the quarter, analysts say', source: 'Bloomberg', url: null, published_utc: '2026-08-25T20:41:00.000Z' },
    ],
  },
  plan: {
    existing_plan_id: null,
    suggested: {
      entry: 504,
      stop: 460,
      targets: [540],
      size: '3 shares · $58 at risk',
      rr: '3.0 : 1',
      scenarios: [
        { label: 'If the target hits', amount: '+$174', plain: 'You close at 540.', tone: 'good' },
        { label: 'If you are stopped', amount: '−$58', plain: 'The stop executes at 460.', tone: 'bad' },
      ],
    },
    order_state: null,
    daily_risk: { cap: 60, used: 0, remaining: 60 },
  },
  community: {
    room_id: 'r2',
    thread_summary: 'Members are split on whether 504 holds — most want a volume close before entering.',
    sentiment: { sample: 28, split: 62, label: '62% bullish' },
    verified_claims: ['volume claim verified'],
    message_count: 28,
  },
  history: [
    { id: 'h1', label: 'Kai graded this B+', at: '2026-08-26T13:15:00.000Z', route: null },
    { id: 'h2', label: 'You set an alert on 504', at: '2026-08-26T13:16:00.000Z', route: '/alert/a2' },
  ],
  actions: {
    buy_label: 'Buy',
    sell_label: 'Sell',
    buy_side: 'buy_to_open',
    sell_side: 'sell_short',
    note: 'Setup forming — Kai suggests waiting for confirmation',
  },
};

/** V5-A1 — Attention · Monitoring · History. */
export const fixtureAlertsSimple: AlertsSimple = {
  attention: [
    {
      id: 'a1',
      symbol: 'NVDA',
      message: 'Fell to 921 — 1% from your invalidation at 912.',
      grade_change: 'B → B−',
      age: '4m ago',
      quote: { symbol: 'NVDA', price: 921, source_ts: SOURCE_TS, freshness: 'delayed', delay_reason: 'entitlement' },
    },
  ],
  monitoring: [
    { id: 'a2', symbol: 'META', condition: 'Holds above 504 with volume', value: '508.40', value_tone: 'market', route: '/alert/a2', quote: { symbol: 'META', price: 508.4, source_ts: SOURCE_TS, freshness: 'delayed', delay_reason: 'entitlement' }, status: 'active' },
    { id: 'p1', symbol: 'META', condition: 'Position · stop 460 · target 540', value: '+$54', value_tone: 'positive', route: '/position/p1', quote: null, status: 'active' },
    { id: 'a3', symbol: 'AAPL', condition: 'Earnings gap-risk briefing', value: '9 days', value_tone: 'neutral', route: '/alert/a3', quote: null, status: 'active' },
    { id: 'a6', symbol: 'SPY', condition: 'CPI print reaction', value: '10:00', value_tone: 'attention', route: '/alert/a6', quote: null, status: 'active' },
  ],
  history: fixtureAlerts.resolved,
  empty_copy: "Kai isn't watching anything for you yet.",
};

/* ==================================================================== */
/* Round 4 fixtures — the prototype boards, verbatim copy.               */
/* ==================================================================== */

import type {
  AlertCard, AlertsRound4, ConversationsPayload, Experience, FocusKey,
  KaiProfile, RuleAdherence, TickerPage,
} from './types';
import { EXPERIENCE_LABEL, EXPERIENCE_VOICE, MODE_LABEL, focusList, kaiVoice } from '../features/account/profile';

const DAY_COMPONENTS = [
  { key: 'trend', label: 'Trend', status: 'Strong', strength: 4, explanation: '20 and 50 EMA both rising on the 5-minute; higher lows since 9:32.' },
  { key: 'structure', label: 'Structure', status: 'Confirmed', strength: 4, explanation: 'Three closes above the 504 shelf that capped price twice yesterday.' },
  { key: 'volume', label: 'Volume', status: 'Healthy', strength: 3, explanation: '1.6× the 20-day average at this time of day.' },
  { key: 'rr', label: 'Risk / Reward', status: 'Favorable', strength: 4, explanation: 'Stop 498 against a 520 first target from a 504–507 entry.' },
  { key: 'market', label: 'Market', status: 'Neutral', strength: 3, explanation: 'SPY is up but CPI at 10:00 keeps the tape undecided.' },
];

const SWING_COMPONENTS = [
  { key: 'trend', label: 'Trend', status: 'Strong', strength: 4, explanation: 'Daily trend up since the July base.' },
  { key: 'entry', label: 'Entry quality', status: 'Forming', strength: 3, explanation: 'Price is still inside the 934 decision area.' },
  { key: 'catalyst', label: 'Catalyst risk', status: 'Waiting', strength: 2, explanation: 'Earnings land inside the intended hold window.' },
  { key: 'rr', label: 'Risk / Reward', status: 'Favorable', strength: 4, explanation: '912 stop against a 988 first target.' },
  { key: 'market', label: 'Market', status: 'Supportive', strength: 3, explanation: 'Semis leading the index over the last five sessions.' },
];

export const fixtureAlertCards: AlertCard[] = [
  {
    id: 'alert-meta-1',
    symbol: 'META',
    company: 'Meta Platforms',
    mode_label: 'Day Trade',
    direction_label: 'Long',
    instrument_label: 'equity',
    grade: 'A−',
    score: 87,
    state: 'entry_reached',
    state_label: 'Triggered',
    triggered_at_label: '9:38 AM',
    headline: 'Breakout confirmation detected',
    what_changed: 'META reclaimed $504 with 1.6× volume across three five-minute candles.',
    company_summary: 'Meta Platforms owns Facebook, Instagram and WhatsApp. Shares are trading with elevated volume after buyers reclaimed a major intraday level.',
    trade: { direction: 'Long', current: '506.12', entry: '504–507', stop: '498', target: '520', rr: '2.4:1', hold: 'intraday', expires: '4:00 PM ET' },
    score_components: DAY_COMPONENTS,
    kai_interpretation: "Volume is the piece that was missing this morning. It fails if price closes back under 498 — that's your exit, not a suggestion.",
    fit: { risk_amount: '$58', cap_line: 'fits daily cap', conflicts: 'No conflicts' },
    community: { sample: 41, bullish_pct: 62, common_level: '504', verification: 'verified' },
    primary_action: { label: 'Open Trade Portal', kind: 'entry_reached' },
    freshness_line: 'Quote 9:41:02 ET · live · received 8s ago',
  },
  {
    id: 'alert-tsla-1',
    symbol: 'TSLA',
    company: 'Tesla',
    mode_label: 'Day Trade',
    direction_label: 'Long',
    instrument_label: 'equity',
    grade: 'B+',
    score: 82,
    state: 'ready',
    state_label: 'Triggered',
    triggered_at_label: '9:22 AM',
    headline: 'Entry zone reached',
    what_changed: 'Pulled back into 242–245 on lighter selling. Invalidates below 238.',
    company_summary: 'Tesla builds electric vehicles and energy storage. Volume is thin into the pullback, which is what Kai wanted to see.',
    trade: { direction: 'Long', current: '243.60', entry: '242–245', stop: '238', target: '256', rr: '2.1:1', hold: 'intraday', expires: '4:00 PM ET' },
    score_components: DAY_COMPONENTS.map((c) => (c.key === 'volume' ? { ...c, status: 'Forming', strength: 2 } : c)),
    kai_interpretation: 'The pullback is orderly. Below 238 the idea is wrong and Kai drops it.',
    fit: { risk_amount: '$44', cap_line: 'fits daily cap', conflicts: 'No conflicts' },
    community: { sample: 26, bullish_pct: 55, common_level: '242', verification: 'unverified' },
    primary_action: { label: 'Review trade', kind: 'ready' },
    freshness_line: 'Quote 9:41:02 ET · live · received 8s ago',
  },
  {
    id: 'alert-amd-1',
    symbol: 'AMD',
    company: 'Advanced Micro',
    mode_label: 'Swing',
    direction_label: 'Long',
    instrument_label: 'equity',
    grade: 'C+',
    score: 64,
    state: 'invalidated',
    state_label: 'Grade changed',
    triggered_at_label: '9:05 AM',
    headline: 'Downgraded from B−',
    what_changed: 'Volume faded through the morning and the market turned neutral.',
    company_summary: 'Advanced Micro Devices designs processors and AI accelerators. The move that earned the higher grade lost its participation.',
    trade: { direction: 'Long', current: '148.90', entry: '152–154', stop: '146', target: '167', rr: '1.4:1', hold: 'days', expires: 'Sep 4' },
    score_components: SWING_COMPONENTS.map((c) => (c.key === 'market' ? { ...c, status: 'Neutral', strength: 2 } : c)),
    kai_interpretation: 'The thesis is not dead, but the edge that made it a B− is gone until volume returns.',
    fit: { risk_amount: '$31', cap_line: 'fits daily cap', conflicts: 'No conflicts' },
    community: { sample: 18, bullish_pct: 44, common_level: '152', verification: 'unverified' },
    primary_action: { label: 'See what changed', kind: 'invalidated' },
    freshness_line: 'Quote 9:41:02 ET · delayed 15m',
  },
];

export const fixtureWatchingCards: AlertCard[] = [
  {
    id: 'alert-nvda-1',
    symbol: 'NVDA',
    company: 'NVIDIA',
    mode_label: 'Swing',
    direction_label: 'Long',
    instrument_label: 'equity',
    grade: 'B',
    score: 74,
    state: 'forming',
    state_label: 'Watching',
    triggered_at_label: '8:58 AM',
    headline: 'Waiting for support to hold',
    what_changed: 'Needs a defended close above 934 with volume. Invalidates at 912.',
    company_summary: 'NVIDIA sells the accelerators most AI training runs on. The level Kai wants defended is the base of the July advance.',
    trade: { direction: 'Long', current: '921.00', entry: '> 934', stop: '912', target: '988', rr: '2.5:1', hold: 'days', expires: 'Sep 5' },
    score_components: SWING_COMPONENTS,
    kai_interpretation: 'Kai needs a defended close above 934 with participation. Grade lifts to B+ if volume returns.',
    fit: { risk_amount: '$52', cap_line: 'fits daily cap', conflicts: 'No conflicts' },
    community: { sample: 63, bullish_pct: 58, common_level: '934', verification: 'verified' },
    progress: { pct: 38, label: '1.4% away' },
    primary_action: { label: 'Keep watching', kind: 'forming' },
    freshness_line: 'Quote 9:41:02 ET · live · received 8s ago',
  },
  {
    id: 'alert-aapl-1',
    symbol: 'AAPL',
    company: 'Apple',
    mode_label: 'Swing',
    direction_label: 'Long',
    instrument_label: 'equity',
    grade: 'B−',
    score: 71,
    state: 'watching',
    state_label: 'Watching',
    triggered_at_label: '8:41 AM',
    headline: 'Waiting on the earnings catalyst',
    what_changed: 'Range-bound until the Oct 29 print. Kai wants a base above 191 first.',
    company_summary: 'Apple sells iPhones, services and wearables. Nothing in the tape changes before the print.',
    trade: { direction: 'Long', current: '188.42', entry: '> 191', stop: '183', target: '204', rr: '1.9:1', hold: 'weeks', expires: 'Oct 29' },
    score_components: SWING_COMPONENTS.map((c) => (c.key === 'catalyst' ? { ...c, status: 'Waiting', strength: 1 } : c)),
    kai_interpretation: 'Nothing to do until a base forms above 191.',
    fit: { risk_amount: '$38', cap_line: 'fits daily cap', conflicts: 'No conflicts' },
    community: { sample: 22, bullish_pct: 51, common_level: '191', verification: 'unverified' },
    primary_action: { label: 'Open chart', kind: 'watching' },
    freshness_line: 'Quote 9:41:02 ET · live · received 8s ago',
  },
  {
    id: 'alert-spy-1',
    symbol: 'SPY',
    company: 'S&P 500 ETF',
    mode_label: 'Day Trade',
    direction_label: 'Neutral',
    instrument_label: 'ETF',
    grade: 'C+',
    score: 63,
    state: 'watching',
    state_label: 'Watching',
    triggered_at_label: '8:30 AM',
    headline: 'Holding for the CPI print',
    what_changed: 'Market direction is undecided into 10:00. Kai is sitting out until the reaction.',
    company_summary: 'SPY tracks the S&P 500. It is the market itself, so the CPI reaction sets the day.',
    trade: { direction: 'Neutral', current: '562.18', entry: 'after 10:00', stop: '558', target: '568', rr: '1.2:1', hold: 'intraday', expires: '4:00 PM ET' },
    score_components: DAY_COMPONENTS.map((c) => ({ ...c, status: c.key === 'market' ? 'Waiting' : 'Neutral', strength: 2 })),
    kai_interpretation: 'No edge before the print. Kai will re-grade at 10:05.',
    fit: { risk_amount: '$0', cap_line: 'nothing at risk yet', conflicts: 'No conflicts' },
    community: { sample: 88, bullish_pct: 49, common_level: '562', verification: 'verified' },
    primary_action: { label: 'Open chart', kind: 'watching' },
    freshness_line: 'Quote 9:41:02 ET · live · received 8s ago',
  },
];

export const fixtureHistoryCards: AlertCard[] = [
  {
    id: 'alert-tsla-hist',
    symbol: 'TSLA',
    company: 'Tesla',
    mode_label: 'Day Trade',
    direction_label: 'Long',
    instrument_label: 'equity',
    grade: 'B+',
    score: 82,
    state: 'closed',
    state_label: 'Executed',
    headline: 'Breakout held. Exited at first target after 3h 12m.',
    what_changed: 'Breakout held. Exited at first target after 3h 12m.',
    trade: {},
    score_components: [],
    primary_action: { label: 'Review outcome', kind: 'closed' },
    outcome: { label: 'Outcome', value: '+$112.40', tone: 'good' },
    resolved_label: 'Yesterday',
  },
  {
    id: 'alert-amd-hist',
    symbol: 'AMD',
    company: 'Advanced Micro',
    mode_label: 'Swing',
    direction_label: 'Long',
    instrument_label: 'equity',
    grade: 'C+',
    score: 64,
    state: 'invalidated',
    state_label: 'Invalidated',
    headline: 'Closed below 148 before entry triggered. Never taken.',
    what_changed: 'Closed below 148 before entry triggered. Never taken.',
    trade: {},
    score_components: [],
    primary_action: { label: 'See what changed', kind: 'invalidated' },
    resolved_label: 'Aug 26',
  },
];

export const fixtureAlertsRound4: AlertsRound4 = {
  active: fixtureAlertCards,
  watching: fixtureWatchingCards,
  history: fixtureHistoryCards,
  counts: { active: 3, watching: 3, history: 2 },
  empty_copy: 'Nothing here yet. Kai will put an alert here the moment something changes.',
};

/**
 * The quiet day: nothing needs a decision, nothing is being monitored, nothing
 * has finished. A real state, and the one that must not dead-end.
 */
export const fixtureAlertsRound4Empty: AlertsRound4 = {
  active: [], watching: [], history: [],
  counts: { active: 0, watching: 0, history: 0 },
  empty_copy: "Kai isn't monitoring anything for you yet. Tell him what to watch below, in your own words.",
};

export const fixtureConversations: ConversationsPayload = {
  pinned: [{ id: 'conv-pinned-1', title: 'Long-Term AI Portfolio', pinned: true, last_message_at: '2026-08-27T20:10:00.000Z' }],
  recent: [
    { id: 'conv-today', title: 'Morning Briefing · Aug 28', pinned: false, last_message_at: '2026-08-28T13:41:00.000Z' },
    { id: 'conv-2', title: 'META Day Trade', pinned: false, last_message_at: '2026-08-28T13:12:00.000Z' },
    { id: 'conv-3', title: 'Review My Positions', pinned: false, last_message_at: '2026-08-27T19:02:00.000Z' },
    { id: 'conv-4', title: 'NVIDIA Earnings Research', pinned: false, last_message_at: '2026-08-27T15:44:00.000Z' },
    { id: 'conv-5', title: 'Explain Options to Me', pinned: false, last_message_at: '2026-08-26T18:20:00.000Z' },
    { id: 'conv-6', title: 'Weekly Swing Ideas', pinned: false, last_message_at: '2026-08-25T14:05:00.000Z' },
  ],
};

export const fixtureTickerPage: TickerPage = {
  symbol: 'META',
  company: 'Meta Platforms',
  quote: { symbol: 'META', price: 506.12, change_pct: 1.24, freshness: 'delayed', source_ts: SOURCE_TS },
  market_label: 'market open',
  starred: true,
  chart: { points: [42, 46, 41, 38, 35, 33, 30, 28, 24, 22, 19, 16], timeframes: ['1D', '1W', '1M', '1Y'], selected: '1D' },
  kai_view: {
    take: "Short-term trend is bullish and the breakout confirmed. One active A− alert plus a longer-term thesis on ad revenue.",
    actions: ['Ask Kai', 'Explain the chart', 'Compare'],
  },
  overview: {
    summary: 'Meta Platforms owns Facebook, Instagram and WhatsApp. Revenue is dominated by advertising, so ad pricing and engagement drive the story.',
    market_cap: '$1.29T',
    next_earnings: 'Oct 29',
    pe: '27.4',
    sector: 'Communication',
  },
  technicals: {
    meters: [
      { label: 'Trend', status: 'Strong', strength: 4 },
      { label: 'Momentum', status: 'Healthy', strength: 3 },
      { label: 'Volatility', status: 'Neutral', strength: 2 },
    ],
    support: 'Support 498',
    resistance: 'Resistance 520',
  },
  community: {
    common_level: '504',
    posts_today: 41,
    bullish_pct: 62,
    sample: 41,
    circle: { id: 'circle-meta-breakout', label: 'Open META Breakout circle' },
  },
  active_alert: { id: 'alert-meta-1', grade: 'A−', score: 87, line: 'One active alert · triggered 9:38' },
};

export function fixtureKaiProfile(experience: Experience = 'new', focus: FocusKey[] = ['tech', 'ai']): KaiProfile {
  return {
    mode: 'day_trade',
    mode_label: MODE_LABEL.day_trade,
    experience,
    experience_label: EXPERIENCE_LABEL[experience],
    focus,
    focus_short: focusList(focus),
    voice_line: EXPERIENCE_VOICE[experience],
  };
}

export const fixtureRuleAdherence: RuleAdherence = { sessions: 10, followed: 9 };

/** Kai's opening line for Home, shaped by experience so the voice is visible. */
export function fixtureOpeningLine(experience: Experience): string {
  return kaiVoice(
    "Good morning, Kway. Futures are slightly higher, technology is leading premarket, and CPI is scheduled for 10:00 AM. I'm monitoring four intraday setups. META is the strongest and has just confirmed.",
    experience,
    'confirmed',
  );
}

/* ==================================================================== */
/* The research desk                                                    */
/* ==================================================================== */

/**
 * The desk, with no network.
 *
 * These rows mirror what the brain's own tables hold — a written-up pick keeps
 * its grade and its theme, a name you typed in has neither, and the state is
 * what the chart is doing rather than an opinion about it. The empty version
 * below is the same screen on the day a new account opens it, which is the one
 * that has to lead somewhere instead of stopping dead.
 */
export const fixtureDeskWatchlist: DeskWatchlistResponse = {
  asOf: '2026-09-04',
  rows: [
    {
      ticker: 'INOD', company: 'Innodata Inc', theme: 'Enterprise-Software-AI-Disruption',
      state: 'armed', stateSince: '2026-09-02', price: 54.96, triggerPrice: 57.4,
      invalidation: 46.1, source: 'pick', grade: 'B+', horizon: '2q',
      direction: 'long', updatedAt: '2026-09-04T15:00:00Z',
    },
    {
      ticker: 'TER', company: 'Teradyne Inc', theme: 'Humanoid-Robotics',
      state: 'coiled', stateSince: '2026-08-28', price: 168.32, triggerPrice: 176.0,
      invalidation: 149.5, source: 'pick', grade: 'A', horizon: '4q',
      direction: 'long', updatedAt: '2026-09-04T15:00:00Z',
    },
    {
      ticker: 'VRT', company: 'Vertiv Holdings', theme: 'Data-Centre-Power',
      state: 'triggered', stateSince: '2026-09-03', price: 141.07, triggerPrice: 138.2,
      invalidation: 122.0, source: 'pick', grade: 'B', horizon: '2q',
      direction: 'long', updatedAt: '2026-09-04T15:00:00Z',
    },
    {
      ticker: 'CRWV', company: 'CoreWeave Inc', theme: 'AI-Compute-Buildout',
      state: 'extended', stateSince: '2026-08-19', price: 96.4, triggerPrice: null,
      invalidation: null, source: 'pick', grade: 'C', horizon: '1q',
      direction: 'long', updatedAt: '2026-09-04T15:00:00Z',
    },
    {
      ticker: 'COST', company: null, theme: null,
      state: 'no_base', stateSince: '2026-09-01', price: 921.4, triggerPrice: null,
      invalidation: null, source: 'manual', grade: null, horizon: null,
      direction: null, updatedAt: '2026-09-04T15:00:00Z',
    },
  ],
};

/** The same screen with nothing on it — a new account, before the first pick. */
export const fixtureDeskWatchlistEmpty: DeskWatchlistResponse = { asOf: '2026-09-04', rows: [] };

/**
 * Themes, largest first. Humanoid robotics scores 9.5 on ONE entry in seven
 * days: size and timing are judged separately and nothing is marked down for
 * being years out, so it sits at the top of this list, not the bottom.
 */
export const fixtureDeskThemes: DeskThemesResponse = {
  asOf: '2026-09-04',
  themes: [
    {
      theme: 'Humanoid-Robotics', magnitude: 9.5, timeline: '5y+', conviction: 7,
      trajectory: 'ESCALATING', reason: 'Labour is the largest cost line in the economy and this is the first credible attempt to price it.',
      outOfFavour: false, entriesTotal: 1, entries7d: 1, mined: true,
      tickers: ['TER', 'ABB', 'NVDA'],
    },
    {
      theme: 'Data-Centre-Power', magnitude: 8.5, timeline: '3-5y', conviction: 8,
      trajectory: 'ESCALATING', reason: 'Compute is now a power problem before it is a chip problem, and the grid cannot be ordered in a quarter.',
      outOfFavour: false, entriesTotal: 34, entries7d: 6, mined: true,
      tickers: ['VRT', 'GEV', 'PWR'],
    },
    {
      theme: 'Enterprise-Software-AI-Disruption', magnitude: 8, timeline: '1-2y', conviction: 6,
      trajectory: 'ESCALATING', reason: 'Seat-based pricing is being repriced by software that does the seat’s work.',
      outOfFavour: false, entriesTotal: 51, entries7d: 9, mined: true,
      tickers: ['INOD', 'PLTR'],
    },
    {
      theme: 'AI-Compute-Buildout', magnitude: 7, timeline: 'now', conviction: 5,
      trajectory: 'DE-ESCALATING', reason: 'The trade everyone already owns. A big theme cooling off is often the entry, not a reason to look away.',
      outOfFavour: true, entriesTotal: 212, entries7d: 18, mined: true,
      tickers: ['CRWV', 'NVDA', 'AMD'],
    },
  ],
};

/**
 * One written-up argument, with no network.
 *
 * Only the names the fixture desk actually argued for have one. A ticker you
 * typed in yourself gets `null` — and the screen then says nothing is written
 * up for it, which is the truth. Inventing a thesis to fill a preview is
 * exactly the kind of fabricated record this app refuses everywhere else.
 *
 * CRWV is here on purpose: its write-up stopped before it stated a call. That
 * is not a rejection, and the screen has to say so in its own words.
 */
const DESK_PICKS: Record<string, DeskPickResponse> = {
  /* A graded call the desk is actually running. Sample data. */
  INOD: {
    pick: {
      ticker: 'INOD', company: 'Innodata Inc', theme: 'Enterprise-Software-AI-Disruption',
      themeRank: 1, pickDate: '2026-01-15', direction: 'long', horizon: '2q',
      status: 'active', grade: 'B+',
      gradeWhy: 'A real idea in a large theme, but the company is one of several that could capture it and the multiple already assumes it does.',
      score: 0.5973, potentialMovePct: null, marketCap: 1.2e9,
      falsifier: 'Revenue growth under +40% in the Q3 print, or the largest customer dropping below a third of revenue.',
      revisitWhen: null,
      catalysts: [
        { when: 'Q3 2026', what: 'earnings — settles whether the acceleration is real or a one-off contract' },
        { when: 'November 2026', what: 'annual contract renewals with the largest customer' },
      ],
      why: [
        'Revenue +57% year over year, and the growth is in the data-preparation line rather than legacy services.',
        'Gross margin has climbed four quarters running while headcount was flat.',
        'Price has not followed (-4% over 60 sessions) while the accounts turned.',
      ],
      blockers: [
        'One customer is close to half of revenue.',
        'Nothing here is proprietary — the moat is delivery, not technology.',
      ],
      hypothesis: 'Firms that prepare and label training data for model builders at scale, sold on multi-year contracts to a small number of very large customers',
      /*
       * A call that has run its course and won. Sample data — nothing in the
       * brain has reached a horizon yet — kept because the settled state is
       * the whole point of the scoreboard and cannot be proved without one.
       * Written 15 January, two quarters, settled 16 July: +41.2% against an
       * S&P that made 12.6% over the same stretch, so the desk was 28.6 ahead
       * and that is the number that decides it.
       */
      entryPrice: 34.80, entryBenchmark: 690.20,
      returnPct: 41.2, excessPct: 28.6, outcome: 'hit', gradedAt: '2026-07-16',
      revisitCount: 2, revisitCheckedAt: '2026-05-02', news90d: 12, nominatedBy: 'RMBS',
      thesis: [
        '# INOD — Innodata Inc.',
        '',
        '## THE THEME',
        '',
        'Model builders have run out of clean public text and are paying for prepared data instead. That spend is new, it is large, and it lands on a handful of firms that can hire and manage annotation at scale. The theme is not "AI" — it is the unglamorous supply chain underneath it, which is where the margin usually ends up in the second year of a build-out.',
        '',
        '## WHAT THEY ACTUALLY DO',
        '',
        '**Innodata** runs managed teams that clean, label and structure text, image and audio data to a customer specification, and increasingly evaluate model output against it. It was a services business that happened to be sitting on the exact capability the labs now need.',
        '',
        '## WHY THIS ONE',
        '',
        'The obvious alternatives have to be named. **Scale AI** is private. **Appen (APX.AX)** has the same business and is losing the customers Innodata is winning, which is itself evidence about delivery quality. **TaskUs (TASK)** is larger but its mix is customer support, not data preparation. Innodata is the listed pure expression, and that is both the case and the risk.',
        '',
        '## COULD IT LEAD',
        '',
        'Probably not on its own. This is a supplier, not a platform, and suppliers to four customers do not set prices. What it can do is compound while the build-out lasts, which is a different and more modest claim than leadership.',
        '',
        '## THE CONNECTION',
        '',
        'The connection is direct and disclosed: the filings name data preparation for large language model training as the growth line, and the growth is in that line rather than in legacy services. This is the rare case where the segment reporting actually answers the question.',
        '',
        '## WHAT THE NUMBERS SAY',
        '',
        '**Revenue +57% year over year**, and accelerating against the prior quarter. **Gross margin up four quarters running** while headcount was flat, which is the shape of operating leverage rather than of a hiring binge. **Customer concentration near 50%** on a single account — the number that decides whether any of the rest matters.',
        '',
        '## WHAT WOULD HAVE TO BE TRUE',
        '',
        '1. **The acceleration has to survive one renewal cycle.** A contract won is not a contract renewed, and the multiple is priced on renewal.',
        '2. **The second customer has to get bigger.** Concentration near half of revenue is the whole risk in one line.',
        '',
        '## THE CALL',
        '',
        'Long, over two quarters. The growth is real, it is in the right line, and the price has not moved with it. The grade is a B+ rather than better because several companies could capture this and the multiple already assumes this one does.',
      ].join('\n'),
      unfinished: false,
    },
    alsoWrittenUp: [
      { theme: 'AI-Compute-Buildout', pickDate: '2026-06-02', grade: 'C', status: 'expired' },
    ],
    themeJudgement: fixtureDeskThemes.themes.find((t) => t.theme === 'Enterprise-Software-AI-Disruption') ?? null,
  },

  /*
   * A real write-up, verbatim: eleven thousand characters, eight sections, a
   * pass with a C on it. This is the one the redesign was briefed against.
   */
  PDYN: {
    pick: {
      ...REAL_PDYN_META,
      themeRank: REAL_PDYN_META.themeRank,
      potentialMovePct: null,
      catalysts: [],
      thesis: REAL_PDYN_THESIS,
      unfinished: false,
    },
    alsoWrittenUp: [],
    themeJudgement: {
      theme: 'Humanoid-Robotics-Physical-AI', magnitude: 9.5, timeline: '5y+', conviction: 7,
      trajectory: 'ESCALATING',
      reason: 'Labour is the largest cost line in the economy and this is the first credible attempt to price it.',
      outOfFavour: false, entriesTotal: 1, entries7d: 1, mined: true,
      tickers: ['PDYN', 'SYM', 'ZBRA'],
    },
  },

  /*
   * A real write-up with NO `##` headings — its sections are bold lines. The
   * section reader has to find them, and this is what proves it does.
   */
  AAOI: {
    pick: {
      ...REAL_AAOI_META,
      potentialMovePct: null,
      catalysts: [],
      thesis: REAL_AAOI_THESIS,
      unfinished: false,
    },
    alsoWrittenUp: [],
    themeJudgement: {
      theme: 'AI-Capex-Cycle', magnitude: 8, timeline: 'now', conviction: 8,
      trajectory: 'ESCALATING',
      reason: 'The spend is committed and disclosed. The question is who keeps the margin, not whether the money is spent.',
      outOfFavour: true, entriesTotal: 212, entries7d: 18, mined: true,
      tickers: ['AAOI', 'COHR', 'LITE'],
    },
  },

  /*
   * The bottom of the scale. Sample data — the brain has never written a D —
   * kept here because a D has to read as a judgement the desk made and not as
   * a broken screen, and that cannot be proved without one.
   */
  SPCE: {
    pick: {
      ticker: 'SPCE', company: 'Virgin Galactic Holdings', theme: 'Commercial-Space-Access',
      themeRank: 6, pickDate: '2025-08-14', direction: 'pass', horizon: '4q',
      status: 'rejected', grade: 'D',
      gradeWhy: 'The theme is real and this company is not a way to own it. Revenue is a rounding error against the cash burn, the share count has doubled twice, and nothing in the filings connects the spending to a commercial programme with dates on it. The judgement is about the fit, not about the sector.',
      score: 0.4084, potentialMovePct: null, marketCap: 2.4e8,
      falsifier: 'A signed, priced flight programme with named customers and disclosed unit economics would change the case entirely.',
      revisitWhen: 'If the company discloses a flight cadence with contracted revenue attached, and the share count stops rising, re-read it.',
      catalysts: [],
      why: [
        'The theme it sits in is genuinely large and the desk holds it at 7 out of 10.',
      ],
      blockers: [
        'Revenue of $1.6M against $115M of quarterly operating cash outflow. The gap is the business.',
        'Diluted shares +212% over two years, and still rising.',
        'No disclosed flight cadence, so there is nothing to check a forecast against.',
      ],
      hypothesis: 'Operators of reusable crewed launch vehicles selling seats or payload capacity on a published, repeatable flight schedule',
      /*
       * A PASS, measured and deliberately not scored. Sample data.
       *
       * The desk prices the names it declined as well as the ones it backed,
       * because a desk that only grades what it bought cannot tell a good
       * standard from an expensive one. This one fell 51% while the market
       * rose 9% — declining it was worth 60 points — but it is still recorded
       * as `not_scored`, because a pass had no direction to be right about and
       * must never be counted into a hit rate.
       */
      entryPrice: 4.62, entryBenchmark: 641.50,
      returnPct: -51.3, excessPct: -60.4, outcome: 'not_scored', gradedAt: '2026-08-14',
      revisitCount: 0, revisitCheckedAt: null, news90d: 41, nominatedBy: null,
      thesis: [
        '# SPCE — Virgin Galactic Holdings',
        '',
        '## THE THEME',
        '',
        'Commercial space access is the claim that getting mass to orbit becomes cheap enough, and often enough, that whole categories of business become possible. The desk holds the theme at 7 out of 10 and is not marking it down for being early.',
        '',
        '## WHAT THEY ACTUALLY DO',
        '',
        'Virgin Galactic sells seats on a suborbital vehicle. It is a flight experience business, not an orbital launch business, and the two are frequently conflated by the coverage.',
        '',
        '## WHY THIS ONE',
        '',
        'It was handed to the desk by the search and it should not have been. **Rocket Lab (RKLB)** and **Firefly** are launch businesses with contracted manifests. This is not the same industry — the hypothesis asked for a published, repeatable flight schedule and this company does not publish one.',
        '',
        '## THE CONNECTION',
        '',
        'Weak. The connection to the theme is the word "space" and very little else in the filings.',
        '',
        '## WHAT THE NUMBERS SAY',
        '',
        '**Revenue: $1.6M in the quarter.** **Operating cash outflow: $115M in the same quarter.** **Diluted shares +212% over two years.** These three numbers are the entire read; nothing further in the filings changes what they say.',
        '',
        '## WHAT WOULD HAVE TO BE TRUE',
        '',
        '1. **A flight cadence would have to exist and be published**, with contracted revenue attached to it.',
        '2. **The share count would have to stop rising**, because at this rate the dilution outruns any plausible revenue ramp.',
        '',
        '## THE CALL',
        '',
        'Pass, and a D on the idea. To be clear about what that D is: it is a mark on the fit between this company and this theme, made after reading the filings. The theme keeps its 7. This is the desk saying it looked and this is not the way in — which is the job, and the most common outcome of doing it.',
      ].join('\n'),
      unfinished: false,
    },
    alsoWrittenUp: [],
    themeJudgement: {
      theme: 'Commercial-Space-Access', magnitude: 7, timeline: '3-5y', conviction: 4,
      trajectory: 'STABLE',
      reason: 'Cost per kilogram to orbit is still falling and the second-order businesses have not been built yet.',
      outOfFavour: false, entriesTotal: 9, entries7d: 0, mined: true,
      tickers: ['RKLB', 'SPCE'],
    },
  },

  /*
   * A write-up filed with no headings of any kind.
   *
   * Every one of the fifty-seven write-ups in the brain today carries sections
   * — forty-three with `##` headings and fourteen with bold lines — so this
   * case is sample data. It is here because the honest fallback is a real code
   * path and a screen state nobody would otherwise ever see: the reader says
   * outright that there is nothing to break up and shows the argument whole,
   * rather than inventing a structure to make the page look tidier.
   */
  NGS: {
    pick: {
      ticker: 'NGS', company: 'Natural Gas Services Group', theme: 'Data-Centre-Power',
      themeRank: 3, pickDate: '2025-08-30', direction: 'long', horizon: '4q',
      status: 'active', grade: null, gradeWhy: null,
      score: 0.5512, potentialMovePct: null, marketCap: 3.1e8,
      falsifier: 'Utilisation of the rental fleet falling below 80% for two consecutive quarters.',
      revisitWhen: null,
      catalysts: [],
      why: [
        'Rental fleet utilisation at 84% and rising for six quarters.',
        'The revenue is contracted rather than spot, so it survives a gas price move.',
      ],
      blockers: ['A single basin is most of the fleet.'],
      hypothesis: 'Owners of contracted gas compression fleets rented to producers on multi-year terms',
      /*
       * THE CASE THAT EXISTS TO BE SEEN. Sample data.
       *
       * This one went UP — +3.1% over the year — and the desk was still wrong,
       * because the S&P made 12.5% over the same year and anyone who simply
       * held the index did better. Green on the raw number and red on the one
       * that counts. A scoreboard that showed only the return would call this
       * a win, and that is exactly the lie this instrument exists to stop.
       */
      entryPrice: 22.10, entryBenchmark: 601.40,
      returnPct: 3.1, excessPct: -9.4, outcome: 'miss', gradedAt: '2026-08-30',
      revisitCount: 0, revisitCheckedAt: null, news90d: 3, nominatedBy: null,
      thesis: [
        'Gas compression is the least interesting way to own the data centre power story and possibly the most direct one. Compression is what moves gas from a wellhead to a pipeline, and every megawatt of gas-fired generation added for a data centre is a call on more of it. The fleet is rented on multi-year contracts rather than sold, so the revenue does not move with the gas price the way a producer\u2019s does.',
        '',
        'Natural Gas Services owns roughly 1,400 compression units and rents them out. Fleet utilisation has risen for six straight quarters and now sits at 84%, which is the number that matters more than any other in this business \u2014 an idle unit earns nothing and still depreciates. Contracted revenue covers about eighteen months forward.',
        '',
        'The risk is concentration. Most of the fleet works one basin, and a slowdown there is not offset anywhere else. Against that, the contracts are long and the customers are the larger producers rather than the marginal ones, which is the difference between a downturn costing utilisation and a downturn costing the contract.',
      ].join('\n'),
      unfinished: false,
    },
    alsoWrittenUp: [],
    themeJudgement: fixtureDeskThemes.themes.find((t) => t.theme === 'Data-Centre-Power') ?? null,
  },

  /*
   * An argument that ran out of room. NOT a rejection — sixteen of nineteen
   * "rejections" on 4 September were this, and the screen says so.
   */
  CRWV: {
    pick: {
      ticker: 'CRWV', company: 'CoreWeave Inc', theme: 'AI-Compute-Buildout',
      themeRank: 4, pickDate: '2026-08-19', direction: null, horizon: '1q',
      status: 'stored', grade: 'C',
      gradeWhy: 'The theme is crowded and the argument never got to the part that would separate this company from the trade everyone already owns.',
      score: 0.31, potentialMovePct: null, marketCap: 4.4e10,
      falsifier: null, revisitWhen: null,
      catalysts: [],
      why: ['Contracted backlog covers more than a year of revenue.'],
      blockers: ['The debt is secured against hardware that depreciates faster than the contracts run.'],
      hypothesis: 'rented compute at hyperscaler scale',
      /*
       * The ordinary state, and the one every real row is in today: stamped on
       * the day, one quarter to run, nothing settled. Written 19 August with a
       * 1q horizon, so the desk measures it on 18 November — until then the
       * scoreboard has a starting line, a dashed run and a date, and no result.
       */
      entryPrice: 82.40, entryBenchmark: 758.90,
      returnPct: null, excessPct: null, outcome: null, gradedAt: null,
      revisitCount: 0, revisitCheckedAt: null, news90d: 214, nominatedBy: null,
      thesis: '## THE THEME\n\nCompute is being built ahead of demand on the assumption demand arrives. That has been right for two years.\n\n## THE COMPANY\n\nCoreWeave is the pure expression of it, which cuts both ways —',
      unfinished: true,
    },
    alsoWrittenUp: [],
    themeJudgement: fixtureDeskThemes.themes.find((t) => t.theme === 'AI-Compute-Buildout') ?? null,
  },
};

/** The write-up for a ticker, or null when the desk never wrote one. */
export function fixtureDeskPick(ticker: string): DeskPickResponse | null {
  return DESK_PICKS[ticker.toUpperCase()] ?? null;
}

const DESK_THEME_NOTES: Record<string, string> = {
  'Humanoid-Robotics':
    '**2026-05-14** — First entry. The claim is not that robots work; it is that labour is the largest cost line in the economy and nobody has priced an attempt on it.\n\n**2026-08-30** — Still one entry in seven days. Ranked 43rd by how much is being written about it and first by size, and the size is the number that matters.',
  'Data-Centre-Power':
    '**2026-04-02** — Compute is a power problem before it is a chip problem.\n\n**2026-08-27** — Utilities have started quoting connection dates in years rather than quarters. That is the constraint becoming visible in prices.',
};

/** One theme in depth, or null when the fixture desk is not reading it. */
export function fixtureDeskTheme(name: string): DeskThemeResponse | null {
  const theme = fixtureDeskThemes.themes.find((t) => t.theme === name);
  if (!theme) return null;
  const writtenUp = fixtureDeskWatchlist.rows
    .filter((r) => r.theme === name)
    .map((r) => ({
      ticker: r.ticker, company: r.company, grade: r.grade,
      status: 'active', direction: r.direction, pickDate: '2026-08-21', themeRank: 1,
      // Nothing under any theme has reached its horizon, so nothing is
      // settled. The screen says that once, rather than ruling a blank column.
      outcome: null, excessPct: null,
    }));
  return {
    theme,
    note: DESK_THEME_NOTES[name] ?? null,
    writtenUp,
    // Every lead the desk has ever named is still unscored — nothing feeds them
    // back through the pipeline. The fixture says so rather than pretending.
    leads: theme.tickers
      .filter((t) => !writtenUp.some((w) => w.ticker === t))
      .map((t) => ({
        ticker: t,
        reason: 'Named in a write-up as fitting this theme better than the company it was handed.',
        // The brain stores the TICKER of the write-up that named it, so the
        // screen can say "from the RMBS write-up" and mean something.
        nominatedBy: writtenUp[0]?.ticker ?? null,
        nominatedOn: '2026-08-30',
        scoredOn: null,
      })),
  };
}
