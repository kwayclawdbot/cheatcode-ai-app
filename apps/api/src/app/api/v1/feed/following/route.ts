/**
 * GET /api/v1/feed/following
 *
 * The calls and shared trades of everybody this member follows, newest first.
 * One list, two kinds of object, discriminated on the wire so the client can
 * render either without guessing.
 *
 * TWO EMPTY STATES, NOT ONE. `follows_nobody` distinguishes "you have not
 * followed anyone" from "the people you follow have not posted" — one of those
 * is fixed by finding somebody and the other by waiting, and an app that shows
 * the same grey box for both cannot tell the user which.
 *
 * The shared trades in here come through the one read helper that joins
 * `profiles.share_trades`; see the header of `lib/social/shares.ts`.
 */
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { FollowFeedResponse } from '@shared/api';
import { authed, ok, parseQuery, type Ctx } from '@/lib/http';
import { FEED_LIMIT, followingFeed } from '@/lib/social/feed';

export const dynamic = 'force-dynamic';

const Query = z.object({
  limit: z.coerce.number().int().min(1).max(FEED_LIMIT).optional(),
});

export const GET = authed(async (req: NextRequest, ctx: Ctx) => {
  const { limit } = parseQuery(req, Query);
  const feed = await followingFeed({ viewerId: ctx.user.id, limit, requestId: ctx.requestId });
  return ok(FollowFeedResponse.parse(feed));
});
