/**
 * Portal fixtures — the Asset-workspace board, verbatim.
 *
 * These render ONLY when EXPO_PUBLIC_FIXTURES=1 or nothing is configured. On a
 * live account a missing `/trade/portal/:symbol` is an honest error, never a
 * fabricated alert with a grade on it.
 */
import { fixtureCandles } from '../../lib/fixtures';
import { fixtureOpenOrders } from '../orders/fixtures';
import { fixtureMeta, fixtureNvda } from '../positions/fixtures';
import type { Quote } from '../../lib/types';
import type {
  Annotation, PortalAlert, PortalCommunity, PortalPlan, TradePortal,
} from './types';

const SOURCE_TS = new Date(Date.now() - 15 * 60_000).toISOString();
const TRIGGER_TS = fixtureCandles[Math.max(0, fixtureCandles.length - 12)]?.t ?? null;

const quote = (symbol: string, price: number, pct: number): Quote => ({
  symbol,
  price,
  change: Number(((price * pct) / 100).toFixed(2)),
  change_pct: pct,
  source_ts: SOURCE_TS,
  freshness: 'delayed',
  delay_reason: 'entitlement',
});

export const fixtureAnnotations = (symbol = 'META'): Annotation[] => [
  {
    id: 'ann-trigger',
    symbol,
    timeframe: null,
    kind: 'trigger',
    price: 504,
    price2: null,
    ts_from: TRIGGER_TS,
    ts_to: null,
    text: 'Trigger 504',
    reason: 'Three 5-minute candles closed above 504 while volume ran 1.6× its 20-day average. That is the level the alert was written against.',
    provenance: 'kai',
    status: 'valid',
    source_alert_id: 'alert-meta',
    source_setup_id: 'seed-meta',
    source_plan_id: null,
    created_at: SOURCE_TS,
    updated_at: SOURCE_TS,
  },
  {
    id: 'ann-entry',
    symbol,
    timeframe: null,
    kind: 'entry',
    price: 504,
    price2: 507,
    ts_from: null,
    ts_to: null,
    text: 'Entry 504–507',
    reason: 'The area where the breakout is still worth paying for. Above 507 you are chasing.',
    provenance: 'plan',
    status: 'valid',
    source_alert_id: 'alert-meta',
    source_setup_id: 'seed-meta',
    source_plan_id: 'plan-meta',
    created_at: SOURCE_TS,
    updated_at: SOURCE_TS,
  },
  {
    id: 'ann-stop',
    symbol,
    timeframe: null,
    kind: 'stop',
    price: 498,
    price2: null,
    ts_from: null,
    ts_to: null,
    text: 'Stop 498',
    reason: 'Below 498 the reclaim has failed and the reason for the trade is gone.',
    provenance: 'plan',
    status: 'valid',
    source_alert_id: 'alert-meta',
    source_setup_id: 'seed-meta',
    source_plan_id: 'plan-meta',
    created_at: SOURCE_TS,
    updated_at: SOURCE_TS,
  },
  {
    id: 'ann-target',
    symbol,
    timeframe: null,
    kind: 'target',
    price: 520,
    price2: null,
    ts_from: null,
    ts_to: null,
    text: 'Target 520',
    reason: 'The prior swing high, where sellers last showed up in size.',
    provenance: 'plan',
    status: 'valid',
    source_alert_id: 'alert-meta',
    source_setup_id: 'seed-meta',
    source_plan_id: 'plan-meta',
    created_at: SOURCE_TS,
    updated_at: SOURCE_TS,
  },
];

