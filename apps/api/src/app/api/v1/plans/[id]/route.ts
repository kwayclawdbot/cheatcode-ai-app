/**
 * GET /api/v1/plans/:id
 *
 * The plan tab of the workspace and the `/plan/[id]` screen: the levels, the
 * size the user's own rules allow, the two outcomes in dollars, what today's
 * risk budget has left, and the one primary action ("Review order").
 */
import type { NextRequest } from 'next/server';
import { PAPER_FILL_PLAIN, PlanResponse } from '@shared/api';
import { authedParams, ok, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { serviceClient } from '@/lib/db';
import { getQuote } from '@/lib/market/polygon';
import { loadRiskPolicy } from '@/lib/kai/context';
import { loadPaperAccount } from '@/lib/execution/engine';
import { dailyRisk } from '@/lib/execution/risk';
import { PLAN_COLUMNS, exitStylePlain, planActions, planEvents, toPlanRow } from '@/lib/execution/plans';
import { decisionChain } from '@/lib/execution/chain';
import { ensureDevTicker } from '@/lib/execution/tick-dev';

export const dynamic = 'force-dynamic';

export const GET = authedParams<{ id: string }>(async (_req: NextRequest, ctx: Ctx & { params: { id: string } }) => {
  ensureDevTicker();
  const db = serviceClient();

  const found = await db
    .from('trade_plans')
    .select(PLAN_COLUMNS)
    .eq('user_id', ctx.user.id)
    .eq('id', ctx.params.id)
    .maybeSingle();
  const row = found.data as Record<string, unknown> | null;
  if (!row) throw new ApiError('NOT_FOUND', 'I could not find that plan.');

  const [policy, account] = await Promise.all([loadRiskPolicy(ctx.user.id), loadPaperAccount(ctx.user.id)]);
  const plan = toPlanRow(row, policy, account?.equity ?? null);

  const [risk, events, history, quote] = await Promise.all([
    dailyRisk(ctx.user.id, policy?.daily_loss_cap_usd ?? null),
    planEvents(ctx.params.id),
    decisionChain({ userId: ctx.user.id, symbol: plan.symbol, limit: 12 }),
    getQuote(plan.symbol),
  ]);

  return ok(
    PlanResponse.parse({
      plan,
      daily_risk: risk,
      events,
      history,
      actions: planActions(plan),
      stop_attaches_plain: exitStylePlain(plan.exit_style),
      paper_plain: PAPER_FILL_PLAIN,
      quote,
    })
  );
});
