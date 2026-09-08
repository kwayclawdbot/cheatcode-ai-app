/**
 * POST /api/v1/stage/evaluate
 *
 * The phone finishes a lesson, reports what its training profile now holds, and
 * this decides whether that is worth a promotion. The member's stage is not
 * writable from a client (0042 §4 puts a trigger on the column), so this route
 * is the only way it moves short of a staff override.
 *
 * It is deliberately idempotent and cheap to call: the ratchet in
 * `decideStage` means calling it ten times in a row produces the same stage as
 * calling it once, so the client can fire it after every lesson without
 * needing to know whether this particular lesson was the one that mattered.
 *
 * WHY THIS TRUSTS A BODY AT ALL is argued in full in `@/lib/stage/rules` — the
 * short version is that training progress has no table yet, so the phone is the
 * only thing that knows, and the choice is between believing its evidence and
 * believing its conclusions. This believes neither: it re-grades the evidence.
 */
import type { NextRequest } from 'next/server';
import { StageEvaluateRequest, StageEvaluateResponse } from '@shared/api';
import { authed, ok, parseBody, type Ctx } from '@/lib/http';
import { serviceClient } from '@/lib/db';
import { ApiError } from '@/lib/errors';
import { emitUserEvent } from '@/lib/events';
import { decideStage, isStage, stageFromEvidence, type Stage } from '@/lib/stage/rules';

export const dynamic = 'force-dynamic';

export const POST = authed(async (req: NextRequest, ctx: Ctx) => {
  const body = await parseBody(req, StageEvaluateRequest);
  const db = serviceClient();

  const { data: profile, error: readError } = await db
    .from('profiles')
    .select('stage,stage_locked')
    .eq('user_id', ctx.user.id)
    .maybeSingle();

  if (readError) {
    throw new ApiError('INTERNAL', 'We could not read your profile.', { detail: readError.message });
  }
  if (!profile) throw new ApiError('NOT_FOUND', 'We could not find your profile.');

  const row = profile as Record<string, unknown>;
  // A profile written before 0042 applied, or by a path that did not set it,
  // is treated as `beginner` rather than crashing the lesson the member just
  // finished. A missing stage is the bottom of the ladder, not an error.
  const current: Stage = isStage(row.stage) ? row.stage : 'beginner';
  const locked = row.stage_locked === true;

  const supported = stageFromEvidence({
    mastery: body.mastery,
    dayProgress: Object.fromEntries(
      Object.entries(body.day_progress).map(([dayId, d]) => [
        dayId,
        { completedLessonIds: d.completed_lesson_ids, bestScorePct: d.best_score_pct },
      ])
    ),
  });

  const decision = decideStage(current, supported, { locked });

  if (decision.changed) {
    const { error: writeError } = await db
      .from('profiles')
      .update({ stage: decision.stage, stage_changed_at: new Date().toISOString() })
      .eq('user_id', ctx.user.id);

    if (writeError) {
      throw new ApiError('INTERNAL', 'We could not record your progress.', {
        detail: writeError.message,
      });
    }

    await emitUserEvent(
      ctx.user.id,
      'system',
      'profile',
      ctx.user.id,
      { event: 'stage_changed', from: current, to: decision.stage, via: 'training' },
      ctx.requestId
    );
  }

  return ok(
    StageEvaluateResponse.parse({
      stage: decision.stage,
      changed: decision.changed,
      reason: decision.reason,
    })
  );
});
