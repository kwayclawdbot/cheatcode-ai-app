/**
 * POST /api/v1/belts/exams/:belt/submit
 *
 * ===========================================================================
 * THE PHONE DOES NOT GRADE THIS AND CANNOT
 * ===========================================================================
 * The answers go straight into `grade_belt_exam`, a `security definer` function
 * that `anon` and `authenticated` may not execute (0047 §11) — the same posture
 * 0039 takes for `award_points`. A belt a phone can grant itself is not a belt,
 * and the answer key never leaves the database, so there is nothing on the
 * device to read, patch or replay.
 *
 * What comes back is a verdict and a REVIEW: for every item, whether it was
 * right and the sentence explaining why. A failed exam that cannot say what was
 * wrong is a gate, not a measurement — and this exam is meant to be a
 * measurement, which is the whole reason the belt moved behind it.
 *
 * THE APPLIED HALF IS REPORTED SEPARATELY because it is a condition of its own:
 * passing needs the mark AND every drawn chart task correct. An 80% earned by
 * answering ten questions from memory and fluffing the chart has not
 * demonstrated the thing the belt claims (spec §12).
 *
 * IT IS IDEMPOTENT. A retried submit reads back the verdict already recorded
 * rather than grading a second time — a dropped connection must not cost
 * somebody a sitting or, worse, produce two different results for one attempt.
 */
import type { NextRequest } from 'next/server';
import { Belt, ExamSubmitRequest, ExamSubmitResponse } from '@shared/api';
import { authedParams, ok, parseBody, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { callRpc } from '@/lib/rpc';
import { examPlain } from '@/lib/training/exam';
import { pointsConfig } from '@/lib/social/belts';

export const dynamic = 'force-dynamic';

export const POST = authedParams<{ belt: string }>(async (req: NextRequest, ctx: Ctx & { params: { belt: string } }) => {
  const belt = Belt.safeParse(String(ctx.params.belt ?? ''));
  if (!belt.success) throw new ApiError('NOT_FOUND', 'There is no belt by that name.');

  const body = await parseBody(req, ExamSubmitRequest);

  const rpc = await callRpc<Record<string, unknown>>(
    'grade_belt_exam',
    { p_user_id: ctx.user.id, p_attempt_id: body.attempt_id, p_answers: body.answers },
    ctx.requestId
  );
  if (!rpc.ok) {
    throw new ApiError('INTERNAL', 'I could not mark that just now. Your answers are safe — send them again in a moment.');
  }

  const data = (rpc.data ?? {}) as Record<string, unknown>;
  if (data.ok !== true) {
    throw new ApiError('NOT_FOUND', 'I could not find that attempt. Start the test again from your belt profile.');
  }

  const cfg = await pointsConfig(ctx.requestId);
  const label = cfg?.belts.find((b) => b.key === belt.data)?.label ?? belt.data;
  const passed = data.passed === true;
  const scorePct = Number(data.score_pct ?? 0);
  const passPct = Number(data.pass_pct ?? 0);
  const appliedCorrect = Number(data.applied_correct ?? 0);
  const appliedTotal = Number(data.applied_total ?? 0);

  const review = Array.isArray(data.review)
    ? (data.review as Record<string, unknown>[]).map((r) => ({
        id: String(r.id ?? ''),
        kind: r.kind === 'applied' ? ('applied' as const) : ('knowledge' as const),
        correct: r.correct === true,
        because: String(r.because ?? ''),
      }))
    : [];

  return ok(
    ExamSubmitResponse.parse({
      score_pct: scorePct,
      pass_pct: passPct,
      passed,
      applied_correct: appliedCorrect,
      applied_total: appliedTotal,
      belt: String(data.belt ?? 'white'),
      belt_changed: passed && String(data.belt ?? 'white') === belt.data,
      review,
      plain: examPlain({
        passed,
        score_pct: scorePct,
        pass_pct: passPct,
        applied_correct: appliedCorrect,
        applied_total: appliedTotal,
        belt_label: label,
      }),
    })
  );
});
