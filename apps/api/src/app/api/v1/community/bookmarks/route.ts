/**
 * GET /api/v1/community/bookmarks?cursor=&limit=
 *
 * The caller's saved posts, most recently saved first. Only ever the caller's:
 * the query is keyed on ctx.user.id and nothing else, and post_bookmarks has no
 * client grant at all (0050). A saved post that has since been deleted, or that
 * sits in a room the caller is now banned from, is left out rather than shown
 * as a gap — a bookmark list is a reading list, not a record.
 */
import type { NextRequest } from 'next/server';
import { BookmarksResponse, ThreadQuery } from '@shared/community';
import { authed, ok, parseQuery, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { serviceClient } from '@/lib/db';
import { decodeTimeCursor, encodeTimeCursor } from '@/lib/social/feed-shape';
import { hydratePosts, loadPostRows, visibleForViewer } from '@/lib/social/posts';

export const dynamic = 'force-dynamic';

export const GET = authed(async (req: NextRequest, ctx: Ctx) => {
  const q = parseQuery(req, ThreadQuery);
  const cur = q.cursor ? decodeTimeCursor(q.cursor) : null;
  if (q.cursor && !cur) {
    throw new ApiError('VALIDATION_FAILED', 'That page marker is not one I recognise. Pull to refresh.', {
      detail: { reason: 'bad_cursor' },
    });
  }
  const db = serviceClient();
  let query = db
    .from('post_bookmarks')
    .select('message_id,created_at')
    .eq('user_id', ctx.user.id)
    .order('created_at', { ascending: false })
    .order('message_id', { ascending: false })
    .limit(q.limit + 1);
  if (cur) query = query.or(`created_at.lt.${cur.t},and(created_at.eq.${cur.t},message_id.lt.${cur.i})`);
  const { data, error } = await query;
  if (error) throw new ApiError('INTERNAL', 'We could not load your saved posts. Please try again.', { detail: error.message });

  const marks = (data ?? []) as { message_id: string; created_at: string }[];
  const hasMore = marks.length > q.limit;
  const page = hasMore ? marks.slice(0, q.limit) : marks;
  const rows = await loadPostRows(page.map((m) => m.message_id));
  const visible = await visibleForViewer([...rows.values()], ctx.user.id);
  const ordered = page.map((m) => rows.get(m.message_id)).filter((r): r is NonNullable<typeof r> => Boolean(r && visible.has(r.id)));
  const posts = await hydratePosts(ordered, ctx.user.id);
  const last = page[page.length - 1];

  return ok(
    BookmarksResponse.parse({
      posts,
      next_cursor: hasMore && last ? encodeTimeCursor({ t: last.created_at, i: last.message_id }) : null,
      empty_plain: posts.length ? null : q.cursor ? 'That is everything.' : 'Nothing saved yet. Tap the bookmark on a post to keep it here.',
    })
  );
});
