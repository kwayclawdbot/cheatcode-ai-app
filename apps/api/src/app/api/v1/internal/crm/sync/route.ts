/**
 * POST /api/v1/internal/crm/sync
 *
 * NOT a user route. Auth is the `x-internal-secret` header matched against
 * `INTERNAL_SECRET`, exactly as `internal/paper/tick` and `internal/push/drain`
 * do — no bearer token, no user, and no way to reach it from the app. Without
 * the env var configured it answers 404 as if it did not exist, so a deploy
 * that forgot the secret does not expose an endpoint that rewrites the CRM.
 *
 * Hosted, this is a Vercel cron alongside the paper tick and the push drain:
 *
 *   { "crons": [{ "path": "/api/v1/internal/crm/sync", "schedule": "0 * * * *" }] }
 *
 * `source` defaults to `app`, which is the only one that can run this round.
 * Asking for a deferred source is not an error here: it runs, records a failed
 * `sync_runs` row carrying the exact reason, and returns it — because a cron
 * that silently skipped a source would look identical to one that succeeded.
 */
import type { NextRequest } from 'next/server';
import { InternalCrmSyncRequest, InternalCrmSyncResponse } from '@shared/api';
import { ApiError, errorResponse, validationError } from '@/lib/errors';
import { env } from '@/lib/env';
import { log, newRequestId } from '@/lib/log';
import { runSync } from '@/lib/crm/run';
import { shapeRun } from '@/lib/admin/sources';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const NOT_FOUND = () => new ApiError('NOT_FOUND', 'That is not something this app does.');

function authorized(req: NextRequest): boolean {
  const secret = env('INTERNAL_SECRET');
  if (!secret) return false;
  const sent = req.headers.get('x-internal-secret') ?? '';
  // Length-independent compare. Overkill for a local secret, and a timing side
  // channel on the endpoint that can rewrite every person in the CRM is not a
  // thing to be relaxed about.
  if (sent.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < secret.length; i += 1) diff |= sent.charCodeAt(i) ^ secret.charCodeAt(i);
  return diff === 0;
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = newRequestId();
  try {
    if (!authorized(req)) throw NOT_FOUND();

    let raw: unknown = {};
    try {
      const text = await req.text();
      raw = text ? JSON.parse(text) : {};
    } catch {
      raw = {};
    }
    const parsed = InternalCrmSyncRequest.safeParse(raw);
    if (!parsed.success) throw validationError(parsed.error.issues);

    const result = await runSync({
      source: parsed.data.source,
      dryRun: parsed.data.dry_run,
      requestId,
    });

    log('info', requestId, 'crm.sync.internal', {
      source: result.source,
      state: result.state,
      dry_run: result.dry_run,
      ...result.counts,
    });

    const run = result.id
      ? shapeRun({
          id: result.id,
          source: result.source,
          state: result.state,
          dry_run: result.dry_run,
          started_at: result.started_at,
          finished_at: result.finished_at,
          counts: result.counts,
          error: result.error,
        })
      : null;

    return Response.json(
      InternalCrmSyncResponse.parse({
        runs: run ? [run] : [],
        plain:
          result.state === 'failed'
            ? `${result.source}: ${result.error ?? 'the run did not complete'}`
            : `${result.source}: looked at ${result.counts.scanned}, created ${result.counts.created}.`,
      }),
      { status: 200, headers: { 'x-request-id': requestId } }
    );
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError('INTERNAL', 'The sync did not complete.');
    log(err.status >= 500 ? 'error' : 'warn', requestId, 'crm.sync.error', {
      code: err.code,
      message: err.message,
    });
    return errorResponse(err, requestId);
  }
}
