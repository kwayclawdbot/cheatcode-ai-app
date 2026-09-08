/**
 * GET /api/v1/belts/me
 *
 * Everything the Belt Profile screen draws, from the one computation that also
 * guards the exam door — so the ring a member looks at and the gate they walk
 * into cannot disagree about whether they are ready.
 *
 * ===========================================================================
 * WHAT THIS ANSWERS, AND WHAT IT DELIBERATELY DOES NOT
 * ===========================================================================
 * It answers: which belt you HOLD, where it came from (a test, or the points
 * ladder that predated the merge), the two XP halves, and — for the next rung —
 * the four things that have to be true before you may sit its exam, each one
 * with what you have beside what you need.
 *
 * It does not answer "how close are you to the belt", because that is the
 * question the owner's decision removed. XP buys the right to sit. The exam
 * gives the belt. `progress_to_eligible` fills to ELIGIBLE and stops, and the
 * action under it on the screen has a verb in it.
 *
 * THE FOUR-PLUS-THREE SENTENCES ARE SERVED, NOT HARDCODED ON THE PHONE. Same
 * argument `lib/social/belts.ts` makes for the scoring rules: a formula printed
 * from a string in the app is a formula that starts lying the day somebody
 * retunes the database, and nothing fails, so nobody finds out.
 */
import type { NextRequest } from 'next/server';
import { BeltProfileResponse } from '@shared/api';
import { authed, ok, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { serviceClient } from '@/lib/db';
import { callRpc } from '@/lib/rpc';
import { beltExplainer, pointsConfig } from '@/lib/social/belts';
import { parseEligibility, progressToEligible } from '@/lib/training/eligibility';

export const dynamic = 'force-dynamic';

export const GET = authed(async (_req: NextRequest, ctx: Ctx) => {
  const rpc = await callRpc<unknown>('belt_eligibility', { p_user_id: ctx.user.id }, ctx.requestId);
  if (!rpc.ok) {
    // A belt screen that invents a ladder because the database was slow would
    // be telling somebody they are three calls from Blue on no evidence at all.
    throw new ApiError('INTERNAL', 'I could not read your belt just now. Nothing has changed — try again in a moment.');
  }

  const eligibility = parseEligibility(rpc.data, ctx.requestId);
  if (!eligibility) {
    throw new ApiError('INTERNAL', 'I could not read your belt just now. Nothing has changed — try again in a moment.');
  }

  const cfg = await pointsConfig(ctx.requestId);

  // The stage is derived from the belt server-side (spec §9) and is already
  // applied by the exam; it is read here rather than recomputed so the screen
  // shows what the profile actually says.
  const { data: profile } = await serviceClient()
    .from('profiles')
    .select('stage')
    .eq('user_id', ctx.user.id)
    .maybeSingle();

  return ok(
    BeltProfileResponse.parse({
      belt: eligibility.belt,
      belt_source: eligibility.belt_source,
      xp_calls: eligibility.xp_calls,
      xp_training: eligibility.xp_training,
      calls_resolved: eligibility.calls_resolved,
      clean_paper_plans: eligibility.clean_paper_plans,
      next: eligibility.next,
      may_convert_legacy: eligibility.may_convert_legacy,
      progress_to_eligible: progressToEligible(eligibility.next),
      explainer: beltExplainer(cfg),
      stage: (profile as { stage?: string } | null)?.stage ?? null,
    })
  );
});
