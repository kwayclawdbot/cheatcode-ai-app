/**
 * POST   /api/v1/community/posts/:id/repost — turn it on (idempotent)
 * DELETE /api/v1/community/posts/:id/repost — turn it off (idempotent)
 *
 * Answers the caller's state and the post's live count. See lib/social/post-actions.ts.
 */
import type { NextRequest } from 'next/server';
import { PostToggleResponse } from '@shared/community';
import { authedParams, ok, type Ctx } from '@/lib/http';
import { setRepost } from '@/lib/social/post-actions';

export const dynamic = 'force-dynamic';

async function run(ctx: Ctx & { params: { id: string } }, on: boolean): Promise<Response> {
  const r = await setRepost({ postId: ctx.params.id, userId: ctx.user.id, on });
  return ok(PostToggleResponse.parse({ post_id: ctx.params.id, on: r.on, count: r.count }));
}

export const POST = authedParams<{ id: string }>(async (_req: NextRequest, ctx) => run(ctx, true));
export const DELETE = authedParams<{ id: string }>(async (_req: NextRequest, ctx) => run(ctx, false));
