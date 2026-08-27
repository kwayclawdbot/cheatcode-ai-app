/**
 * GET /api/v1/orders/:id
 *
 * The order and everything that happened to it: its bracket siblings, its
 * fills, and its full event trail. The client polls this after submit to move
 * from "accepted" to "filled" — which is exactly why both stamps are on the
 * row and why `events[]` is returned verbatim rather than summarised.
 */
import type { NextRequest } from 'next/server';
import { OrderDetailResponse, PAPER_FILL_PLAIN, type PlainAction } from '@shared/api';
import { authedParams, ok, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { serviceClient } from '@/lib/db';
import { ORDER_COLUMNS, fillsFor, orderEvents } from '@/lib/execution/engine';
import { toOrderEventRows, toOrderRow } from '@/lib/execution/shape';
import { decisionChain } from '@/lib/execution/chain';
import { ensureDevTicker } from '@/lib/execution/tick-dev';

export const dynamic = 'force-dynamic';

export const GET = authedParams<{ id: string }>(async (_req: NextRequest, ctx: Ctx & { params: { id: string } }) => {
  ensureDevTicker();
  const db = serviceClient();

  const found = await db
    .from('orders')
    .select(ORDER_COLUMNS)
    .eq('user_id', ctx.user.id)
    .eq('id', ctx.params.id)
    .maybeSingle();
  const order = found.data as Record<string, unknown> | null;
  if (!order) throw new ApiError('NOT_FOUND', 'I could not find that order.');

  const bracketGroup = (order.bracket_group as string) ?? null;
  const legsRes = bracketGroup
    ? await db
        .from('orders')
        .select(ORDER_COLUMNS)
        .eq('user_id', ctx.user.id)
        .eq('bracket_group', bracketGroup)
        .neq('id', ctx.params.id)
    : { data: [] as Record<string, unknown>[] };
  const legRows = (legsRes.data ?? []) as Record<string, unknown>[];
  const ids = [ctx.params.id, ...legRows.map((l) => String(l.id))];

  const [fills, events, chain] = await Promise.all([
    fillsFor(ids),
    orderEvents(ids),
    decisionChain({ userId: ctx.user.id, symbol: String(order.symbol), limit: 12 }),
  ]);

  const shaped = toOrderRow(order, fills, events);

  const position = await db
    .from('positions')
    .select('id')
    .eq('user_id', ctx.user.id)
    .eq('symbol', String(order.symbol))
    .order('opened_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const positionId = position.data ? String((position.data as Record<string, unknown>).id) : null;

  const actions: PlainAction[] = [];
  if (shaped.resting) {
    actions.push({ action: 'cancel', label: 'Cancel this order', route: null, primary: false, enabled: true, hint: null });
  }
  if (positionId && (shaped.status === 'filled' || shaped.status === 'partially_filled')) {
    actions.push({ action: 'view_position', label: 'View position', route: `/position/${positionId}`, primary: true, enabled: true, hint: null });
  }
  actions.push({ action: 'ask_kai', label: 'Ask Kai', route: null, primary: false, enabled: true, hint: null });

  return ok(
    OrderDetailResponse.parse({
      order: shaped,
      legs: legRows.map((l) => toOrderRow(l, fills, events)),
      fills: fills
        .filter((f) => String(f.order_id) === ctx.params.id)
        .map((f) => ({ qty: Number(f.qty), price: Number(f.price), ts: String(f.ts), liquidity: (f.liquidity as string) ?? null })),
      events: toOrderEventRows(events.filter((e) => String(e.order_id) === ctx.params.id)),
      position_id: positionId,
      history: chain,
      actions,
      paper_plain: PAPER_FILL_PLAIN,
    })
  );
});
