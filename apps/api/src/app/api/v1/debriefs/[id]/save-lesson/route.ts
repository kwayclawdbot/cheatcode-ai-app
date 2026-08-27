/**
 * POST /api/v1/debriefs/:id/save-lesson
 *
 * Writes the lesson into `kai_user_memory` as kind `pattern`.
 *
 * Two rules from 00 §8 are enforced here, not assumed:
 *   - `profiles.memory_enabled` is the master switch. Off means nothing is
 *     written, and the answer says so rather than failing silently.
 *   - The extraction policy excludes balances, position sizes and account
 *     numbers. Only the lesson sentence is stored — never the P&L, never the
 *     size — and the refs carry ids, not money.
 */
import type { NextRequest } from 'next/server';
import { SaveLessonResponse, type DebriefPayload } from '@shared/api';
import { authedParams, ok, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { serviceClient } from '@/lib/db';
import { emitUserEvent } from '@/lib/events';
import { loadProfile } from '@/lib/kai/context';

export const dynamic = 'force-dynamic';

export const POST = authedParams<{ id: string }>(async (_req: NextRequest, ctx: Ctx & { params: { id: string } }) => {
  const db = serviceClient();
  const profile = await loadProfile(ctx.user.id);

  const found = await db
    .from('debriefs')
    .select('id,position_id,process_review,kai_summary')
    .eq('user_id', ctx.user.id)
    .eq('id', ctx.params.id)
    .maybeSingle();
  const row = found.data as Record<string, unknown> | null;
  if (!row) throw new ApiError('NOT_FOUND', 'I could not find that write-up.');

  if (!profile.memory_enabled) {
    return ok(
      SaveLessonResponse.parse({
        saved: false,
        memory_id: null,
        plain: 'Memory is switched off, so I did not keep that. You can turn it on in Account.',
      })
    );
  }

  const payload = ((row.process_review as Record<string, unknown>)?.payload as DebriefPayload) ?? null;
  const lesson = (row.kai_summary as string) ?? payload?.lesson_plain ?? null;
  if (!lesson) throw new ApiError('STATE_CONFLICT', 'There is no lesson on that write-up to save.');

  const inserted = await db
    .from('kai_user_memory')
    .insert({
      user_id: ctx.user.id,
      kind: 'pattern',
      content: lesson,
      // Ids only. No balances, no sizes, no P&L (00 §8 extraction policy).
      refs: {
        debrief_id: String(row.id),
        position_id: (row.position_id as string) ?? null,
        symbol: payload?.symbol ?? null,
      } as never,
    })
    .select('id')
    .single();
  if (inserted.error || !inserted.data) {
    throw new ApiError('INTERNAL', 'We could not save that lesson. Please try again.', {
      detail: inserted.error?.message,
    });
  }

  const memoryId = String((inserted.data as Record<string, unknown>).id);
  await emitUserEvent(
    ctx.user.id,
    'kai_result',
    'kai_user_memory',
    memoryId,
    { event: 'lesson_saved', debrief_id: String(row.id) },
    ctx.requestId
  );

  return ok(
    SaveLessonResponse.parse({
      saved: true,
      memory_id: memoryId,
      plain: 'Saved to what Kai remembers. You can see and delete it in Account.',
    }),
    { status: 201 }
  );
});
