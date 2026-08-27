/**
 * POST /orders/submit — the moment a preview becomes an order.
 *
 * The split of responsibility, which is the whole design:
 *   HERE      decide. Is the preview still good? Has price moved past the
 *             tolerance? Does the fill model say this order transacts against
 *             the current print, and at what price, for how many shares?
 *   0020's    book it. One transaction: previewed → submitted → accepted →
 *   RPC       (partially_filled | filled), the fill row, the position upsert,
 *             the account, the bracket legs and every `user_events` row.
 *
 * The three refusals, in the order they are checked, all of which send the user
 * back to a fresh preview rather than guessing on their behalf:
 *   PREVIEW_EXPIRED  — the quote it was built on has aged out of its window.
 *   PREVIEW_INVALID  — price moved further than the tolerance since the preview.
 *   the blocker code — a blocker was on the preview and has not gone away.
 *
 * Idempotency: a repeated `idempotency_key` returns the ORIGINAL order with
 * `deduplicated:true` — a double-tap can never become two positions. The unique
 * index on `orders.idempotency_key` is what actually guarantees it; the RPC
 * checks the key first and writes nothing on a replay.
 *
 * ACCEPTED ≠ FILLED. `submitted` and `accepted` are always separate
 * `order_events` with separate stamps, and a resting limit comes back
 * `accepted` with `filled_at:null`.
 */
import type { OrderStatus, OrderSubmitResponse, PlainAction } from '@shared/api';
import { PAPER_FILL_PLAIN } from '@shared/api';
import { serviceClient } from '../db';
import { ApiError, type ErrorCode } from '../errors';
import { log } from '../log';
import { emitUserEvent } from '../events';
import { getQuote } from '../market/polygon';
import { driftBps, evaluateFill, opensPosition, round2, SIDE_LABEL } from './paper';
import {
  ORDER_COLUMNS,
  applyFill,
  createBracketLegs,
  fillsFor,
  orderEvents,
  transition,
  type LegSpec,
} from './engine';
import { toOrderEventRows, toOrderRow } from './shape';
import { ExecutionRpcError, plainForRpcError, rpcSubmitPaperOrder, type PaperFill } from './adapter';

export async function submitOrder(opts: {
  userId: string;
  previewId: string;
  idempotencyKey: string;
  requestId: string;
  /** Set by the close flow so 0020 cancels the position's resting legs first. */
  closeOfPositionId?: string | null;
}): Promise<OrderSubmitResponse> {
  const db = serviceClient();

  // --- idempotent replay, before anything is read or moved ---------------
  const seen = await db
    .from('orders')
    .select(ORDER_COLUMNS)
    .eq('user_id', opts.userId)
    .eq('idempotency_key', opts.idempotencyKey)
    .maybeSingle();
  if (seen.data) {
    const original = seen.data as Record<string, unknown>;
    log('info', opts.requestId, 'paper.submit_deduplicated', { order_id: String(original.id) });
    return shapeSubmit(opts.userId, original, true, 'This is the same order you already sent — I did not send it twice.');
  }

  // --- load the preview -------------------------------------------------
  const found = await db
    .from('orders')
    .select(ORDER_COLUMNS)
    .eq('user_id', opts.userId)
    .eq('id', opts.previewId)
    .maybeSingle();
  const order = found.data as Record<string, unknown> | null;
  if (!order) throw new ApiError('NOT_FOUND', 'I could not find that order to send. Nothing was sent.');

  const status = String(order.status) as OrderStatus;
  if (status !== 'previewed' && status !== 'draft') {
    throw new ApiError(
      'STATE_CONFLICT',
      `That order has already been sent — it is ${status.replace('_', ' ')}. Nothing was sent again.`
    );
  }

  const preview = (order.preview as Record<string, unknown>) ?? {};
  const expiresAt = String(preview.expires_at ?? '');
  if (!expiresAt || new Date(expiresAt).getTime() < Date.now()) {
    throw new ApiError(
      'PREVIEW_EXPIRED',
      'That review is out of date — prices move. Take one more look and confirm again.',
      { detail: { preview_id: opts.previewId, expires_at: expiresAt || null } }
    );
  }

  const blockers = Array.isArray(preview.blockers) ? (preview.blockers as Record<string, unknown>[]) : [];
  if (blockers.length) {
    const first = blockers[0];
    throw new ApiError(
      (first.code as ErrorCode) ?? 'STATE_CONFLICT',
      String(first.plain ?? 'That order cannot be sent as it stands. Nothing was sent.'),
      { detail: { blockers } }
    );
  }

  // --- fresh snapshot + tolerance --------------------------------------
  const symbol = String(order.symbol);
  const quote = await getQuote(symbol);
  if (quote.freshness === 'stale' || quote.price === null) {
    throw new ApiError(
      'FRESHNESS_STALE',
      `I lost the price on ${symbol} between your review and now, so I did not send it.`
    );
  }
  const previewPrice = Number(preview.quote_price);
  const tolerance = Number(preview.tolerance_bps ?? 25);
  const drift = Number.isFinite(previewPrice) ? driftBps(previewPrice, quote.price) : 0;
  if (drift > tolerance) {
    throw new ApiError(
      'PREVIEW_INVALID',
      `${symbol} moved from $${round2(previewPrice)} to $${round2(quote.price)} since you looked. Have another look before you confirm.`,
      {
        detail: {
          preview_price: round2(previewPrice),
          now: round2(quote.price),
          drift_bps: Math.round(drift),
          tolerance_bps: tolerance,
        },
      }
    );
  }

  // --- the fill model decides -------------------------------------------
  const decision = evaluateFill({
    side: order.side as never,
    type: order.type as never,
    qty: Number(order.qty),
    last: quote.price,
    limitPrice: order.limit_price === null || order.limit_price === undefined ? null : Number(order.limit_price),
    stopPrice: order.stop_price === null || order.stop_price === undefined ? null : Number(order.stop_price),
  });

  const bracket = bracketFrom(preview, String(order.side));
  const fill: PaperFill = {
    fill_price: decision.fills ? decision.price : (decision.price ?? quote.price),
    fill_qty: decision.fills ? decision.qty : Number(order.qty),
    partial: decision.partial,
    resting: !decision.fills,
    quote: {
      price: quote.price,
      source_ts: quote.source_ts,
      received_ts: quote.received_ts,
      freshness: quote.freshness,
    },
    bracket,
    close_of_position_id: opts.closeOfPositionId ?? null,
  };

  // --- preferred: one transaction ---------------------------------------
  try {
    const viaRpc = await rpcSubmitPaperOrder({
      userId: opts.userId,
      orderId: opts.previewId,
      idempotencyKey: opts.idempotencyKey,
      fill,
      requestId: opts.requestId,
    });
    if (viaRpc.used) {
      const bookedOrder = viaRpc.data.order;
      const positionId = viaRpc.data.position ? String(viaRpc.data.position.id ?? '') || null : null;
      return shapeSubmit(
        opts.userId,
        bookedOrder,
        viaRpc.data.deduplicated,
        viaRpc.data.deduplicated
          ? 'That order was already sent — I did not send it twice.'
          : decision.fills
            ? 'Order sent and filled.'
            : 'Order sent and accepted. It is waiting for its price — accepted is not filled.',
        positionId
      );
    }
  } catch (e) {
    if (e instanceof ExecutionRpcError) {
      throw new ApiError(
        'STATE_CONFLICT',
        plainForRpcError(e.message, 'That order could not be sent as it stands. Nothing was sent.')
      );
    }
    throw e;
  }

  // --- fallback: the same transitions, several round-trips ---------------
  // NOT atomic. Only reached when 0020 is not applied. See README "Known gaps".
  return submitWithoutRpc({ ...opts, order, quote, decision, preview, bracket });
}

