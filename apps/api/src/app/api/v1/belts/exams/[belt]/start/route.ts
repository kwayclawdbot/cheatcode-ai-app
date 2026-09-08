/**
 * POST /api/v1/belts/exams/:belt/start
 *
 * Draws a paper and opens an attempt. Everything that decides whether this is
 * allowed is in SQL — eligibility, the 48-hour cooldown after a failure, the
 * cap of three sittings per rung per thirty days — so the answer is the same
 * whether it is asked here or by a future admin tool.
 *
 * ===========================================================================
 * THE PAPER LEAVES WITHOUT ITS ANSWERS
 * ===========================================================================
 * `belt_exams.blueprint` carries `correct_id` on every question and `expected`
 * on every applied task. The attempt row stores the DRAWN items, keys and all,
 * because grading has to be against the paper the member actually saw. Neither
 * reaches the phone: `paperForClient` rebuilds the paper out of an allow-list of
 * fields, so a blueprint that gains a new key next year is stripped by default
 * rather than published by accident.
 *
 * AN UNFINISHED SITTING IS RESUMED, NOT REDRAWN. Losing signal in the middle of
 * an exam must not cost one of three monthly attempts, and re-drawing the
 * applied tasks on a reopen would be a free re-roll of the pool.
 */
import type { NextRequest } from 'next/server';
import { Belt, ExamStartResponse } from '@shared/api';
import { authedParams, ok, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { callRpc } from '@/lib/rpc';
import { paperForClient } from '@/lib/training/exam';

export const dynamic = 'force-dynamic';

/** Why the door is shut, in the words the screen says. Never a code. */
const REFUSALS: Record<string, string> = {
  not_your_next_rung: 'That is not the belt you are working toward. Your next one is on your belt profile.',
  not_eligible: 'You are not ready to sit this one yet. Your belt profile lists what is still outstanding.',
  may_not_sit_yet: 'You cannot sit this one right now — either you are inside the wait after a failed attempt, or you have used your three sittings for this month.',
  no_exam_written: 'That belt does not have a test yet. Blue is the only one written so far, and the rest are being built.',
};

export const POST = authedParams<{ belt: string }>(async (_req: NextRequest, ctx: Ctx & { params: { belt: string } }) => {
  const parsed = Belt.safeParse(String(ctx.params.belt ?? ''));
  if (!parsed.success) throw new ApiError('NOT_FOUND', 'There is no belt by that name.');

  const rpc = await callRpc<Record<string, unknown>>(
    'start_belt_exam',
    { p_user_id: ctx.user.id, p_belt: parsed.data },
    ctx.requestId
  );
  if (!rpc.ok) {
    throw new ApiError('INTERNAL', 'I could not open the test just now. Nothing has been used up — try again in a moment.');
  }

  const data = (rpc.data ?? {}) as Record<string, unknown>;
  if (data.ok !== true) {
    const reason = String(data.reason ?? '');
    throw new ApiError('STATE_CONFLICT', REFUSALS[reason] ?? 'You cannot sit that test right now.');
  }

  const paper = paperForClient(data.paper);
  if (!paper) {
    throw new ApiError('INTERNAL', 'That test could not be prepared. Nothing has been used up.');
  }

  return ok(
    ExamStartResponse.parse({
      attempt_id: String(data.attempt_id),
      resumed: data.resumed === true,
      paper,
    })
  );
});
