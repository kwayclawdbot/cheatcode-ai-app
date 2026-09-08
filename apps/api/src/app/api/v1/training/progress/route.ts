/**
 * GET /api/v1/training/progress
 *
 * The learner's training profile, for the learner who is asking. This route is
 * the whole of the audit's F10 fix from the app's point of view: progress that
 * used to live in one AsyncStorage key with NO ACCOUNT ID on it now comes back
 * per authenticated member, from a database, on any device they sign in on.
 *
 * WHAT MAKES THIS ISOLATED RATHER THAN JUST STORED: `ctx.user.id` comes from
 * the bearer token and nothing in the request can change it. Two accounts on
 * one handset get two different answers here, which was the bug.
 *
 * An empty profile is a normal answer. Somebody who has not started training
 * has exactly that, and so does anybody on a database where 0046 has not been
 * applied yet — the difference is logged and never rendered, because telling a
 * member the service is broken when the truthful answer is "you have not
 * started" is the worse of two mistakes.
 */
import type { NextRequest } from 'next/server';
import { TrainingProgressResponse } from '@shared/api';
import { authed, ok, type Ctx } from '@/lib/http';
import { readProgress } from '@/lib/training/progress';

export const dynamic = 'force-dynamic';

export const GET = authed(async (_req: NextRequest, ctx: Ctx) => {
  const progress = await readProgress(ctx.user.id, ctx.requestId);
  return ok(TrainingProgressResponse.parse(progress));
});
