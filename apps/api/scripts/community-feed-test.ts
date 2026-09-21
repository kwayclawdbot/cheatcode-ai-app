/**
 * The feed's pure half — cursors, chart attachments, media order, result cards,
 * the create-post contract.
 *
 *   cd apps/api && npm test
 *
 * No database, no network, no clock. The database half (every endpoint, RLS,
 * ranking, counts, delete cascade) is `scripts/community-feed-proof.mts`.
 */
import { CreatePostBody, ChartAttachment, FeedQuery, PresenceBody } from '../../../packages/shared/community.ts';
import { CommunityCall } from '../../../packages/shared/api.ts';
import {
  chartsFromRefs,
  decodeFeedCursor,
  decodeTimeCursor,
  encodeFeedCursor,
  encodeTimeCursor,
  feedEmptyPlain,
  participantIds,
  postMediaOf,
  resultOf,
  scoreString,
  thesisFor,
} from '../src/lib/social/feed-shape.ts';

let pass = 0;
let fail = 0;
function ok(name: string, cond: unknown, detail?: unknown): void {
  if (cond) {
    pass += 1;
    console.log(`  PASS  ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${name}${detail === undefined ? '' : `\n        ${JSON.stringify(detail)}`}`);
  }
}
const section = (t: string) => console.log(`\n${t}`);
const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';

section('Feed cursors round-trip exactly and refuse anything we did not write');
{
  const c = { s: '1790000000.123456', i: ID };
  ok('a 16-digit score survives the round trip as a string', decodeFeedCursor(encodeFeedCursor(c))?.s === c.s);
  ok('the id survives', decodeFeedCursor(encodeFeedCursor(c))?.i === ID);
  ok('garbage is null, not a throw', decodeFeedCursor('not-a-cursor') === null);
  ok('empty is null', decodeFeedCursor('') === null && decodeFeedCursor(undefined) === null);
  ok('a non-uuid id is refused', decodeFeedCursor(encodeFeedCursor({ s: '1', i: 'x; drop table' })) === null);
  ok('an injected score is refused', decodeFeedCursor(encodeFeedCursor({ s: '1),(1', i: ID })) === null);
  ok('a numeric score written by an older client is accepted', decodeFeedCursor(Buffer.from(JSON.stringify({ s: 12.5, i: ID })).toString('base64url'))?.s === '12.5');
}

section('Time cursors (threads, bookmarks)');
{
  const t = '2026-09-21T20:30:01.123456+00:00';
  ok('round-trips a Postgres timestamp', decodeTimeCursor(encodeTimeCursor({ t, i: ID }))?.t === t);
  ok('refuses a non-date', decodeTimeCursor(encodeTimeCursor({ t: 'yesterday', i: ID })) === null);
  ok('refuses a filter injection in the time', decodeTimeCursor(encodeTimeCursor({ t: '2026-09-21T00:00:00Z,id.gt.0', i: ID })) === null);
}

section('Scores are kept as the database wrote them');
{
  ok('a string passes through untouched', scoreString('1790000000.123456') === '1790000000.123456');
  ok('a number keeps 6 decimals and drops trailing zeros', scoreString(497222.5) === '497222.5');
  ok('an integer stays an integer', scoreString(1234560) === '1234560');
  ok('nonsense becomes 0, never NaN', scoreString('abc') === '0');
}

section('Chart attachments are data, validated');
{
  const good = ChartAttachment.safeParse({ symbol: 'nvda', timeframe: '1D', levels: [{ price: 180, kind: 'support' }] });
  ok('lower-case ticker is upper-cased', good.success && good.data.symbol === 'NVDA');
  ok('a level without a kind defaults to "level"', ChartAttachment.parse({ symbol: 'AMD', timeframe: '1h', levels: [{ price: 1 }] }).levels[0].kind === 'level');
  ok('levels default to none', ChartAttachment.parse({ symbol: 'AMD', timeframe: '1h' }).levels.length === 0);
  ok('an unknown timeframe is refused', !ChartAttachment.safeParse({ symbol: 'AMD', timeframe: '2h' }).success);
  ok('a ticker that is a sentence is refused', !ChartAttachment.safeParse({ symbol: 'buy now!!', timeframe: '1D' }).success);
  ok('a negative price is refused', !ChartAttachment.safeParse({ symbol: 'AMD', timeframe: '1D', levels: [{ price: -1 }] }).success);
  ok('seven levels is refused', !ChartAttachment.safeParse({ symbol: 'AMD', timeframe: '1D', levels: Array.from({ length: 7 }, (_, i) => ({ price: i + 1 })) }).success);
  ok('BRK.B is a ticker', ChartAttachment.safeParse({ symbol: 'BRK.B', timeframe: '1W' }).success);
  ok('a hand-edited bad chart in refs is dropped on the way out', chartsFromRefs({ charts: [{ symbol: 'AMD', timeframe: '1D' }, { symbol: 7 }] }).length === 1);
  ok('refs without charts is no charts', chartsFromRefs(null).length === 0 && chartsFromRefs({ charts: 'x' }).length === 0);
}

