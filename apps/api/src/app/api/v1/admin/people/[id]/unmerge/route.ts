/**
 * POST /api/v1/admin/people/[id]/unmerge — putting a merge back.
 *
 * NOT IN BRIEF §7'S ROUTE LIST, and added anyway. §5 says merges "can be
 * undone", and 0025 §14 wrote `unmerge_crm_person` to do it — but a function
 * with no route is an undo that only somebody with a psql prompt can perform.
 * A merge is the one destructive thing this surface does to the CRM; shipping
 * it without its undo would make every operator hesitate over a button they
 * ought to be able to press.
 *
 * `[id]` is the LOSER — the row that was merged away — because that is the row
 * an operator is looking at when they realise the merge was wrong, and it is
 * the id the audit trail keys the merge on.
 *
 * WHAT COMES BACK AND WHAT DOES NOT. The function reads the last un-undone
 * merge audit row and moves back exactly the ids it lists. It does not restore
 * the app_user link — that stayed with the winner so the unique column could
 * move, and handing it back would be re-deciding which row the real account
 * belongs to — and it does not un-sum the winner's counts, which the next sync
 * re-derives. The response says both out loud rather than glossing them.
 */
import { ok, parseBody, staffedParams, type StaffCtx } from '@/lib/http';
import { z } from 'zod';
import { serviceClient } from '@/lib/db';
import { ApiError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

const Body = z.object({ reason: z.string().max(500).optional() });

const REFUSAL: Record<string, string> = {
  person_not_found: 'We could not find that person.',
  not_merged: 'That person was not merged into anybody, so there is nothing to undo.',
  no_merge_record:
    'There is no record of how that merge went, so it cannot be undone automatically. The rows have to be moved by hand.',
};

export const POST = staffedParams<{ id: string }>(
  async (req, ctx: StaffCtx & { params: { id: string } }) => {
    let reason: string | null = null;
    try {
      reason = (await parseBody(req, Body)).reason ?? null;
    } catch {
      reason = null;
    }

    const db = serviceClient();
    const { data, error } = await db.rpc('unmerge_crm_person', {
      p_loser_id: ctx.params.id,
      p_actor_user_id: ctx.user.id,
      p_reason: reason,
    });
    if (error) throw error;

    const result = (data ?? {}) as {
      ok?: boolean;
      reason?: string;
      restored?: Record<string, number>;
      not_restored?: string;
    };
    if (!result.ok) {
      const r = result.reason ?? 'person_not_found';
      throw new ApiError(r === 'person_not_found' ? 'NOT_FOUND' : 'STATE_CONFLICT', REFUSAL[r] ?? 'That cannot be undone.', {
        detail: { reason: r },
      });
    }

    const restored = result.restored ?? {};
    return ok({
      person_id: ctx.params.id,
      restored,
      not_restored: result.not_restored ?? null,
      plain: `Put back ${restored.identities ?? 0} identities, ${restored.events ?? 0} events, ${restored.notes ?? 0} notes and ${restored.redemptions ?? 0} redemptions. The app account link stays with the other row, and the summed counts are re-derived by the next sync.`,
    });
  },
  { min: 'admin' }
);
