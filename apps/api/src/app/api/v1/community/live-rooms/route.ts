/**
 * GET /api/v1/community/live-rooms
 *
 * The top rail of Community: the rooms carrying `config.strip` (0052), in
 * strip order, each with
 *   listener_count   members whose heartbeat puts them in this room right now
 *                    (POST /community/presence; 5-minute window)
 *   live             somebody posted here in the last 15 minutes
 *   speaker_avatars  up to four people who posted here most recently
 * and `online_total` for the header ("N members online").
 *
 * TEXT ROOMS. There is no audio: `live` means a conversation is happening, and
 * the card's action opens the room (`route`). Rooms the caller is banned from
 * are left off the strip.
 */
import type { NextRequest } from 'next/server';
import { LiveRoomsResponse } from '@shared/community';
import { authed, ok, type Ctx } from '@/lib/http';
import { LIVE_WINDOW_MIN, ONLINE_WINDOW_MIN, liveRooms } from '@/lib/social/presence';

export const dynamic = 'force-dynamic';

export const GET = authed(async (_req: NextRequest, ctx: Ctx) => {
  const { rooms, online_total } = await liveRooms(ctx.user.id);
  return ok(
    LiveRoomsResponse.parse({
      rooms,
      online_total,
      online_window_minutes: ONLINE_WINDOW_MIN,
      live_window_minutes: LIVE_WINDOW_MIN,
    })
  );
});
