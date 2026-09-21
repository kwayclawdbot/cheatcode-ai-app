/**
 * Replies under a feed post, oldest first, paged by (created_at, id).
 *
 * A deleted reply keeps its place as a gap (body null, `deleted` shape) the
 * same way a room shows one — a conversation with holes cut silently out of it
 * reads as people answering things nobody said.
 */
import type { CommunityPost } from '@shared/community';
import { serviceClient } from '../db';
import { ApiError } from '../errors';
import { decodeTimeCursor, encodeTimeCursor } from './feed-shape';
import { hydratePosts, POST_COLUMNS, toPostRow } from './posts';

export async function repliesPage(opts: {
  parentId: string;
  viewerId: string;
  limit: number;
  cursor: string | null;
}): Promise<{ replies: CommunityPost[]; next_cursor: string | null }> {
  const cur = opts.cursor ? decodeTimeCursor(opts.cursor) : null;
  if (opts.cursor && !cur) {
    throw new ApiError('VALIDATION_FAILED', 'That page marker is not one I recognise. Pull to refresh.', {
      detail: { reason: 'bad_cursor' },
    });
  }
  const db = serviceClient();
  let q = db
    .from('messages')
    .select(POST_COLUMNS)
    .eq('parent_id', opts.parentId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(opts.limit + 1);
  if (cur) q = q.or(`created_at.gt.${cur.t},and(created_at.eq.${cur.t},id.gt.${cur.i})`);
  const { data, error } = await q;
  if (error) throw new ApiError('INTERNAL', 'We could not load the replies. Please try again.', { detail: error.message });

  const rows = ((data ?? []) as Record<string, unknown>[]).map(toPostRow);
  const hasMore = rows.length > opts.limit;
  const page = hasMore ? rows.slice(0, opts.limit) : rows;
  const replies = await hydratePosts(page, opts.viewerId);
  const last = page[page.length - 1];
  return {
    replies,
    next_cursor: hasMore && last ? encodeTimeCursor({ t: last.created_at, i: last.id }) : null,
  };
}
