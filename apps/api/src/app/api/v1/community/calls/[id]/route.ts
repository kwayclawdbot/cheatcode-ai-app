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
 */
import type { NextRequest } from 'next/server';
import { CommunityCall } from '@shared/api';
import { authedParams, ok, type Ctx } from '@/lib/http';
import { emitUserEvent } from '@/lib/events';
import { loadAuthor } from '@/lib/social/authors';
import { shapeCall, withdrawCall } from '@/lib/social/calls';

export const dynamic = 'force-dynamic';

async function withdraw(ctx: Ctx & { params: { id: string } }): Promise<Response> {
  const row = await withdrawCall({
    userId: ctx.user.id,
    callId: ctx.params.id,
    requestId: ctx.requestId,
  });

  await emitUserEvent(
    ctx.user.id,
    'system',
    'community_call',
    row.id,
    { event: 'call_withdrawn', symbol: row.symbol },
    ctx.requestId
  );

  const author = await loadAuthor(ctx.user.id, ctx.requestId);
  return ok({
    call: author ? CommunityCall.parse(shapeCall(row, author)) : null,
    plain: 'Withdrawn. It is off your profile and out of the feed, and it will not be scored.',
  });
}

export const DELETE = authedParams<{ id: string }>(
  async (_req: NextRequest, ctx: Ctx & { params: { id: string } }) => withdraw(ctx)
);

export const POST = authedParams<{ id: string }>(
  async (_req: NextRequest, ctx: Ctx & { params: { id: string } }) => withdraw(ctx)
);
