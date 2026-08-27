/**
 * GET /api/v1/orders?status=open|filled|cancelled|all&symbol=
 *
 * `open` means still working — submitted, accepted or partially filled. A
 * `previewed` row is NOT an order the user placed, so it never appears here:
 * it is an abandoned review, kept for the audit trail, not for the list.
 */
import type { NextRequest } from 'next/server';
import { OrdersQuery, OrdersResponse, PAPER_FILL_PLAIN } from '@shared/api';
import { authed, ok, parseQuery, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { serviceClient } from '@/lib/db';
import { ORDER_COLUMNS, fillsFor, orderEvents } from '@/lib/execution/engine';
import { toOrderRow } from '@/lib/execution/shape';
import { ensureDevTicker } from '@/lib/execution/tick-dev';

export const dynamic = 'force-dynamic';

const OPEN_STATUSES = ['submitted', 'accepted', 'partially_filled'];

export const GET = authed(async (req: NextRequest, ctx: Ctx) => {
  ensureDevTicker();
  const q = parseQuery(req, OrdersQuery);
  const db = serviceClient();

  let query = db
    .from('orders')
    .select(ORDER_COLUMNS)
    .eq('user_id', ctx.user.id)
    .order('created_at', { ascending: false })
    .limit(100);

  if (q.status === 'open') query = query.in('status', OPEN_STATUSES);
  else if (q.status === 'filled') query = query.eq('status', 'filled');
  else if (q.status === 'cancelled') query = query.in('status', ['cancelled', 'rejected']);
  else query = query.neq('status', 'draft');
  if (q.symbol) query = query.eq('symbol', q.symbol.toUpperCase());

  const { data, error } = await query;
  if (error) {
    throw new ApiError('INTERNAL', 'We could not load your orders. Please try again.', { detail: error.message });
  }

  const rows = ((data ?? []) as Record<string, unknown>[]).filter(
    (r) => q.status === 'all' ? String(r.status) !== 'previewed' : true
  );
  const ids = rows.map((r) => String(r.id));
  const [fills, events] = await Promise.all([fillsFor(ids), orderEvents(ids)]);

  return ok(
    OrdersResponse.parse({
      orders: rows.map((r) => toOrderRow(r, fills, events)),
      empty_copy:
        q.status === 'open'
          ? 'Nothing is working right now.'
          : 'No orders yet. When you place one, it will be here with everything that happened to it.',
      paper_plain: PAPER_FILL_PLAIN,
    })
  );
});
