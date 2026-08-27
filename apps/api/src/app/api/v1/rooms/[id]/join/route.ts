/**
 * POST /api/v1/rooms/:id/join
 *
 * Core rooms only. Setup rooms are joined by opening the setup they belong to,
 * and announcement rooms are not joinable at all.
 */
import type { NextRequest } from 'next/server';
import { RoomJoinResponse } from '@shared/api';
import { authedParams, ok, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { serviceClient } from '@/lib/db';
import { emitUserEvent } from '@/lib/events';
import { callRpc, noteFallback } from '@/lib/rpc';
import { loadRoom, loadMembership, roomStats, toRoomRow } from '@/lib/rooms';

export const dynamic = 'force-dynamic';

export const POST = authedParams<{ id: string }>(async (_req: NextRequest, ctx: Ctx & { params: { id: string } }) => {
  const room = await loadRoom(ctx.params.id);
  if (!room) throw new ApiError('NOT_FOUND', 'I could not find that room.');
  if (room.type !== 'core') {
    throw new ApiError('ROOM_RESTRICTED', 'That room is opened from the setup it belongs to, not from here.');
  }

  const before = await loadMembership(ctx.params.id, ctx.user.id);
  if (before?.banned) throw new ApiError('ROOM_RESTRICTED', 'You cannot join that room.');

  if (!before) {
    const rpc = await callRpc('join_core_room', { p_user_id: ctx.user.id, p_room_id: ctx.params.id }, ctx.requestId);
    if (!rpc.ok) {
      if (!rpc.missing) throw new ApiError('INTERNAL', 'We could not get you into that room. Please try again.');
      // FALLBACK (documented in README): insert + outbox, two round-trips.
      noteFallback(ctx.requestId, 'join_core_room');
      const db = serviceClient();
      const { error } = await db
        .from('room_members')
        .upsert({ room_id: ctx.params.id, user_id: ctx.user.id, role: 'member' } as never, {
          onConflict: 'room_id,user_id',
        });
      if (error) throw new ApiError('INTERNAL', 'We could not get you into that room. Please try again.');
      await emitUserEvent(
        ctx.user.id,
        'system',
        'room',
        ctx.params.id,
        { event: 'room_joined', room_name: room.name },
        ctx.requestId
      );
    }
  }

  const [stats, membership] = await Promise.all([
    roomStats([ctx.params.id]),
    loadMembership(ctx.params.id, ctx.user.id),
  ]);

  return ok(
    RoomJoinResponse.parse({
      room: toRoomRow(room, stats.get(ctx.params.id), membership),
      joined: Boolean(membership),
      already_member: Boolean(before),
      plain: before ? `You are already in ${room.name}.` : `You are in ${room.name}.`,
    }),
    { status: before ? 200 : 201 }
  );
});
