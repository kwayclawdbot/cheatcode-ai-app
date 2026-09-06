/**
 * POST /api/v1/internal/uoa-alerts
 *
 * THE PIPE. This is how an alert fired by the unusual-options-activity day-trade
 * engine becomes a card in the app's Day Trade section.
 *
 *   LaunchAgent (a laptop, every trading morning)
 *     → uw_alerts/live_stream.py, polling the Unusual Whales flow feed
 *       → `deliver()` POSTs the fired alert here
 *         → this app's `setups` (mode = day_trade)  → the Alerts board
 *
 * A PUSH, NOT A PULL, AND THAT IS THE POINT. The swing lane next door pulls,
 * because its producer is a Railway service with a pinned deploy and a database
 * this app can read. This producer is neither: it is a process on a laptop with
 * no table anybody else can see, and the alert it fires is worth minutes, not
 * hours. A 0-2 day option found at 09:32 and delivered on the next ten-minute
 * sweep has had a tenth of its life spent in a queue. So the engine hands the
 * alert over the moment it fires, and this route's only job is to be there.
 *
 * IT IS SAFE TO POST THE SAME ALERT TWICE. The setup id is a v5 UUID of
 * (ticker, session date, direction, live-or-replay), so a retry after a timeout
 * that actually succeeded upserts the same row rather than making a second one.
 * That matters here more than usual: the producer retries three times, and a
 * duplicate would be a duplicate CARD.
 *
 * IT SENDS NOBODY A NOTIFICATION, ON PURPOSE. This route fills a board. Pushing
 * a notification to every device on the service is a different decision with a
 * different blast radius, and the swing lane already shows what that costs to
 * get right (`setup_alert_prefs`, quiet hours, max-per-day, a re-read of
 * `notifications` so nobody is told twice). Wiring this family into that is its
 * own piece of work; doing it as a side effect of "make the card appear" is how
 * an experiment starts texting people.
 *
 * WHAT IT ANSWERS WITH. `{ ok, setup_id, state, … }` — and the producer writes
 * that whole response into the alert's own row in its paper track, so the
 * delivery is auditable from the engine's side without asking this app.
 */
import type { NextRequest } from 'next/server';
import { ApiError, errorResponse } from '@/lib/errors';
import { internalAuthorized } from '@/lib/internal-auth';
import { log, newRequestId } from '@/lib/log';
import { serviceClient } from '@/lib/db';
import { setupFromUoaRecord, UoaRejected, UOA_ORIGIN } from '@/lib/uoa/ingest';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const NOT_FOUND = () => new ApiError('NOT_FOUND', 'That is not something this app does.');

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = newRequestId();
  try {
    if (!internalAuthorized(req)) throw NOT_FOUND();

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new ApiError('VALIDATION_FAILED', 'That request body is not JSON.');
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ApiError('VALIDATION_FAILED', 'Send one fired alert as a JSON object.');
    }

    const dryRun = req.nextUrl.searchParams.get('dry') === '1';

    let row;
    try {
      row = setupFromUoaRecord(body as Record<string, unknown>);
    } catch (e) {
      // A malformed record is a producer bug, and it is answered as one — with
      // the reason, so whoever reads the paper track later knows what was wrong
      // with the thing that was sent rather than that "it failed".
      if (e instanceof UoaRejected) throw new ApiError('VALIDATION_FAILED', e.message);
      throw e;
    }

    if (dryRun) {
      return Response.json(
        { ok: true, dry_run: true, setup_id: row.id, symbol: row.symbol, state: row.state,
          plain: 'Read and understood. Nothing was written.' },
        { status: 200, headers: { 'x-request-id': requestId } },
      );
    }

    const db = serviceClient();

    // `setups.symbol` is a foreign key into `instruments`, so a name this app
    // has never seen has to exist there before the setup can. The producer's
    // universe gate is wider than this app's instrument list, so this is the
    // ordinary case for a small name, not an edge one.
    const known = await db.from('instruments').select('symbol').eq('symbol', row.symbol).maybeSingle();
    if (!known.data) {
      const made = await db.from('instruments').upsert(
        [{ symbol: row.symbol, kind: 'equity', active: true, meta: { source: UOA_ORIGIN } }],
        { onConflict: 'symbol', ignoreDuplicates: true },
      );
      if (made.error) {
        throw new ApiError('INTERNAL', 'The symbol could not be registered.', { detail: made.error.message });
      }
    }

    const written = await db.from('setups').upsert([row], { onConflict: 'id' }).select('id').single();
    if (written.error) {
      throw new ApiError('INTERNAL', 'The alert could not be stored.', { detail: written.error.message });
    }

    log('info', requestId, 'uoa.ingest_alert', {
      setup_id: row.id,
      symbol: row.symbol,
      intent: row.intent,
      state: row.state,
      session_date: (row.quote_snapshot as Record<string, unknown>).et_date,
      is_replay: (row.quote_snapshot as Record<string, unknown>).is_replay,
      contracts: ((row.score_components as Record<string, unknown>).recommended_options as unknown[]).length,
    });

    return Response.json(
      {
        ok: true,
        setup_id: row.id,
        symbol: row.symbol,
        state: row.state,
        mode: 'day_trade',
        valid_until: row.valid_until,
        plain: row.state === 'ready'
          ? `Stored. It is a live card in the Day Trade section until the close.`
          : `Stored as a record. It is in the Day Trade history rather than among today's alerts.`,
      },
      { status: 200, headers: { 'x-request-id': requestId } },
    );
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError('INTERNAL', 'The alert was not stored.');
    log(err.status >= 500 ? 'error' : 'warn', requestId, 'uoa.ingest_error', {
      code: err.code,
      message: err.message,
      detail: e instanceof Error ? e.message : String(e),
    });
    return errorResponse(err, requestId);
  }
}
