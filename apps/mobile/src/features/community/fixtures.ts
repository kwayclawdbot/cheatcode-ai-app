/**
 * Fixtures for EXPO_PUBLIC_FIXTURES=1 (owner preview + Playwright proof).
 * Copy is lifted from the artboards: V3-C0 community home, V3-C1 setup room,
 * V3-C1 community summary, S81 room, S84 composer, S85 profile.
 *
 * These are demo objects, not market data — every price carries `delayed`
 * freshness and the seeded `source_ts` rhythm the rest of the app uses.
 */
import type {
  Author, ContributorProfile, KaiRoomObject, Room, RoomMessage, RoomSetup,
} from './types';

const KAI: Author = {
  user_id: 'kai', display_name: 'Kai', handle: null, initial: 'K',
  role_labels: ['AI'], is_kai: true,
};
const JORDAN: Author = {
  user_id: 'u-jordan', display_name: 'Jordan', handle: 'jordan', initial: 'J',
  role_labels: ['Educator'], is_kai: false,
};
const SAM: Author = {
  user_id: 'u-sam', display_name: 'Sam', handle: 'sam', initial: 'S',
  role_labels: [], is_kai: false,
};
const MARCUS: Author = {
  user_id: 'u-marcus', display_name: 'Marcus T.', handle: 'marcus', initial: 'M',
  role_labels: ['Moderator'], is_kai: false,
};

const META_SETUP: RoomSetup = {
  id: '11111111-1111-4111-8111-000000000001',
  symbol: 'META',
  grade_display: 'B+',
  state: 'forming',
  entry: '504',
  target: '540',
  invalid: '460',
  freshness: 'delayed',
  price: '502.40',
  change_pct: '+0.98%',
  headline: 'Buyers are defending an important level.',
};

export const fixtureRooms: Room[] = [
  {
    id: 'room-meta-setup', slug: 'meta-setup', name: 'meta-setup',
    description: 'The META B+ setup, while it is live.',
    mode: 'day_trade', type: 'setup',
    member_count: 28, discussing_count: 28, unread: 3, last_read_seq: 4,
    joined: true, muted_until: null,
    config: { intel_eligible: false },
    pinned: [{ kind: 'kai', text: 'Watching META into the open. CPI print at 10:00 is the main risk.' }],
    setup_id: META_SETUP.id,
    setup: META_SETUP,
    preview: { who: 'Kai', text: 'volume confirmed 1.6×', by_kai: true },
  },
  {
    id: 'room-nvda-setup', slug: 'nvda-setup', name: 'nvda-setup',
    description: 'NVDA is pausing, not breaking down.',
    mode: 'day_trade', type: 'setup',
    member_count: 12, discussing_count: 12, unread: 0, last_read_seq: 0,
    joined: false, muted_until: null,
    config: { intel_eligible: false },
    pinned: [],
    setup_id: '11111111-1111-4111-8111-000000000002',
    setup: {
      id: '11111111-1111-4111-8111-000000000002', symbol: 'NVDA', grade_display: 'B',
      state: 'watching', entry: '128.50', target: '136.00', invalid: '118.00',
      freshness: 'delayed', price: '126.85', change_pct: '-0.41%',
      headline: 'Price is pausing after a strong run, not breaking down.',
    },
    preview: { who: 'Jordan', text: 'catalyst thread updated', by_kai: false },
  },
  {
    id: 'room-market-open', slug: 'dt-market-open', name: 'Market Open',
    description: 'What is moving as the session starts.',
    mode: 'day_trade', type: 'core',
    member_count: 124, discussing_count: 31, unread: 0, last_read_seq: 0,
    joined: true, muted_until: null,
    config: { intel_eligible: false }, pinned: [], setup_id: null, setup: null, preview: null,
  },
  {
    id: 'room-live-setups', slug: 'dt-live-setups', name: 'Live Setups',
    description: 'Setups Kai and members are watching right now.',
    mode: 'day_trade', type: 'core',
    member_count: 87, discussing_count: 22, unread: 3, last_read_seq: 6,
    joined: true, muted_until: null,
    config: { slow_mode_s: 0, intel_eligible: false },
    pinned: [{ kind: 'kai', text: 'Watching META and NVDA into the open. CPI print at 10:00 is the main risk.' }],
    setup_id: null, setup: null, preview: null,
  },
  {
    id: 'room-trade-ready', slug: 'dt-trade-ready', name: 'Trade Ready',
    description: 'Setups that have met their entry condition.',
    mode: 'day_trade', type: 'core',
    member_count: 41, discussing_count: 4, unread: 0, last_read_seq: 0,
    joined: false, muted_until: null,
    config: { intel_eligible: false }, pinned: [], setup_id: null, setup: null, preview: null,
  },
  {
    id: 'room-beginner', slug: 'dt-beginner-questions', name: 'Beginner Questions',
    description: 'No question is too basic here.',
    mode: 'day_trade', type: 'core',
    member_count: 36, discussing_count: 9, unread: 0, last_read_seq: 0,
    joined: false, muted_until: null,
    config: { intel_eligible: false }, pinned: [], setup_id: null, setup: null, preview: null,
  },
  {
    id: 'room-new-ideas', slug: 'sw-new-ideas', name: 'New Ideas',
    description: 'Fresh theses looking for confirmation.',
    mode: 'swing', type: 'core',
    member_count: 52, discussing_count: 7, unread: 0, last_read_seq: 0,
    joined: false, muted_until: null,
    config: { intel_eligible: false }, pinned: [], setup_id: null, setup: null, preview: null,
  },
  {
    id: 'room-stock-research', slug: 'iv-stock-research', name: 'Stock Research',
    description: 'Digging into individual businesses.',
    mode: 'invest', type: 'core',
    member_count: 63, discussing_count: 5, unread: 0, last_read_seq: 0,
    joined: false, muted_until: null,
    config: { intel_eligible: false }, pinned: [], setup_id: null, setup: null, preview: null,
  },
];