export const fixtureAlert = (symbol = 'META'): PortalAlert => ({
  id: 'alert-meta',
  symbol,
  company: 'Meta Platforms',
  mode: 'Day Trade',
  direction: 'Long',
  instrument: 'Equity',
  grade_display: 'A−',
  score: 87,
  state: 'entry_reached',
  state_label: 'Triggered',
  headline: `${symbol} reclaimed $504 with 1.6× volume`,
  what_changed: 'Three five-minute candles held above the trigger, making the setup actionable.',
  triggered_at: SOURCE_TS,
  company_summary:
    'Meta Platforms owns Facebook, Instagram and WhatsApp. Its shares are trading with elevated volume after buyers reclaimed a major intraday level.',
  condition: 'Holds above 504 with volume ≥ 1.5× average',
  condition_met: true,
  entry: 504,
  entry_high: 507,
  stop: 498,
  target: 520,
  rr: '2.7 : 1',
  hold: 'Intraday',
  expires_plain: 'Expires at today’s close',
  score_components: [
    { key: 'trend', label: 'Trend', status: 'Strong', strength: 5, explanation: 'Higher lows all session against a rising 20-period average.' },
    { key: 'structure', label: 'Structure', status: 'Confirmed', strength: 4, explanation: 'The 504 shelf was resistance twice and is now support.' },
    { key: 'volume', label: 'Volume', status: 'Healthy', strength: 4, explanation: '1.6× the 20-day average across the session, not just the open.' },
    { key: 'rr', label: 'Risk / Reward', status: 'Favorable', strength: 4, explanation: '6 points of risk against 16 points to the first target.' },
    { key: 'market', label: 'Market', status: 'Supportive', strength: 3, explanation: 'Index is positive and breadth is not fighting the move.' },
  ],
  kai_interpretation:
    'The reclaim is confirmed by volume rather than a single candle. Losing 498 removes the reason for the trade. Kai’s assessment, not a guarantee.',
  fit_plain: 'About $58 at risk at your size · fits your daily cap · no conflicting position',
  community_plain: '41 messages today · 62% bullish · most-mentioned level 504',
  events: [
    { label: 'Created · from onboarding walkthrough', at: '9:12', tone: 'neutral' },
    { label: '2nd attempt failed · volume faded', at: '9:34', tone: 'warn' },
    { label: 'Triggered at 504.62 · grade B+ → A−', at: '9:38', tone: 'good' },
  ],
  primary_action: { label: 'Review trade', route: '/plan/new?symbol=META&setup=seed-meta' },
});

export const fixturePortalPlan = (symbol = 'META'): PortalPlan => ({
  id: 'plan-meta',
  entry: 504,
  stop: 498,
  targets: [520],
  rr: '2.7 : 1',
  size_plain: '1.29 shares · about $650 of practice money',
  risk_dollars: 58,
  daily_cap: { used: 58, cap: 200 },
  stop_attaches_plain: 'The stop is placed as a paper leg the moment the entry fills.',
  action: { label: 'Review order', route: `/order/new?symbol=${symbol}&side=buy_to_open&plan=plan-meta&setup=seed-meta` },
  empty_plain: null,
});

export const fixturePortalCommunity = (symbol = 'META'): PortalCommunity => ({
  room_id: 'room-day-trade',
  circle_id: 'circle-meta',
  circle_name: `${symbol} Breakout`,
  summary: `${symbol}, NVDA and CPI are driving today’s discussion. Two claims still verifying.`,
  message_count: 41,
  bullish_pct: 62,
  common_level: 504,
  label_plain: 'Community observation — members, not Kai. It never changes the grade on its own.',
  claims: [
    { claim: 'Volume is 1.6× the 20-day average', verdict: 'verified', plain: 'Kai verified · live market data' },
  ],
  messages: [
    {
      id: 'm1', author: 'Jordan', initial: 'J', role: 'Educator · Holds META', at: '9:40',
      body: `Volume is finally coming in. Watching whether $${symbol} holds 504 through the next candle.`,
      is_kai: false, verified_plain: null,
    },
    {
      id: 'm2', author: 'Sam', initial: 'S', role: null, at: '9:42',
      body: 'Is that volume real or just the open? @Kai verify',
      is_kai: false, verified_plain: null,
    },
    {
      id: 'm3', author: 'Kai', initial: 'K', role: null, at: '9:42',
      body: 'Real — 1.6× the 20-day average across the session, not just the opening print.',
      is_kai: true, verified_plain: 'Kai verified · live market data',
    },
    {
      id: 'm4', author: 'Priya', initial: 'P', role: null, at: '9:44',
      body: 'Took a starter here. Stop under 498, adding if it holds into the afternoon.',
      is_kai: false, verified_plain: null,
    },
  ],
});

/** The account, positions, orders and lists behind the top bar. Same on every
 *  fixture symbol, because they belong to the person, not to the chart. */
const fixtureDrawers = (): TradePortal['drawers'] => ({
  account: { value: 10000, day_change: 84.2, day_change_pct: 0.85, buying_power: 3420, kind: 'paper', label: 'PAPER', plain: 'Practice money. Nothing here can be withdrawn.' },
  positions: [fixtureMeta, fixtureNvda],
  open_orders: fixtureOpenOrders(),
  watchlist: [
    { symbol: 'META', name: 'Meta Platforms', quote: quote('META', 504.62, 2.14) },
    { symbol: 'NVDA', name: 'NVIDIA', quote: quote('NVDA', 121.4, -1.1) },
    { symbol: 'AAPL', name: 'Apple', quote: quote('AAPL', 227.8, 0.4) },
  ],
  recent: [
    { symbol: 'TSLA', name: 'Tesla', quote: quote('TSLA', 248.1, 1.9) },
    { symbol: 'SPY', name: 'S&P 500 ETF', quote: quote('SPY', 561.2, 0.3) },
  ],
});

