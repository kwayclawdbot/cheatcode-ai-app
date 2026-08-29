/**
 * POST /api/v1/circles/:id/join
 *
 * The way into a time-boxed setup room.
 *
 * WHY THIS EXISTS. `/rooms/:id/join` runs `join_core_room`, which refuses
 * `type='setup'` — it is the CORE room function and always was. Circles are
 * opened by the tick with nobody in them, so every auto-opened room was
 * read-only for everybody: posting needs membership, and there was no door.
 * This is the door. `/rooms/:id/join` now forwards setup rooms to the same
 * helper, so the mobile Community and Circle screens work unchanged whichever
 * path they call.
 *
 * The response is `RoomJoinResponse` — the identical shape `/rooms/:id/join`
 * returns, `member_count` included and correct straight after the insert.
 */
import type { NextRequest } from 'next/server';
import { RoomJoinResponse } from '@shared/api';
import { authedParams, ok, type Ctx } from '@/lib/http';
import { roomStats, loadMembership, toRoomRow } from '@/lib/rooms';
import { joinCircle } from '@/lib/round4/circles';

export const dynamic = 'force-dynamic';

export const POST = authedParams<{ id: string }>(
  async (_req: NextRequest, ctx: Ctx & { params: { id: string } }) => {
    const { room, already_member } = await joinCircle({
      roomId: ctx.params.id,
      userId: ctx.user.id,
      requestId: ctx.requestId,
    });

    const [stats, membership] = await Promise.all([
      roomStats([ctx.params.id]),
      loadMembership(ctx.params.id, ctx.user.id),
    ]);

    return ok(
      RoomJoinResponse.parse({
        room: toRoomRow(room, stats.get(ctx.params.id), membership),
        joined: Boolean(membership),
        already_member,
        plain: already_member
          ? `You are already in ${String(room.name)}.`
          : `You are in ${String(room.name)}. It closes on its own — nothing is deleted when it does.`,
      }),
      { status: already_member ? 200 : 201 }
    );
  }
);
