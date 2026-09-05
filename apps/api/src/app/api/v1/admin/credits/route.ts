/**
 * GET /api/v1/admin/credits — who is using what, and whether it makes money.
 *
 * The companion to `/admin/spend`. That one answers "what did Kai cost"; this
 * one answers the four questions the owner cannot get anywhere else:
 *
 *   1. WHO IS NEAR THEIR LIMIT — today's balance per person, worst first.
 *   2. WHAT THE FREE TIER IS COSTING — and, more useful than the total, how
 *      many free accounts actually finish their ten credits versus how many
 *      ask one question and leave. Ten a day is generous or expensive
 *      depending entirely on that split, and it cannot be tuned blind.
 *   3. MARGIN PER PERSON — credits taken against dollars really spent. The
 *      dollars come from `kai_model_usage`, which has real `cost_usd`, so this
 *      is measured and not modelled.
 *   4. WHAT THE CACHE-NEUTRAL RULE COSTS US — the gap between what people were
 *      billed for and what actually left. We absorb the cold-start premium on
 *      purpose; this is the line that says how big that decision is.
 *
 * It also reports whether each plan's daily allowance FITS INSIDE its monthly
 * ceiling at what a credit currently costs. That is the number that decides
 * whether Pro at 40 credits a day is safe, and it moves when the model routing
 * moves, so it is measured on every read rather than written down anywhere.
 *
 * READ-ONLY, and staff-only. All three credit tables have RLS on with no
 * policies, so this route and the service role are the only doors to them.
 *
 * Query: ?days=N (1-90, default 14).
 */
import type { NextRequest } from 'next/server';
import { serviceClient } from '@/lib/db';
import { ok, staffed, type StaffCtx } from '@/lib/http';
import { writeAudit } from '@/lib/admin/audit';
import { measureBasis } from '@/lib/kai/credits';
import {
  PLANS,
  TOPUP_PACK,
  UNITS_PER_CREDIT,
  ceilingOutlook,
  type Plan,
} from '@/lib/kai/plans';

export const dynamic = 'force-dynamic';

type PeriodRow = {
  user_id: string;
  period_key: string;
  period_start: string;
  period_end: string;
  plan_key: string;
  granted_credits: number;
  used_credits: number;
  used_units: number;
  cost_ceiling_usd: string | number | null;
};

type LedgerRow = {
  user_id: string;
  created_at: string;
  kind: string;
  credits: number;
  units: number | null;
  cost_usd: string | number | null;
};

type WalletRow = { user_id: string; topup_credits: number };

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round = (n: number, dp = 4) => Math.round(n * 10 ** dp) / 10 ** dp;

