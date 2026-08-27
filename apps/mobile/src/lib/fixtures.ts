/**
 * Fixtures mode (EXPO_PUBLIC_FIXTURES=1).
 * Mirrors the four seed `setups` the SCHEMA lane plants (META B+ forming,
 * NVDA watching, AMD C, TSLA invalidated) and the artboard copy verbatim, so
 * the owner can preview and Playwright can shoot every screen with no network.
 */
import type {
  AlertsPayload, Briefing, GradedSetup, HomePayload, Instrument, MarketStatus,
  Profile, RiskPolicy, RoomRow, WatchingItem,
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
  { symbol: 'NVDA', name: 'NVIDIA Corporation', last: 1158.07, change_pct: 3.25, quote: { symbol: 'NVDA', price: 1158.07, source_ts: SOURCE_TS, freshness: 'delayed' } },
  { symbol: 'AAPL', name: 'Apple Inc.', last: 195.42, change_pct: 1.08, quote: { symbol: 'AAPL', price: 195.42, source_ts: SOURCE_TS, freshness: 'delayed' } },
  { symbol: 'TSLA', name: 'Tesla, Inc.', last: 177.5, change_pct: -0.64, quote: { symbol: 'TSLA', price: 177.5, source_ts: SOURCE_TS, freshness: 'delayed' } },
  { symbol: 'META', name: 'Meta Platforms, Inc.', last: 508.4, change_pct: 0.92, quote: { symbol: 'META', price: 508.4, source_ts: SOURCE_TS, freshness: 'delayed' } },
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
