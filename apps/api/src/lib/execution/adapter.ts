/**
 * Thin adapter over SCHEMA-3's execution RPCs (migration 0020).
 *
 * These functions are the ATOMIC path and the preferred one: PostgREST has no
 * multi-statement transaction, so an order transition, its fill, the position
 * upsert, the account update and the `user_events` outbox row can only land
 * together inside one plpgsql function (01 §3). Everything in this file is a
 * one-call wrapper around exactly the signatures declared in the migration's
 * header — that header is the contract, and it is quoted next to each call.
 *
 * The API still owns the DECISION. 0020 computes nothing about price: the fill
 * model in `paper.ts` decides whether an order fills, at what price, for how
 * many shares, and whether it rests. The RPC books whatever the API decided,
 * atomically. That split is deliberate — market judgement in TypeScript where
 * it can be read and tested, bookkeeping in SQL where it can be transactional.
 *
 * When a function is absent (`missing`) the caller falls back to the
 * multi-round-trip path in `engine.ts`, which does the same work WITHOUT a
 * transaction. That is a real difference and it is recorded in the README.
 */
import { callRpc, noteFallback } from '../rpc';
import { log } from '../log';

export type AdapterResult<T> = { used: true; data: T } | { used: false };

type Json = Record<string, unknown>;

