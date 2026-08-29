/**
 * POST /api/v1/invites/redeem — the public half of brief §6.
 *
 * AUTHENTICATED, AND WHY THAT IS NOT A DEPARTURE FROM "SIGN-UP ACCEPTS A CODE".
 * This app has no server-side sign-up route: the client creates the account
 * against GoTrue directly (`supabase.auth.signUp`). So the moment a code can be
 * "accepted at sign-up" is the first request the new session makes, and that is
 * this one. It carries the user's own token, which is what makes
 * `p_user_id` something we know rather than something the caller claims.
 *
 * ALL OF THE WORK IS `redeem_invite(...)` IN SQL (0025 §12), AND IT MUST STAY
 * THERE. That function takes a row lock on the invite BEFORE any check, so two
 * people redeeming the last seat of a ten-seat code at the same instant produce
 * ten grants and one `invite_exhausted` — never eleven. Doing the same read
 * and write from here would lose that race every time, and lose it silently.
 * The claim, the entitlement grant, the redemption row, the person's status,
 * the CRM event, the user's outbox row and the audit row are one transaction.
 *
 * A REFUSAL SAYS WHICH ONE IT IS (brief §6). The function returns a reason as a
 * VALUE rather than raising, precisely so this route can render "that code
 * expired on the 4th" instead of parsing an error string. Each reason becomes
 * the app's normal error envelope with a plain sentence and `detail.reason`.
 *
 * RATE LIMITED BY IP. A twelve-character code from a 30-glyph alphabet is ~59
 * bits and is not guessable at any rate this app will serve; the limit is here
 * anyway, because "unguessable" is an argument and a limit is a fact.
 */
import { InviteRedeemRequest, InviteRedeemResponse } from '@shared/api';
import { authed, clientIp, ok, parseBody, type Ctx } from '@/lib/http';
import { serviceClient } from '@/lib/db';
import { ApiError } from '@/lib/errors';
import { loadEntitlements } from '@/lib/entitlements';
import { rateLimit } from '@/lib/ratelimit';
import { log } from '@/lib/log';

export const dynamic = 'force-dynamic';

/** The four refusals, in the words a person reads. */
const REFUSAL: Record<string, { code: 'NOT_FOUND' | 'STATE_CONFLICT' | 'VALIDATION_FAILED'; plain: string }> = {
  invite_code_required: { code: 'VALIDATION_FAILED', plain: 'Enter the code you were sent.' },
  invite_not_found: { code: 'NOT_FOUND', plain: 'We do not have a code that looks like that. Check it and try again.' },
  invite_revoked: { code: 'STATE_CONFLICT', plain: 'That code was switched off. Ask whoever sent it for a new one.' },
  invite_expired: { code: 'STATE_CONFLICT', plain: 'That code has expired. Ask whoever sent it for a new one.' },
  invite_exhausted: { code: 'STATE_CONFLICT', plain: 'That code has been used as many times as it allows.' },
  user_not_found: { code: 'NOT_FOUND', plain: 'We could not find your account. Try signing in again.' },
};

export const POST = authed(async (req, ctx: Ctx) => {
  const body = await parseBody(req, InviteRedeemRequest);
  const ip = clientIp(req);

  // Keyed on the ip when there is one and on the user otherwise. Locally and on
  // a single instance there is no forwarded-for header, and falling back to the
  // user id keeps the limit real rather than one shared bucket for everybody.
  rateLimit({
    key: `invite:redeem:${ip ?? ctx.user.id}`,
    limit: 10,
    windowMs: 60_000,
    messagePlain: 'That is a lot of codes in a minute. Wait a moment and try again.',
  });

  const db = serviceClient();
  const { data, error } = await db.rpc('redeem_invite', {
    p_code: body.code,
    p_user_id: ctx.user.id,
    p_ip: ip,
    p_request_id: ctx.requestId,
  });
  if (error) throw error;

  const result = (data ?? {}) as {
    ok?: boolean;
    reason?: string;
    already_redeemed?: boolean;
    invite_id?: string;
    label?: string | null;
    tier?: 'free' | 'premium';
    granted?: Record<string, unknown>;
    expires_at?: string;
    revoked_at?: string;
  };

  if (!result.ok) {
    const reason = result.reason ?? 'invite_not_found';
    const r = REFUSAL[reason] ?? REFUSAL.invite_not_found;
    log('warn', ctx.requestId, 'invite.redeem_refused', { reason, user_id: ctx.user.id });
    // The dates ride along in `detail` so the client can say "expired on the
    // 4th" without a second call, and the sentence above still stands alone.
    throw new ApiError(r.code, r.plain, {
      detail: { reason, expires_at: result.expires_at ?? null, revoked_at: result.revoked_at ?? null },
    });
  }

  // Read the entitlements BACK rather than predicting them. What the function
  // granted and what the user's tier now resolves to are two different
  // questions — a 30-day invite handed to an annual subscriber grants nothing
  // new — and only the second one is what the app will actually honour.
  const ent = await loadEntitlements(ctx.user.id);

  return ok(
    InviteRedeemResponse.parse({
      already_redeemed: Boolean(result.already_redeemed),
      invite_id: String(result.invite_id),
      label: result.label ?? null,
      tier: result.tier ?? 'free',
      granted: result.granted ?? {},
      subscription: {
        tier: ent.tier,
        status: ent.status,
        current_period_end: ent.current_period_end,
        plain:
          ent.tier === 'premium'
            ? 'Premium. Unlimited watches, full posting, and priority when you ask me things.'
            : 'Free. Paper trading, five watches at a time, and the beginner rooms.',
      },
      entitlements: ent.flags,
      plain: result.already_redeemed
        ? 'You had already used that code. Nothing changed, and you keep what it gave you.'
        : result.tier === 'premium'
          ? 'Code accepted. Premium is on your account.'
          : 'Code accepted.',
    })
  );
});
