/**
 * POST /api/v1/rooms/:id/read   {seq}
 *
 * Advances `room_members.last_read_seq`. RLS lets a member update their own
 * membership row directly, so a client COULD write this itself — but then the
 * read mark would be the one number in the room a client can set to anything,
 * and the "N new" pill is the thing a member trusts to tell them what they
 * missed. So the route exists and it does two things a direct write would not:
 *
 *   - it never moves the mark BACKWARDS (a stale screen posting an old seq
 *     cannot resurrect messages the member has already read), and
 *   - it never moves it PAST the end of the room, so a bad seq cannot mark
 *     future posts as read before they are written.
 *
 * `GET /rooms/:id/messages` already advances the mark to what it handed over.
 * This is for the client that read further than the first page, or scrolled
 * past the pill without fetching again.
 */
import type { NextRequest } from 'next/server';
import { RoomReadBody, RoomReadResponse } from '@shared/api';
import { authedParams, ok, parseBody, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { serviceClient } from '@/lib/db';
import { loadRoom, loadMembership, requireMember, roomStats, unreadFor, catchUpPlain } from '@/lib/rooms';

export const dynamic = 'force-dynamic';

export const POST = authedParams<{ id: string }>(async (req: NextRequest, ctx: Ctx & { params: { id: string } }) => {
  const body = await parseBody(req, RoomReadBody);

  const room = await loadRoom(ctx.params.id);
  if (!room) throw new ApiError('NOT_FOUND', 'I could not find that room.');

  const membership = await loadMembership(ctx.params.id, ctx.user.id);
  requireMember(membership, String(room.name));

  const stats = await roomStats([ctx.params.id]);
  const lastSeq = stats.get(ctx.params.id)?.last_seq ?? 0;

  // Forward only, and never past the end of the room.
  const target = Math.min(Math.max(membership.last_read_seq, body.seq), lastSeq);

  if (target !== membership.last_read_seq) {
    const db = serviceClient();
    const { error } = await db
      .from('room_members')
      .update({ last_read_seq: target })
      .eq('room_id', ctx.params.id)
      .eq('user_id', ctx.user.id);
    if (error) {
      throw new ApiError('INTERNAL', 'We could not save your place in that room.', { detail: error.message });
    }
  }

  const unread = await unreadFor(ctx.params.id, ctx.user.id, target);

  return ok(
    RoomReadResponse.parse({
      room_id: ctx.params.id,
      last_read_seq: target,
      unread,
      plain: catchUpPlain(unread),
    })
  );
});
