/**
 * POST /api/v1/positions/:id/close   {qty?, confirm?, idempotency_key?}
 *
 * A convenience over preview + submit for the opposite side — NOT a shortcut
 * past confirmation. Without `confirm:true` it answers `stage:'preview'` and
 * nothing has been sent; the client shows the same review screen as any other
 * order. With `confirm:true` and an idempotency key it previews and submits in
 * one round-trip, which is what "Exit now" needs to feel like one tap without
 * ever becoming a tap that skipped the numbers.
 *
 * Closing cancels the bracket legs on the way out: an exit that fires after the
 * position is already flat would open a NEW position in the opposite direction,
 * which is the classic paper-trading bug and a genuinely expensive real one.
 */
import type { NextRequest } from 'next/server';
import { PositionCloseRequest, PositionCloseResponse } from '@shared/api';
import { authedParams, ok, parseBody, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { serviceClient } from '@/lib/db';
import { loadProfile, normalizeTargets } from '@/lib/kai/context';
import { buildPreview } from '@/lib/execution/preview';
import { submitOrder } from '@/lib/execution/submit';
import { closingSide } from '@/lib/execution/paper';
import { ExecutionRpcError, plainForRpcError, rpcClosePositionPrepare } from '@/lib/execution/adapter';
import { ensureDevTicker } from '@/lib/execution/tick-dev';

export const dynamic = 'force-dynamic';

export const POST = authedParams<{ id: string }>(async (req: NextRequest, ctx: Ctx & { params: { id: string } }) => {
  ensureDevTicker();
  const body = await parseBody(req, PositionCloseRequest);
  const db = serviceClient();

  const found = await db
    .from('positions')
    .select('id,symbol,direction,qty,avg_cost,closed_at,account_id,origin_plan_id,mode')
    .eq('user_id', ctx.user.id)
    .eq('id', ctx.params.id)
    .maybeSingle();
  const position = found.data as Record<string, unknown> | null;
  if (!position) throw new ApiError('NOT_FOUND', 'I could not find that position.');
  if (position.closed_at) {
    throw new ApiError('STATE_CONFLICT', 'That position is already closed. Nothing was sold.');
  }

  const openQty = Number(position.qty);
  const qty = Math.min(body.qty ?? openQty, openQty);
  if (qty < 1) throw new ApiError('VALIDATION_FAILED', 'Tell me how many shares you want to close.');

  const direction = String(position.direction) as 'long' | 'short';
  const side = closingSide(direction);
  const profile = await loadProfile(ctx.user.id);

  // 0020's read-only prepare gives us the exact opposite-side parameters AND
  // the `close_of_position_id` handle. Passing that handle into the submit makes
  // the cancellation of the position's resting stop/target land in the SAME
  // transaction as the closing fill, and run BEFORE it — so an auto stop can
  // never act on shares the manual exit is already closing.
  let closeOf: string | null = null;
  try {
    const prepared = await rpcClosePositionPrepare({
      userId: ctx.user.id,
      positionId: ctx.params.id,
      requestId: ctx.requestId,
    });
    if (prepared.used) closeOf = prepared.data.close_of_position_id;
  } catch (e) {
    if (e instanceof ExecutionRpcError) {
      throw new ApiError('STATE_CONFLICT', plainForRpcError(e.message, 'That position cannot be closed right now.'));
    }
    throw e;
  }

  const planRes = position.origin_plan_id
    ? await db.from('trade_plans').select('stop,targets,exit_style').eq('id', String(position.origin_plan_id)).maybeSingle()
    : { data: null };
  const plan = planRes.data as Record<string, unknown> | null;

  const preview = await buildPreview({
    userId: ctx.user.id,
    requestId: ctx.requestId,
    accountId: String(position.account_id),
    symbol: String(position.symbol),
    side,
    type: 'market',
    qty,
    duration: 'day',
    planId: (position.origin_plan_id as string) ?? undefined,
    mode: (String(position.mode) as typeof profile.primary_mode) ?? profile.primary_mode,
    // A close has no bracket of its own: it IS the exit.
    overrideStop: plan?.stop === null || plan?.stop === undefined ? null : Number(plan.stop),
    overrideTarget: normalizeTargets(plan?.targets)[0]?.price ?? null,
  });

  if (!body.confirm) {
    return ok(
      PositionCloseResponse.parse({
        stage: 'preview',
        preview,
        result: null,
        plain: `This closes ${qty} of your ${openQty} ${String(position.symbol)}. Nothing is sent until you confirm.`,
      }),
      { status: 201 }
    );
  }

  if (!body.idempotency_key) {
    throw new ApiError('VALIDATION_FAILED', 'A confirmed close needs an idempotency key so it can never be sent twice.');
  }

  const result = await submitOrder({
    userId: ctx.user.id,
    previewId: preview.preview_id,
    idempotencyKey: body.idempotency_key,
    requestId: ctx.requestId,
    closeOfPositionId: closeOf ?? ctx.params.id,
  });

  return ok(
    PositionCloseResponse.parse({
      stage: 'submitted',
      preview,
      result,
      plain: result.fill_plain,
    }),
    { status: 201 }
  );
});
