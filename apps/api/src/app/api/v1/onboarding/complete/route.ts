/**
 * POST /api/v1/onboarding/complete
 *
 * {goal_mode, starting_balance, risk_answer, involvement, experience} →
 * updates profiles, risk_policies (+ journal row), and the paper account
 * balance. Idempotent: a second call after completion returns the stored state
 * with `idempotent_replay:true` and changes nothing.
 */
import type { NextRequest } from 'next/server';
import {
  OnboardingCompleteRequest,
  OnboardingCompleteResponse,
  RISK_ANSWER_DAILY_LOSS_PCT,
  RISK_ANSWER_MAX_POSITION_PCT,
} from '@shared/api';
import { authed, ok, parseBody, type Ctx } from '@/lib/http';
import { serviceClient } from '@/lib/db';
import { ApiError } from '@/lib/errors';
import { emitUserEvent } from '@/lib/events';

export const dynamic = 'force-dynamic';

async function loadState(userId: string) {
  const db = serviceClient();
  const [profile, risk, account] = await Promise.all([
    db
      .from('profiles')
      .select('user_id,handle,display_name,primary_mode,experience,involvement,explanation_level,memory_enabled,timezone,onboarding')
      .eq('user_id', userId)
      .single(),
    db
      .from('risk_policies')
      .select('daily_loss_cap_usd,max_position_pct,max_open_positions,max_sector_concentration_pct,min_reward_risk,pdt_warnings')
      .eq('user_id', userId)
      .maybeSingle(),
    db
      .from('accounts')
      .select('id,kind,name,starting_balance,cash,equity')
      .eq('user_id', userId)
      .eq('kind', 'paper')
      .order('created_at' as never, { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  if (profile.error || !profile.data) {
    throw new ApiError('NOT_FOUND', 'We could not find your account yet. Try signing in again.');
  }
  return {
    profile: profile.data as Record<string, unknown>,
    risk: (risk.data ?? null) as Record<string, unknown> | null,
    account: (account.data ?? null) as Record<string, unknown> | null,
  };
}

function shape(state: Awaited<ReturnType<typeof loadState>>, replay: boolean) {
  const p = state.profile;
  const a = state.account;
  return OnboardingCompleteResponse.parse({
    profile: {
      user_id: p.user_id,
      handle: p.handle ?? null,
      display_name: p.display_name ?? null,
      primary_mode: p.primary_mode,
      experience: p.experience,
      involvement: p.involvement,
      explanation_level: p.explanation_level,
      memory_enabled: p.memory_enabled,
      timezone: p.timezone ?? null,
      onboarding: (p.onboarding ?? {}) as Record<string, unknown>,
    },
    risk_policy: {
      daily_loss_cap_usd: num(state.risk?.daily_loss_cap_usd),
      max_position_pct: num(state.risk?.max_position_pct),
      max_open_positions: num(state.risk?.max_open_positions),
      max_sector_concentration_pct: num(state.risk?.max_sector_concentration_pct),
      min_reward_risk: num(state.risk?.min_reward_risk),
      pdt_warnings: state.risk?.pdt_warnings === null || state.risk?.pdt_warnings === undefined ? null : Boolean(state.risk.pdt_warnings),
    },
    account: a
      ? {
          id: a.id,
          kind: a.kind,
          name: a.name,
          starting_balance: num(a.starting_balance),
          cash: num(a.cash),
          equity: num(a.equity),
        }
      : { id: '', kind: 'paper', name: 'Paper account', starting_balance: null, cash: null, equity: null },
    idempotent_replay: replay,
  });
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export const POST = authed(async (req: NextRequest, ctx: Ctx) => {
  const body = await parseBody(req, OnboardingCompleteRequest);
  const db = serviceClient();

  const before = await loadState(ctx.user.id);
  const onboarding = (before.profile.onboarding ?? {}) as Record<string, unknown>;
  if (onboarding.completed_at) {
    return ok(shape(before, true));
  }

  const dailyLossCap = Math.round(body.starting_balance * RISK_ANSWER_DAILY_LOSS_PCT[body.risk_answer] * 100) / 100;
  const maxPositionPct = RISK_ANSWER_MAX_POSITION_PCT[body.risk_answer];
  const completedAt = new Date().toISOString();

  const { error: pErr } = await db
    .from('profiles')
    .update({
      primary_mode: body.goal_mode,
      experience: body.experience,
      involvement: body.involvement,
      explanation_level: body.experience,
      onboarding: {
        ...onboarding,
        completed_at: completedAt,
        goal_mode: body.goal_mode,
        risk_answer: body.risk_answer,
        practice_choice: body.practice_choice,
        starting_balance: body.starting_balance,
        version: 'v1-slice',
      },
    })
    .eq('user_id', ctx.user.id);
  if (pErr) throw new ApiError('INTERNAL', 'We could not save your setup. Please try again.', { detail: pErr.message });

  const { error: rErr } = await db
    .from('risk_policies')
    .upsert(
      {
        user_id: ctx.user.id,
        daily_loss_cap_usd: dailyLossCap,
        max_position_pct: maxPositionPct,
        max_open_positions: body.involvement === 'hands_on' ? 5 : 3,
        min_reward_risk: 1.5,
        pdt_warnings: true,
        updated_by: 'api',
      },
      { onConflict: 'user_id' }
    );
  if (rErr) throw new ApiError('INTERNAL', 'We could not save your risk settings. Please try again.', { detail: rErr.message });

  // Append-only journal (01 §2).
  await db.from('risk_policy_events').insert({
    user_id: ctx.user.id,
    change: {
      source: 'onboarding',
      risk_answer: body.risk_answer,
      daily_loss_cap_usd: dailyLossCap,
      max_position_pct: maxPositionPct,
      starting_balance: body.starting_balance,
      at: completedAt,
    },
  });

  if (before.account?.id) {
    const { error: aErr } = await db
      .from('accounts')
      .update({
        starting_balance: body.starting_balance,
        cash: body.starting_balance,
        buying_power: body.starting_balance,
        equity: body.starting_balance,
      })
      .eq('id', before.account.id as string)
      .eq('user_id', ctx.user.id);
    if (aErr) throw new ApiError('INTERNAL', 'We could not set up your practice account. Please try again.', { detail: aErr.message });
  }

  await emitUserEvent(
    ctx.user.id,
    'system',
    'profile',
    ctx.user.id,
    { event: 'onboarding_completed', goal_mode: body.goal_mode, daily_loss_cap_usd: dailyLossCap },
    ctx.requestId
  );

  const after = await loadState(ctx.user.id);
  return ok(shape(after, false));
});
