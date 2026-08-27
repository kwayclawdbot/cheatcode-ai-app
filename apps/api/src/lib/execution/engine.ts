/**
 * The paper execution engine: the writes that turn a preview into an order,
 * an order into a fill, and a fill into a position.
 *
 * ATOMICITY, STATED PLAINLY
 * -------------------------
 * SCHEMA-3 owns `submit_paper_order(...)` and `apply_paper_tick(...)` in
 * migration 0020 — one plpgsql function per command, which is one transaction,
 * which is how the domain rows and the `user_events` outbox land together
 * (01 §3). This file is the SAME work expressed in several PostgREST
 * round-trips, and it is NOT atomic. It exists so this lane is demonstrable
 * before 0020 is applied, and `src/lib/execution/adapter.ts` prefers the RPC
 * whenever the function is present, with no change to any caller.
 *
 * A crash mid-sequence here would leave an order filled with no position row.
 * That is a real risk and it is the reason the RPC is the preferred path; it is
 * recorded in apps/api/README.md "Known gaps".
 *
 * INVARIANTS (03 Unit 4) that hold on BOTH paths:
 *   - no fill is claimed before the fill model has decided one;
 *   - accepted ≠ filled — the two transitions are separate `order_events` rows
 *     with separate timestamps, and the payload carries both stamps;
 *   - position matching uses `side` (position_effect) exclusively — never an
 *     inference from a bare buy/sell;
 *   - an idempotency key that has been seen returns the original order.
 */
import type { OrderStatus, PositionEffect, OrderType } from '@shared/api';
import { serviceClient } from '../db';
import { log } from '../log';
import { emitUserEvent } from '../events';
import {
  cashDelta,
  closingSide,
  directionFor,
  opensPosition,
  realized,
  round2,
  SIDE_LABEL,
} from './paper';

export type OrderRecord = Record<string, unknown>;

export const ORDER_COLUMNS =
  'id,user_id,account_id,plan_id,symbol,side,type,qty,limit_price,stop_price,duration,status,idempotency_key,preview,reject_reason,driver,bracket_group,parent_order_id,leg,filled_qty,avg_fill_price,submitted_at,accepted_at,filled_at,exec_meta,created_at,updated_at';

export const POSITION_EXEC_COLUMNS =
  'id,user_id,account_id,symbol,direction,qty,avg_cost,opened_at,closed_at,realized_pnl,origin_plan_id,origin_setup_id,origin_room_id,mode,source,origin,mark_price,mark_ts,unrealized_pnl,stop,target';

/* ------------------------------------------------------------------ */
/* Accounts                                                             */
/* ------------------------------------------------------------------ */

export type PaperAccount = {
  id: string;
  cash: number;
  buying_power: number;
  equity: number;
  starting_balance: number | null;
};

export async function loadPaperAccount(userId: string, accountId?: string): Promise<PaperAccount | null> {
  const db = serviceClient();
  let q = db
    .from('accounts')
    .select('id,cash,buying_power,equity,starting_balance')
    .eq('user_id', userId)
    .eq('kind', 'paper');
  if (accountId) q = q.eq('id', accountId);
  const { data } = await q.order('created_at', { ascending: true }).limit(1).maybeSingle();
  const row = data as Record<string, unknown> | null;
  if (!row) return null;
  return {
    id: String(row.id),
    cash: Number(row.cash ?? 0),
    buying_power: Number(row.buying_power ?? row.cash ?? 0),
    equity: Number(row.equity ?? row.cash ?? 0),
    starting_balance: row.starting_balance === null || row.starting_balance === undefined ? null : Number(row.starting_balance),
  };
}

/** Recompute equity = cash + Σ(mark value of open positions). */
export async function revalueAccount(userId: string, accountId: string): Promise<PaperAccount | null> {
  const db = serviceClient();
  const acct = await loadPaperAccount(userId, accountId);
  if (!acct) return null;

  const { data } = await db
    .from('positions')
    .select('qty,avg_cost,direction,mark_price')
    .eq('user_id', userId)
    .eq('account_id', accountId)
    .is('closed_at', null);

  let marketValue = 0;
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const qty = Number(r.qty);
    const avg = Number(r.avg_cost);
    const mark = r.mark_price === null || r.mark_price === undefined ? avg : Number(r.mark_price);
    if (!Number.isFinite(qty) || !Number.isFinite(avg)) continue;
    // A short's market value is negative: closing it costs cash.
    marketValue += (String(r.direction) === 'long' ? 1 : -1) * qty * (Number.isFinite(mark) ? mark : avg);
  }

  const equity = round2(acct.cash + marketValue);
  // Cash-account paper: buying power is cash. No margin is simulated, and the
  // app says "practice money", not "margin".
  const buyingPower = round2(Math.max(0, acct.cash));

  await db.from('accounts').update({ equity, buying_power: buyingPower, updated_at: new Date().toISOString() }).eq('id', accountId);
  return { ...acct, equity, buying_power: buyingPower };
}

