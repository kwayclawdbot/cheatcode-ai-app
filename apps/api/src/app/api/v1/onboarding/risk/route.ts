/**
 * POST /api/v1/onboarding/risk — the risk answer, given at the moment it means
 * something.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THERE IS A SECOND ROUTE INSTEAD OF ONE MORE FIELD ON /onboarding/complete
 * ─────────────────────────────────────────────────────────────────────────────
 * Audit F01: "Ask risk questions before paper execution", not during signup.
 * The screen that asks is a good screen — it quotes the cap in the member's own
 * money — and it used to run third of six, before that money existed and before
 * they had seen a price in the app. Moving it means signup can finish without
 * an answer, so there has to be somewhere to send the answer afterwards. This
 * is that place.
 *
 * `/onboarding/complete` is deliberately not that place. It is idempotent by
 * contract: a second call returns the stored state with `idempotent_replay:
 * true` and changes NOTHING. That is exactly right for a signup that must not
 * be re-run and exactly wrong for a setting somebody may change three times in
 * their first week, so the two live apart.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT WRITES, AND THE ONE FLAG THAT MATTERS
 * ─────────────────────────────────────────────────────────────────────────────
 * The policy columns, the append-only journal row that 01 §2 requires beside
 * any risk change, and `onboarding.risk_confirmed = true`.
 *
 * That last flag is the whole reason the split is honest rather than a
 * loophole. Every account has a risk policy from the moment it is created —
 * `complete_onboarding` cannot leave one out — so without a flag there is no
 * way to tell a cap somebody CHOSE from the default they were given. The app
 * needs that difference twice: to know whether to ask before the first paper
 * order (`features/onboarding/risk-gate.ts`), and to describe the current cap
 * honestly rather than as a decision nobody made.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE CAP IS DERIVED HERE AND NOT SENT
 * ─────────────────────────────────────────────────────────────────────────────
 * The body carries the WORD — careful / balanced / aggressive — and the server
 * turns it into dollars against the account's own starting balance, using the
 * same `RISK_ANSWER_DAILY_LOSS_PCT` table `/onboarding/complete` uses. A client
 * that sent a number would be choosing its own limits, which is the one thing a
 * risk policy exists to stop.
 */
import { z } from 'zod';
import { RISK_ANSWER_DAILY_LOSS_PCT, RISK_ANSWER_MAX_POSITION_PCT } from '@shared/api';
import { authed, ok, parseBody, type Ctx } from '@/lib/http';
import { serviceClient } from '@/lib/db';
import { ApiError } from '@/lib/errors';
import { log } from '@/lib/log';

export const dynamic = 'force-dynamic';

const Body = z.object({
  risk_answer: z.enum(['careful', 'balanced', 'aggressive']),
});

export const POST = authed(async (req, ctx: Ctx) => {
  const body = await parseBody(req, Body);
  const db = serviceClient();

  const [profile, account] = await Promise.all([
    db.from('profiles').select('user_id,onboarding').eq('user_id', ctx.user.id).maybeSingle(),
    db
      .from('accounts')
      .select('starting_balance,cash')
      .eq('user_id', ctx.user.id)
      .eq('kind', 'paper')
      .order('created_at' as never, { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  if (profile.error || !profile.data) {
    throw new ApiError('NOT_FOUND', 'We could not find your account yet. Try signing in again.');
  }

  /**
   * The balance the cap is a percentage OF.
   *
   * `starting_balance` and not `cash`: a cap that shrank every time somebody
   * took a loss would tighten exactly when they were least able to notice, and
   * a cap that grew with a good week would loosen for the same reason. The
   * number the member agreed to on the screen is a percentage of the account
   * they opened, which is what the screen showed them.
   *
   * A missing account means the paper provisioning trigger has not run yet.
   * That is a real state on a seconds-old signup, and it must not become a cap
   * computed against zero — refuse and let the app ask again.
   */
  const starting = Number((account.data as { starting_balance?: unknown } | null)?.starting_balance);
  if (!Number.isFinite(starting) || starting <= 0) {
    throw new ApiError('STATE_CONFLICT', 'Your practice account is still being set up. Try again in a moment.');
  }

  const dailyLossCap = Math.round(starting * RISK_ANSWER_DAILY_LOSS_PCT[body.risk_answer] * 100) / 100;
  const maxPositionPct = RISK_ANSWER_MAX_POSITION_PCT[body.risk_answer];

  const { error: policyError } = await db.from('risk_policies').upsert(
    {
      user_id: ctx.user.id,
      daily_loss_cap_usd: dailyLossCap,
      max_position_pct: maxPositionPct,
      updated_by: 'user',
    },
    { onConflict: 'user_id' },
  );
  if (policyError) {
    throw new ApiError('INTERNAL', 'We could not save that. Please try again.', { detail: policyError.message });
  }

  // 01 §2 — a risk change is journalled, always. `risk_policy_events` is
  // append-only (0026 revokes UPDATE and DELETE on it), so this row is the
  // permanent record of who set what and when.
  await db.from('risk_policy_events').insert({
    user_id: ctx.user.id,
    change: {
      source: 'risk_before_first_order',
      risk_answer: body.risk_answer,
      daily_loss_cap_usd: dailyLossCap,
      max_position_pct: maxPositionPct,
      starting_balance: starting,
      at: new Date().toISOString(),
    },
  });

  // Merged, never replaced: `onboarding` also holds the completion stamp, the
  // focus list and the experience word, and writing the object wholesale would
  // wipe them. That mistake is called out in `lib/session.tsx`'s own header.
  const bag = ((profile.data as { onboarding?: Record<string, unknown> | null }).onboarding ?? {}) as Record<string, unknown>;
  const { error: profileError } = await db
    .from('profiles')
    .update({
      onboarding: { ...bag, risk_answer: body.risk_answer, risk_confirmed: true },
    })
    .eq('user_id', ctx.user.id);
  if (profileError) {
    throw new ApiError('INTERNAL', 'We could not save that. Please try again.', { detail: profileError.message });
  }

  log('info', ctx.requestId, 'onboarding.risk.confirmed', { risk_answer: body.risk_answer });

  return ok({
    risk_answer: body.risk_answer,
    daily_loss_cap_usd: dailyLossCap,
    max_position_pct: maxPositionPct,
    confirmed: true,
    plain: `Set. A bad day stops at $${Math.round(dailyLossCap).toLocaleString('en-US')} on your practice account.`,
  });
});
