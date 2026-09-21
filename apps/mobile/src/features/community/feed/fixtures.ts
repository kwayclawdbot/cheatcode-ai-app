/**
 * EXAMPLE COMMUNITY — reachable ONLY behind `EXPO_PUBLIC_FIXTURES=1`.
 *
 * Shaped exactly like `packages/shared/community.ts` (the types are imported,
 * so a contract change breaks this file at compile time rather than on screen).
 * A dead connection never falls back to these: `useFeed` says "unreachable"
 * instead, because an invented club is worse than an empty screen.
 */
import type {
  CommunityPost, FeedResponse, FeedTab, LiveRoom, LiveRoomsResponse, PostMedia, ThreadResponse,
} from '@shared/community';
import type { CommunityCall, SocialAuthor } from '@cheatcode/shared';

const HOUR = 3600_000;
const ago = (h: number) => new Date(Date.now() - h * HOUR).toISOString();

const who = (id: string, display_name: string, handle: string, belt: SocialAuthor['belt']): SocialAuthor => ({
  user_id: id, handle, display_name, avatar_url: null, initial: display_name.charAt(0), belt, stage: 'trade_ready',
});

export const FX_PEOPLE = {
  alex: who('fx-alex', 'Alex T.', 'alexcharts', 'purple'),
  maya: who('fx-maya', 'Maya', 'mayainvests', 'brown'),
  jordan: who('fx-jordan', 'Jordan M.', 'jordanm', 'blue'),
  taylor: who('fx-taylor', 'Taylor S.', 'taylors', 'white'),
  priya: who('fx-priya', 'Priya R.', 'priyaswings', 'black'),
  chris: who('fx-chris', 'Chris D.', 'chrisdaytrades', 'white'),
};

const FEED_ROOM = { id: 'fx-feed', slug: 'feed', name: 'Community Feed', is_feed: true };

function call(id: string, author: SocialAuthor, symbol: string, direction: 'long' | 'short',
  entry: number, stop: number, target: number, hoursAgo: number): CommunityCall {
  return {
    id, author, symbol, direction, entry, stop, target, thesis: '', mode: 'swing', message_id: null,
    scoreable: true, status: 'open', result_pct: null, outcome_label: 'Still open',
    published_at: ago(hoursAgo), time_label: `${hoursAgo}h ago`, resolved_at: null,
  };
}

function post(p: Partial<CommunityPost> & Pick<CommunityPost, 'id' | 'author' | 'body'> & { hoursAgo: number }): CommunityPost {
  const { hoursAgo, ...rest } = p;
  return {
    room: FEED_ROOM, parent_id: null, author_deleted: false,
    timestamp: ago(hoursAgo), time_label: hoursAgo < 1 ? `${Math.round(hoursAgo * 60)}m ago` : `${hoursAgo}h ago`,
    media: [], trade_call: null, result: null, quote: null,
    reply_count: 0, repost_count: 0, like_count: 0, liked: false, reposted: false, bookmarked: false,
    participants: [], reposted_by: null, mine: false, route: `/community/post/${rest.id}`,
    ...rest,
  };
}

const nvdaChart: PostMedia = {
  type: 'chart', position: 0, symbol: 'NVDA', timeframe: '1D',
  levels: [{ price: 180, kind: 'entry' }, { price: 172, kind: 'stop' }, { price: 205, kind: 'target' }],
};

