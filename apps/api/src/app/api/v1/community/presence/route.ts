/**
 * POST /api/v1/community/presence  { room_id?: uuid | null }
 *
 * The heartbeat. Send it when Community opens, when the member moves between
 * the feed and a room, and every `next_heartbeat_s` while the screen is on.
 * `room_id` is the room on screen; null or absent means the feed.
 *
 * It stores one row per member (0051) and returns nothing about anybody else.
 */
import type { NextRequest } from 'next/server';
import { PresenceBody, PresenceResponse } from '@shared/community';
import { authed, ok, parseBody, type Ctx } from '@/lib/http';
import { rateLimit } from '@/lib/ratelimit';
import { HEARTBEAT_S, heartbeat } from '@/lib/social/presence';

export const dynamic = 'force-dynamic';

export const POST = authed(async (req: NextRequest, ctx: Ctx) => {
  const body = await parseBody(req, PresenceBody);
  rateLimit({
    key: `presence:${ctx.user.id}`,
    limit: 20,
    windowMs: 60_000,
    messagePlain: 'Too many check-ins. It will catch up on its own.',
  });
  const roomId = await heartbeat({ userId: ctx.user.id, roomId: body.room_id ?? null, requestId: ctx.requestId });
  return ok(PresenceResponse.parse({ ok: true, room_id: roomId, next_heartbeat_s: HEARTBEAT_S }));
});