function bracketFrom(
  preview: Record<string, unknown>,
  side: string
): PaperFill['bracket'] {
  if (!opensPosition(side as never)) return null;
  const stop = preview.stop === null || preview.stop === undefined ? null : Number(preview.stop);
  const targets = Array.isArray(preview.targets) ? (preview.targets as Record<string, unknown>[]) : [];
  const firstRaw = targets[0];
  const target = firstRaw ? Number(firstRaw.price ?? firstRaw.level ?? firstRaw) : NaN;
  if (stop === null && !Number.isFinite(target)) return null;
  return {
    stop: stop === null || !Number.isFinite(stop) ? null : round2(stop),
    target: Number.isFinite(target) ? round2(target) : null,
    exit_style: String(preview.exit_style ?? 'auto'),
  };
}

/* ------------------------------------------------------------------ */
/* Fallback path (no 0020)                                              */
/* ------------------------------------------------------------------ */

async function submitWithoutRpc(opts: {
  userId: string;
  previewId: string;
  idempotencyKey: string;
  requestId: string;
  order: Record<string, unknown>;
  quote: { price: number | null };
  decision: ReturnType<typeof evaluateFill>;
  preview: Record<string, unknown>;
  bracket: PaperFill['bracket'];
}): Promise<OrderSubmitResponse> {
  const db = serviceClient();
  const now = new Date();
  const ts = now.toISOString();
  const { order, decision, preview } = opts;
  const symbol = String(order.symbol);

  const claimed = await db
    .from('orders')
    .update({ idempotency_key: opts.idempotencyKey, updated_at: ts })
    .eq('id', opts.previewId)
    .eq('user_id', opts.userId)
    .in('status', ['previewed', 'draft'])
    .select('id')
    .maybeSingle();
  if (!claimed.data) {
    const again = await db
      .from('orders')
      .select(ORDER_COLUMNS)
      .eq('user_id', opts.userId)
      .eq('idempotency_key', opts.idempotencyKey)
      .maybeSingle();
    if (again.data) {
      return shapeSubmit(opts.userId, again.data as Record<string, unknown>, true, 'That order was already sent.');
    }
    throw new ApiError('STATE_CONFLICT', 'That order changed while you were confirming it. Review it once more.');
  }

  await transition(opts.previewId, String(order.status) as OrderStatus, 'submitted', 'Order sent. Nothing has filled yet.', {}, ts);
  const acceptedAt = new Date(now.getTime() + 1).toISOString();
  await transition(
    opts.previewId,
    'submitted',
    'accepted',
    'Accepted. It is live and waiting for its price — accepted is not filled.',
    { accepted_at: acceptedAt },
    acceptedAt
  );
  await emitUserEvent(
    opts.userId,
    'order_status',
    'order',
    opts.previewId,
    { status: 'accepted', symbol, side: order.side, qty: order.qty, plain: 'Order accepted. Accepted is not filled.' },
    opts.requestId
  );

  const current = await db.from('orders').select(ORDER_COLUMNS).eq('id', opts.previewId).maybeSingle();
  const live = (current.data as Record<string, unknown>) ?? order;

  let positionId: string | null = null;
  if (decision.fills && decision.price !== null) {
    const filledAt = new Date(now.getTime() + 2).toISOString();
    const result = await applyFill({
      userId: opts.userId,
      order: { ...live, status: 'accepted' },
      qty: decision.qty,
      price: decision.price,
      ts: filledAt,
      requestId: opts.requestId,
    });
    positionId = result.positionId;

    if (opensPosition(String(live.side) as never) && result.status === 'filled' && opts.bracket) {
      const legs: LegSpec[] = [];
      if (opts.bracket.stop !== null) legs.push({ role: 'stop', type: 'stop', price: opts.bracket.stop, qty: decision.qty });
      if (opts.bracket.target !== null) legs.push({ role: 'target', type: 'limit', price: opts.bracket.target, qty: decision.qty });
      if (legs.length) {
        const bracketGroup = String(live.id);
        await db.from('orders').update({ bracket_group: bracketGroup }).eq('id', live.id);
        await createBracketLegs({
          userId: opts.userId,
          entry: { ...live, bracket_group: bracketGroup },
          bracketGroup,
          legs,
          exitStyle: String(preview.exit_style ?? 'auto'),
          requestId: opts.requestId,
        });
      }
    }
  }

  const finalRow = await db.from('orders').select(ORDER_COLUMNS).eq('id', opts.previewId).maybeSingle();
  return shapeSubmit(
    opts.userId,
    (finalRow.data as Record<string, unknown>) ?? live,
    false,
    decision.fills
      ? 'Order sent and filled.'
      : 'Order sent and accepted. It is waiting for its price — accepted is not filled.',
    positionId
  );
}

