/**
 * Loading side of the debrief: gather everything that actually happened on a
 * position so the generator never has to guess.
 *
 * `simulated` comes from `trade_plans.origin.simulated` — the dev tool stamps
 * it on every row it creates, and every surface that shows a simulated trade
 * has to label it (BUILD-BRIEF-round-2: "Simulated trades render a SIMULATED
 * tag").
 */
import type { PositionRow } from '@shared/api';
import { serviceClient } from './db';
import { loadProfile, loadRiskPolicy } from './kai/context';
import type { DebriefSources } from './kai/debrief';
import { holdPlain } from './kai/debrief';

export const POSITION_COLUMNS =
  'id,symbol,direction,qty,avg_cost,opened_at,closed_at,realized_pnl,mode,origin,origin_plan_id,origin_setup_id,account_id';

export type RawPosition = Record<string, unknown>;

export async function planOrigins(planIds: string[]): Promise<Map<string, Record<string, unknown>>> {
  const out = new Map<string, Record<string, unknown>>();
  const ids = planIds.filter(Boolean);
  if (!ids.length) return out;
  const db = serviceClient();
  const { data } = await db.from('trade_plans').select('id,origin').in('id', ids);
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    out.set(String(r.id), (r.origin as Record<string, unknown>) ?? {});
  }
  return out;
}

export function isSimulated(origin: Record<string, unknown> | undefined): boolean {
  return Boolean(origin?.simulated);
}

/** positions.origin is the authority (0018); the plan's origin is the fallback. */
export function positionSimulated(
  row: RawPosition,
  planOrigin: Record<string, unknown> | undefined
): boolean {
  return isSimulated((row.origin as Record<string, unknown>) ?? undefined) || isSimulated(planOrigin);
}

export function positionPlain(row: RawPosition, simulated: boolean): string {
  const pnl = row.realized_pnl === null || row.realized_pnl === undefined ? null : Number(row.realized_pnl);
  const held = holdPlain(String(row.opened_at), (row.closed_at as string) ?? null);
  const tag = simulated ? ' (simulated)' : '';
  if (!row.closed_at) return `${row.symbol} — still open${tag}.`;
  if (pnl === null) return `${row.symbol} — closed after ${held.plain}${tag}.`;
  if (pnl > 0) return `${row.symbol} — closed up $${Math.abs(pnl)} after ${held.plain}${tag}.`;
  if (pnl < 0) return `${row.symbol} — closed down $${Math.abs(pnl)} after ${held.plain}${tag}.`;
  return `${row.symbol} — closed flat after ${held.plain}${tag}.`;
}

export function toPositionRow(
  row: RawPosition,
  simulated: boolean,
  debriefId: string | null
): PositionRow {
  return {
    id: String(row.id),
    symbol: String(row.symbol),
    direction: row.direction as 'long' | 'short',
    qty: Number(row.qty),
    avg_cost: Number(row.avg_cost),
    opened_at: String(row.opened_at),
    closed_at: (row.closed_at as string) ?? null,
    realized_pnl: row.realized_pnl === null || row.realized_pnl === undefined ? null : Number(row.realized_pnl),
    mode: row.mode as PositionRow['mode'],
    simulated,
    has_debrief: Boolean(debriefId),
    debrief_id: debriefId,
    plain: positionPlain(row, simulated),
  };
}

/** Everything the debrief generator is allowed to know. */
export async function loadDebriefSources(userId: string, positionId: string): Promise<DebriefSources | null> {
  const db = serviceClient();
  const pos = await db
    .from('positions')
    .select(POSITION_COLUMNS)
    .eq('user_id', userId)
    .eq('id', positionId)
    .maybeSingle();
  const row = pos.data as RawPosition | null;
  if (!row) return null;

  const planId = (row.origin_plan_id as string) ?? null;
  const [plan, planEvents, orders, profile, risk, setup] = await Promise.all([
    planId
      ? db
          .from('trade_plans')
          .select('id,status,entry_condition,invalidation,stop,targets,size,exit_style,origin')
          .eq('id', planId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    planId
      ? db
          .from('plan_events')
          .select('type,payload,created_at')
          .eq('plan_id', planId)
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [] }),
    db
      .from('orders')
      .select('id,side,type,qty,status,created_at')
      .eq('user_id', userId)
      .eq('plan_id', planId ?? '00000000-0000-0000-0000-000000000000')
      .order('created_at', { ascending: true }),
    loadProfile(userId),
    loadRiskPolicy(userId),
    row.origin_setup_id
      ? db.from('setups').select('thesis_plain').eq('id', row.origin_setup_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const orderRows = (orders.data ?? []) as Record<string, unknown>[];
  const orderIds = orderRows.map((o) => String(o.id));

  const [orderEvents, fills] = await Promise.all([
    orderIds.length
      ? db
          .from('order_events')
          .select('order_id,from_status,to_status,payload,created_at')
          .in('order_id', orderIds)
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [] }),
    orderIds.length
      ? db.from('fills').select('order_id,qty,price,ts').in('order_id', orderIds).order('ts', { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);

  const planRow = plan.data as Record<string, unknown> | null;
  const origin = (planRow?.origin as Record<string, unknown>) ?? {};

  return {
    position: {
      id: String(row.id),
      symbol: String(row.symbol),
      direction: row.direction as 'long' | 'short',
      qty: Number(row.qty),
      avg_cost: Number(row.avg_cost),
      opened_at: String(row.opened_at),
      closed_at: (row.closed_at as string) ?? null,
      realized_pnl: row.realized_pnl === null || row.realized_pnl === undefined ? null : Number(row.realized_pnl),
      mode: String(row.mode),
      origin_plan_id: planId,
      origin_setup_id: (row.origin_setup_id as string) ?? null,
      simulated: positionSimulated(row, origin),
    },
    plan: planRow
      ? {
          id: String(planRow.id),
          status: String(planRow.status),
          entry_condition: (planRow.entry_condition as Record<string, unknown>) ?? null,
          invalidation: (planRow.invalidation as Record<string, unknown>) ?? null,
          stop: planRow.stop === null || planRow.stop === undefined ? null : Number(planRow.stop),
          targets: planRow.targets ?? null,
          size: (planRow.size as Record<string, unknown>) ?? null,
          exit_style: String(planRow.exit_style ?? 'auto'),
          origin,
        }
      : null,
    planEvents: ((planEvents.data ?? []) as Record<string, unknown>[]).map((e) => ({
      type: String(e.type),
      payload: (e.payload as Record<string, unknown>) ?? {},
      created_at: String(e.created_at),
    })),
    orders: orderRows.map((o) => ({
      id: String(o.id),
      side: String(o.side),
      type: String(o.type),
      qty: Number(o.qty),
      status: String(o.status),
      created_at: String(o.created_at),
    })),
    orderEvents: ((orderEvents.data ?? []) as Record<string, unknown>[]).map((e) => ({
      order_id: String(e.order_id),
      from_status: (e.from_status as string) ?? null,
      to_status: (e.to_status as string) ?? null,
      payload: (e.payload as Record<string, unknown>) ?? null,
      created_at: String(e.created_at),
    })),
    fills: ((fills.data ?? []) as Record<string, unknown>[]).map((f) => ({
      order_id: String(f.order_id),
      qty: Number(f.qty),
      price: Number(f.price),
      ts: String(f.ts),
    })),
    setupThesis: ((setup.data as Record<string, unknown> | null)?.thesis_plain as string) ?? null,
    risk,
    profile,
  };
}
