/**
 * THE DOOR ON KAI. Ask before, charge after, and never take the answer away.
 *
 * THE GAP THIS FILLS. Until this file existed there was NO LIMIT of any kind on
 * how much of Kai one account could use. `usage.ts` wrote down what every call
 * cost, which meant the owner could see the damage — after it happened. Nothing
 * could stop it. One script, one shared login, one loop.
 *
 * ---------------------------------------------------------------------------
 * WHERE THIS SITS, AND WHY IT IS NOT IN `stream.ts`
 * ---------------------------------------------------------------------------
 * At the ROUTE. One question is one charge, and one question can make up to
 * five model calls — the answer, the tool lookups, an object retry, the chart
 * recovery pass. Charging inside the call would bill someone five times for
 * asking once. The route is the only place that knows where a question begins
 * and ends.
 *
 * ---------------------------------------------------------------------------
 * FOUR RULES, ALL OF THEM ABOUT NOT DOING HARM
 * ---------------------------------------------------------------------------
 * 1. CHECK BEFORE, CHARGE AFTER. The balance is read before the model runs and
 *    the credits come off once the answer is finished.
 * 2. AN IN-FLIGHT QUESTION ALWAYS FINISHES. Nothing here can interrupt a reply
 *    that has started. The charge may take somebody past zero; that is correct,
 *    and much better than an answer they read and were then told they did not
 *    have.
 * 3. A FAILURE HERE MUST NEVER COST SOMEBODY THEIR REPLY. Every function in
 *    this file fails OPEN. If the database is unreachable, the migration has
 *    not run, or the RPC throws, the message goes through and a loud line goes
 *    to the log. Denying a paying customer service because a table is down is
 *    worse than a few free answers. Same discipline `usage.ts` already uses.
 * 4. AN ANSWER THAT FAILED IS NOT CHARGED FOR. The route only charges when
 *    something was actually delivered.
 *
 * ---------------------------------------------------------------------------
 * THE TWO LIMITS ARE NOT THE SAME LIMIT
 * ---------------------------------------------------------------------------
 * The daily allowance is credits and resets every night. The monthly ceiling is
 * dollars and does not. Either can stop a question and they mean completely
 * different things when they do — "come back tomorrow" versus "this month has
 * cost more than the plan covers" — so they are separate reasons, with separate
 * words, all the way out to the screen.
 *
 * SERVER SIDE ONLY. There is no client-side check anywhere and there must not
 * be one. A check in the app is a suggestion.
 */
import { serviceClient } from '../db';
import { log } from '../log';
import { callRpc } from '../rpc';
import { chargeableUnits, creditsForUnits } from './plans';
import {
  BASIS_MIN_QUESTIONS,
  BASIS_WINDOW_DAYS,
  CREDIT_COPY,
  FALLBACK_USD_PER_CREDIT,
  PLANS,
  UNITS_PER_CREDIT,
  USD_PER_CREDIT_CAP,
  USD_PER_CREDIT_FLOOR,
  WARN_AT_PCT,
  type Plan,
  type PlanKey,
} from './plans';

/* ==================================================================== */
/* 1. Periods                                                            */
/* ==================================================================== */

/**
 * THE DAY BOUNDARY IS THE PERSON'S OWN, not the server's.
 *
 * A trader in Los Angeles whose credits reset at 5pm — which is what a UTC day
 * would do to them — is a product defect, not a rounding detail. So the day is
 * computed in `profiles.timezone` when the profile carries one.
 *
 * THAT OPENS ONE DOOR AND IT IS CLOSED IN THE DATABASE. A timezone is a
 * user-editable field, so in principle someone could move it forward to mint
 * tomorrow's credits early. `kai_credit_state` will not open a day key earlier
 * than the newest one this person already has, and the whole timezone range is
 * only 26 hours wide, so the most that trick can ever buy is a single day once
 * — after which they are simply ahead of themselves and get nothing more.
 */
function parts(now: Date, timezone: string | null): { y: number; m: number; d: number } {
  const tz = timezone && timezone.length ? timezone : 'UTC';
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const [y, m, d] = fmt.format(now).split('-').map(Number);
    return { y, m, d };
  } catch {
    // An unknown zone string is not a reason to fail; UTC is the honest default
    // and the person simply gets a UTC day.
    return { y: now.getUTCFullYear(), m: now.getUTCMonth() + 1, d: now.getUTCDate() };
  }
}

