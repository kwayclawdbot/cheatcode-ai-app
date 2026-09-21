/**
 * GET /api/v1/community/feed?tab=for_you|following|trade_calls|media&cursor=&limit=
 *
 * One page of the V2 Community feed. The order, the tab filters and the
 * visibility rule are one SQL function (`community_feed_page`, 0050); this
 * route decodes the cursor, hydrates the ids into posts, and writes the next
 * cursor from the last row it handed out. See docs/COMMUNITY-FEED-2026-09-21.md
 * for the For You formula.
 *
 * A cursor this server did not write is a 400, not a silent first page: a
 * phone that sent a stale cursor and got page one again would show every post
 * twice.
 */
import type { NextRequest } from 'next/server';
import { FeedQuery, FeedResponse } from '@shared/community';
import { authed, ok, parseQuery, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { decodeFeedCursor, encodeFeedCursor, feedEmptyPlain, scoreString } from '@/lib/social/feed-shape';
import { feedPageIds, hydratePosts, loadPostRows } from '@/lib/social/posts';
import { followeeIds } from '@/lib/social/follows';

export const dynamic = 'force-dynamic';

export const GET = authed(async (req: NextRequest, ctx: Ctx) => {
  const q = parseQuery(req, FeedQuery);
  const cursor = q.cursor ? decodeFeedCursor(q.cursor) : null;
  if (q.cursor && !cursor) {
    throw new ApiError('VALIDATION_FAILED', 'That page marker is not one I recognise. Pull to refresh.', {
      detail: { reason: 'bad_cursor' },
    });
  }

  const page = await feedPageIds({ viewerId: ctx.user.id, tab: q.tab, limit: q.limit, cursor, requestId: ctx.requestId });
  const hasMore = page.length > q.limit;
  const slice = hasMore ? page.slice(0, q.limit) : page;

  const rows = await loadPostRows(slice.map((p) => p.message_id));
  const ordered = slice.map((p) => rows.get(p.message_id)).filter((r): r is NonNullable<typeof r> => Boolean(r));
  const repostedBy = new Map<string, string>();
  for (const p of slice) if (p.reposted_by) repostedBy.set(p.message_id, p.reposted_by);

  const posts = await hydratePosts(ordered, ctx.user.id, { repostedBy });
  const last = slice[slice.length - 1];

  let emptyPlain: string | null = null;
  if (!posts.length) {
    const followsNobody = q.tab === 'following' ? (await followeeIds(ctx.user.id)).length === 0 : false;
    emptyPlain = feedEmptyPlain(q.tab, { followsNobody, firstPage: !cursor });
  }

  return ok(
    FeedResponse.parse({
      tab: q.tab,
      posts,
      next_cursor: hasMore && last ? encodeFeedCursor({ s: scoreString(last.score), i: last.message_id }) : null,
      empty_plain: emptyPlain,
    })
  );
});
