/**
 * POST /api/v1/messages/:id/reactions   {kind}
 *
 * One tap, one toggle. Tapping "Agree" a second time takes it back; there is no
 * separate DELETE, because on a phone the same button does both and two routes
 * for one gesture is two chances for them to disagree about the state.
 *
 * WHAT THIS ROUTE ACTUALLY GUARDS.
 *   · MEMBERSHIP. A reaction is a thing said in a room, so the caller has to be
 *     in that room. Checked here against `room_members`, exactly as posting is
 *     — never inferred from the fact that they had a message id.
 *   · A REMOVED POST TAKES NO REACTIONS. Not for tidiness: a moderator has
 *     taken something down and a member piling agreement onto it afterwards is
 *     the room arguing with the moderation.
 *   · A BANNED OR MUTED MEMBER MAY NOT REACT. A mute that still lets somebody
 *     stamp "Disagree" on every post in the room is not a mute.
 *
 * ONE OF EACH KIND PER PERSON IS NOT CHECKED HERE. It is the primary key of
 * `message_reactions` (migration 0033 §2), so a double tap that races itself
 * cannot produce two rows no matter what this code does.
 *
 * THE COUNTS COME BACK OFF THE MESSAGE ROW, not from counting. The trigger has
 * already updated them inside the same transaction as the insert, so re-reading
 * the row is one indexed lookup and is guaranteed to match what the next reader
 * will see.
 */
import type { NextRequest } from 'next/server';
import { ReactionToggleRequest, ReactionToggleResponse, type ReactionKind } from '@shared/api';
import { authedParams, ok, parseBody, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { serviceClient } from '@/lib/db';
import { rateLimit } from '@/lib/ratelimit';
import { isModerationMuted, loadMembership } from '@/lib/rooms';

export const dynamic = 'force-dynamic';

export const POST = authedParams<{ id: string }>(
  async (req: NextRequest, ctx: Ctx & { params: { id: string } }) => {
    const body = await parseBody(req, ReactionToggleRequest);
    const db = serviceClient();

    const found = await db
      .from('messages')
      .select('id,room_id,deleted_at')
      .eq('id', ctx.params.id)
      .maybeSingle();
    const row = (found.data as Record<string, unknown> | null) ?? null;
    if (!row) throw new ApiError('NOT_FOUND', 'I could not find that message.');
    if (row.deleted_at) {
      throw new ApiError('VALIDATION_FAILED', 'That post has been removed, so it cannot be reacted to.');
    }

    const roomId = String(row.room_id);
    const membership = await loadMembership(roomId, ctx.user.id);
    if (!membership || membership.banned) {
      // Same shape as any other room refusal: the person is not in the room, so
      // as far as this route is concerned the message is not there.
      throw new ApiError('NOT_FOUND', 'I could not find that message.');
    }
    if (isModerationMuted(membership)) {
      throw new ApiError('ROOM_RESTRICTED', 'A moderator has muted you in this room right now.');
    }

    rateLimit({
      key: `reaction:${ctx.user.id}`,
      limit: 60,
      windowMs: 60_000,
      messagePlain: 'You are reacting very quickly. Give it a minute.',
    });

    // Toggle. The delete is attempted first and its row count is the answer:
    // if something came off, the tap was a take-back; if nothing did, it is a
    // new reaction. One round trip either way, and no read-then-write window
    // where two taps could both decide to insert.
    const removed = await db
      .from('message_reactions')
      .delete()
      .eq('message_id', ctx.params.id)
      .eq('user_id', ctx.user.id)
      .eq('kind', body.kind)
      .select('kind');

    let on = false;
    if (!(removed.data ?? []).length) {
      const ins = await db
        .from('message_reactions')
        .insert({ message_id: ctx.params.id, user_id: ctx.user.id, kind: body.kind });
      // A duplicate here means two taps raced and the other one won. That is
      // the state the member asked for, so it is a success, not an error.
      if (ins.error && !/duplicate key/i.test(ins.error.message)) {
        throw new ApiError('INTERNAL', 'That did not register. Try again.', { detail: ins.error.message });
      }
      on = true;
    }

    const after = await db
      .from('messages')
      .select('reaction_counts')
      .eq('id', ctx.params.id)
      .maybeSingle();

    const mineRes = await db
      .from('message_reactions')
      .select('kind')
      .eq('message_id', ctx.params.id)
      .eq('user_id', ctx.user.id);

    const rawCounts = ((after.data as Record<string, unknown> | null)?.reaction_counts as Record<string, unknown>) ?? {};
    const counts: Record<string, number> = {};
    for (const [k, v] of Object.entries(rawCounts)) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) counts[k] = n;
    }

    return ok(
      ReactionToggleResponse.parse({
        message_id: ctx.params.id,
        reactions: {
          counts,
          mine: ((mineRes.data ?? []) as Record<string, unknown>[]).map((r) => r.kind as ReactionKind),
        },
        on,
      })
    );
  }
);
