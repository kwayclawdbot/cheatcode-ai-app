/**
 * POST /api/v1/internal/push/drain
 *
 * NOT a user route — the same shape as `/internal/paper/tick`. Auth is the
 * `x-internal-secret` header matched against `INTERNAL_SECRET`; without the env
 * var the route answers 404 exactly as if it did not exist, so a deploy that
 * forgot the secret does not expose an endpoint that can send messages to every
 * device on the service.
 *
 * Locally the same function runs on a `setInterval` (`PUSH_DRAIN_DEV_INTERVAL_S`,
 * single-instance guard — see `lib/push/drain-dev.ts`). Hosted, this is a Vercel
 * cron, alongside the paper tick:
 *
 *   { "crons": [{ "path": "/api/v1/internal/push/drain", "schedule": "* * * * *" }] }
 *
 * THE SENDER ONLY RUNS WHILE SOMETHING TICKS. No cron, no push — the rows pile
 * up as `queued` and `GET /push/health` says so.
 */
import type { NextRequest } from 'next/server';
import { PushDrainResponse } from '@shared/api';
import { ApiError, errorResponse } from '@/lib/errors';
import { internalAuthorized } from '@/lib/internal-auth';
import { log, newRequestId } from '@/lib/log';
import { drainPush } from '@/lib/push/send';
import { ensureDevDrainer } from '@/lib/push/drain-dev';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const NOT_FOUND = () => new ApiError('NOT_FOUND', 'That is not something this app does.');


async function handle(req: NextRequest): Promise<Response> {
  const requestId = newRequestId();
  try {
    if (!internalAuthorized(req)) throw NOT_FOUND();

    ensureDevDrainer();
    const r = await drainPush({ requestId });

    log('info', requestId, 'push.drain_run', r);

    return Response.json(
      PushDrainResponse.parse({
        ...r,
        plain:
          r.claimed === 0 && r.receipts_checked === 0
            ? 'Nothing was waiting.'
            : `${r.sent} sent, ${r.retried} to retry, ${r.failed} failed.`,
      }),
      { status: 200, headers: { 'x-request-id': requestId } }
    );
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError('INTERNAL', 'The drain did not complete.');
    log(err.status >= 500 ? 'error' : 'warn', requestId, 'push.drain_error', {
      code: err.code,
      message: err.message,
    });
    return errorResponse(err, requestId);
  }
}

/** Vercel cron calls GET; a script may call either. See `lib/internal-auth.ts`. */
export const GET = handle;
export const POST = handle;
