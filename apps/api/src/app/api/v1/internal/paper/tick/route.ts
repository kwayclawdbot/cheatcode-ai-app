/**
 * POST /api/v1/internal/paper/tick
 *
 * NOT a user route. Auth is the `x-internal-secret` header matched against
 * `INTERNAL_SECRET` — there is no bearer token, no user, and no way to reach it
 * from the app. Without the env var configured the route answers 404 exactly as
 * if it did not exist, so a deploy that forgot the secret does not expose an
 * open endpoint that moves positions.
 *
 * Locally the same function also runs on a `setInterval`
 * (`PAPER_TICK_DEV_INTERVAL_S`, guarded so only one ever runs). Hosted, this is
 * a Vercel cron:
 *
 *   { "crons": [{ "path": "/api/v1/internal/paper/tick", "schedule": "* * * * *" }] }
 *
 * with the secret supplied by a Vercel cron header rewrite. One tick costs at
 * most two Polygon requests regardless of how many symbols are in flight,
 * because `getSnapshot` uses the grouped endpoint.
 *
 * The `{quotes:{SYM:price}}` override is DEV_TOOLS=1 only. It is how the smoke
 * test crosses a limit or fires a stop on demand without waiting for the market
 * to do it, and it must never be reachable in production: a synthetic price
 * that could book a real-looking fill is exactly the kind of fixture that ends
 * up in a screenshot as if it happened.
 */
import type { NextRequest } from 'next/server';
import { PaperTickRequest, PaperTickResponse } from '@shared/api';
import { ApiError, errorResponse, validationError } from '@/lib/errors';
import { env } from '@/lib/env';
import { log, newRequestId } from '@/lib/log';
import { runPaperTick } from '@/lib/execution/tick';
import { devTickerStatus, ensureDevTicker } from '@/lib/execution/tick-dev';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const NOT_FOUND = () => new ApiError('NOT_FOUND', 'That is not something this app does.');

function authorized(req: NextRequest): boolean {
  const secret = env('INTERNAL_SECRET');
  if (!secret) return false;
  const sent = req.headers.get('x-internal-secret') ?? '';
  // Length-independent compare is overkill for a local secret, but a timing
  // side-channel on an execution endpoint is not a thing to be relaxed about.
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
    const parsed = PaperTickRequest.safeParse(raw);
    if (!parsed.success) throw validationError(parsed.error.issues);

    const devTools = env('DEV_TOOLS') === '1';
    if (parsed.data.quotes && !devTools) {
      throw new ApiError('FORBIDDEN', 'Synthetic prices are a development tool and are not available here.');
    }

    ensureDevTicker();
    const result = await runPaperTick({
      requestId,
      overrides: devTools ? parsed.data.quotes : undefined,
      userId: parsed.data.user_id,
    });

    log('info', requestId, 'paper.tick_run', {
      symbols: result.symbols.length,
      marked: result.positions_marked,
      filled: result.orders_filled,
      legs: result.legs_fired,
      source: result.quote_source,
      dev_ticker: devTickerStatus().on,
    });

    return Response.json(PaperTickResponse.parse(result), {
      status: 200,
      headers: { 'x-request-id': requestId },
    });
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError('INTERNAL', 'The tick did not complete.');
    log(err.status >= 500 ? 'error' : 'warn', requestId, 'paper.tick_error', { code: err.code, message: err.message });
    return errorResponse(err, requestId);
  }
}