function isObject(v: unknown): v is Json {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

/* ------------------------------------------------------------------ */
/* Plans                                                                */
/* ------------------------------------------------------------------ */

/** `create_plan(p_user_id uuid, p_patch jsonb) returns trade_plans` */
export async function rpcCreatePlan(args: {
  userId: string;
  patch: Json;
  requestId: string;
}): Promise<AdapterResult<Json>> {
  const r = await callRpc<unknown>(
    'create_plan',
    { p_user_id: args.userId, p_patch: args.patch },
    args.requestId
  );
  if (!r.ok) {
    if (r.missing) {
      noteFallback(args.requestId, 'create_plan');
      return { used: false };
    }
    // A validation error from the function is a REAL answer, not a missing
    // function — the plan was refused for a reason the user needs to hear.
    throw new PlanRpcError(r.message, r.code);
  }
  if (!isObject(r.data) || typeof r.data.id !== 'string') return { used: false };
  return { used: true, data: r.data };
}

/**
 * `plan_action(p_user_id uuid, p_plan_id uuid, p_action text, p_payload jsonb)
 *  returns trade_plans`
 */
export async function rpcPlanAction(args: {
  userId: string;
  planId: string;
  action: string;
  payload: Json;
  requestId: string;
}): Promise<AdapterResult<Json>> {
  const r = await callRpc<unknown>(
    'plan_action',
    { p_user_id: args.userId, p_plan_id: args.planId, p_action: args.action, p_payload: args.payload },
    args.requestId
  );
  if (!r.ok) {
    if (r.missing) {
      noteFallback(args.requestId, 'plan_action');
      return { used: false };
    }
    throw new PlanRpcError(r.message, r.code);
  }
  if (!isObject(r.data) || typeof r.data.id !== 'string') return { used: false };
  return { used: true, data: r.data };
}

/* ------------------------------------------------------------------ */
/* Orders                                                               */
/* ------------------------------------------------------------------ */

export type PaperFill = {
  fill_price: number | null;
  fill_qty: number;
  partial: boolean;
  /** accepted and NOT filled — a limit away from the market. */
  resting: boolean;
  quote: { price: number | null; source_ts: string | null; received_ts: string | null; freshness: string };
  bracket: { stop: number | null; target: number | null; exit_style: string } | null;
  close_of_position_id: string | null;
};

export type SubmitRpcResult = {
  deduplicated: boolean;
  order: Json;
  position: Json | null;
  legs: Json[];
  cancelled_legs: string[];
  closed_position: boolean;
  realized_pnl: number;
};

/**
 * `submit_paper_order(p_user_id uuid, p_order_id uuid, p_idempotency_key text,
 *                     p_fill jsonb) returns jsonb`
 * → `{deduplicated, order, position, legs, cancelled_legs, closed_position, realized_pnl}`
 */
export async function rpcSubmitPaperOrder(args: {
  userId: string;
  orderId: string;
  idempotencyKey: string;
  fill: PaperFill;
  requestId: string;
}): Promise<AdapterResult<SubmitRpcResult>> {
  const r = await callRpc<unknown>(
    'submit_paper_order',
    {
      p_user_id: args.userId,
      p_order_id: args.orderId,
      p_idempotency_key: args.idempotencyKey,
      p_fill: args.fill,
    },
    args.requestId
  );
  if (!r.ok) {
    if (r.missing) {
      noteFallback(args.requestId, 'submit_paper_order');
      return { used: false };
    }
    throw new ExecutionRpcError(r.message, r.code);
  }
  if (!isObject(r.data) || !isObject(r.data.order)) {
    log('warn', args.requestId, 'paper.submit_rpc_bad_shape', {});
    return { used: false };
  }
  return {
    used: true,
    data: {
      deduplicated: r.data.deduplicated === true,
      order: r.data.order as Json,
      position: isObject(r.data.position) ? (r.data.position as Json) : null,
      legs: Array.isArray(r.data.legs) ? (r.data.legs as Json[]) : [],
      cancelled_legs: Array.isArray(r.data.cancelled_legs) ? (r.data.cancelled_legs as string[]) : [],
      closed_position: r.data.closed_position === true,
      realized_pnl: Number(r.data.realized_pnl ?? 0),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Tick                                                                 */
/* ------------------------------------------------------------------ */

export type TickAttention = {
  order_id: string;
  leg: 'stop' | 'target';
  level: number;
  price: number;
  symbol: string;
  position_id: string | null;
  exit_style: string;
};

export type TickRpcResult = {
  marked: string[];
  filled: string[];
  fired: { order_id: string; leg: string; price: number; position_id: string | null }[];
  needs_attention: TickAttention[];
  price: number | null;
  symbol: string;
  freshness: string | null;
};

/**
 * `apply_paper_tick(p_user_id uuid, p_symbol text, p_quote jsonb) returns jsonb`
 *
 * The function fills crossed resting entries, fires `auto` bracket legs, and
 * marks every open position. It does NOT send notifications: an
 * `alert_assisted` leg comes back in `needs_attention` and the API raises the
 * Attention alert and the notification, because that is where the copy lives.
 */
export async function rpcApplyPaperTick(args: {
  userId: string;
  symbol: string;
  quote: { price: number; source_ts: string | null; received_ts: string | null; freshness: string };
  requestId: string;
}): Promise<AdapterResult<TickRpcResult>> {
  const r = await callRpc<unknown>(
    'apply_paper_tick',
    { p_user_id: args.userId, p_symbol: args.symbol, p_quote: args.quote },
    args.requestId
  );
  if (!r.ok) {
    if (r.missing) noteFallback(args.requestId, 'apply_paper_tick');
    else log('warn', args.requestId, 'paper.tick_rpc_failed', { message: r.message, symbol: args.symbol });
    return { used: false };
  }
  if (!isObject(r.data)) return { used: false };
  return {
    used: true,
    data: {
      marked: Array.isArray(r.data.marked) ? (r.data.marked as string[]) : [],
      filled: Array.isArray(r.data.filled) ? (r.data.filled as string[]) : [],
      fired: Array.isArray(r.data.fired) ? (r.data.fired as TickRpcResult['fired']) : [],
      needs_attention: Array.isArray(r.data.needs_attention) ? (r.data.needs_attention as TickAttention[]) : [],
      price: r.data.price === null || r.data.price === undefined ? null : Number(r.data.price),
      symbol: String(r.data.symbol ?? args.symbol),
      freshness: (r.data.freshness as string) ?? null,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Close                                                                */
/* ------------------------------------------------------------------ */

export type ClosePrepare = {
  position_id: string;
  account_id: string;
  plan_id: string | null;
  mode: string;
  symbol: string;
  direction: 'long' | 'short';
  side: string;
  qty: number;
  avg_cost: number;
  mark_price: number | null;
  stop: number | null;
  target: number | null;
  close_of_position_id: string;
};

/** `close_position_prepare(p_user_id uuid, p_position_id uuid) returns jsonb` */
export async function rpcClosePositionPrepare(args: {
  userId: string;
  positionId: string;
  requestId: string;
}): Promise<AdapterResult<ClosePrepare>> {
  const r = await callRpc<unknown>(
    'close_position_prepare',
    { p_user_id: args.userId, p_position_id: args.positionId },
    args.requestId
  );
  if (!r.ok) {
    if (r.missing) {
      noteFallback(args.requestId, 'close_position_prepare');
      return { used: false };
    }
    throw new ExecutionRpcError(r.message, r.code);
  }
  if (!isObject(r.data) || typeof r.data.position_id !== 'string') return { used: false };
  const d = r.data;
  return {
    used: true,
    data: {
      position_id: String(d.position_id),
      account_id: String(d.account_id),
      plan_id: (d.plan_id as string) ?? null,
      mode: String(d.mode ?? 'day_trade'),
      symbol: String(d.symbol),
      direction: d.direction === 'short' ? 'short' : 'long',
      side: String(d.side),
      qty: Number(d.qty),
      avg_cost: Number(d.avg_cost),
      mark_price: d.mark_price === null || d.mark_price === undefined ? null : Number(d.mark_price),
      stop: d.stop === null || d.stop === undefined ? null : Number(d.stop),
      target: d.target === null || d.target === undefined ? null : Number(d.target),
      close_of_position_id: String(d.close_of_position_id ?? d.position_id),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Errors                                                               */
/* ------------------------------------------------------------------ */

/**
 * A refusal FROM the function — a plan whose stop is on the wrong side of its
 * entry, a close for more shares than are open. These are answers, not
 * outages, and the routes translate them into beginner-readable copy.
 */
export class ExecutionRpcError extends Error {
  readonly pgCode?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'ExecutionRpcError';
    this.pgCode = code;
  }
}

export class PlanRpcError extends ExecutionRpcError {
  constructor(message: string, code?: string) {
    super(message, code);
    this.name = 'PlanRpcError';
  }
}

/** 0020's raise-names → copy a beginner can act on. */
export const RPC_MESSAGE_PLAIN: Record<string, string> = {
  plan_mode_required: 'I need to know which way you are trading this before I can write the plan.',
  plan_symbol_required: 'Tell me which symbol this plan is for.',
  plan_intent_invalid: 'A plan has to start with a buy or a short — that is the side you are opening.',
  plan_entry_required: 'A plan needs an entry price. Without one there is nothing to measure the risk against.',
  plan_stop_required: 'A plan needs a level that says you were wrong. Without one the loss is open-ended.',
  plan_orientation_invalid:
    'Those levels do not line up. On a buy the stop goes below the entry and the target above it; on a short it is the other way round.',
  plan_target_orientation_invalid:
    'That target is on the wrong side of the entry for this direction. Check which way you meant to trade it.',
  exit_style_invalid: 'Exits are either automatic or a notification you act on. Pick one of those two.',
  plan_not_found: 'I could not find that plan.',
  plan_action_unknown: 'That is not something you can do to a plan.',
  plan_state_invalid: 'That plan has moved on — it cannot be changed like that any more.',
  order_not_found: 'I could not find that order.',
  order_not_paper: 'That order is not a practice order, so I will not touch it.',
  fill_price_required: 'I have no price to fill that against right now, so nothing was sent.',
  fill_qty_invalid: 'That quantity does not work for this order.',
  position_not_found: 'I could not find that position.',
  position_already_closed: 'That position is already closed. Nothing was sold.',
  position_insufficient_qty: 'You do not have that many shares open on this one.',
  quote_price_required: 'I have no price to mark that against right now.',
};

export function plainForRpcError(message: string, fallback: string): string {
  for (const [key, plain] of Object.entries(RPC_MESSAGE_PLAIN)) {
    if (message.includes(key)) return plain;
  }
  return fallback;
}