/* ------------------------------------------------------------------ */
/* Shaping                                                              */
/* ------------------------------------------------------------------ */

export async function shapeSubmit(
  userId: string,
  order: Record<string, unknown>,
  deduplicated: boolean,
  acceptedPlain: string,
  positionIdHint: string | null = null
): Promise<OrderSubmitResponse> {
  const db = serviceClient();
  const orderId = String(order.id);
  const bracketGroup = (order.bracket_group as string) ?? null;

  const legsRes = bracketGroup
    ? await db
        .from('orders')
        .select(ORDER_COLUMNS)
        .eq('user_id', userId)
        .eq('bracket_group', bracketGroup)
        .neq('id', orderId)
    : { data: [] as Record<string, unknown>[] };
  const legRows = (legsRes.data ?? []) as Record<string, unknown>[];
  const ids = [orderId, ...legRows.map((l) => String(l.id))];

  const [fills, events] = await Promise.all([fillsFor(ids), orderEvents(ids)]);

  let positionId = positionIdHint;
  if (!positionId) {
    const { data } = await db
      .from('positions')
      .select('id')
      .eq('user_id', userId)
      .eq('symbol', String(order.symbol))
      .is('closed_at', null)
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    positionId = data ? String((data as Record<string, unknown>).id) : null;
  }

  const shaped = toOrderRow(order, fills, events);
  const legs = legRows.map((l) => toOrderRow(l, fills, events));

  const next: PlainAction = positionId
    ? { action: 'view_position', label: 'View position', route: `/position/${positionId}`, primary: true, enabled: true, hint: null }
    : { action: 'view_order', label: 'View order', route: `/order/${orderId}`, primary: true, enabled: true, hint: null };

  return {
    order: shaped,
    legs,
    fills: fills
      .filter((f) => String(f.order_id) === orderId)
      .map((f) => ({ qty: Number(f.qty), price: Number(f.price), ts: String(f.ts), liquidity: (f.liquidity as string) ?? null })),
    events: toOrderEventRows(events.filter((e) => String(e.order_id) === orderId)),
    position_id: positionId,
    deduplicated,
    accepted_plain: acceptedPlain,
    fill_plain:
      shaped.status === 'filled'
        ? `${SIDE_LABEL[shaped.side]} ${shaped.filled_qty} ${shaped.symbol} filled at $${shaped.avg_fill_price}. ${PAPER_FILL_PLAIN}`
        : shaped.status === 'partially_filled'
          ? `${shaped.filled_qty} of ${shaped.qty} filled at $${shaped.avg_fill_price}. The rest is still working. ${PAPER_FILL_PLAIN}`
          : `Nothing has filled yet — the order is accepted and waiting for its price. ${PAPER_FILL_PLAIN}`,
    paper_plain: PAPER_FILL_PLAIN,
    next_action: next,
  };
}
