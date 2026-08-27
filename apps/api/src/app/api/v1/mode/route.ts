/**
 * PUT /api/v1/mode
 *
 * Switching mode never hides an open position or a pending confirmation
 * (07 §10 "Mode integrity"), so the response carries them as `carryover`.
 */
import type { NextRequest } from 'next/server';
import { ModeRequest, ModeResponse } from '@shared/api';
import { authed, ok, parseBody, type Ctx } from '@/lib/http';
import { serviceClient } from '@/lib/db';
import { ApiError } from '@/lib/errors';
import { emitUserEvent } from '@/lib/events';

export const dynamic = 'force-dynamic';

const PENDING_ORDER_STATUSES = ['draft', 'previewed', 'submitted', 'accepted', 'partially_filled'];

export const PUT = authed(async (req: NextRequest, ctx: Ctx) => {
  const { mode } = await parseBody(req, ModeRequest);
  const db = serviceClient();

  const { error } = await db.from('profiles').update({ primary_mode: mode }).eq('user_id', ctx.user.id);
  if (error) throw new ApiError('INTERNAL', 'We could not switch your mode. Please try again.', { detail: error.message });

  const [positions, orders] = await Promise.all([
    db
      .from('positions')
      .select('id,symbol,direction,qty,avg_cost,mode')
      .eq('user_id', ctx.user.id)
      .is('closed_at', null),
    db
      .from('orders')
      .select('id,symbol,status,side,qty')
      .eq('user_id', ctx.user.id)
      .in('status', PENDING_ORDER_STATUSES),
  ]);

  await emitUserEvent(ctx.user.id, 'system', 'profile', ctx.user.id, { event: 'mode_changed', mode }, ctx.requestId);

  return ok(
    ModeResponse.parse({
      mode,
      carryover: {
        open_positions: (positions.data ?? []).map((p) => {
          const r = p as Record<string, unknown>;
          return {
            id: String(r.id),
            symbol: String(r.symbol),
            direction: r.direction as 'long' | 'short',
            qty: Number(r.qty),
            avg_cost: Number(r.avg_cost),
            mode: r.mode,
          };
        }),
        pending_confirmations: (orders.data ?? []).map((o) => {
          const r = o as Record<string, unknown>;
          return {
            id: String(r.id),
            kind: 'order' as const,
            symbol: r.symbol ? String(r.symbol) : null,
            status: String(r.status),
            summary_plain: `${r.symbol ?? 'Order'} — ${String(r.status).replace('_', ' ')}. Accepted is not the same as filled.`,
          };
        }),
      },
    })
  );
});
