/**
 * Who is allowed to call an `/api/v1/internal/*` route.
 *
 * TWO CALLERS, TWO CREDENTIALS, ONE CHECK.
 *
 *   a human or a script   `x-internal-secret: <INTERNAL_SECRET>`
 *   a Vercel cron         `Authorization: Bearer <CRON_SECRET>`, on a **GET**
 *
 * THE SECOND ONE IS WHY THIS FILE EXISTS. Vercel invokes a cron with a GET and
 * the `Authorization` header it derives from `CRON_SECRET`; it cannot be told
 * to send a custom header, and it never issues a POST. Internal routes that
 * only exported `POST` and only read `x-internal-secret` therefore answered 405
 * to every scheduled invocation — the job was configured, the platform called
 * it on time, and nothing ran. A cron that silently does not fire is worse than
 * no cron: the dashboard shows it green.
 *
 * `CRON_SECRET` falls back to `INTERNAL_SECRET` so there is one secret to set,
 * and both comparisons are constant-time. With NEITHER env var present the
 * caller is refused, and the route is expected to answer 404 — a deploy that
 * forgot the secret must not expose an endpoint that can write to the database
 * or message every device on the service.
 */
import type { NextRequest } from 'next/server';
import { env } from './env';

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function internalAuthorized(req: NextRequest): boolean {
  const internal = env('INTERNAL_SECRET');
  const cron = env('CRON_SECRET') ?? internal;

  if (internal) {
    const sent = req.headers.get('x-internal-secret');
    if (sent && constantTimeEqual(internal, sent)) return true;
  }
  if (cron) {
    const auth = req.headers.get('authorization') ?? '';
    const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (bearer && constantTimeEqual(cron, bearer)) return true;
  }
  return false;
}
