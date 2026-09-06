/**
 * Fixtures for EXPO_PUBLIC_FIXTURES=1 (owner preview + Playwright proof).
 * Copy is lifted from the artboards: V3-C0 community home, V3-C1 setup room,
 * V3-C1 community summary, S81 room, S84 composer, S85 profile.
 *
 * These are demo objects, not market data — every price carries `delayed`
 * freshness and the seeded `source_ts` rhythm the rest of the app uses.
 */
import type {
  Author, ContributorProfile, KaiRoomObject, MessageMedia, Room, RoomMessage, RoomSetup,
} from './types';
import { EMPTY_REACTIONS } from './types';

const KAI: Author = {
  user_id: 'kai', display_name: 'Kai', handle: null, avatar_url: null, initial: 'K',
  role_labels: ['AI'], is_kai: true, author_deleted: false,
};
const JORDAN: Author = {
  user_id: 'u-jordan', display_name: 'Jordan', handle: 'jordan', avatar_url: null, initial: 'J',
  role_labels: ['Educator'], is_kai: false, author_deleted: false,
};
const SAM: Author = {
  user_id: 'u-sam', display_name: 'Sam', handle: 'sam', avatar_url: null, initial: 'S',
  role_labels: [], is_kai: false, author_deleted: false,
};
const MARCUS: Author = {
  user_id: 'u-marcus', display_name: 'Marcus T.', handle: 'marcus', avatar_url: null, initial: 'M',
  role_labels: ['Moderator'], is_kai: false, author_deleted: false,
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

/**
 * The three rooms (owner decision 2026-08-26). Nothing else is a room any more:
 * no per-mode sub-rooms, no setup rooms in the directory.
 *
 * `#day-trade` keeps the META setup attached and the fixture conversation about
 * it, so the room screen's pinned-setup path and the @Kai objects still have
 * something real-shaped to render in the proof shots.
 */
export const fixtureRooms: Room[] = [
  {
    id: 'room-day-trade', slug: 'day-trade', name: 'Day Trade',
    description: 'Intraday setups, confirmations, exits — today.',
    mode: 'day_trade', type: 'core',
    member_count: 124, discussing_count: 31, unread: 3, last_read_seq: 4,
    joined: true, muted_until: null,
    config: { slow_mode_s: 0, intel_eligible: false },
    pinned: [{ kind: 'kai', text: 'Watching META and NVDA into the open. CPI print at 10:00 is the main risk.' }],
    setup_id: META_SETUP.id,
    setup: META_SETUP,
    preview: { who: 'Kai', text: 'volume confirmed 1.6×', by_kai: true },
  },
  {
    id: 'room-swing', slug: 'swing', name: 'Swing',
    description: 'Ideas held for days or weeks: theses, catalysts, updates.',
    mode: 'swing', type: 'core',
    member_count: 52, discussing_count: 7, unread: 0, last_read_seq: 0,
    joined: false, muted_until: null,
    config: { intel_eligible: false }, pinned: [], setup_id: null, setup: null,
    preview: { who: 'Jordan', text: 'catalyst thread updated', by_kai: false },
  },
  {
    id: 'room-investing', slug: 'investing', name: 'Investing',
    description: 'Building and reviewing a long-term portfolio.',
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

/**
 * A picture for the fixture feed, so the media frame can be SEEN in a proof
 * screenshot rather than only asserted in a test.
 *
 * A data URI and not a file in `assets/`: it is example content, it belongs
 * with the rest of the example content, and a fixture that adds a binary to
 * the repository is a fixture somebody will later mistake for a real asset.
 * Nothing in the app ever writes a data URI — a real attachment is always a
 * short-lived signed URL from the private bucket.
 */
const FIXTURE_CHART: MessageMedia = {
  id: 'fixture-chart',
  url:
    'data:image/png;base64,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',
  mime_type: 'image/png',
  width: 480,
  height: 300,
  bytes: 2852,
  aspect: 0.625,
};

export const fixtureMessages: RoomMessage[] = [
  {
    id: 'm-1', room_id: 'room-meta', seq: 4, kind: 'text', created_at: '2026-08-26T13:40:00Z', time_label: 'Today at 9:40',
    author: JORDAN, body: '$META reclaimed VWAP on strong volume. Watching 501 for the entry.',
    refs: { symbol: 'META', levels: [501] }, structured_idea: null,
    position_disclosure: { holds: true, symbol: 'META', label: 'Holds META' },
    kai_object: null, deleted: false, is_claim: true,
    // `watching` is here on purpose: it is one of the two kinds nobody can give
    // any more, and the bar has to keep drawing counts that already exist.
    reactions: { counts: { agree: 14, fire: 6, watching: 9 }, mine: ['agree'] }, reply_count: 3,
    parent_id: null, quote: null, media: [FIXTURE_CHART], author_deleted: false,
  },
  {
    id: 'm-2', room_id: 'room-meta', seq: 5, kind: 'text', created_at: '2026-08-26T13:41:00Z', time_label: 'Today at 9:41',
    author: SAM, body: 'Is that volume real or just the open? @Kai verify',
    refs: null, structured_idea: null, position_disclosure: null,
    kai_object: null, deleted: false, is_claim: false, reactions: EMPTY_REACTIONS, reply_count: 0, parent_id: null, quote: null, media: [], author_deleted: false,
  },
  {
    id: 'm-3', room_id: 'room-meta', seq: 6, kind: 'kai_object', created_at: '2026-08-26T13:41:30Z', time_label: 'Today at 9:41',
    author: KAI, body: null, refs: { symbol: 'META' }, structured_idea: null,
    position_disclosure: null, kai_object: VERIFICATION, deleted: false, is_claim: false,
    reactions: { counts: { useful: 21 }, mine: [] }, reply_count: 0,
    parent_id: null, quote: null, media: [], author_deleted: false,
  },
  {
    id: 'm-4', room_id: 'room-meta', seq: 7, kind: 'text', created_at: '2026-08-26T13:44:00Z', time_label: 'Today at 9:44',
    author: MARCUS, body: 'Reminder: nothing here is advice, and no one posts fills without the plan that produced them.',
    refs: null, structured_idea: null, position_disclosure: null,
    kai_object: null, deleted: false, is_claim: false, reactions: EMPTY_REACTIONS, reply_count: 0, parent_id: null, quote: null, media: [], author_deleted: false,
  },
  {
    id: 'm-5', room_id: 'room-meta', seq: 8, kind: 'position_update', created_at: '2026-08-26T13:47:00Z', time_label: 'Today at 9:47',
    author: JORDAN,
    body: 'Took the entry at 504.10 on the hold. Stop stays at 460 — risk $58.',
    refs: { symbol: 'META' }, structured_idea: null,
    position_disclosure: { holds: true, symbol: 'META', label: 'Holds META' },
    kai_object: null, deleted: false, is_claim: true, reactions: EMPTY_REACTIONS, reply_count: 0, parent_id: null, quote: null, media: [], author_deleted: false,
  },
  {
    id: 'm-6', room_id: 'room-meta', seq: 9, kind: 'kai_object', created_at: '2026-08-26T13:49:00Z', time_label: 'Today at 9:49',
    author: KAI, body: null, refs: { symbol: 'META' }, structured_idea: null,
    position_disclosure: null, kai_object: SUMMARY, deleted: false, is_claim: false, reactions: EMPTY_REACTIONS, reply_count: 0, parent_id: null, quote: null, media: [], author_deleted: false,
  },
];

/**
 * A THREAD, so the comments screen can be proved in fixtures.
 *
 * Four comments, and each one is here because it is a case that is easy to get
 * wrong:
 *
 *  · c1 answers the POST — the ordinary comment, quoting nothing.
 *  · c2 was REMOVED. It keeps its place and loses its words, because a comment
 *    that answers something no longer there reads as a non-sequitur unless you
 *    can see that something was removed.
 *  · c3 answers c1 — it quotes a SIBLING, so it draws indented under c1 while
 *    still hanging off the post.
 *  · c4 answers c3, which is already indented. It does NOT go a second level
 *    right; it sits beside c3 under c1. One level of indent is the whole rule.
 *
 * `parent_id` is the POST on every one of them and `reply_count` is zero on
 * every one of them, which is the threading rule in two fields: a comment
 * belongs to a post and can never be the parent of anything. The shape of the
 * conversation lives in `quote`, not in the tree.
 */
export function fixtureThread(parentId: string): RoomMessage[] {
  const quoteOfC1 = {
    message_id: `${parentId}-c1`,
    author_name: SAM.display_name,
    handle: SAM.handle,
    text: 'What is your invalidation on that? 501 is thin on the daily.',
    deleted: false,
  };
  return [
    {
      id: `${parentId}-c1`, room_id: 'room-meta', seq: 101, kind: 'text',
      created_at: '2026-08-26T13:42:00Z', time_label: 'Today at 9:42',
      author: SAM, body: 'What is your invalidation on that? 501 is thin on the daily.',
      refs: null, structured_idea: null, position_disclosure: null, kai_object: null,
      deleted: false, is_claim: false,
      reactions: { counts: { agree: 3, useful: 1 }, mine: [] },
      reply_count: 0, parent_id: parentId, quote: null, media: [], author_deleted: false,
    },
    {
      id: `${parentId}-c2`, room_id: 'room-meta', seq: 102, kind: 'text',
      created_at: '2026-08-26T13:43:00Z', time_label: 'Today at 9:43',
      author: MARCUS, body: null,
      refs: null, structured_idea: null, position_disclosure: null, kai_object: null,
      deleted: true, is_claim: false,
      reactions: EMPTY_REACTIONS, reply_count: 0, parent_id: parentId, quote: null,
      media: [], author_deleted: false,
    },
    {
      id: `${parentId}-c3`, room_id: 'room-meta', seq: 103, kind: 'text',
      created_at: '2026-08-26T13:45:00Z', time_label: 'Today at 9:45',
      author: JORDAN, body: 'Below 495 the whole reason for being in it is gone. Stop is there, not at 501.',
      refs: { levels: [495, 501] }, structured_idea: null, position_disclosure: null, kai_object: null,
      deleted: false, is_claim: true,
      reactions: { counts: { agree: 6, chart_up: 4, watching: 2 }, mine: ['agree'] },
      reply_count: 0, parent_id: parentId, quote: quoteOfC1, media: [], author_deleted: false,
    },
    {
      id: `${parentId}-c4`, room_id: 'room-meta', seq: 104, kind: 'text',
      created_at: '2026-08-26T13:46:00Z', time_label: 'Today at 9:46',
      author: SAM, body: 'That is clearer, thanks. Same read on $NVDA into the print?',
      refs: null, structured_idea: null, position_disclosure: null, kai_object: null,
      deleted: false, is_claim: false,
      reactions: { counts: { hundred: 2 }, mine: [] },
      reply_count: 0, parent_id: parentId,
      quote: {
        message_id: `${parentId}-c3`,
        author_name: JORDAN.display_name,
        handle: JORDAN.handle,
        text: 'Below 495 the whole reason for being in it is gone. Stop is there, not at 501.',
        deleted: false,
      },
      media: [], author_deleted: false,
    },
  ];
}

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
