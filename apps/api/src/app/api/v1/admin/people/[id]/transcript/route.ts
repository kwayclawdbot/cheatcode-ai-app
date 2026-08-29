/**
 * POST /api/v1/admin/people/[id]/transcript — reading somebody's words.
 *
 * THIS ROUTE EXISTS SO THAT THE PERSON PAGE DOES NOT HAVE TO. Brief §3:
 * "Opening a transcript is a separate, reason-required action that writes an
 * audit row and shows the user's own view, unedited."
 *
 * Three things follow from that and all three are load-bearing:
 *
 *   * `reason` is REQUIRED by the schema, minimum eight characters. Not by an
 *     `if` in this handler that a refactor could drop — by the shape of the
 *     request, so a call without one cannot be made.
 *   * It is a POST even though it reads. A GET would end up in a browser
 *     history, a prefetch, a link somebody shares. This is an act.
 *   * `admin`, not `support`. Reading the CRM and leaving notes is support's
 *     job; reading a user's conversation with Kai is not.
 *
 * The response is the conversation exactly as the user's own client would
 * render it — same rows, same order, nothing summarised or filtered — because a
 * transcript an operator half-sees is worse than one they see whole: it invites
 * them to guess at the rest.
 */
import { AdminTranscriptRequest, AdminTranscriptResponse } from '@shared/api';
import { ok, parseBody, staffedParams, type StaffCtx } from '@/lib/http';
import { serviceClient } from '@/lib/db';
import { ApiError } from '@/lib/errors';
import { writeAudit } from '@/lib/admin/audit';

export const dynamic = 'force-dynamic';

export const POST = staffedParams<{ id: string }>(
  async (req, ctx: StaffCtx & { params: { id: string } }) => {
    const body = await parseBody(req, AdminTranscriptRequest);
    const db = serviceClient();

    const { data: person, error: pErr } = await db
      .from('crm_people')
      .select('id,app_user_id')
      .eq('id', ctx.params.id)
      .maybeSingle();
    if (pErr) throw pErr;
    if (!person) throw new ApiError('NOT_FOUND', 'We could not find that person.');

    const appUserId = (person as { app_user_id: string | null }).app_user_id;
    if (!appUserId) {
      throw new ApiError('NOT_FOUND', 'That person has no app account, so there is nothing to open.');
    }

    // The conversation must belong to THIS person. Without the second `eq` an
    // operator could open any conversation in the system through any person's
    // page, and the audit row would name the wrong subject — a log that points
    // at the wrong human is worse than no log.
    const { data: conv, error: cErr } = await db
      .from('conversations')
      .select('id,title,created_at,last_message_at')
      .eq('id', body.conversation_id)
      .eq('user_id', appUserId)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!conv) throw new ApiError('NOT_FOUND', 'We could not find that conversation for this person.');

    const { data: msgs, error: mErr } = await db
      .from('conversation_messages')
      .select('seq,role,content,created_at')
      .eq('conversation_id', body.conversation_id)
      .order('seq', { ascending: true })
      .limit(500);
    if (mErr) throw mErr;

    // AUDITED BEFORE IT IS RETURNED, and the reason is stored verbatim. If the
    // write fails the read still happens (audit writes never throw), but it
    // happens second so the ordinary path always has its row first.
    await writeAudit({
      actorUserId: ctx.user.id,
      action: 'crm.person.transcript',
      targetKind: 'conversation',
      targetId: body.conversation_id,
      after: {
        person_id: ctx.params.id,
        app_user_id: appUserId,
        messages: (msgs ?? []).length,
      },
      reason: body.reason,
      requestId: ctx.requestId,
      ip: ctx.ip,
    });

    return ok(
      AdminTranscriptResponse.parse({
        conversation: conv,
        messages: msgs ?? [],
        plain: 'This is the conversation as the user sees it. Opening it has been logged against your name.',
      })
    );
  },
  { min: 'admin' }
);
