/**
 * GET    /api/v1/community/posts/:id — the post and the first page of its replies
 * DELETE /api/v1/community/posts/:id — delete your own post (or reply)
 *
 * DELETING IS SOFT, AND IT CASCADES THE SAME WAY A MODERATOR'S REMOVAL DOES.
 * The row keeps its place and loses its words (deleted_at); its replies come
 * down with it (deleted_cascade_of names the post); its pictures are purged by
 * the 0033 trigger; the parent's reply_count is recounted by the 0033 trigger;
 * its reposts and bookmarks are dropped because they would point at a gap.
 *
 * A POST CARRYING A CALL:
 *   open       → the call is withdrawn with it (it will not be scored)
 *   resolved   → refused. A member may take back a claim that has not been
 *                proved wrong yet; they may not tidy away one that has
 *                (the rule withdrawCall already enforces for the calls route).
 *
 * Somebody else's post answers NOT_FOUND, not FORBIDDEN.
 */
import type { NextRequest } from 'next/server';
import { DeletePostResponse, ThreadResponse } from '@shared/community';
import { authedParams, ok, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { serviceClient } from '@/lib/db';
import { emitUserEvent } from '@/lib/events';
import { withdrawCall } from '@/lib/social/calls';
import { dropPointersTo, hydratePosts, loadVisiblePost } from '@/lib/social/posts';
import { repliesPage } from '@/lib/social/threads';

export const dynamic = 'force-dynamic';

export const GET = authedParams<{ id: string }>(async (_req: NextRequest, ctx: Ctx & { params: { id: string } }) => {
  const { row } = await loadVisiblePost(ctx.params.id, ctx.user.id);
  const [post] = await hydratePosts([row], ctx.user.id);
  const page = await repliesPage({ parentId: row.id, viewerId: ctx.user.id, limit: 30, cursor: null });
  return ok(
    ThreadResponse.parse({
      post,
      replies: page.replies,
      next_cursor: page.next_cursor,
      empty_plain: page.replies.length ? null : 'No replies yet.',
    })
  );
});

export const DELETE = authedParams<{ id: string }>(async (_req: NextRequest, ctx: Ctx & { params: { id: string } }) => {
  const { row } = await loadVisiblePost(ctx.params.id, ctx.user.id, { allowReply: true, allowDeleted: true });
  if (row.user_id !== ctx.user.id) {
    throw new ApiError('NOT_FOUND', 'I could not find that post. It may have been deleted.');
  }
  if (row.deleted_at) {
    return ok(
      DeletePostResponse.parse({
        post_id: row.id,
        deleted: true,
        replies_removed: 0,
        call_withdrawn: false,
        plain: 'That post was already deleted.',
      })
    );
  }

  // The call first: if it has resolved, nothing is deleted at all.
  const callId = typeof row.refs?.community_call_id === 'string' ? row.refs.community_call_id : null;
  let callWithdrawn = false;
  if (callId) {
    const db0 = serviceClient();
    const { data } = await db0.from('community_calls').select('status').eq('id', callId).maybeSingle();
    const status = String((data as Record<string, unknown> | null)?.status ?? 'withdrawn');
    if (status === 'open') {
      await withdrawCall({ userId: ctx.user.id, callId, requestId: ctx.requestId });
      callWithdrawn = true;
    } else if (status !== 'withdrawn') {
      throw new ApiError(
        'STATE_CONFLICT',
        'That post carries a call that has already resolved, so it stays on your record. You can reply to it instead.'
      );
    }
  }

  const db = serviceClient();
  const now = new Date().toISOString();
  const del = await db
    .from('messages')
    .update({ deleted_at: now, deleted_by: ctx.user.id, deleted_reason: 'Deleted by its author.' })
    .eq('id', row.id)
    .eq('user_id', ctx.user.id)
    .is('deleted_at', null)
    .select('id');
  if (del.error) {
    throw new ApiError('INTERNAL', 'We could not delete that. Please try again.', { detail: del.error.message });
  }

  let repliesRemoved = 0;
  const gone = [row.id];
  if (!row.parent_id) {
    const cascade = await db
      .from('messages')
      .update({
        deleted_at: now,
        deleted_by: ctx.user.id,
        deleted_reason: 'Removed with the post it answered, which its author deleted.',
        deleted_cascade_of: row.id,
      })
      .eq('parent_id', row.id)
      .is('deleted_at', null)
      .select('id');
    const ids = ((cascade.data ?? []) as Record<string, unknown>[]).map((r) => String(r.id));
    repliesRemoved = ids.length;
    gone.push(...ids);
  }
  await dropPointersTo(gone);

  await emitUserEvent(
    ctx.user.id,
    'system',
    'message',
    row.id,
    { event: 'feed_post_deleted', replies_removed: repliesRemoved, call_withdrawn: callWithdrawn },
    ctx.requestId
  );

  const parts = ['Deleted.'];
  if (repliesRemoved === 1) parts.push('One reply came down with it.');
  else if (repliesRemoved > 1) parts.push(`${repliesRemoved} replies came down with it.`);
  if (callWithdrawn) parts.push('Its call was withdrawn and will not be scored.');

  return ok(
    DeletePostResponse.parse({
      post_id: row.id,
      deleted: true,
      replies_removed: repliesRemoved,
      call_withdrawn: callWithdrawn,
      plain: parts.join(' '),
    })
  );
});
