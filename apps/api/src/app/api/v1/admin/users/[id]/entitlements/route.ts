/**
 * POST /api/v1/admin/users/[id]/entitlements — granting and taking away access.
 *
 * THE REASON IS REQUIRED (brief §3), and it is required by the SCHEMA rather
 * than by a check in this handler: `AdminEntitlementRequest.reason` is a
 * minimum-eight-character string, so a call without one does not reach the
 * body. Six months from now the only defensible answer to "why does this
 * account have premium" is a sentence somebody typed, and the moment to demand
 * it is the moment of the grant.
 *
 * `admin` and above. Support reads and takes notes.
 *
 * WHAT IT WRITES. `subscriptions` — the same row `loadEntitlements` reads, so
 * there is no second notion of who is premium. The status is `active` for a
 * grant and `canceled` for a revoke, with `current_period_end` following
 * `duration_days` when one is given. Stripe is NOT touched: this app's billing
 * is scaffolded and unconfigured (`BILLING_NOT_CONFIGURED`), and a grant that
 * silently diverged from Stripe would be worse than one that plainly did not
 * involve it. The audit row carries the before and the after in full.
 */
import { AdminEntitlementRequest, AdminEntitlementResponse } from '@shared/api';
import { ok, parseBody, staffedParams, type StaffCtx } from '@/lib/http';
import { serviceClient } from '@/lib/db';
import { ApiError } from '@/lib/errors';
import { loadEntitlements } from '@/lib/entitlements';
import { emitUserEvent } from '@/lib/events';
import { writeAudit } from '@/lib/admin/audit';

export const dynamic = 'force-dynamic';

export const POST = staffedParams<{ id: string }>(
  async (req, ctx: StaffCtx & { params: { id: string } }) => {
    const body = await parseBody(req, AdminEntitlementRequest);
    const db = serviceClient();
    const userId = ctx.params.id;

    const { data: profile, error: pErr } = await db
      .from('profiles')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (pErr) throw pErr;
    if (!profile) throw new ApiError('NOT_FOUND', 'We could not find that account.');

    const { data: before, error: bErr } = await db
      .from('subscriptions')
      .select('tier,status,current_period_end,stripe_customer_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (bErr) throw bErr;

    const grant = body.action === 'grant';
    const periodEnd =
      grant && body.duration_days
        ? new Date(Date.now() + body.duration_days * 24 * 60 * 60_000).toISOString()
        : grant
          ? null
          : new Date().toISOString();

    const { data: after, error: upErr } = await db
      .from('subscriptions')
      .upsert(
        {
          user_id: userId,
          tier: grant ? body.tier : 'free',
          status: grant ? 'active' : 'canceled',
          current_period_end: periodEnd,
        },
        { onConflict: 'user_id' }
      )
      .select('tier,status,current_period_end,stripe_customer_id')
      .single();
    if (upErr) throw upErr;

    await writeAudit({
      actorUserId: ctx.user.id,
      action: grant ? 'entitlement.grant' : 'entitlement.revoke',
      targetKind: 'user',
      targetId: userId,
      before: before ?? null,
      after,
      reason: body.reason,
      requestId: ctx.requestId,
      ip: ctx.ip,
    });

    // The user's own outbox. Their access changed; that is something that
    // happened to them, and they are entitled to see it in their timeline even
    // though a staff member caused it.
    await emitUserEvent(
      userId,
      'system',
      'subscription',
      userId,
      { event: grant ? 'entitlement_granted' : 'entitlement_revoked', tier: grant ? body.tier : 'free' },
      ctx.requestId
    );

    const ent = await loadEntitlements(userId);
    return ok(
      AdminEntitlementResponse.parse({
        user_id: userId,
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
        plain: grant
          ? `Granted ${body.tier}${body.duration_days ? ` for ${body.duration_days} days` : ''}. Logged against your name with the reason you gave.`
          : 'Access removed. Logged against your name with the reason you gave.',
      })
    );
  },
  { min: 'admin' }
);