/* ------------------------------------------------------------------ */
/* Order events + status transitions                                    */
/* ------------------------------------------------------------------ */

export async function transition(
  orderId: string,
  from: OrderStatus | null,
  to: OrderStatus,
  plain: string,
  payload: Record<string, unknown> = {},
  at = new Date().toISOString()
): Promise<void> {
  const db = serviceClient();
  await db.from('orders').update({ status: to, updated_at: at }).eq('id', orderId);
  await db.from('order_events').insert({
    order_id: orderId,
    from_status: from,
    to_status: to,
    payload: { ...payload, plain } as never,
    created_at: at,
  });
}

export async function orderEvents(orderIds: string[]) {
  if (!orderIds.length) return [] as Record<string, unknown>[];
  const db = serviceClient();
  const { data } = await db
    .from('order_events')
    .select('order_id,from_status,to_status,payload,created_at')
    .in('order_id', orderIds)
    .order('created_at', { ascending: true });
  return (data ?? []) as Record<string, unknown>[];
}

export async function fillsFor(orderIds: string[]) {
  if (!orderIds.length) return [] as Record<string, unknown>[];
  const db = serviceClient();
  const { data } = await db
    .from('fills')
    .select('order_id,qty,price,ts,liquidity')
    .in('order_id', orderIds)
    .order('ts', { ascending: true });
  return (data ?? []) as Record<string, unknown>[];
}

/* ------------------------------------------------------------------ */
/* Applying a fill                                                      */
/* ------------------------------------------------------------------ */

export type ApplyFillResult = {
  positionId: string | null;
  realizedPnl: number | null;
  filledQty: number;
  status: OrderStatus;
  closedPosition: boolean;
};

/**
 * Book one fill against an order: fills row, order transition, position upsert,
 * account update, user_events. Position matching is by `side` exactly.
 */
