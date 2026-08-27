/**
 * GET /api/v1/positions/:id
 *
 * Position detail (V3-P1): the position now, the plan it came from, an explicit
 * plan-vs-now comparison, the orders behind it, the conditions Kai is watching
 * on it, and the decision chain that produced it.
 *
 * `plan_vs_now` exists because the most useful question about a live position
 * is not "how much am I up" — it is "is this still the trade I decided to take".
 */
import type { NextRequest } from 'next/server';
import {
  PAPER_FILL_PLAIN,
  PositionDetailResponse,
  type MonitoringRow,
  type PlainAction,
} from '@shared/api';
import { authedParams, ok, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { serviceClient } from '@/lib/db';
import { getQuote } from '@/lib/market/polygon';
import { loadRiskPolicy } from '@/lib/kai/context';
import { ORDER_COLUMNS, fillsFor, loadPaperAccount, orderEvents } from '@/lib/execution/engine';
import { toOrderRow } from '@/lib/execution/shape';
import { loadOpenPositions } from '@/lib/execution/positions-view';
import { PLAN_COLUMNS, toPlanRow } from '@/lib/execution/plans';
import { decisionChain } from '@/lib/execution/chain';
import { round2 } from '@/lib/execution/paper';
import { ensureDevTicker } from '@/lib/execution/tick-dev';

export const dynamic = 'force-dynamic';

export const GET = authedParams<{ id: string }>(async (_req: NextRequest, ctx: Ctx & { params: { id: string } }) => {
  ensureDevTicker();
  const db = serviceClient();

  const raw = await db
    .from('positions')
    .select('id,symbol,closed_at,realized_pnl,origin_plan_id')
    .eq('user_id', ctx.user.id)
    .eq('id', ctx.params.id)
    .maybeSingle();
  const meta = raw.data as Record<string, unknown> | null;
  if (!meta) throw new ApiError('NOT_FOUND', 'I could not find that position.');

  const closed = Boolean(meta.closed_at);
  const loaded = await loadOpenPositions({ userId: ctx.user.id, closed, id: ctx.params.id });
  const position = loaded.rows[0];
  if (!position) throw new ApiError('NOT_FOUND', 'I could not find that position.');

  const [policy, account] = await Promise.all([loadRiskPolicy(ctx.user.id), loadPaperAccount(ctx.user.id)]);

  const planRes = meta.origin_plan_id
    ? await db.from('trade_plans').select(PLAN_COLUMNS).eq('id', String(meta.origin_plan_id)).maybeSingle()
    : { data: null };
  const plan = planRes.data ? toPlanRow(planRes.data as Record<string, unknown>, policy, account?.equity ?? null) : null;

  const ordersRes = await db
    .from('orders')
    .select(ORDER_COLUMNS)
    .eq('user_id', ctx.user.id)
    .eq('symbol', position.symbol)
    .neq('status', 'draft')
    .neq('status', 'previewed')
    .order('created_at', { ascending: true })
    .limit(50);
  const orderRows = (ordersRes.data ?? []) as Record<string, unknown>[];
  const ids = orderRows.map((r) => String(r.id));
  const [fills, events] = await Promise.all([fillsFor(ids), orderEvents(ids)]);
  const orders = orderRows.map((r) => toOrderRow(r, fills, events));

  const debrief = await db
    .from('debriefs')
    .select('id')
    .eq('user_id', ctx.user.id)
    .eq('position_id', ctx.params.id)
    .maybeSingle();

  // --- plan vs now -------------------------------------------------------
  const planVsNow = [
    {
      label: 'Entry',
      planned: plan?.entry === null || plan?.entry === undefined ? 'not set' : `$${plan.entry}`,
      now: `$${position.avg_cost}`,
      semantic:
        plan?.entry == null
          ? ('neutral' as const)
          : Math.abs(position.avg_cost - plan.entry) / plan.entry > 0.01
            ? ('risk' as const)
            : ('positive' as const),
    },
    {
      label: 'Exit if wrong',
      planned: position.stop === null ? 'not set' : `$${position.stop}`,
      now: position.mark_price === null ? 'no price' : `$${position.mark_price}`,
      semantic: position.health === 'at_risk' ? ('risk' as const) : ('neutral' as const),
    },
    {
      label: 'Target',
      planned: position.target === null ? 'not set' : `$${position.target}`,
      now:
        position.mark_price === null || position.target === null
          ? 'unknown'
          : `${round2(Math.abs(position.target - position.mark_price))} away`,
      semantic: 'positive' as const,
    },
  ];

  // --- monitoring rows attached to this position -------------------------
  const monitoring: MonitoringRow[] = orders
    .filter((o) => o.resting && o.bracket_role)
    .map((o) => ({
      id: o.id,
      kind: 'position' as const,
      type: 'position' as const,
      symbol: o.symbol,
      condition_plain:
        o.bracket_role === 'stop'
          ? `${o.symbol} falls to $${o.stop_price}`
          : `${o.symbol} reaches $${o.limit_price}`,
      value_plain: position.mark_price === null ? 'no current price' : `now $${position.mark_price}`,
      route: `/position/${position.id}`,
      position_id: position.id,
      alert_id: null,
      monitoring: 'armed_delayed' as const,
      monitoring_plain:
        position.exit_style === 'auto'
          ? 'Armed against delayed prices. It executes when the level is reached on a delayed print.'
          : 'Watched against delayed prices. You get a notification with one-tap close — this is not automatic protection.',
    }));

  const actions: PlainAction[] = closed
    ? [
        {
          action: 'debrief',
          label: debrief.data ? 'Read the debrief' : "Get Kai's debrief",
          route: debrief.data ? `/debrief/${String((debrief.data as Record<string, unknown>).id)}` : null,
          primary: true,
          enabled: true,
          hint: null,
        },
        { action: 'ask_kai', label: 'Ask Kai', route: null, primary: false, enabled: true, hint: null },
      ]
    : [
        { action: 'exit_now', label: 'Exit now', route: null, primary: position.health === 'at_risk', enabled: true, hint: null },
        { action: 'adjust_stop', label: 'Move the stop', route: plan ? `/plan/${plan.id}` : null, primary: false, enabled: Boolean(plan), hint: plan ? null : 'This position has no plan behind it.' },
        { action: 'ask_kai', label: 'Ask Kai', route: null, primary: position.health !== 'at_risk', enabled: true, hint: null },
        { action: 'open_symbol', label: `Open ${position.symbol}`, route: `/symbol/${position.symbol}`, primary: false, enabled: true, hint: null },
      ];

  return ok(
    PositionDetailResponse.parse({
      position,
      closed,
      realized_pnl: meta.realized_pnl === null || meta.realized_pnl === undefined ? null : Number(meta.realized_pnl),
      closed_at: (meta.closed_at as string) ?? null,
      plan,
      plan_vs_now: planVsNow,
      orders,
      monitoring,
      history: await decisionChain({ userId: ctx.user.id, symbol: position.symbol, limit: 20 }),
      debrief_id: debrief.data ? String((debrief.data as Record<string, unknown>).id) : null,
      actions,
      quote: await getQuote(position.symbol),
      paper_plain: PAPER_FILL_PLAIN,
    })
  );
});
