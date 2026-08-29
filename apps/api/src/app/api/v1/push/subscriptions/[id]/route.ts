/**
 * DELETE /api/v1/push/subscriptions/:id — turn this device off.
 *
 * REVOKE, NOT DELETE. The delivery ledger points at this row, and "this device
 * was turned off" is a different fact from "this device never existed". A
 * re-register from the same handle brings the same row back to `active`.
 *
 * OWNERSHIP IS CHECKED HERE, not by the RPC. 0024's `revoke_push_subscription`
 * is owner-only for a JWT but permissive for `service_role` — that is how a 410
 * from a push endpoint retires a token nobody asked us to retire — and this app
 * always calls Postgres as the service role. So the route does the scoping,
 * exactly as every other query in this codebase does (see `lib/db.ts`).
 *
 * A row that is not yours and a row that does not exist give the SAME answer,
 * so this endpoint cannot be used to ask whether a subscription id exists.
 */
import type { NextRequest } from 'next/server';
import { PushSubscriptionDeleteResponse } from '@shared/api';
import { authedParams, ok, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { serviceClient } from '@/lib/db';
import { callRpc } from '@/lib/rpc';

export const dynamic = 'force-dynamic';

export const DELETE = authedParams<{ id: string }>(
  async (_req: NextRequest, ctx: Ctx & { params: { id: string } }) => {
    const db = serviceClient();
    const { data: owned } = await db
      .from('push_subscriptions')
      .select('id')
      .eq('id', ctx.params.id)
      .eq('user_id', ctx.user.id)
      .maybeSingle();
    if (!owned) throw new ApiError('NOT_FOUND', 'I could not find that device.');

    const rpc = await callRpc<Record<string, unknown>>(
      'revoke_push_subscription',
      { p_id: ctx.params.id },
      ctx.requestId
    );
    if (!rpc.ok) {
      // The RPC is the honest path, but a device the user asked to turn off has
      // to actually stop buzzing. The direct update is already user-scoped.
      const { error } = await db
        .from('push_subscriptions')
        .update({ state: 'revoked', updated_at: new Date().toISOString() })
        .eq('id', ctx.params.id)
        .eq('user_id', ctx.user.id);
      if (error) {
        throw new ApiError('INTERNAL', 'We could not turn that device off. Please try again.', {
          detail: error.message,
        });
      }
    }

    return ok(
      PushSubscriptionDeleteResponse.parse({
        revoked: 1,
        plain: 'That device will not get notifications any more. Everything still lands in your inbox.',
      })
    );
  }
);
