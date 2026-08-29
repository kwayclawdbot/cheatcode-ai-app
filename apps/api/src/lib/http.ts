/**
 * Route plumbing: request id, auth, zod validation, consistent error envelope.
 * No handler returns a bare throw — everything lands in the 02 error shape.
 */
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireUser, type AuthedUser } from './auth';
import { atLeast, loadStaffRole, type StaffRole } from './admin/staff';
import { ApiError, errorResponse, validationError } from './errors';
import { log, newRequestId } from './log';

export type Ctx = { user: AuthedUser; requestId: string };

/** What a `staffed()` handler gets on top of `Ctx`: the role, and the caller's ip. */
export type StaffCtx = Ctx & { role: StaffRole; ip: string | null };

function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  if (e instanceof z.ZodError) return validationError(e.issues);
  return new ApiError('INTERNAL', 'Something went wrong on our side. Please try again.');
}

/** Wrap an authenticated JSON handler. */
export function authed(
  handler: (req: NextRequest, ctx: Ctx) => Promise<Response>
): (req: NextRequest, route?: unknown) => Promise<Response> {
  return async (req: NextRequest) => {
    const requestId = newRequestId();
    const started = Date.now();
    try {
      const user = await requireUser(req);
      const res = await handler(req, { user, requestId });
      res.headers.set('x-request-id', requestId);
      log('info', requestId, 'request.ok', {
        method: req.method,
        path: new URL(req.url).pathname,
        status: res.status,
        ms: Date.now() - started,
      });
      return res;
    } catch (e) {
      const err = toApiError(e);
      log(err.status >= 500 ? 'error' : 'warn', requestId, 'request.error', {
        method: req.method,
        path: new URL(req.url).pathname,
        code: err.code,
        status: err.status,
        ms: Date.now() - started,
        message: err.message,
      });
      return errorResponse(err, requestId);
    }
  };
}

/**
 * Same wrapper for a dynamic segment. Next 16 hands route params in as a
 * promise on the second argument; `authed` drops it, so `[id]` routes use this.
 */
export function authedParams<P extends Record<string, string>>(
  handler: (req: NextRequest, ctx: Ctx & { params: P }) => Promise<Response>
): (req: NextRequest, route: { params: Promise<P> }) => Promise<Response> {
  return async (req: NextRequest, route: { params: Promise<P> }) => {
    const requestId = newRequestId();
    const started = Date.now();
    try {
      const user = await requireUser(req);
      const params = (await route?.params) ?? ({} as P);
      const res = await handler(req, { user, requestId, params });
      res.headers.set('x-request-id', requestId);
      log('info', requestId, 'request.ok', {
        method: req.method,
        path: new URL(req.url).pathname,
        status: res.status,
        ms: Date.now() - started,
      });
      return res;
    } catch (e) {
      const err = toApiError(e);
      log(err.status >= 500 ? 'error' : 'warn', requestId, 'request.error', {
        method: req.method,
        path: new URL(req.url).pathname,
        code: err.code,
        status: err.status,
        ms: Date.now() - started,
        message: err.message,
      });
      return errorResponse(err, requestId);
    }
  };
}

/**
 * THE LOCK ON THE ADMIN DOOR (round-6 brief §3).
 *
 * Same wrapper as `authed()` with two differences, and both of them are the
 * point:
 *
 * 1. IT ASKS THE DATABASE. `loadStaffRole` calls `staff_role(user_id)` on every
 *    single request. Never a JWT claim: a token minted before a revoke is still
 *    valid after it, and "staff for the next 59 minutes" is not a role.
 *
 * 2. A NON-STAFF CALLER GETS NOT_FOUND. Not FORBIDDEN — an admin route must not
 *    confirm that it exists. `403` on `/api/v1/admin/people` tells an attacker
 *    they found the right path and only need a better account; `404` tells them
 *    nothing they did not already know. The two answers are byte-identical to
 *    the answer for a path this app really does not serve, which is what makes
 *    the whole surface unenumerable.
 *
 * `min` names the LOWEST role that may run the handler, and an under-ranked
 * staff member gets FORBIDDEN rather than NOT_FOUND: they already know the
 * route exists, they have a door of their own, and telling support that
 * granting entitlements is not theirs is a better product than a mystery.
 */