export const FX_POSTS: CommunityPost[] = [
  post({
    id: 'fx-p1', author: FX_PEOPLE.alex, hoursAgo: 2,
    body: '$NVDA reclaimed 180 with volume. Watching the retest before adding.',
    media: [nvdaChart],
    trade_call: call('fx-c1', FX_PEOPLE.alex, 'NVDA', 'long', 180, 172, 205, 2),
    reply_count: 18, repost_count: 12, like_count: 84, liked: true,
    participants: [FX_PEOPLE.maya, FX_PEOPLE.jordan, FX_PEOPLE.priya],
  }),
  post({
    id: 'fx-p2', author: FX_PEOPLE.maya, hoursAgo: 4,
    body: 'Closed half at Target 1. Moving stop to breakeven. Discipline pays.',
    result: {
      call_id: 'fx-c2', symbol: 'UMC', direction: 'long', status: 'target', outcome_label: 'Hit target',
      result_pct: 5, resolved_at: ago(5), scoreable: true,
    },
    reply_count: 6, repost_count: 2, like_count: 28,
    participants: [FX_PEOPLE.taylor],
  }),
  post({
    id: 'fx-p3', author: FX_PEOPLE.chris, hoursAgo: 5,
    body: '$TSLA lost the morning low. Short against 252 with a tight stop.',
    trade_call: call('fx-c3', FX_PEOPLE.chris, 'TSLA', 'short', 248.5, 252, 240, 5),
    reply_count: 3, like_count: 11,
  }),
  post({
    id: 'fx-p4', author: FX_PEOPLE.taylor, hoursAgo: 6,
    body: 'First week paper trading. What is the one rule you wish you had learned earlier?',
    reply_count: 4, like_count: 5, repost_count: 1,
    participants: [FX_PEOPLE.alex, FX_PEOPLE.maya, FX_PEOPLE.priya],
    reposted_by: FX_PEOPLE.priya,
  }),
  post({
    id: 'fx-p5', author: FX_PEOPLE.priya, hoursAgo: 8,
    body: 'Patience today. $AMD is sitting right under 180 resistance. No chase, I want the close above it.',
    media: [{
      type: 'chart', position: 0, symbol: 'AMD', timeframe: '1D',
      levels: [{ price: 180, kind: 'resistance', label: 'Resistance' }, { price: 164.2, kind: 'support', label: 'Support' }],
    }],
    like_count: 2, bookmarked: true,
  }),
];

const matches = (tab: FeedTab, p: CommunityPost) =>
  tab === 'for_you' ? true
  : tab === 'following' ? [FX_PEOPLE.alex.user_id, FX_PEOPLE.maya.user_id, FX_PEOPLE.priya.user_id].includes(p.author?.user_id ?? '') || !!p.reposted_by
  : tab === 'trade_calls' ? !!p.trade_call
  : p.media.length > 0;

export function fixtureFeed(tab: FeedTab): FeedResponse {
  const posts = FX_POSTS.filter((p) => matches(tab, p)).map((p) => (tab === 'following' ? p : { ...p, reposted_by: null }));
  return { tab, posts, next_cursor: null, empty_plain: posts.length ? null : 'Nothing here yet.' };
}

const room = (id: string, slug: string, name: string, room_name: string, order: number,
  listener_count: number, live: boolean, speakers: SocialAuthor[]): LiveRoom => ({
  id, slug, name, room_name, topic: null, live, listener_count, speaker_avatars: speakers,
  last_activity_at: live ? ago(0.1) : ago(30), joined: true, order, route: `/room/${id}`,
});

export function fixtureLiveRooms(): LiveRoomsResponse {
  return {
    rooms: [
      room('fx-traders', 'traders', 'War Room', 'Traders Chat', 1, 146, true, [FX_PEOPLE.alex, FX_PEOPLE.maya, FX_PEOPLE.jordan, FX_PEOPLE.chris]),
      room('fx-investors', 'investors', 'Investors', 'Investors Chat', 2, 421, false, [FX_PEOPLE.priya]),
      room('fx-wins', 'wins', 'Wins', 'Wins', 3, 38, false, []),
      room('fx-ask-kai', 'ask-kai', 'Ask Kai', 'Ask Kai', 4, 319, false, []),
      room('fx-beginners', 'beginners', 'Beginners', 'Beginners Chat', 5, 57, false, [FX_PEOPLE.taylor]),
    ],
    online_total: 981,
    online_window_minutes: 5,
    live_window_minutes: 15,
  };
}

export function fixtureThread(id: string): ThreadResponse | null {
  const p = FX_POSTS.find((x) => x.id === id);
  if (!p) return null;
  const reply = (rid: string, author: SocialAuthor, body: string, h: number) =>
    post({ id: rid, author, body, hoursAgo: h, parent_id: p.id });
  return {
    post: p,
    replies: [
      reply(`${id}-r1`, FX_PEOPLE.jordan, 'Same read. Volume on the reclaim was the tell for me.', 1.5),
      reply(`${id}-r2`, FX_PEOPLE.maya, 'What would make you cut it before 172?', 1.2),
      reply(`${id}-r3`, FX_PEOPLE.alex, 'A close back under 178 on heavy volume. Then the reclaim failed and I am wrong early.', 1),
    ],
    next_cursor: null,
    empty_plain: null,
  };
}
