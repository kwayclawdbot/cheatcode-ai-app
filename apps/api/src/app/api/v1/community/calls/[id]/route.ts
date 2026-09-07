/**
 * DELETE /api/v1/community/calls/:id   — withdraw
 * POST   /api/v1/community/calls/:id   — withdraw (same thing, for clients that
 *                                        cannot send a DELETE)
 *
 * WITHDRAWING IS NOT DELETING. The row stays, its status becomes `withdrawn`,
 * and it stops appearing on the author's public profile and in every follower's
 * feed — but it is still there, and the author still sees it. That is the
 * honest reading of "I no longer stand behind this": a member may take back a
 * claim they have not been proved wrong on yet, and may not tidy away the ones
 * they have. `withdrawCall` refuses anything that has already resolved.
 *
 * A call belonging to somebody else answers NOT_FOUND rather than FORBIDDEN.
 * There is no reason for this route to confirm which ids exist.
 *
 * AND IT REACHES THE ROOM. Since 0040 a published call is also a post in its
 * desk's conversation, so withdrawing has to take that post down as well — a
 * card left standing with an entry and a stop would still be presenting a live
 * trade the member has just taken back, which would make the button theatre.
 * The post is SOFT-deleted, exactly the way a moderator's removal soft-deletes
 * one: it keeps its place in the thread and loses its words, and the replies
 * underneath are left alone. Nobody's conversation is hard-deleted.
 */
import type { NextRequest } from 'next/server';
import { CommunityCall } from '@shared/api';
import { authedParams, ok, type Ctx } from '@/lib/http';
import { emitUserEvent } from '@/lib/events';
import { loadAuthor } from '@/lib/social/authors';
import { shapeCall, withdrawCall } from '@/lib/social/calls';
import { retractCallMessage } from '@/lib/social/rooms-bridge';

export const dynamic = 'force-dynamic';

async function withdraw(ctx: Ctx & { params: { id: string } }): Promise<Response> {
  const row = await withdrawCall({
    userId: ctx.user.id,
    callId: ctx.params.id,
    requestId: ctx.requestId,
  });

  // Runs AFTER the withdrawal, and never blocks it. The call is already taken
  // back; a chat write that fails must not make the member think it was not.
  // It answers false when there was no post to take down — a call published
  // during a minute the room refused it — which is not a failure, just nothing
  // to do.
  const postRemoved = await retractCallMessage({
    messageId: row.message_id,
    userId: ctx.user.id,
    requestId: ctx.requestId,
  });

  await emitUserEvent(
    ctx.user.id,
    'system',
    'community_call',
    row.id,
    { event: 'call_withdrawn', symbol: row.symbol, message_removed: postRemoved },
    ctx.requestId
  );

  const author = await loadAuthor(ctx.user.id, ctx.requestId);
  return ok({
    call: author ? CommunityCall.parse(shapeCall(row, author)) : null,
    plain: postRemoved
      ? 'Withdrawn. It is off your profile, its post is gone from the room, and it will not be scored.'
      : 'Withdrawn. It is off your profile and out of the feed, and it will not be scored.',
  });
}

export const DELETE = authedParams<{ id: string }>(
  async (_req: NextRequest, ctx: Ctx & { params: { id: string } }) => withdraw(ctx)
);

export const POST = authedParams<{ id: string }>(
  async (_req: NextRequest, ctx: Ctx & { params: { id: string } }) => withdraw(ctx)
);
