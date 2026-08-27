/**
 * Error envelope + canonical codes (02 §12 + VALIDATION_FAILED).
 * Every message_plain is beginner-readable: no jargon, no stack traces,
 * no internal identifiers, no secrets.
 */
import { z } from 'zod';
import type { ErrorCode } from '@shared/api';

export type { ErrorCode };

const DEFAULT_STATUS: Partial<Record<ErrorCode, number>> = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  STATE_CONFLICT: 409,
  IDEMPOTENT_REPLAY: 200,
  RATE_LIMITED: 429,
  ENTITLEMENT_REQUIRED: 402,
  CONSENT_REQUIRED: 403,
  ROOM_RESTRICTED: 403,
  MARKET_CLOSED: 409,
  FRESHNESS_STALE: 409,
  KAI_UNAVAILABLE: 503,
  INTERNAL: 500,
  // Round 3 — paper execution. Every one of these means "go back and look
  // again", never "we lost your order", so they are all client-recoverable 4xx.
  PREVIEW_EXPIRED: 409,
  PREVIEW_INVALID: 409,
  RISK_LIMIT_DAILY_LOSS: 409,
  RISK_LIMIT_POSITION_SIZE: 409,
  RISK_LIMIT_CONCENTRATION: 409,
  CAPABILITY_UNSUPPORTED: 409,
  PDT_WARNING: 409,
  EXTENDED_HOURS_UNSUPPORTED: 409,
  BROKER_DISCONNECTED: 409,
  BROKER_AUTH_EXPIRED: 409,
  BROKER_PERMISSION_MISSING: 403,
  OPTIONS_LEVEL_INSUFFICIENT: 403,
};

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly messagePlain: string;
  readonly detail?: unknown;

  constructor(code: ErrorCode, messagePlain: string, opts?: { status?: number; detail?: unknown }) {
    super(`${code}: ${messagePlain}`);
    this.name = 'ApiError';
    this.code = code;
    this.messagePlain = messagePlain;
    this.status = opts?.status ?? DEFAULT_STATUS[code] ?? 400;
    this.detail = opts?.detail;
  }
}

export function errorBody(code: ErrorCode, messagePlain: string, detail?: unknown) {
  return { error: { code, message_plain: messagePlain, ...(detail === undefined ? {} : { detail }) } };
}

export function errorResponse(err: ApiError, requestId: string): Response {
  return Response.json(errorBody(err.code, err.messagePlain, err.detail), {
    status: err.status,
    headers: { 'x-request-id': requestId },
  });
}

/** Turn a zod failure into a beginner-readable envelope. */
export function validationError(issues: z.ZodIssue[]): ApiError {
  const first = issues[0];
  const where = first?.path?.length ? first.path.join('.') : 'the request';
  const plain =
    first?.message && !/^(Invalid|Expected|Required)/i.test(first.message)
      ? first.message
      : `Something in ${where} wasn't right. Please check it and try again.`;
  return new ApiError('VALIDATION_FAILED', plain, {
    detail: issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  });
}

export const UNAUTHENTICATED = () =>
  new ApiError('UNAUTHENTICATED', 'Please sign in again — your session has expired.');
