/**
 * POST /api/v1/messages/:id/keep  {reason}
 *
 * The other half of moderation, and the half that usually gets left out: a
 * moderator read the reports and decided the post stays.
 *
 * Without it the queue only grows and every moderator re-reads what the last
 * one already cleared — which is the state in which real moderation stops
 * happening. The post is untouched; the reports on it are closed with the
 * reason attached, and the decision is logged under the moderator's name in
 * both records.
 */
import type { NextRequest } from 'next/server';
import { KeepMessageRequest, KeepMessageResponse, MODERATION_MIN_ROLE } from '@shared/api';
import { ok, parseBody, staffedParams, type StaffCtx } from '@/lib/http';
import { keepMessage } from '@/lib/moderation';

export const dynamic = 'force-dynamic';

export const POST = staffedParams<{ id: string }>(
  async (req: NextRequest, ctx: StaffCtx & { params: { id: string } }) => {
    const body = await parseBody(req, KeepMessageRequest);

    const { reportsClosed } = await keepMessage({
      messageId: ctx.params.id,
      actorId: ctx.user.id,
      reason: body.reason,
      requestId: ctx.requestId,
      ip: ctx.ip,
    });

    return ok(
      KeepMessageResponse.parse({
        message_id: ctx.params.id,
        reports_closed: reportsClosed,
        plain:
          reportsClosed === 0
            ? 'Nothing was open on that post. Your note is on the record.'
            : reportsClosed === 1
              ? 'Left up. One report closed with your reason.'
              : `Left up. ${reportsClosed} reports closed with your reason.`,
      })
    );
  },
  { min: MODERATION_MIN_ROLE }
);
