/**
 * POST /api/v1/onboarding/intent — where the website's funnel now ends.
 *
 * PUBLIC, AND IT HAS TO BE. The whole point of audit F21 is that the most
 * engaged visitor in the product does not have an account yet; requiring one
 * to record what they just told us would be the same dead end as the `mailto:`
 * this replaces, wearing a different coat. So there is no bearer token here.
 *
 * WHAT THAT COSTS AND WHAT PAYS FOR IT. An unauthenticated write is an
 * invitation to fill a table with rubbish, and the three defences are:
 *
 *   · The body is four short, closed fields. `path` is one of three literals,
 *     the two answers are bounded feature ids, and the email must normalise.
 *     Nothing free-text reaches the database.
 *   · Rate limited by IP, and by email as well — a single address cannot be
 *     used to spray a thousand rows through a botnet.
 *   · The write is bounded per person. A second request from the same address
 *     resolves to the same `crm_people` row and adds one timeline event; it does
 *     not create a second human. That is `unique (kind, value)` doing its job
 *     rather than this route being careful.
 *
 * THE SITE CALLS THIS SERVER-TO-SERVER. `apps/site` posts to its own
 * `/api/early-access` route handler, which forwards here. That is not
 * indirection for its own sake: it means the browser never needs a CORS grant
 * against the API, and a visitor in a locked-down in-app browser — the exact
 * case where `mailto:` failed silently — is doing an ordinary same-origin POST.
 * The forwarder passes the visitor's address on in `x-forwarded-for` so the
 * limit below is keyed on the person and not on one Vercel egress IP.
 *
 * IT ANSWERS WITH A TOKEN AND A SENTENCE, AND NOTHING ABOUT THE PERSON. See
 * `lib/crm/intent.ts` for why the token is hashed at rest and why it can only
 * ever buy you a path preference.
 */
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ApiError, errorResponse } from '@/lib/errors';
import { clientIp, ok, parseBody } from '@/lib/http';
import { log, newRequestId } from '@/lib/log';
import { rateLimit } from '@/lib/ratelimit';
import { FUNNEL_PATHS, recordEarlyAccessIntent } from '@/lib/crm/intent';
import { supabaseConfigured } from '@/lib/db';

export const dynamic = 'force-dynamic';

const Body = z.object({
  path: z.enum(FUNNEL_PATHS),
  interest: z.string().max(64).optional().nullable(),
  priority: z.string().max(64).optional().nullable(),
  email: z.string().min(3).max(320),
});

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = newRequestId();
  try {
    // A deploy without the database configured must say so in a sentence a
    // visitor can act on, not throw. The site renders this straight into the
    // form and still offers the email fallback underneath it — that is the
    // audit's "a confirmed record OR a recoverable error".
    if (!supabaseConfigured()) {
      throw new ApiError('INTERNAL', 'We cannot take requests right now. Please try again shortly.', { status: 503 });
    }

    const body = await parseBody(req, Body);
    const ip = clientIp(req);

    rateLimit({
      key: `onboarding:intent:ip:${ip ?? 'unknown'}`,
      limit: 10,
      windowMs: 60_000,
      messagePlain: 'That is a lot of requests in a minute. Wait a moment and try again.',
    });
    rateLimit({
      key: `onboarding:intent:email:${body.email.trim().toLowerCase()}`,
      limit: 5,
      windowMs: 10 * 60_000,
      messagePlain: 'We already have that address. Check your inbox — we will write when there is an invite.',
    });

    const result = await recordEarlyAccessIntent({
      path: body.path,
      interest: body.interest ?? null,
      priority: body.priority ?? null,
      email: body.email,
      requestId,
    });

    log('info', requestId, 'onboarding.intent.recorded', {
      path: result.intent.path,
      returning: result.returning,
    });

    return ok({
      // The token is the ONLY thing that leaves here, and it is opaque. The
      // site puts it in the app link so a device that installs the app can pick
      // the answers back up without asking them again.
      intent_token: result.token,
      intent: result.intent,
      plain: result.returning
        ? 'We already had you down. Your answers are updated and your place is kept.'
        : 'Request received. We will write to that address when there is an invite.',
    });
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError('INTERNAL', 'We could not save that request. Please try again.');
    log(err.status >= 500 ? 'error' : 'warn', requestId, 'onboarding.intent.error', {
      code: err.code,
      message: err.message,
    });
    return errorResponse(err, requestId);
  }
}

/** A GET here is somebody poking at the URL, not a caller. Say so plainly. */
export async function GET(): Promise<Response> {
  return errorResponse(new ApiError('NOT_FOUND', 'That is not something this app does.'), newRequestId());
}
