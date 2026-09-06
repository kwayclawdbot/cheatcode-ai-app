/**
 * GET|POST /api/v1/internal/media/purge
 *
 * THE THING THAT MAKES "WE DELETED IT" TRUE.
 *
 * Removing a message, or deleting an account, deletes the `media_assets` rows —
 * and deleting a row does NOT delete the file. Supabase Storage keeps its index
 * in Postgres and the bytes in an object store, and only an HTTP call moves the
 * bytes. A trigger cannot make one. So migration 0033 §5 has the database write
 * down what needs to go, and this route is what carries it out.
 *
 * IT IS NOT THE ONLY CARRIER, and it must not be. The moderation removal route
 * drains inline, so a reported picture is gone in the same second a moderator
 * taps the button. This exists because that call can fail — storage down, the
 * function timed out, a network blip — and a best-effort delete inside a
 * request handler has no memory of having failed. The queue does. Every minute
 * it tries again, and a row that never clears carries its error where somebody
 * can see it.
 *
 * It also sweeps ORPHANS: uploads a member started and never posted. That
 * happens honestly — pick a photo, change your mind, close the app — and
 * without this the bytes would sit in the bucket forever attached to nothing.
 *
 * Same auth as every other internal route: `x-internal-secret`, and with no
 * `INTERNAL_SECRET` configured the route answers 404 as if it did not exist.
 */
import type { NextRequest } from 'next/server';
import { ApiError, errorResponse } from '@/lib/errors';
import { internalAuthorized } from '@/lib/internal-auth';
import { log, newRequestId } from '@/lib/log';
import { purgePending, sweepOrphans } from '@/lib/media/store';
import { ORPHAN_AGE_MS } from '@/lib/media/limits';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const NOT_FOUND = () => new ApiError('NOT_FOUND', 'That is not something this app does.');

async function handle(req: NextRequest): Promise<Response> {
  const requestId = newRequestId();
  try {
    if (!internalAuthorized(req)) throw NOT_FOUND();

    // Orphans first, so anything it queues is picked up by the same run rather
    // than waiting a minute.
    const orphans = await sweepOrphans({ olderThanMs: ORPHAN_AGE_MS, requestId });
    const purge = await purgePending({ requestId });

    log('info', requestId, 'media.purge_run', { ...purge, orphans });

    return Response.json(
      {
        orphans_swept: orphans,
        attempted: purge.attempted,
        purged: purge.purged,
        failed: purge.failed,
        plain:
          purge.attempted === 0 && orphans === 0
            ? 'Nothing was waiting.'
            : `${purge.purged} file(s) removed from storage, ${purge.failed} still to retry.`,
      },
      { status: 200, headers: { 'x-request-id': requestId } }
    );
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError('INTERNAL', 'The purge did not complete.');
    log(err.status >= 500 ? 'error' : 'warn', requestId, 'media.purge_error', {
      code: err.code,
      message: err.message,
    });
    return errorResponse(err, requestId);
  }
}

export const GET = handle;
export const POST = handle;