const VERIFICATION: KaiRoomObject = {
  type: 'verification_card',
  title: 'Volume check · META',
  claim: 'Unusual volume on META this morning.',
  result: 'verified',
  result_label: 'Confirmed',
  detail: 'Real — **1.6× the 20-day average**, not just the open.',
  sources: [{ label: 'Market data · relative volume', at: '9:41 ET' }],
  as_of: '9:41 ET',
  uncertainty: 'One session of volume is not a trend.',
  effect_on_setup: 'Raises confidence in the B+ · the grade does not move on sentiment.',
  message_id: 'm-1',
};

const SUMMARY: KaiRoomObject = {
  type: 'room_summary',
  title: "Kai's room summary",
  window_label: 'updated 2m ago',
  bull_case: 'Holding support with improving volume',
  bear_case: 'Broader market still weak into CPI',
  sentiment: { bull_pct: 62, sample: 41 },
  take: 'Interest is elevated · confirmation incomplete',
  grade_display: 'B+',
  themes: ['VWAP reclaim', '504 as the confirmation level', 'CPI at 10:00'],
  claims: [
    { claim: 'Relative volume is 1.6× the 20-day average', verified: 'verified', plain: 'Checked against market data at 9:41.' },
    { claim: 'Institutions are accumulating', verified: 'unverifiable', plain: 'No source available — treat it as an opinion.' },
  ],
  disagreements: ['Whether 504 holds today or gets faded again into the CPI print'],
  assets: ['META'],
  missed: ['Kai marked the 504 level at 9:38 while you were away'],
  footnote: 'Sample 41 · sentiment never changes the grade',
};

export const fixtureMessages: RoomMessage[] = [
  {
    id: 'm-1', seq: 4, kind: 'text', created_at: '2026-08-26T13:40:00Z', time_label: 'Today at 9:40',
    author: JORDAN, body: 'Reclaimed VWAP on strong volume. Watching 501 for the entry.',
    refs: { symbol: 'META', levels: [501] }, structured_idea: null,
    position_disclosure: { holds: true, symbol: 'META', label: 'Holds META' },
    kai_object: null, deleted: false, is_claim: true,
    reactions: [{ label: '14', count: 14, tone: 'neutral' }, { label: '9', count: 9, tone: 'market' }],
  },
  {
    id: 'm-2', seq: 5, kind: 'text', created_at: '2026-08-26T13:41:00Z', time_label: 'Today at 9:41',
    author: SAM, body: 'Is that volume real or just the open? @Kai verify',
    refs: null, structured_idea: null, position_disclosure: null,
    kai_object: null, deleted: false, is_claim: false, reactions: [],
  },
  {
    id: 'm-3', seq: 6, kind: 'kai_object', created_at: '2026-08-26T13:41:30Z', time_label: 'Today at 9:41',
    author: KAI, body: null, refs: { symbol: 'META' }, structured_idea: null,
    position_disclosure: null, kai_object: VERIFICATION, deleted: false, is_claim: false,
    reactions: [{ label: '21', count: 21, tone: 'kai' }],
  },
  {
    id: 'm-4', seq: 7, kind: 'text', created_at: '2026-08-26T13:44:00Z', time_label: 'Today at 9:44',
    author: MARCUS, body: 'Reminder: nothing here is advice, and no one posts fills without the plan that produced them.',
    refs: null, structured_idea: null, position_disclosure: null,
    kai_object: null, deleted: false, is_claim: false, reactions: [],
  },
  {
    id: 'm-5', seq: 8, kind: 'position_update', created_at: '2026-08-26T13:47:00Z', time_label: 'Today at 9:47',
    author: JORDAN,
    body: 'Took the entry at 504.10 on the hold. Stop stays at 460 — risk $58.',
    refs: { symbol: 'META' }, structured_idea: null,
    position_disclosure: { holds: true, symbol: 'META', label: 'Holds META' },
    kai_object: null, deleted: false, is_claim: true, reactions: [],
  },
  {
    id: 'm-6', seq: 9, kind: 'kai_object', created_at: '2026-08-26T13:49:00Z', time_label: 'Today at 9:49',
    author: KAI, body: null, refs: { symbol: 'META' }, structured_idea: null,
    position_disclosure: null, kai_object: SUMMARY, deleted: false, is_claim: false, reactions: [],
  },
];