export async function applyFill(opts: {
  userId: string;
  order: OrderRecord;
  qty: number;
  price: number;
  ts?: string;
  requestId?: string;
  liquidity?: string;
}): Promise<ApplyFillResult> {
  const db = serviceClient();
  const ts = opts.ts ?? new Date().toISOString();
  const requestId = opts.requestId ?? '-';
  const order = opts.order;
  const orderId = String(order.id);
  const side = String(order.side) as PositionEffect;
  const symbol = String(order.symbol);
  const accountId = String(order.account_id);
  const orderQty = Number(order.qty);

  await db.from('fills').insert({
    order_id: orderId,
    qty: opts.qty,
    price: opts.price,
    ts,
    liquidity: opts.liquidity ?? 'paper',
  });

  const prior = await fillsFor([orderId]);
  const filledQty = prior.reduce((a, f) => a + Number(f.qty ?? 0), 0);
  const status: OrderStatus = filledQty + 1e-9 >= orderQty ? 'filled' : 'partially_filled';

  await transition(
    orderId,
    String(order.status) as OrderStatus,
    status,
    status === 'filled'
      ? `Filled ${round2(filledQty)} at $${opts.price}.`
      : `Partially filled — ${round2(filledQty)} of ${orderQty} at $${opts.price}. The rest is still working.`,
    { fill_qty: opts.qty, fill_price: opts.price, filled_qty: filledQty, filled_at: ts },
    ts
  );

  // --- position ---------------------------------------------------------
  const direction = directionFor(side);
  const existing = await db
    .from('positions')
    .select(POSITION_EXEC_COLUMNS)
    .eq('user_id', opts.userId)
    .eq('account_id', accountId)
    .eq('symbol', symbol)
    .eq('direction', direction)
    .is('closed_at', null)
    .maybeSingle();

  const pos = existing.data as Record<string, unknown> | null;
  let positionId: string | null = pos ? String(pos.id) : null;
  let realizedPnl: number | null = null;
  let closedPosition = false;

  const plan = order.plan_id ? await loadPlanLite(String(order.plan_id)) : null;

  if (opensPosition(side)) {
    if (pos) {
      const oldQty = Number(pos.qty);
      const oldAvg = Number(pos.avg_cost);
      const newQty = oldQty + opts.qty;
      const newAvg = round2((oldQty * oldAvg + opts.qty * opts.price) / newQty);
      await db
        .from('positions')
        .update({ qty: newQty, avg_cost: newAvg, mark_price: opts.price, mark_ts: ts, updated_at: ts })
        .eq('id', positionId);
    } else {
      const inserted = await db
        .from('positions')
        .insert({
          user_id: opts.userId,
          account_id: accountId,
          symbol,
          direction,
          qty: opts.qty,
          avg_cost: opts.price,
          opened_at: ts,
          realized_pnl: 0,
          origin_plan_id: (order.plan_id as string) ?? null,
          origin_setup_id: plan?.setup_id ?? null,
          origin_room_id: plan?.room_id ?? null,
          mode: plan?.mode ?? 'day_trade',
          source: 'app',
          mark_price: opts.price,
          mark_ts: ts,
          origin: { driver: 'paper', order_id: orderId } as never,
        })
        .select('id')
        .single();
      if (inserted.error) {
        // `mark_price` / `mark_ts` arrive with SCHEMA-3's 0020. Retry without
        // them so the chain still works on an un-migrated database.
        const retry = await db
          .from('positions')
          .insert({
            user_id: opts.userId,
            account_id: accountId,
            symbol,
            direction,
            qty: opts.qty,
            avg_cost: opts.price,
            opened_at: ts,
            realized_pnl: 0,
            origin_plan_id: (order.plan_id as string) ?? null,
            origin_setup_id: plan?.setup_id ?? null,
            origin_room_id: plan?.room_id ?? null,
            mode: plan?.mode ?? 'day_trade',
            source: 'app',
            origin: { driver: 'paper', order_id: orderId } as never,
          })
          .select('id')
          .single();
        if (retry.error || !retry.data) {
          log('error', requestId, 'paper.position_insert_failed', { message: retry.error?.message });
        } else {
          positionId = String((retry.data as Record<string, unknown>).id);
        }
      } else {
        positionId = String((inserted.data as Record<string, unknown>).id);
      }
    }
  } else {
    // Closing side. With no matching open position there is nothing to close —
    // we do not invent a short out of a stray sell.
    if (!pos) {
      log('warn', requestId, 'paper.close_without_position', { symbol, side });
    } else {
      const oldQty = Number(pos.qty);
      const avg = Number(pos.avg_cost);
      const closeQty = Math.min(opts.qty, oldQty);
      realizedPnl = realized(direction, closeQty, avg, opts.price);
      const remaining = round2(oldQty - closeQty);
      const priorRealized = Number(pos.realized_pnl ?? 0);
      if (remaining <= 0) {
        await db
          .from('positions')
          .update({
            qty: oldQty,
            closed_at: ts,
            realized_pnl: round2(priorRealized + realizedPnl),
            updated_at: ts,
          })
          .eq('id', positionId);
        closedPosition = true;
      } else {
        await db
          .from('positions')
          .update({ qty: remaining, realized_pnl: round2(priorRealized + realizedPnl), updated_at: ts })
          .eq('id', positionId);
      }
    }
  }

  // --- account ----------------------------------------------------------
  const acct = await loadPaperAccount(opts.userId, accountId);
  if (acct) {
    const delta = cashDelta(side, opts.qty, opts.price);
    await db
      .from('accounts')
      .update({ cash: round2(acct.cash + delta), updated_at: ts })
      .eq('id', accountId);
    await revalueAccount(opts.userId, accountId);
  }

  await emitUserEvent(
    opts.userId,
    'fill',
    'order',
    orderId,
    {
      symbol,
      side,
      qty: opts.qty,
      price: opts.price,
      status,
      position_id: positionId,
      realized_pnl: realizedPnl,
      plain: `${SIDE_LABEL[side]} ${opts.qty} ${symbol} at $${opts.price}.`,
    },
    requestId
  );

  if (positionId) {
    await emitUserEvent(
      opts.userId,
      'position_update',
      'position',
      positionId,
      {
        event: closedPosition ? 'position_closed' : opensPosition(side) ? 'position_opened' : 'position_reduced',
        symbol,
        qty: opts.qty,
        price: opts.price,
        realized_pnl: realizedPnl,
      },
      requestId
    );
  }

  return { positionId, realizedPnl, filledQty, status, closedPosition };
}