section('Media: pictures first in the order picked, then charts');
{
  const img = (id: string, position: number) => ({ id, url: null, mime_type: 'image/png', width: 1, height: 1, bytes: 1, aspect: 1, position });
  const m = postMediaOf([img('b', 1), img('a', 0)], { charts: [{ symbol: 'NVDA', timeframe: '1D', levels: [] }] });
  ok('three items', m.length === 3);
  ok('images sorted by position', m[0].type === 'image' && (m[0] as { id: string }).id === 'a');
  ok('chart comes after the pictures with the next position', m[2].type === 'chart' && m[2].position === 2);
}

section('A result card exists only for a RESOLVED call');
{
  const author = { user_id: 'u', handle: 'h', display_name: 'H', avatar_url: null, initial: 'H', belt: 'white' as const };
  const base = CommunityCall.parse({
    id: 'c', author, symbol: 'UMC', direction: 'long', entry: 10, stop: 9, target: 12, thesis: 't', scoreable: true,
    status: 'open', result_pct: null, outcome_label: 'Still open', published_at: 'x', time_label: 'now', resolved_at: null,
  });
  ok('open → no result', resultOf(base) === null);
  ok('withdrawn → no result', resultOf({ ...base, status: 'withdrawn' }) === null);
  const won = resultOf({ ...base, status: 'target', result_pct: 20, outcome_label: 'Hit target', resolved_at: 'y' });
  ok('target → result with the resolver percent', won?.status === 'target' && won.result_pct === 20);
  ok('stopped → result', resultOf({ ...base, status: 'stop', result_pct: -10 })?.status === 'stop');
  ok('no call → no result', resultOf(null) === null);
  ok('the result carries no size field', won !== null && !Object.keys(won).some((k) => /qty|quantity|size|notional|pnl|shares/.test(k)));
}

section('The create-post contract');
{
  ok('an empty post is refused', !CreatePostBody.safeParse({ body: '   ' }).success);
  ok('a chart alone is a post', CreatePostBody.safeParse({ charts: [{ symbol: 'NVDA', timeframe: '1D' }] }).success);
  ok('a call alone is a post', CreatePostBody.safeParse({ trade_call: { symbol: 'NVDA', direction: 'long', entry: 180, stop: 172 } }).success);
  ok('five pictures is refused', !CreatePostBody.safeParse({ body: 'x', attachment_ids: Array.from({ length: 5 }, () => ID) }).success);
  ok('a non-uuid attachment id is refused', !CreatePostBody.safeParse({ body: 'x', attachment_ids: ['../etc'] }).success);
  ok('three charts is refused', !CreatePostBody.safeParse({ charts: Array.from({ length: 3 }, () => ({ symbol: 'A', timeframe: '1D' })) }).success);
  ok('4001 characters is refused', !CreatePostBody.safeParse({ body: 'x'.repeat(4001) }).success);
  const sized = CreatePostBody.safeParse({ body: 'x', trade_call: { symbol: 'A', direction: 'long', qty: 500, notional: 10000 } });
  ok('size fields on a call are STRIPPED, never stored', sized.success && !('qty' in (sized.data.trade_call ?? {})) && !('notional' in (sized.data.trade_call ?? {})));
  ok('feed tab defaults to for_you', FeedQuery.parse({}).tab === 'for_you');
  ok('an unknown tab is refused', !FeedQuery.safeParse({ tab: 'hot' }).success);
  ok('limit is capped at 50', !FeedQuery.safeParse({ limit: '51' }).success);
  ok('presence with no room is the feed', PresenceBody.parse({}).room_id === undefined);
  ok('presence with a non-uuid room is refused', !PresenceBody.safeParse({ room_id: 'war-room' }).success);
}

section('Small pieces');
{
  ok('a long post becomes a ≤280 thesis', thesisFor('word '.repeat(200), 'nvda', 'long').length <= 280);
  ok('an empty post gets "Long NVDA"', thesisFor('', 'nvda', 'long') === 'Long NVDA');
  const p = participantIds([
    { parent_id: 'p', user_id: 'a' }, { parent_id: 'p', user_id: 'a' }, { parent_id: 'p', user_id: 'b' },
    { parent_id: 'p', user_id: 'c' }, { parent_id: 'p', user_id: 'd' }, { parent_id: 'q', user_id: null },
  ]);
  ok('participants: three distinct, most recent first', JSON.stringify(p.get('p')) === '["a","b","c"]');
  ok('following-nobody copy differs from followees-quiet copy',
    feedEmptyPlain('following', { followsNobody: true, firstPage: true }) !== feedEmptyPlain('following', { followsNobody: false, firstPage: true }));
  ok('past the last page says so', feedEmptyPlain('for_you', { firstPage: false }) === 'That is everything.');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