/** The offset that zone was at, at this instant, in minutes. */
function offsetMinutes(now: Date, timezone: string | null): number {
  const tz = timezone && timezone.length ? timezone : 'UTC';
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const p = Object.fromEntries(dtf.formatToParts(now).map((x) => [x.type, x.value]));
    const asUtc = Date.UTC(
      Number(p.year),
      Number(p.month) - 1,
      Number(p.day),
      Number(p.hour) % 24,
      Number(p.minute),
      Number(p.second)
    );
    return Math.round((asUtc - now.getTime()) / 60_000);
  } catch {
    return 0;
  }
}

const pad = (n: number) => String(n).padStart(2, '0');

export type Period = {
  kind: 'day';
  /** `2026-09-05` in the person's own timezone. The grant's idempotency key. */
  key: string;
  start: string;
  end: string;
  /** Start of the calendar month the ceiling is measured over. */
  ceilingSince: string;
  /** What the person is told, e.g. "tomorrow morning". */
  resetsOn: string;
};

export function periodFor(now: Date, timezone: string | null): Period {
  const { y, m, d } = parts(now, timezone);
  const off = offsetMinutes(now, timezone);
  const localMidnightUtcMs = Date.UTC(y, m - 1, d) - off * 60_000;
  const start = new Date(localMidnightUtcMs);
  const end = new Date(localMidnightUtcMs + 86_400_000);
  const monthStart = new Date(Date.UTC(y, m - 1, 1) - off * 60_000);
  return {
    kind: 'day',
    key: `${y}-${pad(m)}-${pad(d)}`,
    start: start.toISOString(),
    end: end.toISOString(),
    ceilingSince: monthStart.toISOString(),
    resetsOn: 'tomorrow morning',
  };
}

/** When the MONTHLY ceiling clears, said the way a person would say it. */
function ceilingClearsOn(now: Date, timezone: string | null): string {
  const { y, m } = parts(now, timezone);
  const next = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1));
  return `on ${next.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' })}`;
}

/* ==================================================================== */
/* 2. What a credit is costing right now                                 */
/* ==================================================================== */

export type CreditBasis = {
  usd_per_credit: number;
  source: 'measured' | 'fallback';
  questions: number;
  /** True when the measured figure was pushed into the sane band. */
  clamped: boolean;
};

type BasisRow = {
  model: string;
  questions: number;
  input_tokens: number;
  cache_read: number;
  cache_write: number;
  output_tokens: number;
  cost_usd: string | number;
};

/**
 * Reporting only — no allowance is derived from this. It answers "is the daily
 * allowance about to run into the monthly ceiling", which is the question the
 * owner cannot answer any other way.
 *
 * The database does the counting and this does the pricing, because there is
 * exactly one file allowed to know a rate and it is not a migration.
 */
export async function measureBasis(requestId = '-'): Promise<CreditBasis> {
  const since = new Date(Date.now() - BASIS_WINDOW_DAYS * 86_400_000).toISOString();
  const out = await callRpc<BasisRow[]>('kai_credit_basis', { p_since: since }, requestId);
  if (!out.ok) {
    return { usd_per_credit: FALLBACK_USD_PER_CREDIT, source: 'fallback', questions: 0, clamped: false };
  }
  const rows = out.data ?? [];
  let units = 0;
  let cost = 0;
  let questions = 0;
  for (const r of rows) {
    questions += Number(r.questions) || 0;
    const u = chargeableUnits(r.model, {
      input_tokens: Number(r.input_tokens) || 0,
      output_tokens: Number(r.output_tokens) || 0,
      cache_read_input_tokens: Number(r.cache_read) || 0,
      cache_creation_input_tokens: Number(r.cache_write) || 0,
    });
    // A model with no rate is a gap, not a zero: its tokens are left out of both
    // sides of the division rather than counted on one.
    if (u === null) continue;
    units += u;
    cost += Number(r.cost_usd) || 0;
  }
  const credits = units / UNITS_PER_CREDIT;
  if (questions < BASIS_MIN_QUESTIONS || credits <= 0 || cost <= 0) {
    return { usd_per_credit: FALLBACK_USD_PER_CREDIT, source: 'fallback', questions, clamped: false };
  }
  const raw = cost / credits;
  const clamped = Math.min(USD_PER_CREDIT_CAP, Math.max(USD_PER_CREDIT_FLOOR, raw));
  return {
    usd_per_credit: Math.round(clamped * 1_000_000) / 1_000_000,
    source: 'measured',
    questions,
    clamped: clamped !== raw,
  };
}

