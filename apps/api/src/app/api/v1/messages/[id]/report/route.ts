/**
 * POST /api/v1/messages/:id/report  {reason}
 *
 * Files a report. The original message is NOT deleted here — 01 §14 keeps
 * market-claim originals for the moderation audit, and a reporter cannot
 * remove someone else's post.
 */
import type { NextRequest } from 'next/server';
import { ReportRequest, ReportResponse } from '@shared/api';
import { authedParams, ok, parseBody, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { serviceClient } from '@/lib/db';
import { emitUserEvent } from '@/lib/events';
import { rateLimit } from '@/lib/ratelimit';

export const dynamic = 'force-dynamic';

export const POST = authedParams<{ id: string }>(async (req: NextRequest, ctx: Ctx & { params: { id: string } }) => {
  const body = await parseBody(req, ReportRequest);
  const db = serviceClient();

  const message = await db.from('messages').select('id,room_id').eq('id', ctx.params.id).maybeSingle();
  const row = message.data as Record<string, unknown> | null;
  if (!row) throw new ApiError('NOT_FOUND', 'I could not find that message.');

  rateLimit({
    key: `report:${ctx.user.id}`,
    limit: 10,
    windowMs: 60 * 60_000,
    messagePlain: 'You have filed a lot of reports in the last hour. Give it a while.',
  });

  const existing = await db
    .from('reports')
    .select('id')
    .eq('reporter_id', ctx.user.id)
    .eq('message_id', ctx.params.id)
    .maybeSingle();
  if (existing.data) {
    return ok(
      ReportResponse.parse({
        report_id: String((existing.data as Record<string, unknown>).id),
        plain: 'You already reported that one. A moderator will look at it.',
      })
    );
  }

  const inserted = await db
    .from('reports')
    .insert({
      reporter_id: ctx.user.id,
      message_id: ctx.params.id,
      room_id: row.room_id,
      reason: body.reason,
      status: 'open',
    })
    .select('id')
    .single();
  if (inserted.error || !inserted.data) {
    throw new ApiError('INTERNAL', 'We could not file that report. Please try again.', {
      detail: inserted.error?.message,
    });
  }

  const reportId = String((inserted.data as Record<string, unknown>).id);
  await emitUserEvent(
    ctx.user.id,
    'system',
    'report',
    reportId,
    { event: 'message_reported', message_id: ctx.params.id, room_id: row.room_id },
    ctx.requestId
  );

  return ok(
    ReportResponse.parse({
      report_id: reportId,
      plain: 'Reported. A moderator will look at it. The post stays up until they do.',
    }),
    { status: 201 }
  );
});
