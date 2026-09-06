/**
 * POST /api/v1/rooms/:id/moderate  {user_id, action: mute|unmute, minutes?, reason}
 *
 * A moderator silences somebody in one room, for a while.
 *
 * WHY THIS IS NOT `/rooms/:id/mute`. That route exists and it is the OPPOSITE
 * action: it writes `room_members.muted_until` on the CALLER's own row and it
 * turns off their notifications. 0018 keeps the two columns apart on purpose —
 * a member muting their own alerts must not be able to lift a moderator's
 * decision by un-muting themselves, and a moderator's mute must not switch off
 * somebody's notifications as a side effect. Two columns, two routes, one
 * sentence each.
 *
 * A MUTE IS TIME-BOXED BY DEFAULT. No `minutes` means 24 hours, not forever:
 * an indefinite mute is a ban that nobody has to admit to, and this app has a
 * `banned` column for the real thing. The mute lifts itself, so nothing depends
 * on a moderator remembering.
 *
 * `staffedParams` with `min: 'support'` — the same database-asked check every
 * staff surface uses. `room_members.role = 'moderator'` grants nothing here.
 */
import type { NextRequest } from 'next/server';
import { MODERATION_MIN_ROLE, ModerateMemberRequest, ModerateMemberResponse } from '@shared/api';
import { ok, parseBody, staffedParams, type StaffCtx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { DEFAULT_MUTE_MINUTES, moderateMember } from '@/lib/moderation';

export const dynamic = 'force-dynamic';

function forPlain(minutes: number): string {
  if (minutes % (24 * 60) === 0) {
    const d = minutes / (24 * 60);
    return d === 1 ? 'a day' : `${d} days`;
  }
  if (minutes % 60 === 0) {
    const h = minutes / 60;
    return h === 1 ? 'an hour' : `${h} hours`;
  }
  return `${minutes} minutes`;
}

export const POST = staffedParams<{ id: string }>(
  async (req: NextRequest, ctx: StaffCtx & { params: { id: string } }) => {
    const body = await parseBody(req, ModerateMemberRequest);

    // A moderator muting themselves is almost certainly a mis-tap on the wrong
    // row, and it would lock them out of the room they are moderating.
    if (body.user_id === ctx.user.id) {
      throw new ApiError('VALIDATION_FAILED', 'That is your own account. Pick the member you meant.');
    }

    const minutes = body.minutes ?? DEFAULT_MUTE_MINUTES;
    const { mutedUntil, memberName } = await moderateMember({
      roomId: ctx.params.id,
      userId: body.user_id,
      actorId: ctx.user.id,
      action: body.action,
      minutes,
      reason: body.reason,
      requestId: ctx.requestId,
      ip: ctx.ip,
    });

    const who = memberName ?? 'That member';
    return ok(
      ModerateMemberResponse.parse({
        room_id: ctx.params.id,
        user_id: body.user_id,
        muted_until: mutedUntil,
        plain:
          body.action === 'mute'
            ? `${who} cannot post in this room for ${forPlain(minutes)}. They can still read it, and it lifts on its own.`
            : `${who} can post here again.`,
      })
    );
  },
  { min: MODERATION_MIN_ROLE }
);