/* ==================================================================== */
/* 3. The balance                                                        */
/* ==================================================================== */

export type CreditState = {
  plan: Plan;
  period: Period;
  granted: number;
  used: number;
  /** Grant left today. Never negative on screen even when the ledger overran. */
  remaining: number;
  topup: number;
  /** Grant + purchased, which is what the person can actually still ask with. */
  available: number;
  spent_usd: number;
  ceiling_usd: number | null;
  /** 'allow' · 'out_of_credits' · 'ceiling' — the reason, never just a boolean. */
  verdict: 'allow' | 'out_of_credits' | 'ceiling';
  /** Kai's own words when the verdict is not `allow`. */
  refusal_plain: string | null;
  /** Set once 80% of the day is gone, and null before that. */
  warning_plain: string | null;
  pct_used: number;
  /**
   * True when we could not read the balance at all and let the message through
   * anyway. The route logs it; the admin view counts it.
   */
  degraded: boolean;
};

type StateRow = {
  period_id: string;
  granted_credits: number;
  used_credits: number;
  used_units: number;
  cost_ceiling_usd: string | number | null;
  topup_credits: number;
  used_today: number;
  spent_usd: string | number;
};

async function loadPlanAndZone(userId: string): Promise<{ plan: Plan; timezone: string | null }> {
  const db = serviceClient();
  const [sub, profile] = await Promise.all([
    db.from('subscriptions').select('tier,status').eq('user_id', userId).maybeSingle(),
    db.from('profiles').select('timezone').eq('user_id', userId).maybeSingle(),
  ]);
  const row = (sub.data ?? null) as { tier?: string; status?: string } | null;
  // A lapsed subscription is a free account. Same test `loadEntitlements` makes,
  // deliberately: two places must not disagree about who is paying.
  const active = row?.status === 'active' || row?.status === 'trialing';
  const key: PlanKey = !active
    ? 'free'
    : row?.tier === 'pro'
      ? 'pro'
      : row?.tier === 'vip' || row?.tier === 'premium'
        ? 'vip'
        : 'free';
  const tz = ((profile.data as Record<string, unknown> | null)?.timezone as string) ?? null;
  return { plan: PLANS[key], timezone: tz };
}

/** The state everything else is built from. Never throws. */
export async function creditState(userId: string, requestId = '-'): Promise<CreditState> {
  const now = new Date();
  let plan = PLANS.free;
  let timezone: string | null = null;
  try {
    const loaded = await loadPlanAndZone(userId);
    plan = loaded.plan;
    timezone = loaded.timezone;
  } catch (e) {
    log('warn', requestId, 'credits.plan_read_failed', {
      message: e instanceof Error ? e.message : String(e),
    });
  }
  const period = periodFor(now, timezone);
  const basis = await measureBasis(requestId);

  const out = await callRpc<StateRow>(
    'kai_credit_state',
    {
      p_user_id: userId,
      p_period_kind: 'day',
      p_period_key: period.key,
      p_period_start: period.start,
      p_period_end: period.end,
      p_plan_key: plan.key,
      p_granted_credits: plan.daily_credits,
      p_cost_ceiling_usd: plan.monthly_cost_ceiling_usd,
      p_basis_usd_per_credit: basis.usd_per_credit,
      p_basis_source: basis.source,
      p_day_start: period.start,
      p_ceiling_since: plan.monthly_cost_ceiling_usd === null ? null : period.ceilingSince,
    },
    requestId
  );

  if (!out.ok) {
    /**
     * FAIL OPEN, AND SAY SO LOUDLY. This is rule 3, and it is the single most
     * important line in the file. A missing migration or an unreachable
     * database must not turn into "Kai has stopped answering" for people who
     * are paying. The message goes through; the log carries the reason; the
     * admin view counts how often it happened.
     */
    log('error', requestId, 'credits.unavailable_allowing', {
      user_id: userId,
      plan: plan.key,
      reason: out.missing ? 'rpc_missing' : out.message,
    });
    return {
      plan,
      period,
      granted: plan.daily_credits,
      used: 0,
      remaining: plan.daily_credits,
      topup: 0,
      available: plan.daily_credits,
      spent_usd: 0,
      ceiling_usd: plan.monthly_cost_ceiling_usd,
      verdict: 'allow',
      refusal_plain: null,
      warning_plain: null,
      pct_used: 0,
      degraded: true,
    };
  }

  const row = out.data;
  const granted = Number(row.granted_credits) || 0;
  const used = Number(row.used_credits) || 0;
  const topup = Number(row.topup_credits) || 0;
  const spentUsd = Number(row.spent_usd) || 0;
  const ceiling = row.cost_ceiling_usd === null ? null : Number(row.cost_ceiling_usd);

  const remaining = Math.max(granted - used, 0);
  const available = remaining + topup;
  const pctUsed = granted + topup > 0 ? Math.round((100 * used) / (granted + topup)) : 100;

  // THE CEILING IS TESTED FIRST because it is the more serious of the two and
  // needs the more specific sentence. Someone with credits left who has run the
  // month's money out must not be told to come back tomorrow — tomorrow will
  // stop them too, and they would ask again and be refused again.
  let verdict: CreditState['verdict'] = 'allow';
  let refusal: string | null = null;
  if (ceiling !== null && spentUsd >= ceiling) {
    verdict = 'ceiling';
    refusal = CREDIT_COPY.ceilingHit(ceilingClearsOn(now, timezone));
  } else if (available <= 0) {
    verdict = 'out_of_credits';
    refusal = CREDIT_COPY.outOfCredits(plan, period.resetsOn);
  }

  const warning =
    verdict === 'allow' && pctUsed >= WARN_AT_PCT && available > 0
      ? CREDIT_COPY.warning(available, period.resetsOn, 'day')
      : null;

  return {
    plan,
    period,
    granted,
    used,
    remaining,
    topup,
    available,
    spent_usd: Math.round(spentUsd * 1_000_000) / 1_000_000,
    ceiling_usd: ceiling,
    verdict,
    refusal_plain: refusal,
    warning_plain: warning,
    pct_used: pctUsed,
    degraded: false,
  };
}

