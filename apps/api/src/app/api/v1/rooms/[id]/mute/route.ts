/**
 * POST /api/v1/rooms/:id/mute  {minutes?}
 *
 * Muting yourself in a room, not muting somebody else — that is moderation and
 * lives elsewhere. Writes `room_members.muted_until` on the caller's own row.
 */
import type { NextRequest } from 'next/server';
import { MuteRequest, MuteResponse } from '@shared/api';
import { authedParams, ok, parseBody, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { serviceClient } from '@/lib/db';
import { emitUserEvent } from '@/lib/events';
import { callRpc, noteFallback } from '@/lib/rpc';
import { loadRoom, loadMembership, requireMember } from '@/lib/rooms';

export const dynamic = 'force-dynamic';

const FAR_FUTURE_YEARS = 100;

export const POST = authedParams<{ id: string }>(async (req: NextRequest, ctx: Ctx & { params: { id: string } }) => {
  const body = await parseBody(req, MuteRequest);
  const room = await loadRoom(ctx.params.id);
  if (!room) throw new ApiError('NOT_FOUND', 'I could not find that room.');
  const membership = await loadMembership(ctx.params.id, ctx.user.id);
  requireMember(membership, String(room.name));

  const until = body.minutes
    ? new Date(Date.now() + body.minutes * 60_000)
    : new Date(Date.now() + FAR_FUTURE_YEARS * 365 * 24 * 60 * 60_000);

  await setMute(ctx.params.id, ctx.user.id, until.toISOString(), ctx.requestId);
  await emitUserEvent(
    ctx.user.id,
    'system',
    'room',
    ctx.params.id,
    { event: 'room_muted', until: until.toISOString() },
    ctx.requestId
  );

  return ok(
    MuteResponse.parse({
      room_id: ctx.params.id,
      muted_until: until.toISOString(),
      plain: body.minutes
        ? `Muted for ${body.minutes} minutes. You will not get notifications from ${room.name}.`
        : `Muted. You will not get notifications from ${room.name} until you unmute it.`,
    })
  );
});

export async function setMute(roomId: string, userId: string, until: string | null, requestId: string) {
  const rpc = await callRpc('set_room_mute', { p_user_id: userId, p_room_id: roomId, p_until: until }, requestId);
  if (rpc.ok) return;
  if (!rpc.missing) throw new ApiError('INTERNAL', 'We could not change that. Please try again.');

  // FALLBACK (documented in README).
  noteFallback(requestId, 'set_room_mute');
  const db = serviceClient();
  const { error } = await db
    .from('room_members')
    .update({ muted_until: until })
    .eq('room_id', roomId)
    .eq('user_id', userId);
  if (error) throw new ApiError('INTERNAL', 'We could not change that. Please try again.');
}
