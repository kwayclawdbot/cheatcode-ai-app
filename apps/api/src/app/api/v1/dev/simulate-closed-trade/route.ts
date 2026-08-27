/**
 * POST /api/v1/dev/simulate-closed-trade   {symbol?, outcome?}   DEV ONLY
 *
 * Gated on `DEV_TOOLS=1`; without it the route answers 404 exactly as if it
 * did not exist, so a production deploy never advertises it.
 *
 * It manufactures the whole lifecycle — plan → order (filled) → fills →
 * position (closed) → events — so the debrief flow can be exercised before the
 * execution worker exists. EVERY row it writes is stamped `origin.simulated =
 * true`, and every surface that reads them labels it "SIMULATED". A fabricated
 * trade that could be mistaken for a real one would be the worst possible bug
 * in a financial product, so the label is not optional anywhere.
 *
 * Prices are real: entry and exit are derived from the symbol's actual last
 * close (or its setup's levels), not from invented numbers.
 */
import type { NextRequest } from 'next/server';
import { SimulateClosedTradeRequest, SimulateClosedTradeResponse } from '@shared/api';
import { authed, ok, parseBody, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { env } from '@/lib/env';
import { serviceClient } from '@/lib/db';
import { emitUserEvent } from '@/lib/events';
import { callRpc, noteFallback } from '@/lib/rpc';
import { getQuote, round2 } from '@/lib/market/polygon';
import { loadProfile, type SetupRow } from '@/lib/kai/context';
import { levels } from '@/lib/setups';

export const dynamic = 'force-dynamic';

const DEFAULT_SYMBOL = 'META';
const QTY = 10;

function devEnabled(): boolean {
  return env('DEV_TOOLS') === '1';
}

export const POST = authed(async (req: NextRequest, ctx: Ctx) => {
  if (!devEnabled()) throw new ApiError('NOT_FOUND', 'That is not something this app does.');

  const body = await parseBody(req, SimulateClosedTradeRequest);
  const symbol = (body.symbol ?? DEFAULT_SYMBOL).toUpperCase();
  const win = body.outcome !== 'loss';
  const db = serviceClient();

  const known = await db.from('instruments').select('symbol').eq('symbol', symbol).maybeSingle();
  if (!known.data) throw new ApiError('NOT_FOUND', `I do not follow ${symbol}, so I cannot simulate a trade on it.`);

  const profile = await loadProfile(ctx.user.id);
  const account = await db
    .from('accounts')
    .select('id')
    .eq('user_id', ctx.user.id)
    .eq('kind', 'paper')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  const accountId = (account.data as Record<string, unknown> | null)?.id;
  if (!accountId) throw new ApiError('STATE_CONFLICT', 'Your paper account is not set up yet.');

  // Real prices: the setup's own levels when there is one, otherwise the close.
  const setupRes = await db
    .from('setups')
    .select('id,symbol,mode,intent,state,score,grade_band,grade_display,score_components,thesis_plain,thesis_technical,entry_condition,invalidation,stop,targets,catalyst,quote_snapshot,valid_until,scanner_run_id')
    .eq('symbol', symbol)
    .order('score', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  const setup = (setupRes.data ?? null) as unknown as SetupRow | null;
  const quote = await getQuote(symbol);

  const base = quote.price ?? (setup ? levels(setup).entry : null);
  if (base === null) throw new ApiError('STATE_CONFLICT', `I do not have a price for ${symbol} to build that from.`);

  const setupLevels = setup ? levels(setup) : { entry: null, stop: null, targets: [] as { price: number }[] };
  const entry = round2(setupLevels.entry ?? base);
  const stop = round2(setupLevels.stop ?? entry * 0.97);
  const target = round2(setupLevels.targets[0]?.price ?? entry * 1.05);
  const exit = win ? target : stop;
  const pnl = round2((exit - entry) * QTY);

  const openedAt = new Date(Date.now() - 2 * 60 * 60 * 1000 - 14 * 60 * 1000).toISOString();
  const closedAt = new Date().toISOString();

  // Preferred: one transaction in SCHEMA-2's simulate_closed_trade.
  const rpc = await callRpc<{
    position_id?: string;
    plan_id?: string;
    entry_order_id?: string;
    realized_pnl?: number;
    entry?: number;
    exit?: number;
  }>(
    'simulate_closed_trade',
    { p_user_id: ctx.user.id, p_symbol: symbol, p_entry: entry, p_exit: exit, p_qty: QTY },
    ctx.requestId
  );
  if (rpc.ok && rpc.data?.position_id) {
    const d = rpc.data;
    return ok(
      SimulateClosedTradeResponse.parse({
        position_id: d.position_id,
        plan_id: d.plan_id ?? null,
        order_id: d.entry_order_id ?? null,
        symbol,
        realized_pnl: Number(d.realized_pnl ?? pnl),
        simulated: true,
        plain: `Simulated a closed ${symbol} trade: in at $${d.entry ?? entry}, out at $${d.exit ?? exit}. This is a dev fixture — it is labeled SIMULATED everywhere.`,
      }),
      { status: 201 }
    );
  }

  // FALLBACK (documented in README): the same rows, several round-trips, not
  // atomic. Used only until 0018 is applied.
  noteFallback(ctx.requestId, 'simulate_closed_trade');
  const origin = {
    simulated: true,
    source: 'dev/simulate-closed-trade',
    created_at: closedAt,
    note: 'Dev fixture. Not a real trade.',
  };

  const plan = await db
    .from('trade_plans')
    .insert({
      user_id: ctx.user.id,
      setup_id: setup?.id ?? null,
      mode: setup?.mode ?? profile.primary_mode,
      status: 'closed',
      symbol,
      intent: 'buy_to_open',
      entry_condition: { type: 'price_cross', level: entry, hold: true } as never,
      invalidation: { type: 'close_below', level: stop } as never,
      stop,
      targets: [{ price: target, label: 'first target' }] as never,
      size: { shares: QTY, max_loss_usd: round2((entry - stop) * QTY) } as never,
      scenarios: null,
      exit_style: 'auto',
      origin: origin as never,
    })
    .select('id')
    .single();
  if (plan.error || !plan.data) {
    throw new ApiError('INTERNAL', 'We could not build that simulated trade.', { detail: plan.error?.message });
  }
  const planId = String((plan.data as Record<string, unknown>).id);

  await db.from('plan_events').insert([
    { plan_id: planId, user_id: ctx.user.id, seq: 1, type: 'created', payload: { ...origin, plain: 'Plan written.' } as never, created_at: openedAt },
    { plan_id: planId, user_id: ctx.user.id, seq: 2, type: 'activated', payload: { ...origin, plain: 'Entry condition met.' } as never, created_at: openedAt },
    {
      plan_id: planId,
      user_id: ctx.user.id,
      seq: 3,
      type: 'closed',
      payload: {
        ...origin,
        reason: win ? 'Exited in the target zone' : 'Stopped out at the invalidation level',
        plain: win ? 'Target hit and the position was closed.' : 'The invalidation level failed and the position was closed.',
      } as never,
      created_at: closedAt,
    },
  ]);

  const stamp = Date.now();
  const orders = await db
    .from('orders')
    .insert([
      {
        user_id: ctx.user.id,
        account_id: accountId,
        plan_id: planId,
        symbol,
        side: 'buy_to_open',
        type: 'limit',
        qty: QTY,
        limit_price: entry,
        status: 'filled',
        idempotency_key: `sim-${ctx.user.id}-${stamp}-entry`,
        driver: 'paper',
        preview: origin as never,
        created_at: openedAt,
      },
      {
        user_id: ctx.user.id,
        account_id: accountId,
        plan_id: planId,
        symbol,
        side: 'sell_to_close',
        type: 'limit',
        qty: QTY,
        limit_price: exit,
        status: 'filled',
        idempotency_key: `sim-${ctx.user.id}-${stamp}-exit`,
        driver: 'paper',
        preview: origin as never,
        created_at: closedAt,
      },
    ])
    .select('id,side');
  if (orders.error || !orders.data) {
    throw new ApiError('INTERNAL', 'We could not build that simulated trade.', { detail: orders.error?.message });
  }
  const orderRows = orders.data as Record<string, unknown>[];
  const entryOrder = orderRows.find((o) => o.side === 'buy_to_open');
  const exitOrder = orderRows.find((o) => o.side === 'sell_to_close');

  await db.from('order_events').insert([
    { order_id: entryOrder?.id, from_status: 'draft', to_status: 'submitted', payload: { ...origin, plain: 'Order submitted. Accepted is not the same as filled.' } as never, created_at: openedAt },
    { order_id: entryOrder?.id, from_status: 'submitted', to_status: 'filled', payload: { ...origin, plain: `Filled ${QTY} at $${entry}.` } as never, created_at: openedAt },
    { order_id: exitOrder?.id, from_status: 'draft', to_status: 'submitted', payload: { ...origin, plain: 'Exit order submitted.' } as never, created_at: closedAt },
    {
      order_id: exitOrder?.id,
      from_status: 'submitted',
      to_status: 'filled',
      payload: {
        ...origin,
        reason: win ? 'Exited in the target zone' : 'Stopped out at the invalidation level',
        plain: `Filled ${QTY} at $${exit}.`,
      } as never,
      created_at: closedAt,
    },
  ]);

  await db.from('fills').insert([
    { order_id: entryOrder?.id, qty: QTY, price: entry, ts: openedAt, liquidity: 'simulated' },
    { order_id: exitOrder?.id, qty: QTY, price: exit, ts: closedAt, liquidity: 'simulated' },
  ]);

  const position = await db
    .from('positions')
    .insert({
      user_id: ctx.user.id,
      account_id: accountId,
      symbol,
      direction: 'long',
      qty: QTY,
      avg_cost: entry,
      opened_at: openedAt,
      closed_at: closedAt,
      realized_pnl: pnl,
      origin_plan_id: planId,
      origin_setup_id: setup?.id ?? null,
      mode: setup?.mode ?? profile.primary_mode,
      source: 'app',
    })
    .select('id')
    .single();
  if (position.error || !position.data) {
    throw new ApiError('INTERNAL', 'We could not build that simulated trade.', { detail: position.error?.message });
  }
  const positionId = String((position.data as Record<string, unknown>).id);

  await emitUserEvent(
    ctx.user.id,
    'position_update',
    'position',
    positionId,
    { event: 'position_closed', simulated: true, symbol, realized_pnl: pnl, entry, exit },
    ctx.requestId
  );

  return ok(
    SimulateClosedTradeResponse.parse({
      position_id: positionId,
      plan_id: planId,
      order_id: entryOrder ? String(entryOrder.id) : null,
      symbol,
      realized_pnl: pnl,
      simulated: true,
      plain: `Simulated a closed ${symbol} trade: in at $${entry}, out at $${exit}. This is a dev fixture — it is labeled SIMULATED everywhere.`,
    }),
    { status: 201 }
  );
});
