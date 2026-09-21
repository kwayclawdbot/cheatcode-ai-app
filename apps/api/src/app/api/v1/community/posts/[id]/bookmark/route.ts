/**
 * POST   /api/v1/community/posts/:id/bookmark — save it (idempotent)
 * DELETE /api/v1/community/posts/:id/bookmark — unsave it (idempotent)
 *
 * PRIVATE. Nobody else can learn what you saved: there is no bookmark count on
 * a post and the list (GET /community/bookmarks) is only ever yours.
 */
import type { NextRequest } from 'next/server';
import { BookmarkResponse } from '@shared/community';
import { authedParams, ok, type Ctx } from '@/lib/http';
import { setBookmark } from '@/lib/social/post-actions';

export const dynamic = 'force-dynamic';

async function run(ctx: Ctx & { params: { id: string } }, on: boolean): Promise<Response> {
  const r = await setBookmark({ postId: ctx.params.id, userId: ctx.user.id, on });
  return ok(BookmarkResponse.parse({ post_id: ctx.params.id, bookmarked: r.bookmarked }));
}

export const POST = authedParams<{ id: string }>(async (_req: NextRequest, ctx) => run(ctx, true));
export const DELETE = authedParams<{ id: string }>(async (_req: NextRequest, ctx) => run(ctx, false));
