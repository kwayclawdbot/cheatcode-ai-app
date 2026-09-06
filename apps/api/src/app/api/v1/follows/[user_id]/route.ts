/**
 * POST   /api/v1/follows/:user_id   — follow
 * DELETE /api/v1/follows/:user_id   — unfollow
 *
 * Both answer the same `FollowState`, so the button never has to infer its own
 * next state from a 204 and a hope. The counts come back with it because they
 * change on the same tap and a stale count under a filled button is the most
 * obvious kind of wrong.
 *
 * WHY THIS IS A ROUTE AND NOT A POSTGREST INSERT. `follows` is service-role
 * only (0038 §6) precisely so a follow can be rate limited and can raise a
 * notification. `message_reactions`, `media_assets` and `reports` are all
 * social objects and all service-role only for the same reason; a follow is the
 * same species.
 */
import type { NextRequest } from 'next/server';
import { FollowState } from '@shared/api';
import { authedParams, ok, type Ctx } from '@/lib/http';
import { rateLimit } from '@/lib/ratelimit';
import { emitUserEvent } from '@/lib/events';
import { follow, unfollow } from '@/lib/social/follows';

export const dynamic = 'force-dynamic';

/**
 * Thirty follows a minute is far more than a person taps and far less than a
 * script needs to walk a member list. The in-process limiter is a floor, not a
 * guarantee (see `lib/ratelimit.ts`), and it is the same floor every other
 * write route in this app stands on.
 */
const FOLLOW_LIMIT = 30;
const FOLLOW_WINDOW_MS = 60_000;

export const POST = authedParams<{ user_id: string }>(
  async (_req: NextRequest, ctx: Ctx & { params: { user_id: string } }) => {
    rateLimit({
      key: `follow:${ctx.user.id}`,
      limit: FOLLOW_LIMIT,
      windowMs: FOLLOW_WINDOW_MS,
      messagePlain: 'You are following people quickly. Give it a minute.',
    });

    const state = await follow({
      viewerId: ctx.user.id,
      subjectId: ctx.params.user_id,
      requestId: ctx.requestId,
    });

    await emitUserEvent(
      ctx.user.id,
      'system',
      'profile',
      ctx.params.user_id,
      { event: 'followed', followee_id: ctx.params.user_id },
      ctx.requestId
    );

    return ok(FollowState.parse(state));
  }
);

export const DELETE = authedParams<{ user_id: string }>(
  async (_req: NextRequest, ctx: Ctx & { params: { user_id: string } }) => {
    rateLimit({
      key: `follow:${ctx.user.id}`,
      limit: FOLLOW_LIMIT,
      windowMs: FOLLOW_WINDOW_MS,
      messagePlain: 'You are changing who you follow quickly. Give it a minute.',
    });

    const state = await unfollow({
      viewerId: ctx.user.id,
      subjectId: ctx.params.user_id,
      requestId: ctx.requestId,
    });

    await emitUserEvent(
      ctx.user.id,
      'system',
      'profile',
      ctx.params.user_id,
      { event: 'unfollowed', followee_id: ctx.params.user_id },
      ctx.requestId
    );

    return ok(FollowState.parse(state));
  }
);