/* ==================================================================== */
/* 4. Charging for a finished answer                                     */
/* ==================================================================== */

type UsageRow = {
  model: string;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_input_tokens: number | null;
  cache_creation_input_tokens: number | null;
  cost_usd: string | number | null;
};

/**
 * READ WHAT THE QUESTION ACTUALLY CONSUMED, off 0029's own rows.
 *
 * `usage.ts` writes those rows fire-and-forget so that a ledger failure can
 * never break a reply — which is right, and means they can land a few
 * milliseconds after the answer finishes. So this looks, and if it sees nothing
 * it waits once and looks again.
 *
 * If they still are not there, THE QUESTION IS STILL CHARGED — one credit, the
 * minimum — and the ledger row says the charge was a floor rather than a
 * measurement. Charging nothing would be a free answer created by a race, and
 * charging a guessed larger number would be worse.
 */
async function usageFor(requestId: string): Promise<{ rows: UsageRow[]; waited: boolean }> {
  const db = serviceClient();
  const read = async () => {
    const { data } = await db
      .from('kai_model_usage')
      .select('model,input_tokens,output_tokens,cache_read_input_tokens,cache_creation_input_tokens,cost_usd')
      .eq('request_id', requestId);
    return (data ?? []) as unknown as UsageRow[];
  };
  let rows = await read();
  if (rows.length) return { rows, waited: false };
  await new Promise((r) => setTimeout(r, 400));
  rows = await read();
  return { rows, waited: true };
}

export type Charge = {
  credits: number;
  units: number;
  cost_usd: number | null;
  basis: 'measured' | 'floor';
};

/** What one finished question comes to. Exported so it can be tested directly. */
export function chargeFor(rows: UsageRow[]): Charge {
  let units = 0;
  let cost = 0;
  let priced = 0;
  for (const r of rows) {
    const u = chargeableUnits(r.model, {
      input_tokens: r.input_tokens,
      output_tokens: r.output_tokens,
      cache_read_input_tokens: r.cache_read_input_tokens,
      cache_creation_input_tokens: r.cache_creation_input_tokens,
    });
    if (u !== null) {
      units += u;
      priced += 1;
    }
    const c = r.cost_usd === null ? null : Number(r.cost_usd);
    if (c !== null && Number.isFinite(c)) cost += c;
  }
  if (!priced) return { credits: 1, units: 0, cost_usd: null, basis: 'floor' };
  return {
    credits: creditsForUnits(units),
    units: Math.round(units),
    cost_usd: Math.round(cost * 1_000_000) / 1_000_000,
    basis: 'measured',
  };
}

