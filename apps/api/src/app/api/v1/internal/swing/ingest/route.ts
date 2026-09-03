/**
 * GET|POST /api/v1/internal/swing/ingest
 *
 * THE PIPE. This is how a Kai alert generated on Railway becomes an object in
 * this app without a person running anything.
 *
 *   Railway `cron-morning-alerts` → Kai Supabase `sent_alerts`
 *     → THIS ROUTE (Vercel cron, every 10 minutes through the session)
 *       → this app's `setups`  → the Alerts tab
 *       → `notifications`      → the inbox, and a push if the user allows one
 *
 * A PULL, NOT A PUSH, ON PURPOSE. Railway holds the producer and its deploy is
 * pinned at 2026-08-04; making delivery depend on shipping a change there would
 * put a change to what 130 paying SMS subscribers receive in the path of an
 * in-app feature. Pulling also means the app self-heals: an ingest that fails
 * at 08:40 simply picks the pick up at 08:50, and a producer nobody has taught
 * about this app still lands in it.
 *
 * SAFE TO RUN EVERY TEN MINUTES, and that is a property of `ingestSwingSetups`,
 * not a hope. The setup id is a v5 UUID of (ticker, ET date, alert_type) and a
 * fingerprint is compared before any write, so a run over an unchanged window
 * writes zero rows; `publishSetups` is handed ONLY the ids this run INSERTED,
 * and it re-reads `notifications` before sending, so nobody is told twice.
 *
 * `notify` DEFAULTS ON HERE and is off in the CLI. The cron exists precisely to
 * deliver; a scheduled run that filled a table and told nobody would be the
 * silent-failure this route was written to end. `?notify=0` turns it off for a
 * one-off catch-up, and `?dry=1` computes everything and writes nothing.
 *
 * THE WINDOW IS SMALL BY DEFAULT (7 days). A backfill is a deliberate act with
 * an explicit `?since=`, run by a human who has read what it will do — see
 * `scripts/ingest-swing-setups.ts`.
 */
import type { NextRequest } from 'next/server';
import { ApiError, errorResponse } from '@/lib/errors';
import { internalAuthorized } from '@/lib/internal-auth';
import { log, newRequestId } from '@/lib/log';
import { ingestSwingSetups } from '@/lib/swing/run';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const NOT_FOUND = () => new ApiError('NOT_FOUND', 'That is not something this app does.');

/** Days of source history a scheduled run looks at. Days, not picks. */
const CRON_WINDOW_DAYS = 7;

async function handle(req: NextRequest): Promise<Response> {
  const requestId = newRequestId();
  try {
    if (!internalAuthorized(req)) throw NOT_FOUND();

    const q = req.nextUrl.searchParams;
    const dryRun = q.get('dry') === '1';
    // Opt OUT, not in: the whole point of the schedule is that it delivers.
    const notify = q.get('notify') !== '0';
    const since = q.get('since') ?? isoDaysAgo(CRON_WINDOW_DAYS);

    const started = Date.now();
    const summary = await ingestSwingSetups({ since, dryRun, notify });
    const elapsedMs = Date.now() - started;

    log('info', requestId, 'swing.ingest_run', {
      since,
      dry_run: dryRun,
      picks_ingested: summary.picks_ingested,
      inserted: summary.inserted,
      updated: summary.updated,
      unchanged: summary.unchanged,
      published: summary.published?.published ?? 0,
      notified: summary.published?.notified ?? 0,
      declined: summary.declined,
      elapsed_ms: elapsedMs,
    });

    // An `alert_type` the family map has never seen is a NEW FAMILY appearing
    // in the source, not noise: it is being skipped, and the log is the only
    // place anyone would find out before a user asks where their alert went.
    for (const [family, types] of Object.entries(summary.declined)) {
      log('warn', requestId, 'swing.ingest_unclassified_alert_type', { family, types });
    }

    return Response.json(
      {
        ok: true,
        since,
        dry_run: dryRun,
        inserted: summary.inserted,
        updated: summary.updated,
        unchanged: summary.unchanged,
        published: summary.published?.published ?? 0,
        notified: summary.published?.notified ?? 0,
        refusals: summary.published?.refusals ?? {},
        elapsed_ms: elapsedMs,
        plain: summary.inserted === 0
          ? 'No new alert had arrived.'
          : `${summary.inserted} new alert${summary.inserted === 1 ? '' : 's'} imported, `
            + `${summary.published?.notified ?? 0} recipient${(summary.published?.notified ?? 0) === 1 ? '' : 's'} told.`,
      },
      { status: 200, headers: { 'x-request-id': requestId } },
    );
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError('INTERNAL', 'The ingest did not complete.');
    log(err.status >= 500 ? 'error' : 'warn', requestId, 'swing.ingest_error', {
      code: err.code,
      message: err.message,
      detail: e instanceof Error ? e.message : String(e),
    });
    return errorResponse(err, requestId);
  }
}

/** Vercel cron calls GET. A human or a script may call either. */
export const GET = handle;
export const POST = handle;

function isoDaysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}
