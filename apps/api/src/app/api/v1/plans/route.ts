/**
 * POST /api/v1/plans
 *
 * From a setup (`{setup_id}`) or by hand (`{symbol, side, entry, stop, targets}`).
 * The server computes the size suggestion from the user's own risk policy and
 * their paper equity, so the number the client shows is the number the preview
 * will later check against — two surfaces can never disagree about how much
 * risk a plan carries.
 *
 * A new plan is `draft`: written down, not armed. Nothing watches it and
 * nothing can fill until it is activated.
 */
import type { NextRequest } from 'next/server';
import {
  CreatePlanRequest,
  PAPER_FILL_PLAIN,
  PlanResponse,
  type PositionEffect,
  type SetupTarget,
} from '@shared/api';
import { authed, ok, parseBody, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { serviceClient } from '@/lib/db';
import { emitUserEvent } from '@/lib/events';
import { getQuote } from '@/lib/market/polygon';
import { loadProfile, loadRiskPolicy, normalizeTargets, entryPrice, invalidationPrice } from '@/lib/kai/context';
import { loadPaperAccount } from '@/lib/execution/engine';
import { dailyRisk } from '@/lib/execution/risk';
import {
  PLAN_COLUMNS,
  appendPlanEvent,
  defaultExitStyle,
  exitStylePlain,
  planActions,
  planEvents,
  planSize,
  toPlanRow,
} from '@/lib/execution/plans';
import { decisionChain } from '@/lib/execution/chain';
import { PlanRpcError, plainForRpcError, rpcCreatePlan } from '@/lib/execution/adapter';
import { ensureDevTicker } from '@/lib/execution/tick-dev';

export const dynamic = 'force-dynamic';

export const POST = authed(async (req: NextRequest, ctx: Ctx) => {
  ensureDevTicker();
  const body = await parseBody(req, CreatePlanRequest);
  const db = serviceClient();
  const profile = await loadProfile(ctx.user.id);

  let symbol = body.symbol?.toUpperCase() ?? null;
  let intent: PositionEffect = body.side ?? 'buy_to_open';
  let entry = body.entry ?? null;
  let stop = body.stop ?? null;
  let targets: SetupTarget[] = normalizeTargets(body.targets ?? []);
  let mode = body.mode ?? profile.primary_mode;
  let setupId: string | null = null;
  let roomId: string | null = null;

  if (body.setup_id) {
    const { data } = await db
      .from('setups')
      .select('id,symbol,mode,intent,entry_condition,invalidation,stop,targets,discussion_room_id,thesis_plain,state')
      .eq('id', body.setup_id)
      .maybeSingle();
    const setup = data as Record<string, unknown> | null;
    if (!setup) throw new ApiError('NOT_FOUND', 'I could not find that setup to build a plan from.');
    setupId = String(setup.id);
    symbol = symbol ?? String(setup.symbol);
    intent = body.side ?? (String(setup.intent) as PositionEffect);
    mode = body.mode ?? (String(setup.mode) as typeof mode);
    entry = entry ?? entryPrice(setup.entry_condition);
    stop = stop ?? (setup.stop === null || setup.stop === undefined ? invalidationPrice(setup.invalidation) : Number(setup.stop));
    if (!targets.length) targets = normalizeTargets(setup.targets);
    roomId = (setup.discussion_room_id as string) ?? null;
  }

  if (!symbol) throw new ApiError('VALIDATION_FAILED', 'Tell me which symbol this plan is for.');

  const known = await db.from('instruments').select('symbol').eq('symbol', symbol).maybeSingle();
  if (!known.data) throw new ApiError('NOT_FOUND', `I do not follow ${symbol} yet, so I cannot plan a trade on it.`);

  // No entry level? Use the last delayed print — and say that is what it is.
  const quote = await getQuote(symbol);
  if (entry === null) entry = quote.price;

  const exitStyle = body.exit_style ?? defaultExitStyle(profile.involvement);

  // The size the user's own rules allow. 0020 computes NOTHING about size — the
  // policy lives here, so one number reaches the plan, the preview and the app.
  const [policyPre, accountPre] = await Promise.all([loadRiskPolicy(ctx.user.id), loadPaperAccount(ctx.user.id)]);
  const sized = planSize(entry, stop, targets, policyPre, accountPre?.equity ?? null, body.size ?? null);

  const patch = {
    setup_id: setupId,
    mode,
    symbol,
    intent,
    entry,
    entry_condition: entry === null ? null : { type: 'price_cross', level: entry, hold: true },
    invalidation: stop === null ? null : { type: 'close_below', level: stop },
    stop,
    targets: targets.map((t) => ({ label: t.label ?? 'Target', level: t.price })),
    size: { shares: sized.shares, max_loss_usd: sized.max_loss_usd, notional: sized.notional },
    exit_style: exitStyle,
    status: 'draft',
    origin: {
      source: body.setup_id ? 'setup' : 'manual',
      setup_id: setupId,
      room_id: roomId,
      created_at: new Date().toISOString(),
    },
  };

  // Preferred: SCHEMA-3's `create_plan` — plan + plan_events + user_events in
  // one transaction, with the orientation validated in the database so a stop
  // on the wrong side of the entry can never be written at all.
  let viaRpc;
  try {
    viaRpc = await rpcCreatePlan({ userId: ctx.user.id, patch, requestId: ctx.requestId });
  } catch (e) {
    if (e instanceof PlanRpcError) {
      throw new ApiError(
        'VALIDATION_FAILED',
        plainForRpcError(e.message, 'Those levels do not make a plan I can write. Check the entry, the stop and the target.')
      );
    }
    throw e;
  }

  let planId: string;
  if (viaRpc.used) {
    planId = String(viaRpc.data.id);
  } else {
    const inserted = await db
      .from('trade_plans')
      .insert({
        user_id: ctx.user.id,
        setup_id: setupId,
        mode,
        status: 'draft',
        symbol,
        intent,
        entry_condition: patch.entry_condition as never,
        invalidation: patch.invalidation as never,
        stop,
        targets: targets as never,
        size: patch.size as never,
        scenarios: null,
        exit_style: exitStyle,
        origin: patch.origin as never,
      })
      .select('id')
      .single();
    if (inserted.error || !inserted.data) {
      throw new ApiError('INTERNAL', 'We could not write that plan. Please try again.', { detail: inserted.error?.message });
    }
    planId = String((inserted.data as Record<string, unknown>).id);
    await appendPlanEvent(planId, ctx.user.id, 'created', {
      plain: `Plan written for ${symbol}. Nothing is armed and nothing can fill until you say so.`,
      entry,
      stop,
      targets,
      exit_style: exitStyle,
    });
    await emitUserEvent(ctx.user.id, 'plan_event', 'plan', planId, { event: 'created', symbol, entry, stop }, ctx.requestId);
  }

  const fresh = await db.from('trade_plans').select(PLAN_COLUMNS).eq('id', planId).single();
  const plan = toPlanRow(fresh.data as Record<string, unknown>, policyPre, accountPre?.equity ?? null);
  const risk = await dailyRisk(ctx.user.id, policyPre?.daily_loss_cap_usd ?? null);

  return ok(
    PlanResponse.parse({
      plan,
      daily_risk: risk,
      events: await planEvents(planId),
      history: await decisionChain({ userId: ctx.user.id, symbol, limit: 12 }),
      actions: planActions(plan),
      stop_attaches_plain: exitStylePlain(plan.exit_style),
      paper_plain: PAPER_FILL_PLAIN,
      quote,
    }),
    { status: 201 }
  );
});
