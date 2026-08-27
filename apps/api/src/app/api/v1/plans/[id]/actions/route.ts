/**
 * POST /api/v1/plans/:id/actions
 *   activate · cancel · adjust_stop · adjust_target · set_exit_style
 *
 * State-machine validated: a closed plan cannot be re-armed, a cancelled one
 * cannot be adjusted. Every move appends a `plan_events` row and a
 * `user_events` row, so the plan's history is the plan's history — not a
 * reconstruction from the current values.
 *
 * `adjust_stop` re-runs the size and the reward:risk with the new level, so the
 * user sees immediately what moving a stop actually did to their risk. Moving a
 * stop further away is allowed and it is NOT scolded — but the new number is
 * shown, because that is the honest consequence.
 */
import type { NextRequest } from 'next/server';
import { PAPER_FILL_PLAIN, PlanActionRequest, PlanResponse, type PlanStatus } from '@shared/api';
import { authedParams, ok, parseBody, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { serviceClient } from '@/lib/db';
import { emitUserEvent } from '@/lib/events';
import { getQuote } from '@/lib/market/polygon';
import { loadRiskPolicy, normalizeTargets } from '@/lib/kai/context';
import { loadPaperAccount } from '@/lib/execution/engine';
import { dailyRisk } from '@/lib/execution/risk';
import { PLAN_COLUMNS, appendPlanEvent, exitStylePlain, planActions, planEvents, toPlanRow } from '@/lib/execution/plans';
import { decisionChain } from '@/lib/execution/chain';
import { PlanRpcError, plainForRpcError, rpcPlanAction } from '@/lib/execution/adapter';

export const dynamic = 'force-dynamic';

const ADJUSTABLE: PlanStatus[] = ['draft', 'planned', 'active'];

export const POST = authedParams<{ id: string }>(async (req: NextRequest, ctx: Ctx & { params: { id: string } }) => {
  const body = await parseBody(req, PlanActionRequest);
  const db = serviceClient();

  const found = await db
    .from('trade_plans')
    .select(PLAN_COLUMNS)
    .eq('user_id', ctx.user.id)
    .eq('id', ctx.params.id)
    .maybeSingle();
  const row = found.data as Record<string, unknown> | null;
  if (!row) throw new ApiError('NOT_FOUND', 'I could not find that plan.');

  const status = String(row.status) as PlanStatus;

  // Guard rails the database cannot express as kindly as a sentence can. The
  // state machine itself is enforced by 0020's `plan_action`; these two exist
  // because "you are already in this one" needs to be said, not error-coded.
  if (body.action === 'cancel' && status === 'active') {
    throw new ApiError(
      'STATE_CONFLICT',
      'You are in this one. Cancelling the plan would not close the position — close the position instead.'
    );
  }

  const payload: Record<string, unknown> = {};
  let plain = '';
  switch (body.action) {
    case 'activate':
      plain = 'Plan armed. Kai is watching for the entry condition — nothing has been bought.';
      break;
    case 'cancel':
      plain = 'Plan called off. Nothing was bought or sold.';
      break;
    case 'adjust_stop': {
      if (body.stop === undefined) throw new ApiError('VALIDATION_FAILED', 'Tell me the new level for the stop.');
      payload.stop = body.stop;
      plain = `Stop moved to $${body.stop}. Your size and what being wrong costs both changed with it.`;
      break;
    }
    case 'adjust_target': {
      if (!body.targets?.length) throw new ApiError('VALIDATION_FAILED', 'Tell me the new target level.');
      const next = normalizeTargets(body.targets);
      payload.targets = next.map((t) => ({ label: t.label ?? 'Target', level: t.price }));
      plain = `Target moved to $${next[0]?.price}. What you are being paid to take this risk changed with it.`;
      break;
    }
    case 'set_exit_style': {
      if (!body.exit_style) throw new ApiError('VALIDATION_FAILED', 'Tell me which way you want the exits handled.');
      payload.exit_style = body.exit_style;
      plain =
        body.exit_style === 'auto'
          ? 'Your stop will execute on its own from now on.'
          : 'Your exits become notifications with one-tap close. They are not automatic protection.';
      break;
    }
  }

  // Preferred: 0020's `plan_action` — the state machine, the orientation
  // re-validation, the open position's stop/target and any resting bracket leg
  // all move in ONE transaction. Re-pricing a stop without re-pricing the leg
  // that enforces it is exactly the drift this prevents.
  let updatedRow: Record<string, unknown> | null = null;
  try {
    const viaRpc = await rpcPlanAction({
      userId: ctx.user.id,
      planId: ctx.params.id,
      action: body.action,
      payload,
      requestId: ctx.requestId,
    });
    if (viaRpc.used) updatedRow = viaRpc.data;
  } catch (e) {
    if (e instanceof PlanRpcError) {
      throw new ApiError(
        'STATE_CONFLICT',
        plainForRpcError(e.message, 'That plan cannot be changed like that.')
      );
    }
    throw e;
  }

  if (!updatedRow) {
    // FALLBACK (no 0020): several round-trips, not atomic. README "Known gaps".
    updatedRow = await applyWithoutRpc(ctx.user.id, ctx.params.id, status, body, payload);
    // The RPC already journals the action inside its transaction, so this pair
    // belongs to the fallback ONLY — writing it on both paths put the same move
    // in a plan's history twice.
    await appendPlanEvent(ctx.params.id, ctx.user.id, body.action, { plain, ...payload });
    await emitUserEvent(ctx.user.id, 'plan_event', 'plan', ctx.params.id, { event: body.action, plain }, ctx.requestId);
  }

  const [policy, account] = await Promise.all([loadRiskPolicy(ctx.user.id), loadPaperAccount(ctx.user.id)]);
  const plan = toPlanRow(updatedRow, policy, account?.equity ?? null);

  const [risk, events, history, quote] = await Promise.all([
    dailyRisk(ctx.user.id, policy?.daily_loss_cap_usd ?? null),
    planEvents(ctx.params.id),
    decisionChain({ userId: ctx.user.id, symbol: plan.symbol, limit: 12 }),
    getQuote(plan.symbol),
  ]);

  return ok(
    PlanResponse.parse({
      plan,
      daily_risk: risk,
      events,
      history,
      actions: planActions(plan),
      stop_attaches_plain: exitStylePlain(plan.exit_style),
      paper_plain: PAPER_FILL_PLAIN,
      quote,
    })
  );
});

/**
 * The same transitions without 0020. Kept so the lane works on an un-migrated
 * database; it does NOT re-price a resting bracket leg, which is precisely why
 * the RPC is preferred.
 */
async function applyWithoutRpc(
  userId: string,
  planId: string,
  status: PlanStatus,
  body: PlanActionRequest,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const db = serviceClient();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.action === 'activate') {
    if (status !== 'draft' && status !== 'planned') {
      throw new ApiError('STATE_CONFLICT', `That plan is already ${status}, so there is nothing to arm.`);
    }
    patch.status = 'planned';
  } else if (body.action === 'cancel') {
    if (status === 'closed' || status === 'cancelled') {
      throw new ApiError('STATE_CONFLICT', 'That plan is already finished.');
    }
    patch.status = 'cancelled';
  } else if (!ADJUSTABLE.includes(status)) {
    throw new ApiError('STATE_CONFLICT', 'That plan can no longer be adjusted.');
  } else if (body.action === 'adjust_stop') {
    patch.stop = payload.stop;
    patch.invalidation = { type: 'close_below', level: payload.stop } as never;
  } else if (body.action === 'adjust_target') {
    patch.targets = normalizeTargets(body.targets ?? []) as never;
  } else if (body.action === 'set_exit_style') {
    patch.exit_style = body.exit_style;
  }

  const updated = await db
    .from('trade_plans')
    .update(patch)
    .eq('id', planId)
    .eq('user_id', userId)
    .select(PLAN_COLUMNS)
    .single();
  if (updated.error || !updated.data) {
    throw new ApiError('INTERNAL', 'We could not change that plan. Please try again.', { detail: updated.error?.message });
  }
  return updated.data as Record<string, unknown>;
}