type PlanLite = { id: string; mode: string; setup_id: string | null; room_id: string | null; stop: number | null; targets: unknown; exit_style: string };

export async function loadPlanLite(planId: string): Promise<PlanLite | null> {
  const db = serviceClient();
  const { data } = await db
    .from('trade_plans')
    .select('id,mode,setup_id,stop,targets,exit_style,origin')
    .eq('id', planId)
    .maybeSingle();
  const row = data as Record<string, unknown> | null;
  if (!row) return null;
  const origin = (row.origin as Record<string, unknown>) ?? {};
  return {
    id: String(row.id),
    mode: String(row.mode),
    setup_id: (row.setup_id as string) ?? null,
    room_id: typeof origin.room_id === 'string' ? origin.room_id : null,
    stop: row.stop === null || row.stop === undefined ? null : Number(row.stop),
    targets: row.targets ?? null,
    exit_style: String(row.exit_style ?? 'auto'),
  };
}

/* ------------------------------------------------------------------ */
/* Bracket legs                                                         */
/* ------------------------------------------------------------------ */

export type LegSpec = { role: 'stop' | 'target'; type: OrderType; price: number; qty: number };

/**
 * Create the exit legs for a filled entry as ONE authorized unit: same
 * `bracket_group` as the entry, status `accepted` (armed, not filled — they
 * work on the tick). `exit_style` decides what firing means: `auto` executes
 * the leg, `alert_assisted` raises an Attention alert instead.
 */
export async function createBracketLegs(opts: {
  userId: string;
  entry: OrderRecord;
  bracketGroup: string;
  legs: LegSpec[];
  exitStyle: string;
  requestId?: string;
}): Promise<string[]> {
  const db = serviceClient();
  const ids: string[] = [];
  const closeSide = closingSide(directionFor(String(opts.entry.side) as PositionEffect));
  const at = new Date().toISOString();

  for (const leg of opts.legs) {
    const key = `${String(opts.entry.id)}-${leg.role}-${leg.price}`;
    const row = await db
      .from('orders')
      .insert({
        user_id: opts.userId,
        account_id: String(opts.entry.account_id),
        plan_id: (opts.entry.plan_id as string) ?? null,
        symbol: String(opts.entry.symbol),
        side: closeSide,
        type: leg.type,
        qty: leg.qty,
        limit_price: leg.type === 'limit' ? leg.price : null,
        stop_price: leg.type === 'stop' || leg.type === 'stop_limit' ? leg.price : null,
        duration: 'gtc',
        status: 'accepted',
        idempotency_key: key,
        driver: 'paper',
        bracket_group: opts.bracketGroup,
        preview: { bracket_role: leg.role, exit_style: opts.exitStyle } as never,
        created_at: at,
      })
      .select('id')
      .single();
    if (row.error || !row.data) {
      log('warn', opts.requestId ?? '-', 'paper.leg_insert_failed', { role: leg.role, message: row.error?.message });
      continue;
    }
    const id = String((row.data as Record<string, unknown>).id);
    ids.push(id);
    await db.from('order_events').insert({
      order_id: id,
      from_status: 'draft',
      to_status: 'accepted',
      payload: {
        bracket_role: leg.role,
        exit_style: opts.exitStyle,
        plain:
          opts.exitStyle === 'auto'
            ? `${leg.role === 'stop' ? 'Stop' : 'Target'} armed at $${leg.price}. It is in place from now — armed is not filled.`
            : `${leg.role === 'stop' ? 'Stop' : 'Target'} watched at $${leg.price}. You will get a notification with one-tap close; this is not automatic protection.`,
      } as never,
      created_at: at,
    });
  }
  return ids;
}

/** OCO: when one leg of a bracket fills, its siblings are cancelled. */
export async function cancelSiblings(bracketGroup: string, keepOrderId: string, why: string): Promise<string[]> {
  const db = serviceClient();
  const { data } = await db
    .from('orders')
    .select('id,status')
    .eq('bracket_group', bracketGroup)
    .in('status', ['accepted', 'submitted', 'partially_filled']);
  const ids: string[] = [];
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const id = String(r.id);
    if (id === keepOrderId) continue;
    await transition(id, String(r.status) as OrderStatus, 'cancelled', why, { reason: 'oco_sibling_filled' });
    ids.push(id);
  }
  return ids;
}
