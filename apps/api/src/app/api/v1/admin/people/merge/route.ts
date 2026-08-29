/**
 * POST /api/v1/admin/people/merge — two rows, one human.
 *
 * The work is `merge_crm_people(...)` in SQL (0025 §13) and it is NOT
 * reimplemented here. That function locks both rows in a fixed order so two
 * operators merging the same pair from opposite directions cannot deadlock,
 * moves identities/events/notes/redemptions, records exactly which ids it moved
 * so the merge can be undone, and refuses the cases that no automatic rule
 * should decide.
 *
 * A REFUSAL IS A VALUE, NOT AN EXCEPTION. The function returns
 * `{ok:false, reason}` and this route turns each reason into the sentence an
 * operator can act on. `conflicting_app_user` is the important one: two people
 * who each hold a DIFFERENT app account are not one person, and merging them
 * would have to drop one account's link — which is a decision, not a merge.
 */
import { AdminMergeRequest, AdminMergeResponse } from '@shared/api';
import { ok, parseBody, staffed, type StaffCtx } from '@/lib/http';
import { serviceClient } from '@/lib/db';
import { ApiError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

const REFUSAL: Record<string, string> = {
  person_not_found: 'One of those people is not in the CRM.',
  same_person: 'Those are the same person.',
  already_merged: 'That person has already been merged into somebody else.',
  winner_is_merged: 'The person you are merging INTO has themselves been merged into somebody else. Merge into the survivor instead.',
  conflicting_app_user:
    'Those two people each have a different app account, so they cannot be merged automatically. Decide which account is theirs and unlink the other first.',
};

export const POST = staffed(
  async (req, ctx: StaffCtx) => {
    const body = await parseBody(req, AdminMergeRequest);
    const db = serviceClient();

    const { data, error } = await db.rpc('merge_crm_people', {
      p_winner_id: body.winner_id,
      p_loser_id: body.loser_id,
      p_actor_user_id: ctx.user.id,
      p_reason: body.reason ?? null,
    });
    if (error) throw error;

    const result = (data ?? {}) as {
      ok?: boolean;
      reason?: string;
      moved?: { identities?: string[]; events?: string[]; notes?: string[]; redemptions?: string[] };
    };

    if (!result.ok) {
      const reason = result.reason ?? 'person_not_found';
      throw new ApiError(
        reason === 'person_not_found' ? 'NOT_FOUND' : 'STATE_CONFLICT',
        REFUSAL[reason] ?? 'Those two cannot be merged.',
        { detail: { reason } }
      );
    }

    // The audit row was written inside the function's own transaction, so it is
    // all-or-nothing with the merge itself. Nothing is written here.
    const moved = result.moved ?? {};
    return ok(
      AdminMergeResponse.parse({
        winner_id: body.winner_id,
        loser_id: body.loser_id,
        moved: {
          identities: (moved.identities ?? []).length,
          events: (moved.events ?? []).length,
          notes: (moved.notes ?? []).length,
          redemptions: (moved.redemptions ?? []).length,
        },
        plain: 'Merged. The other row still exists pointing at this one, so any id that resolved to it still lands here — and the merge can be undone.',
      })
    );
  },
  { min: 'admin' }
);
