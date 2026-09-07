/**
 * GET | POST /api/v1/internal/social/resolve
 *
 * THE PASS DOES TWO JOBS AND THE PATH ONLY NAMES ONE. It resolves members'
 * calls, and it keeps the running peak of every ACTIVE call — the house's own
 * alerts included — so History can show what the best price actually was rather
 * than a percentage with no price behind it. The path is unchanged because the
 * cron entry in `vercel.json` points at it and renaming a scheduled route to be
 * tidier is a way to silently stop a job. See `lib/social/resolve.ts`.
 *
 * NOT a user route. Auth is `internalAuthorized()` — the `x-internal-secret`
 * header for a script, or the `Authorization: Bearer <CRON_SECRET>` a Vercel
 * cron derives. An unauthorised caller gets 404, exactly as if the path did not
 * exist: a deploy that forgot the secret must not expose an endpoint that
 * writes points.
 *
 * BOTH VERBS ARE EXPORTED AND THAT IS NOT TIDINESS. Vercel invokes a cron with
 * a GET and cannot be told to send a custom header; an internal route that only
 * exported POST answered 405 to every scheduled invocation, and the dashboard
 * showed it green. The whole story is in the header of `lib/internal-auth.ts`.
 *
 * THE SCHEDULE, in `vercel.json`:
 *
 *   { "path": "/api/v1/internal/social/resolve",
 *     "schedule": "*\/5 13,14,15,16,17,18,19,20 * * 1-5" }
 *
 * Every five minutes, weekdays, through the US session in UTC. NOT every
 * minute: there is a rate limiter in front of Polygon (`POLYGON_RPM`) shared
 * with the paper tick, which does run every minute and has positions riding on
 * it. A call's horizon is five days; five minutes of resolution against that is
 * more precision than the claim itself has.
 */
import type { NextRequest } from 'next/server';
import { ApiError, errorResponse } from '@/lib/errors';
import { internalAuthorized } from '@/lib/internal-auth';
import { log, newRequestId } from '@/lib/log';
import { runSocialResolve } from '@/lib/social/resolve';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const NOT_FOUND = () => new ApiError('NOT_FOUND', 'That is not something this app does.');

async function handle(req: NextRequest): Promise<Response> {
  const requestId = newRequestId();
  try {
    if (!internalAuthorized(req)) throw NOT_FOUND();

    const result = await runSocialResolve({ requestId });

    log('info', requestId, 'social.resolve_run', {
      checked: result.checked,
      symbols: result.symbols,
      resolved: result.resolved,
      hit_target: result.hit_target,
      stopped: result.stopped,
      expired: result.expired,
      awarded: result.awarded,
      belts_changed: result.belts_changed,
      degraded: result.degraded,
      // The peak tracker's half of the same pass. Logged flat beside the
      // resolver's own counters so one log line says what the whole pass did.
      tracked_setups: result.peaks?.tracked_setups ?? 0,
      tracked_calls: result.peaks?.tracked_calls ?? 0,
      extremes_written: result.peaks?.extremes_written ?? 0,
      seeded: result.peaks?.seeded ?? 0,
      tracking_resolved: result.peaks?.resolved ?? 0,
      contracts_graded: result.peaks?.contracts_graded ?? 0,
    });

    return Response.json(result, { status: 200, headers: { 'x-request-id': requestId } });
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError('INTERNAL', 'The resolver did not complete.');
    log(err.status >= 500 ? 'error' : 'warn', requestId, 'social.resolve_error', {
      code: err.code,
      message: err.message,
      detail: e instanceof Error ? e.message : String(e),
    });
    return errorResponse(err, requestId);
  }
}

/** Vercel cron calls GET; a script may call either. See `lib/internal-auth.ts`. */
export const GET = handle;
export const POST = handle;
