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
  },
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