export function staffed(
  handler: (req: NextRequest, ctx: StaffCtx) => Promise<Response>,
  opts?: { min?: StaffRole }
): (req: NextRequest, route?: unknown) => Promise<Response> {
  return async (req: NextRequest) => runStaffed(req, undefined, opts, (r, ctx) => handler(r, ctx));
}

/** `staffed()` for a dynamic segment. Next 16 hands params in as a promise. */
export function staffedParams<P extends Record<string, string>>(
  handler: (req: NextRequest, ctx: StaffCtx & { params: P }) => Promise<Response>,
  opts?: { min?: StaffRole }
): (req: NextRequest, route: { params: Promise<P> }) => Promise<Response> {
  return async (req: NextRequest, route: { params: Promise<P> }) =>
    runStaffed(req, route, opts, async (r, ctx) => {
      const params = (await route?.params) ?? ({} as P);
      return handler(r, { ...ctx, params });
    });
}

const ADMIN_NOT_FOUND = () =>
  new ApiError('NOT_FOUND', 'That is not something this app does.');

async function runStaffed<P extends Record<string, string>>(
  req: NextRequest,
  _route: { params: Promise<P> } | undefined,
  opts: { min?: StaffRole } | undefined,
  run: (req: NextRequest, ctx: StaffCtx) => Promise<Response>
): Promise<Response> {
  const requestId = newRequestId();
  const started = Date.now();
  const path = new URL(req.url).pathname;
  try {
    // An unauthenticated caller gets NOT_FOUND too. 401 on an admin path is the
    // same disclosure as 403: it says "sign in and you might be someone".
    let user: AuthedUser;
    try {
      user = await requireUser(req);
    } catch {
      throw ADMIN_NOT_FOUND();
    }

    const role = await loadStaffRole(user.id);
    if (!role) {
      // Logged as a warn with the path and the user, because an ordinary user
      // knocking on /admin is worth seeing in a log even though they were told
      // nothing. The RESPONSE stays indistinguishable from a real 404.
      log('warn', requestId, 'staff.refused', { path, user_id: user.id, method: req.method });
      throw ADMIN_NOT_FOUND();
    }
    if (opts?.min && !atLeast(role, opts.min)) {
      throw new ApiError(
        'FORBIDDEN',
        opts.min === 'owner'
          ? 'Only the owner can do that.'
          : 'That is an admin action, and your access is read-and-note.'
      );
    }

    const res = await run(req, { user, requestId, role, ip: clientIp(req) });
    res.headers.set('x-request-id', requestId);
    log('info', requestId, 'request.ok', {
      method: req.method,
      path,
      status: res.status,
      role,
      ms: Date.now() - started,
    });
    return res;
  } catch (e) {
    const err = toApiError(e);
    log(err.status >= 500 ? 'error' : 'warn', requestId, 'request.error', {
      method: req.method,
      path,
      code: err.code,
      status: err.status,
      ms: Date.now() - started,
      message: err.message,
    });
    return errorResponse(err, requestId);
  }
}

/**
 * The caller's ip for the audit log. `x-forwarded-for` is a LIST when there are
 * proxies and the first entry is the client; behind Vercel it is trustworthy,
 * and locally it is usually absent. It is stored as `inet`, so anything that is
 * not an address must become null rather than a Postgres error — an audit row
 * that fails to write because a header was odd is the worst possible outcome.
 */
export function clientIp(req: Request | NextRequest): string | null {
  const raw =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip')?.trim() ||
    '';
  if (!raw) return null;
  const v4 = /^\d{1,3}(\.\d{1,3}){3}$/;
  const v6 = /^[0-9a-f:]+$/i;
  if (v4.test(raw) || (raw.includes(':') && v6.test(raw))) return raw;
  return null;
}

export async function parseBody<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError('VALIDATION_FAILED', 'We could not read that request. Please try again.');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw validationError(parsed.error.issues);
  return parsed.data;
}

export function parseQuery<T extends z.ZodType>(req: Request, schema: T): z.infer<T> {
  const url = new URL(req.url);
  const obj: Record<string, string> = {};
  url.searchParams.forEach((v, k) => {
    if (v !== '') obj[k] = v;
  });
  const parsed = schema.safeParse(obj);
  if (!parsed.success) throw validationError(parsed.error.issues);
  return parsed.data;
}

export function ok(body: unknown, init?: ResponseInit): Response {
  return Response.json(body, { status: 200, ...init });
}
