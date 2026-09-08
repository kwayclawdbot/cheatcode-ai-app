/**
 * POST /api/v1/training/claim
 *
 * One handset's stored training profile, moved up to the account that says it
 * is theirs — once, and only when that account has nothing of its own.
 *
 * ===========================================================================
 * WHY THIS IS A CLAIM AND NOT A MERGE
 * ===========================================================================
 * The stored blob carries no account id. That IS the bug (audit F10): one
 * AsyncStorage key, no owner, no reset on sign-out. So nothing about the blob
 * can prove whose progress it is, and this route does not pretend otherwise.
 *
 * What it does instead:
 *   - the app ASKS, out loud, before ever calling this. "Is this yours?" with
 *     the lessons named, and a way to say no.
 *   - the server honours it only when the account has NO training rows, so a
 *     second account on the same handset cannot inherit a first one's work.
 *   - the app deletes the local key after a successful claim, so the offer is
 *     made exactly once on that device.
 *
 * The one case none of that can distinguish — two people sharing a phone where
 * the first to sign in was not the learner — is resolved by the question, which
 * is why the question is not optional.
 *
 * IT PAYS WHAT A LESSON COMPLETED TODAY PAYS, AND NO MORE. Every row goes
 * through `record_lesson_completion`, so a claimed lesson is clamped by the same
 * `sanitiseLedger` and lands on the same ledger under the same idempotency rule.
 * Claiming twice is worth nothing, and so is claiming a lesson you had already
 * completed on another device.
 */
import type { NextRequest } from 'next/server';
import { TrainingClaimRequest, TrainingClaimResponse } from '@shared/api';
import { authed, ok, parseBody, type Ctx } from '@/lib/http';
import { claimLocalProfile, readProgress } from '@/lib/training/progress';

export const dynamic = 'force-dynamic';

export const POST = authed(async (req: NextRequest, ctx: Ctx) => {
  const body = await parseBody(req, TrainingClaimRequest);
  const result = await claimLocalProfile({
    userId: ctx.user.id,
    lessons: body.lessons,
    requestId: ctx.requestId,
  });
  return ok(
    TrainingClaimResponse.parse({
      claimed: result.claimed,
      lessons: result.lessons,
      reason: result.reason,
      progress: await readProgress(ctx.user.id, ctx.requestId),
    })
  );
});
