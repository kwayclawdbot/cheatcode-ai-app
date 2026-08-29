/**
 * POST /api/v1/admin/invites/[id]/revoke — switch a code off.
 *
 * A TIMESTAMP, NOT A DELETE. `revoked_at` is set and the row stays, so the
 * redemptions already made against it keep their join and "who let those twelve
 * people in" still has an answer. A deleted invite makes its own redemptions
 * unexplainable.
 *
 * Revoking twice is not an error. The second call finds it already revoked,
 * changes nothing, keeps the original timestamp, and says so — an operator
 * pressing a button twice is not a state conflict.
 */
import { AdminInviteResponse, AdminRevokeInviteRequest } from '@shared/api';
import { ok, parseBody, staffedParams, type StaffCtx } from '@/lib/http';
import { serviceClient } from '@/lib/db';
import { ApiError } from '@/lib/errors';
import { writeAudit } from '@/lib/admin/audit';
import { INVITE_COLUMNS, shapeInvite, type InviteRecord } from '@/lib/admin/invites';

export const dynamic = 'force-dynamic';

export const POST = staffedParams<{ id: string }>(
  async (req, ctx: StaffCtx & { params: { id: string } }) => {
    let reason: string | null = null;
    try {
      const body = await parseBody(req, AdminRevokeInviteRequest);
      reason = body.reason ?? null;
    } catch {
      // An empty body is a valid revoke. A reason is welcome, not required —
      // switching a code OFF removes access rather than granting it, and
      // demanding paperwork to close a door makes doors stay open.
      reason = null;
    }

    const db = serviceClient();
    const { data: before, error } = await db
      .from('invites')
      .select(INVITE_COLUMNS)
      .eq('id', ctx.params.id)
      .maybeSingle();
    if (error) throw error;
    if (!before) throw new ApiError('NOT_FOUND', 'We could not find that code.');

    const row = before as InviteRecord;
    if (row.revoked_at) {
      return ok(
        AdminInviteResponse.parse({
          invite: shapeInvite(row),
          plain: `That code was already switched off on ${row.revoked_at.slice(0, 10)}.`,
        })
      );
    }

    const { data: after, error: upErr } = await db
      .from('invites')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', ctx.params.id)
      .select(INVITE_COLUMNS)
      .single();
    if (upErr) throw upErr;

    await writeAudit({
      actorUserId: ctx.user.id,
      action: 'invite.revoke',
      targetKind: 'invite',
      targetId: ctx.params.id,
      before: { revoked_at: null, redeemed_count: row.redeemed_count },
      after: { revoked_at: (after as InviteRecord).revoked_at },
      reason,
      requestId: ctx.requestId,
      ip: ctx.ip,
    });

    return ok(
      AdminInviteResponse.parse({
        invite: shapeInvite(after as InviteRecord),
        plain: 'Switched off. Nobody new can redeem it; the people who already did keep what they got.',
      })
    );
  },
  { min: 'admin' }
);