/**
 * Take the credits off. Called AFTER the answer has been delivered, so it can
 * never affect what the person saw.
 *
 * Never throws. A charge that cannot be written is logged and the answer stands
 * — the alternative is holding a reply hostage to a bookkeeping row.
 */
export async function chargeQuestion(opts: {
  userId: string;
  state: CreditState;
  requestId: string;
  conversationId?: string | null;
}): Promise<Charge | null> {
  try {
    if (opts.state.degraded) {
      // We never read a balance for this question, so there is no period row to
      // charge against. Logged rather than silently skipped.
      log('warn', opts.requestId, 'credits.charge_skipped_degraded', { user_id: opts.userId });
      return null;
    }
    const { rows, waited } = await usageFor(opts.requestId);
    const charge = chargeFor(rows);
    if (charge.basis === 'floor') {
      log('warn', opts.requestId, 'credits.charge_floored', {
        user_id: opts.userId,
        waited,
        rows: rows.length,
      });
    }

    const out = await callRpc<{ charged: number; reason?: string }>(
      'kai_credit_spend',
      {
        p_user_id: opts.userId,
        p_period_kind: opts.state.period.kind,
        p_period_key: opts.state.period.key,
        p_credits: charge.credits,
        p_units: charge.units,
        p_cost_usd: charge.cost_usd,
        p_request_id: opts.requestId,
        p_conversation_id: opts.conversationId ?? null,
        p_note: charge.basis === 'floor' ? 'minimum charge: no usage rows arrived' : null,
      },
      opts.requestId
    );
    if (!out.ok) {
      log('error', opts.requestId, 'credits.charge_failed', {
        user_id: opts.userId,
        reason: out.missing ? 'rpc_missing' : out.message,
      });
      return charge;
    }
    log('info', opts.requestId, 'credits.charged', {
      user_id: opts.userId,
      plan: opts.state.plan.key,
      credits: charge.credits,
      units: charge.units,
      cost_usd: charge.cost_usd,
      model_calls: rows.length,
    });
    return charge;
  } catch (e) {
    log('error', opts.requestId, 'credits.charge_threw', {
      message: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

/* ==================================================================== */
/* 5. Buying more                                                        */
/* ==================================================================== */

/**
 * Grant purchased credits. `sourceRef` is the Stripe event id and it carries a
 * unique index in the database, so a webhook Stripe retries five times grants
 * once. The function reports whether it actually granted rather than swallowing
 * the difference.
 */
export async function grantTopup(opts: {
  userId: string;
  credits: number;
  priceUsd: number;
  sourceRef: string;
  requestId?: string;
  note?: string;
}): Promise<boolean> {
  const out = await callRpc<{ granted: boolean; reason?: string }>(
    'kai_credit_topup',
    {
      p_user_id: opts.userId,
      p_credits: opts.credits,
      p_source_ref: opts.sourceRef,
      p_price_usd: opts.priceUsd,
      p_note: opts.note ?? null,
    },
    opts.requestId ?? '-'
  );
  if (!out.ok) {
    log('error', opts.requestId ?? '-', 'credits.topup_failed', {
      user_id: opts.userId,
      reason: out.missing ? 'rpc_missing' : out.message,
    });
    return false;
  }
  log('info', opts.requestId ?? '-', 'credits.topup', {
    user_id: opts.userId,
    credits: opts.credits,
    granted: out.data?.granted ?? false,
    reason: out.data?.reason ?? null,
  });
  return Boolean(out.data?.granted);
}

/* ==================================================================== */
/* 6. What the app is told                                               */
/* ==================================================================== */

/** The block `/me`, `/credits` and the SSE stream all send. One shape, one place. */
export function creditBlock(state: CreditState) {
  return {
    plan: state.plan.key,
    plan_name: state.plan.name,
    granted: state.granted,
    used: state.used,
    remaining: state.remaining,
    topup: state.topup,
    available: state.available,
    pct_used: state.pct_used,
    resets_at: state.period.end,
    // NEVER TOKENS AND NEVER DOLLARS. The person is shown credits and a plain
    // sentence about what a credit buys; the money is the owner's business.
    what_a_credit_is: CREDIT_COPY.what_a_credit_is,
    typical_runs_per_day: state.plan.typical_runs_per_day,
    warning_plain: state.warning_plain,
    blocked: state.verdict !== 'allow',
    blocked_reason: state.verdict === 'allow' ? null : state.verdict,
    blocked_plain: state.refusal_plain,
    trade_panel: state.plan.trade_panel,
  };
}
