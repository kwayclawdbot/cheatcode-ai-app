/**
 * Route plumbing: request id, auth, zod validation, consistent error envelope.
 * No handler returns a bare throw — everything lands in the 02 error shape.
 */
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireUser, type AuthedUser } from './auth';
import { ApiError, errorResponse, validationError } from './errors';
import { log, newRequestId } from './log';

export type Ctx = { user: AuthedUser; requestId: string };

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