export const GET = staffed(async (req: NextRequest, ctx: StaffCtx) => {
  const raw = Number(new URL(req.url).searchParams.get('days') ?? 14);
  const days = Number.isFinite(raw) ? Math.min(90, Math.max(1, Math.trunc(raw))) : 14;
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const db = serviceClient();
  const [periodsRes, ledgerRes, walletsRes, basis] = await Promise.all([
    db
      .from('kai_credit_periods')
      .select('user_id,period_key,period_start,period_end,plan_key,granted_credits,used_credits,used_units,cost_ceiling_usd')
      .gte('period_start', since)
      .order('period_start', { ascending: false })
      .limit(50_000),
    db
      .from('kai_credit_ledger')
      .select('user_id,created_at,kind,credits,units,cost_usd')
      .gte('created_at', since)
      .limit(100_000),
    db.from('kai_credit_wallets').select('user_id,topup_credits').gt('topup_credits', 0).limit(10_000),
    measureBasis(ctx.requestId),
  ]);
  if (periodsRes.error) throw periodsRes.error;
  if (ledgerRes.error) throw ledgerRes.error;

  const periods = (periodsRes.data ?? []) as unknown as PeriodRow[];
  const ledger = (ledgerRes.data ?? []) as unknown as LedgerRow[];
  const wallets = (walletsRes.data ?? []) as unknown as WalletRow[];
  const topupByUser = new Map(wallets.map((w) => [w.user_id, num(w.topup_credits)]));

  // What each person really cost over the same window, straight off 0029.
  const usageRes = await db
    .from('kai_model_usage')
    .select('user_id,cost_usd,created_at')
    .gte('created_at', since)
    .limit(200_000);
  const realCost = new Map<string, number>();
  for (const r of (usageRes.data ?? []) as { user_id: string | null; cost_usd: string | number | null }[]) {
    if (!r.user_id) continue;
    realCost.set(r.user_id, (realCost.get(r.user_id) ?? 0) + num(r.cost_usd));
  }

  /* -- 1. today, per person ------------------------------------------- */
  const nowIso = new Date().toISOString();
  const current = periods.filter((p) => p.period_end > nowIso);
  const nearLimit = current
    .map((p) => {
      const topup = topupByUser.get(p.user_id) ?? 0;
      const total = num(p.granted_credits) + topup;
      const used = num(p.used_credits);
      return {
        user_id: p.user_id,
        plan: p.plan_key,
        day: p.period_key,
        granted: num(p.granted_credits),
        used,
        topup,
        remaining: Math.max(total - used, 0),
        pct_used: total > 0 ? Math.round((100 * used) / total) : 100,
        /** True when the ledger recorded a spend past zero — the in-flight
         *  question that was allowed to finish. Expected, and worth seeing. */
        overran: used > num(p.granted_credits) + topup,
      };
    })
    .sort((a, b) => b.pct_used - a.pct_used);

  /* -- 2. the free tier ------------------------------------------------ */
  const freeDays = new Map<
    string,
    { users: number; maxed: number; barely: number; credits: number; cost: number }
  >();
  for (const p of periods) {
    if (p.plan_key !== 'free') continue;
    const b = freeDays.get(p.period_key) ?? { users: 0, maxed: 0, barely: 0, credits: 0, cost: 0 };
    b.users += 1;
    if (num(p.used_credits) >= num(p.granted_credits)) b.maxed += 1;
    if (num(p.used_credits) <= 2) b.barely += 1;
    b.credits += num(p.used_credits);
    b.cost += realCost.get(p.user_id) ?? 0;
    freeDays.set(p.period_key, b);
  }

  /* -- 3. margin per person -------------------------------------------- */
  const byUser = new Map<string, { plan: string; credits: number; units: number; days: number }>();
  for (const p of periods) {
    const b = byUser.get(p.user_id) ?? { plan: p.plan_key, credits: 0, units: 0, days: 0 };
    b.plan = p.plan_key;
    b.credits += num(p.used_credits);
    b.units += num(p.used_units);
    b.days += 1;
    byUser.set(p.user_id, b);
  }
  const margin = [...byUser.entries()]
    .map(([userId, b]) => {
      const cost = realCost.get(userId) ?? 0;
      const plan = (PLANS as Record<string, Plan>)[b.plan];
      // A month's subscription apportioned over the window, so a 14-day view is
      // compared against 14 days of revenue rather than a whole month of it.
      const revenue = plan ? (plan.price_usd * b.days) / 30 : 0;
      return {
        user_id: userId,
        plan: b.plan,
        active_days: b.days,
        credits_used: b.credits,
        real_cost_usd: round(cost),
        apportioned_revenue_usd: round(revenue, 2),
        margin_usd: round(revenue - cost, 2),
        ceiling_usd: plan?.monthly_cost_ceiling_usd ?? null,
        /** Set when the month's real spend has already passed the plan's
         *  ceiling. This is the backstop having fired, not a bug. */
        over_ceiling:
          plan?.monthly_cost_ceiling_usd != null && cost > plan.monthly_cost_ceiling_usd,
      };
    })
    .sort((a, b) => b.real_cost_usd - a.real_cost_usd);

  /* -- 4. what the cache-neutral rule costs ----------------------------- */
  let billedUnits = 0;
  let trueCost = 0;
  let spendRows = 0;
  let flooredRows = 0;
  for (const r of ledger) {
    if (r.kind !== 'spend') continue;
    spendRows += 1;
    billedUnits += num(r.units);
    trueCost += num(r.cost_usd);
    if (num(r.units) === 0) flooredRows += 1;
  }
  // What the billed units WOULD have cost at the measured rate, against what
  // actually left. The gap is the cold-start premium we chose to absorb.
  const billedEquivalentUsd = (billedUnits / UNITS_PER_CREDIT) * basis.usd_per_credit;

  await writeAudit({
    actorUserId: ctx.user.id,
    action: 'admin.credits.read',
    targetKind: 'credits',
    targetId: null,
    requestId: ctx.requestId,
    ip: ctx.ip,
  });

  return ok({
    window_days: days,
    since,

    /**
     * WHAT A CREDIT IS COSTING RIGHT NOW, and therefore whether each plan's
     * daily allowance fits inside its monthly ceiling at full daily use. Full
     * use every day is the worst case and almost nobody does it — but it is
     * exactly the case the ceiling exists for.
     */
    basis: {
      usd_per_credit: basis.usd_per_credit,
      source: basis.source,
      questions_measured: basis.questions,
      clamped: basis.clamped,
      units_per_credit: UNITS_PER_CREDIT,
      plain:
        basis.source === 'measured'
          ? `A credit is currently costing $${basis.usd_per_credit.toFixed(4)}, measured over ${basis.questions} questions.`
          : `Not enough traffic yet to measure what a credit costs, so this is the last measured figure — $${basis.usd_per_credit.toFixed(4)}, from nine questions on Sonnet on 5 September.`,
    },
    plan_outlook: Object.values(PLANS).map((p) => {
      const o = ceilingOutlook(p, basis.usd_per_credit);
      return {
        plan: p.key,
        price_usd: p.price_usd,
        daily_credits: p.daily_credits,
        ...o,
        plain:
          o.ceiling_usd === null
            ? `${p.name} has no dollar ceiling — the ${p.daily_credits} credits a day are the whole limit. At full use that is about $${o.projected_usd} a month per account.`
            : o.fits
              ? `${p.name} at full use projects $${o.projected_usd} a month against a $${o.ceiling_usd} ceiling — $${o.headroom_usd} of room.`
              : `${p.name} at full use projects $${o.projected_usd} a month against a $${o.ceiling_usd} ceiling. The ceiling would stop a maximal user around day ${o.binds_on_day}.`,
      };
    }),

    near_limit: nearLimit.slice(0, 200),

    free_tier: {
      days: [...freeDays.entries()]
        .map(([day, b]) => ({
          day,
          free_users: b.users,
          maxed_out: b.maxed,
          barely_used: b.barely,
          credits_used: b.credits,
          real_cost_usd: round(b.cost),
          cost_per_free_user_usd: b.users ? round(b.cost / b.users, 5) : null,
        }))
        .sort((a, b) => (a.day < b.day ? 1 : -1)),
      /**
       * WHAT IT WOULD COST AT SCALE. Free is the only tier whose cost follows
       * signups instead of revenue, so the exposure is stated in dollars rather
       * than left to be discovered. The assumption is named: EVERY account
       * finishing all ten credits EVERY day, which no real population does.
       */
      projection: {
        assumption: 'every free account uses all 10 credits every day',
        per_user_per_month_usd: round(PLANS.free.daily_credits * 30 * basis.usd_per_credit, 2),
        at_1_000_users_usd: round(PLANS.free.daily_credits * 30 * basis.usd_per_credit * 1_000, 0),
        at_10_000_users_usd: round(PLANS.free.daily_credits * 30 * basis.usd_per_credit * 10_000, 0),
      },
    },

    margin: margin.slice(0, 200),

    cache_absorption: {
      spend_rows: spendRows,
      billed_units: Math.round(billedUnits),
      billed_equivalent_usd: round(billedEquivalentUsd),
      true_cost_usd: round(trueCost),
      absorbed_usd: round(trueCost - billedEquivalentUsd),
      /** Spends charged the one-credit floor because no usage row arrived in
       *  time. A handful is normal; a run of them means the ledger writes are
       *  falling behind and the charges are understated. */
      floored_charges: flooredRows,
      plain:
        spendRows === 0
          ? 'Nothing has been charged in this window yet.'
          : `People were billed for the equivalent of $${round(billedEquivalentUsd)} and the model actually cost $${round(trueCost)}. The $${round(trueCost - billedEquivalentUsd)} difference is the cold-start cache premium we absorb on purpose.`,
    },

    topup_pack: TOPUP_PACK,
    generated_at: new Date().toISOString(),
  });
});
