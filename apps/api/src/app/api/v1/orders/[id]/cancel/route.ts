/**
 * POST /api/v1/orders/:id/cancel
 *
 * Only a working order can be cancelled. A filled one cannot be un-filled, and
 * saying so plainly is better than a button that silently does nothing.
 *
 * Cancelling an ENTRY cancels its bracket legs with it — they exist to protect
 * a position that will now never open. Cancelling one exit leg leaves the other
 * alone: that is the user deliberately removing one side of the bracket, and
 * the response says which protection they just gave up.
 */
import type { NextRequest } from 'next/server';
import { OrderCancelResponse, type OrderStatus } from '@shared/api';
import { authedParams, ok, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { serviceClient } from '@/lib/db';
import { emitUserEvent } from '@/lib/events';
import { ORDER_COLUMNS, fillsFor, orderEvents, transition } from '@/lib/execution/engine';
import { bracketRoleOf, isRestingStatus, toOrderRow } from '@/lib/execution/shape';

export const dynamic = 'force-dynamic';

export const POST = authedParams<{ id: string }>(async (_req: NextRequest, ctx: Ctx & { params: { id: string } }) => {
  const db = serviceClient();

  const found = await db
    .from('orders')
    .select(ORDER_COLUMNS)
    .eq('user_id', ctx.user.id)
    .eq('id', ctx.params.id)
    .maybeSingle();
  const order = found.data as Record<string, unknown> | null;
  if (!order) throw new ApiError('NOT_FOUND', 'I could not find that order.');

  const status = String(order.status) as OrderStatus;
  if (status === 'filled') {
    throw new ApiError('STATE_CONFLICT', 'That order already filled — it cannot be cancelled. You would need to close the position instead.');
  }
  if (status === 'cancelled') {
    throw new ApiError('STATE_CONFLICT', 'That order was already cancelled. Nothing was bought or sold.');
  }
  if (!isRestingStatus(status) && status !== 'previewed') {
    throw new ApiError('STATE_CONFLICT', `That order is ${status.replace('_', ' ')}, so there is nothing to cancel.`);
  }

  const role = bracketRoleOf(order);
  await transition(ctx.params.id, status, 'cancelled', 'Cancelled. Nothing was bought or sold.', { cancelled_by: 'user' });

  // An entry that is cancelled takes its exits with it.
  const cancelledLegs: Record<string, unknown>[] = [];
  const bracketGroup = (order.bracket_group as string) ?? null;
  if (bracketGroup && role === 'entry') {
    const { data } = await db
      .from('orders')
      .select(ORDER_COLUMNS)
      .eq('user_id', ctx.user.id)
      .eq('bracket_group', bracketGroup)
      .neq('id', ctx.params.id)
      .in('status', ['accepted', 'submitted', 'partially_filled']);
    for (const leg of (data ?? []) as Record<string, unknown>[]) {
      await transition(
        String(leg.id),
        String(leg.status) as OrderStatus,
        'cancelled',
        'Cancelled with the entry — there is no position for it to protect.',
        { cancelled_by: 'entry_cancelled' }
      );
      cancelledLegs.push({ ...leg, status: 'cancelled' });
    }
  }

  await emitUserEvent(
    ctx.user.id,
    'order_status',
    'order',
    ctx.params.id,
    { status: 'cancelled', symbol: order.symbol, legs_cancelled: cancelledLegs.length },
    ctx.requestId
  );

  const ids = [ctx.params.id, ...cancelledLegs.map((l) => String(l.id))];
  const [fills, events] = await Promise.all([fillsFor(ids), orderEvents(ids)]);

  return ok(
    OrderCancelResponse.parse({
      order: toOrderRow({ ...order, status: 'cancelled' }, fills, events),
      cancelled_legs: cancelledLegs.map((l) => toOrderRow(l, fills, events)),
      plain:
        role === 'stop'
          ? 'Your stop is cancelled. There is no level protecting this position now — that is worth knowing before you walk away from it.'
          : cancelledLegs.length
            ? 'Order cancelled, and the stop and target that went with it. Nothing was bought or sold.'
            : 'Order cancelled. Nothing was bought or sold.',
    })
  );
});