export const fixtureAlertPreview: KaiRoomObject = {
  type: 'alert_preview',
  title: 'Alert preview',
  natural_language: 'Watch META for a break and hold above 504.',
  condition_lines: ['META price crosses above 504', 'and holds for 5 minutes'],
  data_dependency: 'META price · delayed 15m feed',
  frequency: 'Once',
  expires_label: 'Expires at the close',
  summary_plain: "You will hear from Kai the moment 504 holds. Nothing is bought.",
  monitoring_note: 'Armed · live evaluation starts when market data goes live.',
};

export const fixtureComparison: KaiRoomObject = {
  type: 'comparison',
  title: 'Bull vs bear · META',
  bull: ['Support held three times at 480', 'Relative volume 1.6× the 20-day average', 'VWAP reclaimed and held'],
  bear: ['No close above 504 yet — the missing confirmation', 'Broader market weak into the CPI print', 'Sellers still active on every push'],
  bull_plain: null,
  bear_plain: null,
  conclusion: 'Both sides agree on the level. They disagree about whether today is the day it holds.',
  footnote: 'Counting posts is not evidence — this is what people argued, not what is true.',
};

export const fixtureExplain: KaiRoomObject = {
  type: 'explain',
  title: 'Explained for a beginner',
  lines: [
    { label: 'What', text: 'META keeps stopping at the same price — 504. People are waiting to see if it can get past it.' },
    { label: 'Why it matters', text: 'If it gets above and stays, buyers are in control. If it fails again, sellers are.' },
    { label: 'The risk', text: 'If it drops below 460 the idea is wrong. That is $58 at the size Kai suggested.' },
  ],
  footnote: 'Kai prepares and explains. It never buys or sells anything.',
};

export const fixtureContributor: ContributorProfile = {
  user_id: 'u-jordan',
  display_name: 'Jordan',
  handle: 'jordan',
  initial: 'J',
  role_labels: ['Educator'],
  verified_identity: true,
  history: [
    { label: 'Ideas posted', value: '84' },
    { label: 'Theses updated', value: '61' },
    { label: 'Outcomes disclosed', value: '57' },
    { label: 'Ideas with defined risk', value: '92%' },
  ],
  feedback: [
    { label: 'Usefulness', score: 4.6, out_of: 5 },
    { label: 'Clarity', score: 4.8, out_of: 5 },
  ],
  feedback_note: 'Rated on usefulness and clarity — never on profit claims or P/L screenshots.',
  recent: [
    {
      id: 'm-1', room_name: 'meta-setup', time_label: 'Today at 9:40',
      body: 'Reclaimed VWAP on strong volume. Watching 501 for the entry.',
      disclosure: { holds: true, symbol: 'META', label: 'Holds META' },
    },
    {
      id: 'm-5', room_name: 'meta-setup', time_label: 'Today at 9:47',
      body: 'Took the entry at 504.10 on the hold. Stop stays at 460 — risk $58.',
      disclosure: { holds: true, symbol: 'META', label: 'Holds META' },
    },
    {
      id: 'm-9', room_name: 'Live Setups', time_label: 'Yesterday at 15:02',
      body: 'Closed the NVDA swing at the first target. Thesis played out, wrote it up in Reviews.',
      disclosure: { holds: false, symbol: 'NVDA', label: 'No position' },
    },
  ],
  muted: false,
};

/** Kai's improved draft, used by the structured composer in fixtures mode. */
export const fixtureAssist = {
  feedback:
    "Strong structure. One gap: no target or horizon — readers can't judge reward against the $58 risk. Your invalidation matches the live setup.",
  draft: {
    direction_thesis: 'Long META — buyers have defended 480 three times; I expect a move toward 540 if 504 gives way.',
    entry_condition: 'Break and hold above 504 for a full 5-minute candle, on above-average volume.',
    invalidation: 'A daily close below 460.',
    risk_size: '$58 at my planned size — inside my daily loss cap of $60.',
    target_horizon: '540 within 2–3 sessions; flat by Friday either way.',
    evidence: ['Chart attached', 'Relative volume 1.6×'],
  },
};
