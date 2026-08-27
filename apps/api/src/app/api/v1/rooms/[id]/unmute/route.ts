/** POST /api/v1/rooms/:id/unmute — clears the caller's own muted_until. */
import type { NextRequest } from 'next/server';
import { MuteResponse } from '@shared/api';
import { authedParams, ok, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { emitUserEvent } from '@/lib/events';
import { loadRoom, loadMembership, requireMember } from '@/lib/rooms';
import { setMute } from '../mute/route';

export const dynamic = 'force-dynamic';

export const POST = authedParams<{ id: string }>(async (_req: NextRequest, ctx: Ctx & { params: { id: string } }) => {
  const room = await loadRoom(ctx.params.id);
  if (!room) throw new ApiError('NOT_FOUND', 'I could not find that room.');
  const membership = await loadMembership(ctx.params.id, ctx.user.id);
  requireMember(membership, String(room.name));

  await setMute(ctx.params.id, ctx.user.id, null, ctx.requestId);
  await emitUserEvent(ctx.user.id, 'system', 'room', ctx.params.id, { event: 'room_unmuted' }, ctx.requestId);

  return ok(
    MuteResponse.parse({
      room_id: ctx.params.id,
      muted_until: null,
      plain: `Unmuted. ${room.name} can reach you again.`,
    })
  );
});
