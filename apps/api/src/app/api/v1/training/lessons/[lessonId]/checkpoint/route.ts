/**
 * PUT /api/v1/training/lessons/:lessonId/checkpoint
 *
 * Where somebody is inside a lesson they have not finished (audit F11).
 *
 * The one authored lesson is a fourteen-screen sequence, and until this existed
 * leaving it half way restarted the run from screen one with every answer gone.
 * That is the most expensive thing this product does to somebody's attention,
 * and it is fixed by writing one small row on every interaction.
 *
 * IT IS BEST-EFFORT ON PURPOSE. A checkpoint that fails to save costs a member
 * the tail of one lesson; a lesson that refuses to advance because a checkpoint
 * did not save costs them the lesson. So this route answers 200 with
 * `{ saved: false }` when the write did not land, and the runner carries on —
 * it keeps its own copy in memory for the session either way.
 *
 * There is no GET. The checkpoints come back inside `GET /training/progress`,
 * because the screen that needs them is already reading that on mount and a
 * second round trip per lesson would buy nothing.
 */
import type { NextRequest } from 'next/server';
import { TrainingCheckpointRequest } from '@shared/api';
import { authedParams, ok, parseBody, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { lessonEntry } from '@/lib/training/curriculum';
import { saveCheckpoint } from '@/lib/training/progress';

export const dynamic = 'force-dynamic';

export const PUT = authedParams<{ lessonId: string }>(async (req: NextRequest, ctx: Ctx & { params: { lessonId: string } }) => {
  const lessonId = String(ctx.params.lessonId ?? '');
  if (!lessonEntry(lessonId)) {
    throw new ApiError('NOT_FOUND', 'There is no lesson with that id in the programme.');
  }
  const body = await parseBody(req, TrainingCheckpointRequest);
  const saved = await saveCheckpoint({
    userId: ctx.user.id,
    lessonId,
    screenIndex: body.screen_index,
    answers: body.answers,
    correct: body.correct,
    answered: body.answered,
    assessmentPassed: body.assessment_passed,
    requestId: ctx.requestId,
  });
  return ok({ saved });
});