/**
 * SYMBOLS WITH NOTHING GRADED ON THEM — which is most symbols, most of the time.
 *
 * Until this existed, `fixturePortal` substituted the ticker into META's numbers
 * and every symbol in fixtures came back an A− with a plan on it. So the state a
 * person hits most often — open a chart, there is no setup — had never once been
 * looked at, and the honest version of Kai's answer had nowhere to be shot.
 *
 * These three are the ones the rest of the fixture catalogue already has no
 * setup for (`features/trade/fixtures`, `lib/fixtures`), so nothing else changes
 * its mind about them.
 */
export const BARE_FIXTURE_SYMBOLS = ['SPY', 'AAPL', 'MSFT'];

const BARE_NAME: Record<string, string> = {
  SPY: 'S&P 500 ETF',
  AAPL: 'Apple',
  MSFT: 'Microsoft',
};

/**
 * A real chart, a real price, and no plan — because there is no graded setup and
 * nothing here is going to invent one. `plan` carries the empty shape the live
 * adapter produces when the server has no entry and no invalidation, and
 * `execution.action` is null so no volt button offers an action that does not
 * exist.
 */
export const fixtureBarePortal = (symbol: string): TradePortal => ({
  symbol,
  name: BARE_NAME[symbol] ?? null,
  instrument: 'Equity',
  mode: 'Day Trade',
  quote: quote(symbol, symbol === 'SPY' ? 561.2 : symbol === 'AAPL' ? 227.8 : 418.4, 0.31),
  market_state: 'Market open',
  paper: true,
  starred: false,
  chart: { timeframe: 'D', timeframes: ['1m', '5m', '15m', '1h', '4h', 'D'], focus_ts: null },
  annotations: [],
  kai: {
    conversation_id: null,
    opening_message: `${symbol} is open. I have no graded setup on it, so ask me what is on the chart and I will mark it.`,
  },
  alert: null,
  plan: {
    id: null, entry: null, stop: null, targets: [], rr: null, size_plain: null,
    risk_dollars: null, daily_cap: null, stop_attaches_plain: null,
    action: { label: 'Build a plan', route: `/plan/new?symbol=${symbol}` },
    empty_plain: `Kai has no entry, stop or target for ${symbol} at the moment.`,
  },
  community: null,
  execution: {
    state: 'none',
    label: 'Nothing to do',
    action: null,
    detail_plain: 'Nothing to prepare yet — I need an entry and an invalidation level before there is a trade here.',
    order: null,
    position: null,
  },
  drawers: fixtureDrawers(),
  is_fixture: true,
  notice: null,
});

export const fixturePortal = (symbol = 'META', ctx?: string | null): TradePortal =>
  (BARE_FIXTURE_SYMBOLS.includes(symbol.toUpperCase()) ? fixtureBarePortal(symbol.toUpperCase()) : ({
  symbol,
  name: 'Meta Platforms',
  instrument: 'Equity',
  mode: 'Day Trade',
  quote: quote(symbol, 504.62, 2.14),
  market_state: 'Market open',
  paper: true,
  starred: true,
  chart: { timeframe: '15m', timeframes: ['1m', '5m', '15m', '1h', '4h', 'D'], focus_ts: TRIGGER_TS },
  annotations: fixtureAnnotations(symbol),
  kai: {
    conversation_id: null,
    opening_message: ctx === 'alert'
      ? `This is the ${symbol} alert you opened. I marked the trigger, entry area, stop and first target on the chart.`
      : `${symbol} held above 504 for three 5-minute candles while volume reached 1.6× its average. I've marked the breakout on your chart.`,
  },
  alert: fixtureAlert(symbol),
  plan: fixturePortalPlan(symbol),
  community: fixturePortalCommunity(symbol),
  execution: {
    state: 'ready',
    label: 'Ready',
    action: { label: 'Review trade', route: `/plan/new?symbol=${symbol}&setup=seed-meta` },
    detail_plain: 'Max planned risk $58 · fits your daily cap',
    order: null,
    position: null,
  },
  drawers: fixtureDrawers(),
  is_fixture: true,
  notice: null,
}) as TradePortal);
