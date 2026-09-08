/**
 * POST /api/v1/admin/users/[id]/stage — moving somebody's readiness stage by hand.
 *
 * THE REASON IS REQUIRED, by the SCHEMA and not by a check in this handler:
 * `AdminStageRequest.reason` is a minimum-eight-character string, so a call
 * without one never reaches the body. This is a deliberate copy of the
 * entitlements route's argument — a stage is visible next to a member's name in
 * every room, and "why is this person marked trade_ready" deserves a sentence
 * somebody typed rather than a guess from a timestamp.
 *
 * `admin` and above. Support reads and takes notes.
 *
 * WHAT IT WRITES. `profiles.stage`, plus `stage_locked` and `stage_changed_at`
 * (0042). It is the second of exactly two routes that may write that column —
 * the other is `POST /api/v1/stage/evaluate`, which grades training evidence —
 * and no client may write it at all, because 0042 §4 puts a trigger on it.
 *
 * LOCKING IS THE POINT, AND IS STILL A CHOICE. `locked` defaults to true: an
 * override that the next lesson silently recomputes away is not an override.
 * But it is exposed rather than implied, because an admin correcting somebody
 * DOWN to `developing` usually still wants them able to earn `trade_ready`
 * honestly, and that is `locked: false`.
 */
import { AdminStageRequest } from '@shared/api';
import { ok, parseBody, staffedParams, type StaffCtx } from '@/lib/http';
import { serviceClient } from '@/lib/db';
import { ApiError } from '@/lib/errors';
import { emitUserEvent } from '@/lib/events';
import { writeAudit } from '@/lib/admin/audit';

export const dynamic = 'force-dynamic';

export const POST = staffedParams<{ id: string }>(
  async (req, ctx: StaffCtx & { params: { id: string } }) => {
    const body = await parseBody(req, AdminStageRequest);
    const db = serviceClient();
    const userId = ctx.params.id;

    const { data: before, error: bErr } = await db
      .from('profiles')
      .select('user_id,stage,stage_locked,stage_changed_at')
      .eq('user_id', userId)
      .maybeSingle();
    if (bErr) throw bErr;
    if (!before) throw new ApiError('NOT_FOUND', 'We could not find that account.');

    const { data: after, error: upErr } = await db
      .from('profiles')
      .update({
        stage: body.stage,
        stage_locked: body.locked,
        stage_changed_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .select('user_id,stage,stage_locked,stage_changed_at')
      .single();
    if (upErr) throw upErr;

    await writeAudit({
      actorUserId: ctx.user.id,
      action: 'stage.override',
      targetKind: 'user',
      targetId: userId,
      before,
      after,
      reason: body.reason,
      requestId: ctx.requestId,
      ip: ctx.ip,
    });

    // The member's own outbox. Their standing in the community changed, and a
    // staff member caused it — that belongs in their timeline either way.
    await emitUserEvent(
      userId,
      'system',
      'profile',
      userId,
      { event: 'stage_changed', from: (before as Record<string, unknown>).stage, to: body.stage, via: 'admin' },
      ctx.requestId
    );

    return ok({
      user_id: userId,
      stage: body.stage,
      stage_locked: body.locked,
    });
  },
  { min: 'admin' }
);
