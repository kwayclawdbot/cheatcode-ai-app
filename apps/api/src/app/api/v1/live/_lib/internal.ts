/**
 * Auth for the worker-facing endpoints under `/api/v1/live/internal/**`.
 *
 * Same shape as `internal/paper/tick`: an `x-internal-secret` header compared
 * against `INTERNAL_SECRET`, no user, no bearer token, and a 404 — not a 401 —
 * when the secret is unset, so a deploy that forgot the variable exposes an
 * endpoint that does not appear to exist rather than one that answers "wrong
 * password" to anybody probing.
 *
 * WHY THESE ENDPOINTS EXIST AT ALL. `workers/kai-live` needs three things the
 * API already does correctly — Polygon candles with the cache in front of them,
 * the deterministic technicals, and the setup derivations — and a duplicate of
 * any of them in the worker would be a second source of numbers that can drift
 * from the app's. The show and the app must never quote different prices for
 * the same level.
 */
import type { NextRequest } from 'next/server';
import { ApiError, errorResponse } from '@/lib/errors';
import { env } from '@/lib/env';
import { log, newRequestId } from '@/lib/log';

export const NOT_FOUND = () => new ApiError('NOT_FOUND', 'That is not something this app does.');

function authorized(req: NextRequest): boolean {
  const secret = env('INTERNAL_SECRET');
  if (!secret) return false;
  const sent = req.headers.get('x-internal-secret') ?? '';
  if (sent.length !== secret.length) return false;
  // Constant-time within the compared length. Overkill for a local secret and
  // exactly right for one that will sit in a Railway variable next to a
  // service-role key.
  let diff = 0;
  for (let i = 0; i < secret.length; i += 1) diff |= sent.charCodeAt(i) ^ secret.charCodeAt(i);
  return diff === 0;
}

export type InternalCtx = { requestId: string };

/** Wrap an internal handler with the secret check and the standard envelope. */
export function internalRoute(
  handler: (req: NextRequest, ctx: InternalCtx) => Promise<Response>
): (req: NextRequest) => Promise<Response> {
  return async (req: NextRequest) => {
    const requestId = newRequestId();
    const started = Date.now();
    try {
      if (!authorized(req)) throw NOT_FOUND();
      const res = await handler(req, { requestId });
      res.headers.set('x-request-id', requestId);
      log('info', requestId, 'live.internal_ok', {
        path: new URL(req.url).pathname,
        status: res.status,
        ms: Date.now() - started,
      });
      return res;
    } catch (e) {
      const err =
        e instanceof ApiError
          ? e
          : new ApiError('INTERNAL', 'Something went wrong on our side. Please try again.');
      log(err.status >= 500 ? 'error' : 'warn', requestId, 'live.internal_error', {
        path: new URL(req.url).pathname,
        code: err.code,
        status: err.status,
        message: err.message,
      });
      return errorResponse(err, requestId);
    }
  };
}
