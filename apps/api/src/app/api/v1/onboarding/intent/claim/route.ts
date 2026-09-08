/**
 * POST /api/v1/onboarding/intent/claim — the app picking the funnel back up.
 *
 * AUTHENTICATED, AND THAT IS THE SECURITY MODEL RATHER THAN A CONVENIENCE.
 * Audit F21's constraint on the handoff is one sentence: "An intent token must
 * not be a way to claim someone else's identity; keep it to intent, and let
 * authentication establish who." This route is where those two halves meet, so
 * it is worth being explicit about which does what:
 *
 *   THE TOKEN answers "what did this person want?" — a path, and two feature
 *   preferences. It is optional. It is never trusted to say who is calling.
 *
 *   THE SESSION answers "who is calling?" — verified against Supabase on this
 *   request, exactly as every other authed route does. It is what turns a lead
 *   in the CRM into this account, and nothing else is allowed to.
 *
 * So presenting somebody else's token gets you a path preference and no more:
 * the reply carries `{ path, interest, priority }` and the CRM link is made on
 * the AUTHENTICATED user's own email address (`linkAppUser`), never on the
 * token's person. Two people who used one mailbox stay two accounts and one
 * person row keeps the first link — see `lib/crm/intent.ts`.
 *
 * WITHOUT A TOKEN IT STILL WORKS, and that is the case the acceptance actually
 * turns on. "Onboarding can retrieve the submitted intent for the correct
 * person" describes somebody who filled the form on a laptop and installed the
 * app on a phone: that phone has no token, and it does not need one, because
 * the session's email is the identity the form wrote.
 *
 * A MISS IS NOT AN ERROR. Most people reaching onboarding never touched the
 * website funnel. `{ intent: null }` with 200 is the honest answer and lets the
 * app call this once, unconditionally, without a special case for "probably
 * nothing there".
 */
import { z } from 'zod';
import { authed, ok, parseBody, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { log } from '@/lib/log';
import { rateLimit } from '@/lib/ratelimit';
import { supabaseConfigured } from '@/lib/db';
import { linkAppUser, readIntentByToken, readIntentForEmail } from '@/lib/crm/intent';

export const dynamic = 'force-dynamic';

const Body = z.object({
  /** Present only for a device that arrived from the site's confirmation. */
  token: z.string().min(1).max(200).optional().nullable(),
});

export const POST = authed(async (req, ctx: Ctx) => {
  if (!supabaseConfigured()) {
    throw new ApiError('INTERNAL', 'We could not reach your account right now. Please try again.', { status: 503 });
  }
  const body = await parseBody(req, Body);

  rateLimit({
    key: `onboarding:intent:claim:${ctx.user.id}`,
    limit: 20,
    windowMs: 60_000,
    messagePlain: 'Give that a moment and try again.',
  });

  // The email link is attempted FIRST and independently of the token, because
  // it is the only one of the two that establishes anything about a person. It
  // is a no-op for the overwhelming majority — somebody who never filled the
  // form has no CRM person to join.
  const link = await linkAppUser(ctx.user.id, ctx.user.email);

  // Token first when there is one: it names the exact funnel run this device
  // came from, which the email lookup can only approximate with "the most
  // recent". Falling back to the email is what makes a laptop-to-phone jump
  // work at all.
  const byToken = body.token ? await readIntentByToken(body.token) : null;
  const intent = byToken ?? (await readIntentForEmail(ctx.user.email));

  log('info', ctx.requestId, 'onboarding.intent.claimed', {
    matched: intent ? (byToken ? 'token' : 'email') : 'none',
    link,
  });

  return ok({
    intent,
    plain: intent
      ? 'Picked up what you told us on the website. Change anything you like.'
      : 'Nothing to pick up — this is a fresh start.',
  });
});
