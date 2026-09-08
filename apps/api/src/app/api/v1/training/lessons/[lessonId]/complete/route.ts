/**
 * POST /api/v1/training/lessons/:lessonId/complete
 *
 * One walk through one lesson, recorded against the person who walked it.
 *
 * ===========================================================================
 * THE TWO THINGS THIS ROUTE REFUSES TO TAKE ON TRUST
 * ===========================================================================
 * 1. WHICH DAY AND SKILL THE LESSON BELONGS TO. Read from the server's own
 *    index (`lib/training/curriculum.ts`), never from the body — otherwise a
 *    caller could file a Day 1 lesson under Day 7 and open a gate with it.
 *    A lesson id the index does not know is a 404, so "complete lesson
 *    free-money" is not a route onto a belt.
 * 2. WHAT THE RUN WAS WORTH. `sanitiseLedger` clamps every award to the
 *    config's number and forces the assessment line to zero unless the run
 *    cleared its pass mark — the rule from `xp.ts`, enforced again in
 *    `record_lesson_completion`. Two locks on the one door that matters.
 *
 * ===========================================================================
 * REPEATING A LESSON IS FINE AND PAYS NOTHING (audit F12)
 * ===========================================================================
 * The response says which happened. `xp_awarded: 0, repeat: true` is a success,
 * not an error: re-walking a lesson is how a weak score gets fixed, and the
 * ledger's `unique (source, ref_id)` — with the LESSON's id as the ref — is what
 * stops it paying twice. The completion screen reads `repeat` and says "you have
 * already been paid for this one" rather than printing an award that did not
 * happen.
 */
import type { NextRequest } from 'next/server';
import { TrainingCompleteRequest, TrainingCompleteResponse } from '@shared/api';
import { authedParams, ok, parseBody, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { lessonEntry } from '@/lib/training/curriculum';
import { readProgress, recordCompletion } from '@/lib/training/progress';

export const dynamic = 'force-dynamic';

export const POST = authedParams<{ lessonId: string }>(async (req: NextRequest, ctx: Ctx & { params: { lessonId: string } }) => {
  const lessonId = String(ctx.params.lessonId ?? '');
  if (!lessonEntry(lessonId)) {
    throw new ApiError('NOT_FOUND', 'There is no lesson with that id in the programme.');
  }

  const body = await parseBody(req, TrainingCompleteRequest);

  const outcome = await recordCompletion({
    userId: ctx.user.id,
    lessonId,
    scorePct: body.score_pct,
    masteryGain: body.mastery_gain,
    xp: body.xp,
    assessmentPassed: body.assessment_passed,
    competencies: body.competencies,
    requestId: ctx.requestId,
  });

  if (!outcome.ok) {
    throw new ApiError('INTERNAL', 'I could not save that lesson just now. Your answers are still on this device — open the lesson again and it will save.');
  }

  return ok(
    TrainingCompleteResponse.parse({
      xp_awarded: outcome.xpAwarded,
      repeat: outcome.repeat,
      progress: await readProgress(ctx.user.id, ctx.requestId),
    })
  );
});
