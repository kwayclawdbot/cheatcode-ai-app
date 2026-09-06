/**
 * POST /api/v1/messages/:id/remove  {reason}
 *
 * A moderator takes a post down. `staffedParams` with `min: 'support'`, which
 * means the check is `staff_role(user_id)` asked of the database on this
 * request — never a claim, never `room_members.role`, never a client flag.
 *
 * A non-staff caller gets the app's ordinary NOT_FOUND, the same bytes as a
 * path this app does not serve. That is right HERE and wrong on `/circles`,
 * and the difference is worth stating: every member uses `/circles`, so
 * refusing it must name the reason; nobody but staff has any business knowing
 * this route exists.
 *
 * NOTHING IS DELETED. `deleted_at` + `deleted_by` + the reason; the row keeps
 * its place in the thread and loses its body (`messages_public`, and after
 * migration 0031 the original is where only the service role can read it).
 * Every open report on the message is closed in the same call, because a queue
 * that still lists a post somebody already removed is a queue nobody trusts.
 */
import type { NextRequest } from 'next/server';
import { MODERATION_MIN_ROLE, RemoveMessageRequest, RemoveMessageResponse } from '@shared/api';
import { ok, parseBody, staffedParams, type StaffCtx } from '@/lib/http';
import { removeMessage } from '@/lib/moderation';

export const dynamic = 'force-dynamic';

export const POST = staffedParams<{ id: string }>(
  async (req: NextRequest, ctx: StaffCtx & { params: { id: string } }) => {
    const body = await parseBody(req, RemoveMessageRequest);

    const result = await removeMessage({
      messageId: ctx.params.id,
      actorId: ctx.user.id,
      reason: body.reason,
      requestId: ctx.requestId,
      ip: ctx.ip,
    });

    const closed =
      result.reportsClosed === 0
        ? ''
        : result.reportsClosed === 1
          ? ' One report closed.'
          : ` ${result.reportsClosed} reports closed.`;

    return ok(
      RemoveMessageResponse.parse({
        message_id: ctx.params.id,
        removed: true,
        reports_closed: result.reportsClosed,
        plain: result.alreadyRemoved
          ? `That post was already down.${closed}`
          : `Removed. It stays in the thread as a gap and its words are gone from the room.${closed}`,
      })
    );
  },
  { min: MODERATION_MIN_ROLE }
);
