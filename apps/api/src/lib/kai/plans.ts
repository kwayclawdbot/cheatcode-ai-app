/**
 * WHAT A PLAN COSTS AND WHAT IT BUYS. One file. Every number the owner may want
 * to change is in it, and nothing else in this codebase is allowed to hold one.
 *
 * There are now two price files and they answer different questions:
 *
 *   pricing.ts  what ANTHROPIC charges US for a thousand tokens.
 *   plans.ts    what WE charge a person, and what that entitles them to.
 *
 * This file never restates a model rate; it imports them. A rate change is
 * still a one-line edit in pricing.ts and every allowance below follows it.
 *
 * ===========================================================================
 * EVERY NUMBER IN HERE IS THE OWNER'S TO CHANGE.
 * ===========================================================================
 * The two subscription prices and their ceilings came from him. The free tier
 * and the top-up pack are PROPOSALS with the reasoning written next to them —
 * they are placeholders until he says otherwise.
 *
 * ---------------------------------------------------------------------------
 * WHAT THE OWNER SET, AND HOW THE TWO HALVES FIT
 * ---------------------------------------------------------------------------
 * He set each tier TWICE, in two different currencies, and both are enforced:
 *
 *   a DAILY ALLOWANCE in credits    — 10 free, about 25 runs on Pro, 50 on VIP
 *   a MONTHLY CEILING in dollars    — none on free, $10 on Pro, $20 on VIP
 *
 * The allowance is what the person plans around; the ceiling is what protects
 * the business. Credits are proportional to what a question really costs, so
 * the two normally agree - but they are separate limits, either can bind first,
 * and they say DIFFERENT things when they do. "You have used today's questions,
 * there are more tomorrow" and "this month has cost more than your plan covers"
 * need different actions from the person, so Kai never blurs them into one
 * sentence.
 *
 * ---------------------------------------------------------------------------
 * WHAT A CREDIT IS
 * ---------------------------------------------------------------------------
 * A fixed slice of the work one question causes, measured AS IF THE CACHE WERE
 * ALWAYS WARM:
 *
 *     chargeable units = input + cache_read x 0.1 + output x (out price / in price)
 *
 * `cache_creation` — the premium for being the first question of a session — is
 * excluded. It is a property of our cache, not of anything the person typed;
 * they cannot see it, cannot avoid it, and would not accept it as an
 * explanation. We absorb it, and the ledger records how much that came to.
 *
 * The user is billed cache-neutral. The tier's dollar ceiling is enforced on
 * TRUE cost, cache writes included. We eat the difference on purpose; the admin
 * view carries it as its own line so it can be watched rather than assumed.
 */
import { MODEL_RATES, rateFor } from './pricing';

/* ==================================================================== */
/* 1. The size of a credit                                              */
/* ==================================================================== */

/**
 * HOW MANY CHARGEABLE UNITS MAKE ONE CREDIT.
 *
 * CALIBRATED, NOT CHOSEN, AND RE-RUNNABLE. `scripts/credits-proof.mts` prints
 * the table this number was picked off; run it again when real traffic exists,
 * and change the number here if the shape has moved. Nothing else changes.
 *
 * Measured 2026-09-05 against every real question in `kai_model_usage` that a
 * credit is actually charged for — the chat path, not the background work
 * nobody asked for. Ten questions. Credits per question at each candidate size:
 *
 *     2,000 units    4 of 10 cost 1, dearest 6
 *     3,000 units    6 of 10 cost 1, dearest 4
 *     4,000 units    7 of 10 cost 1, dearest 3   <- this one
 *     5,000 units    7 of 10 cost 1, dearest 2
 *     6,000 units    9 of 10 cost 1, dearest 2
 *
 * 4,000 is where the owner's shape comes out: most questions cost one, and a
 * question that goes and looks several things up costs two or three. 6,000
 * flattens it until the number stops meaning anything; 2,000 spreads it to six,
 * which is more variation than anybody should have to hold in their head.
 *
 * THE SAMPLE IS TEN QUESTIONS AND THAT IS SAID PLAINLY RATHER THAN DRESSED UP.
 * It is enough to place the number and not enough to defend it to two
 * significant figures.
 *
 * ONE OUTLIER IS EXCLUDED AND IT IS NAMED. A single `chart_answer` request with
 * 57 model calls: that is the chart-vocabulary PROOF SCRIPT running a battery
 * under one request id, not a person asking a question. The proof script drops
 * anything over eight model calls for the same reason, and says so when it does.
 */
export const UNITS_PER_CREDIT = 4_000;

/**
 * ROUNDING GOES THE USER'S WAY, ALWAYS. A question worth 1.9 credits costs 1,
 * not 2. The floor is one: a question can never cost nothing, because a free
 * answer created by arithmetic rather than by a decision is a hole.
 *
 * We under-charge systematically as a result — measurably so, since the ledger
 * stores the units as well as the credits. That is the correct direction to be
 * wrong in, and the dollar ceiling is what stops it mattering.
 */
export function creditsForUnits(units: number): number {
  if (!Number.isFinite(units) || units <= 0) return 1;
  return Math.max(1, Math.floor(units / UNITS_PER_CREDIT));
}

/* ==================================================================== */
/* 2. Turning provider token counts into chargeable units               */
/* ==================================================================== */

export type UsageCounts = {
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_input_tokens: number | null;
  cache_creation_input_tokens: number | null;
};

/**
 * The output/input price ratio for a model, read from the one table that holds
 * rates. On every model currently priced this is 5 — Anthropic prices output at
 * five times input across the range — but it is read rather than assumed, so a
 * model that breaks the pattern prices correctly the day it is added.
 *
 * A model with no rate returns null: same rule as `costUsd`. An unknown model
 * is a gap to report, never a zero to fold in.
 */
export function outputRatio(model: string): number | null {
  const rate = rateFor(model);
  if (!rate || !rate.input_per_mtok) return null;
  return rate.output_per_mtok / rate.input_per_mtok;
}

/**
 * Chargeable units for ONE model call, or null when the model has no price and
 * the ratio is therefore unknowable.
 *
 * NOTE what is missing: `cache_creation_input_tokens`. That is the whole point
 * of this function and the reason it is not just a token sum.
 */
export function chargeableUnits(model: string, t: UsageCounts): number | null {
  const ratio = outputRatio(model);
  if (ratio === null) return null;
  if (t.input_tokens === null && t.output_tokens === null) return null;
  return (
    (t.input_tokens ?? 0) +
    (t.cache_read_input_tokens ?? 0) * 0.1 +
    (t.output_tokens ?? 0) * ratio
  );
}

/* ==================================================================== */
/* 3. The plans                                                          */
/* ==================================================================== */

export type PlanKey = 'free' | 'pro' | 'vip';

export type Plan = {
  key: PlanKey;
  /** What the person is shown and charged. */
  name: string;
  /** Billed monthly. The ALLOWANCE is daily; those are different things. */
  price_usd: number;

  /**
   * THE ALLOWANCE, AND IT IS DAILY ON EVERY TIER. It does not roll over.
   *
   * Daily on all three, not just on free, and that is deliberate: a daily grant
   * keeps the blast radius of a runaway loop or a shared login to one day for
   * everybody. A monthly grant means the first bad afternoon can take the whole
   * month with it.
   *
   * The numbers are DERIVED FROM MEASURED BEHAVIOUR, not chosen. The owner
   * asked for "about 20-30 runs a day" on Pro and 50 on VIP. Measured against
   * the ten real questions on record, a question costs on average 1.5 credits
   * (seven cost 1, one costs 2, two cost 3). So:
   *
   *     Pro   25 runs x 1.5 = 37.5  ->  40 credits a day
   *     VIP   50 runs x 1.5 = 75.0  ->  75 credits a day
   *
   * Round numbers, rounded UP from the arithmetic so the stated run count is
   * one the product can actually honour on an average day.
   */
  daily_credits: number;

  /**
   * WHAT THAT BUYS ON A TYPICAL DAY, and the word "typical" is load-bearing.
   * Credits are proportional to the work a question causes, so a day of simple
   * questions buys more than this and a day of heavy chart lookups buys fewer.
   * Every piece of copy built on this number says "about", and none of it
   * promises a count the system will not honour.
   */
  typical_runs_per_day: number;

  /**
   * THE HARD BACKSTOP, AND IT IS MONTHLY EVEN THOUGH THE ALLOWANCE IS DAILY.
   *
   * The owner sold the tiers on a dollar ceiling: $10 inside Pro, $20 inside
   * VIP. Credits are a good proxy for that cost and not a perfect one, so the
   * ceiling is enforced separately and directly on REAL DOLLARS — cache writes
   * included, because that is money that actually left. If someone reaches $10
   * on the 22nd, the ceiling stops them even though the day's credits are
   * untouched. That is the ceiling doing its job, and Kai says so in different
   * words from "you have used today's runs", because the two mean different
   * things and need different actions.
   *
   * NULL on free, which has no dollar ceiling behind it: ten credits a day IS
   * the whole limit there.
   */
  monthly_cost_ceiling_usd: number | null;

  /**
   * Whether this plan opens the Trade section. It is repeated in
   * `entitlement_flags` — which is what the routes actually read — and kept
   * here so the plan screen can describe the plan without a second query. If
   * the two ever disagree, THE FLAG WINS: it is the one on the enforcement
   * path.
   */
  trade_panel: boolean;

  /** Shown on the plan screen. Facts only — no promise about outcomes. */
  blurb: string;
};

/**
 * ALL THREE ARE THE OWNER'S NUMBERS.
 *
 *   Free  10 credits a day, community, no Trade section
 *   Pro   $59/month, about 25 runs a day, $10/month of model cost at most
 *   VIP   $99/month, about 50 runs a day, $20/month of model cost at most
 *
 * NOTHING ROLLS OVER. Unused credits expire at the day boundary on every tier.
 * A daily grant that banks up is a monthly grant with extra steps, and it gives
 * back exactly the blast radius the daily reset exists to contain.
 */
export const PLANS: Record<PlanKey, Plan> = {
  free: {
    key: 'free',
    name: 'Free',
    price_usd: 0,
    daily_credits: 10,
    typical_runs_per_day: 6,
    monthly_cost_ceiling_usd: null,
    trade_panel: false,
    blurb: 'Ten credits a day with Kai, and the community. The Trade section is on the paid plans.',
  },
  pro: {
    key: 'pro',
    name: 'Pro',
    price_usd: 59,
    daily_credits: 40,
    typical_runs_per_day: 25,
    monthly_cost_ceiling_usd: 10,
    trade_panel: true,
    blurb: 'About 25 questions a day with Kai, and the Trade section open.',
  },
  vip: {
    key: 'vip',
    name: 'VIP',
    price_usd: 99,
    daily_credits: 75,
    typical_runs_per_day: 50,
    monthly_cost_ceiling_usd: 20,
    trade_panel: true,
    blurb: 'About 50 questions a day, for when you do not want to count.',
  },
};

/**
 * The daily grant IS the daily cap on every tier now, so there is no second
 * number to keep in step with it. Kept as a function because the enforcement
 * path asks the question rather than assuming the answer.
 */
export function dailyCap(plan: Plan): number {
  return plan.daily_credits;
}

/** The monthly dollar ceiling behind a plan, or null when it has none. */
export function ceilingUsd(plan: Plan): number | null {
  return plan.monthly_cost_ceiling_usd;
}

/* ==================================================================== */
/* 4. The top-up pack                                                    */
/* ==================================================================== */

/**
 * STILL A PROPOSAL, AND STILL THE OWNER'S TO SET.
 *
 * WHAT IT IS FOR. The person who ran out today and does not want to wait for
 * tomorrow, and the Pro subscriber the monthly ceiling stopped on the 22nd. It
 * is not a cheaper way to buy the plan.
 *
 * THE PRICING. Pro is $59 for 40 credits a day, which is 1,200 credits over a
 * month - about 4.9 cents a credit. A top-up has to be dearer than that or it
 * undercuts the subscription, and not so dear it reads as a penalty. 100
 * credits for $9 is about 9 cents a credit, a little under twice the
 * subscription rate, which is the usual shape for buying overflow. 100 credits
 * is roughly two and a half extra Pro days, or ten free days.
 *
 * THEY DO NOT EXPIRE. The daily grant does; money does not. The two are held as
 * separate pots in the database and the grant is always spent first, so a reset
 * can never quietly destroy something that was paid for.
 */
export const TOPUP_PACK = {
  key: 'topup_100',
  name: 'Top-up',
  credits: 100,
  price_usd: 9,
  blurb: 'Extra credits that stay with you — they do not reset with the day.',
} as const;

/* ==================================================================== */
/* 5. Measuring what a credit actually costs                             */
/* ==================================================================== */

/**
 * THE ALLOWANCES ARE FIXED NUMBERS AND THIS IS NOT WHAT SETS THEM.
 *
 * It answers the other question, which the owner needs just as much: what is a
 * credit costing us right now, and does a tier's daily allowance fit inside its
 * monthly ceiling? That is a measurement, it moves when the model routing
 * moves, and it belongs on the admin screen rather than in anybody's head.
 */

/** How far back the measurement looks. */
export const BASIS_WINDOW_DAYS = 30;

/**
 * How many questions the window must contain before its answer is trusted.
 * Under this a couple of unusual questions would swing the figure, so the last
 * figure that WAS measured is shown instead and labelled as such.
 */
export const BASIS_MIN_QUESTIONS = 25;

/**
 * THE FALLBACK IS A MEASUREMENT, NOT A GUESS — AND IT IS THE PESSIMISTIC END OF
 * ONE ON PURPOSE.
 *
 * $0.0152 a credit is what nine real Sonnet questions on record actually cost,
 * measured 2026-09-05. The hosted database's five come out at $0.0138. Both ran
 * against a cold-ish cache, which is what a first session looks like and is the
 * expensive case.
 *
 * FOR SCALE, THE WARM FLOOR IS ABOUT HALF THAT. A credit is 4,000
 * input-equivalent tokens; on Sonnet at $2 per million that is $0.008 if every
 * one of them were fresh input, and a warm session is mostly cache reads at a
 * tenth. So the real range on Sonnet is roughly $0.008 to $0.015, and where a
 * given month lands inside it depends on how well the prompt cache is holding.
 *
 * HAIKU IS EXACTLY HALF, and that is derived rather than estimated: its input
 * rate in pricing.ts is $1 per million against Sonnet's $2, a credit is
 * denominated in input-equivalent units, and the output ratio is 5 on both — so
 * every term in the sum halves. Which model chat runs on and whether Pro fits
 * inside $10 are therefore THE SAME DECISION. `scripts/credits-proof.mts`
 * prints both, and the admin view measures it live.
 */
export const FALLBACK_USD_PER_CREDIT = 0.0152;

/**
 * The band a measured figure is clamped into, so one freak day cannot make the
 * admin screen say something absurd. The floor is roughly what a credit can
 * cost at best - a fully warm Haiku session - and the cap is comfortably above
 * anything measured.
 */
export const USD_PER_CREDIT_FLOOR = 0.003;
export const USD_PER_CREDIT_CAP = 0.02;

/**
 * What a plan's daily allowance would cost over a 30-day month at FULL daily
 * usage, and whether that fits inside its ceiling. Full usage every single day
 * is the worst case and almost nobody does it - but it is the case the ceiling
 * exists for, so it is the one worth showing.
 */
export function ceilingOutlook(plan: Plan, usdPerCredit: number) {
  const monthlyCredits = plan.daily_credits * 30;
  const projectedUsd = Math.round(monthlyCredits * usdPerCredit * 100) / 100;
  const ceiling = plan.monthly_cost_ceiling_usd;
  return {
    monthly_credits: monthlyCredits,
    projected_usd: projectedUsd,
    ceiling_usd: ceiling,
    fits: ceiling === null ? true : projectedUsd <= ceiling,
    headroom_usd: ceiling === null ? null : Math.round((ceiling - projectedUsd) * 100) / 100,
    /** Which day of a 30-day month the ceiling would bite on, if it does. */
    binds_on_day:
      ceiling === null || projectedUsd <= ceiling
        ? null
        : Math.max(1, Math.floor(ceiling / (plan.daily_credits * usdPerCredit))),
  };
}

/* ==================================================================== */
/* 6. What Kai says about it                                             */
/* ==================================================================== */

/**
 * KAI SAYS IT HIMSELF. Running out of credits is not an error toast and not a
 * spinner that never resolves — it is a thing that happened, and the rule this
 * whole product runs on is that the honest thing gets said rather than a
 * silence. These are his words, in his register, and they live here next to the
 * numbers they describe so the two can never disagree.
 */
export const CREDIT_COPY = {
  /** The unit, explained once, wherever the balance is shown. */
  what_a_credit_is:
    'Most questions cost one credit. A complicated one where I go and look several things up costs two or three.',

  outOfCredits(plan: Plan, resetsOn: string): string {
    return plan.key === 'free'
      ? `I have to stop there — that is your ten free credits for today. You get ten more ${resetsOn}. If you would rather not wait, Pro is $${PLANS.pro.price_usd} a month and opens the Trade section too. Nothing you have asked me is lost; it is all still here.`
      : `I have to stop there — that is your credits for this month used up. They reset ${resetsOn}. You can buy a top-up if you would rather not wait; the credits you buy stay with you and do not reset. Everything we have talked about is still here either way.`;
  },

  dailyCapHit(cap: number, resetsOn: string): string {
    return `I am going to stop for today. That is ${cap} credits since midnight, which is far more than a normal day, so I would rather pause than quietly run through your month in an afternoon. It clears ${resetsOn} — and if that was really you and not something looping, tell the owner and he can lift it.`;
  },

  ceilingHit(resetsOn: string): string {
    return `I have to stop there. You have not run out of credits — this month's questions have been unusually expensive to answer, and your plan has a cost limit behind the credits that I have reached. It clears ${resetsOn}. This is our side of the line, not yours, so if it seems wrong it is worth telling the owner.`;
  },

  warning(remaining: number, resetsOn: string, period: 'day' | 'month'): string {
    const left = `${remaining} ${remaining === 1 ? 'credit' : 'credits'} left`;
    return period === 'day'
      ? `You have ${left} today — ten more ${resetsOn}.`
      : `You have ${left} this month — they reset ${resetsOn}.`;
  },

  /** The Trade section, refused honestly, with the reason and the way out. */
  tradeLocked(): string {
    return `The Trade section is on the paid plans. Your free account keeps Kai and the community — Pro is $${PLANS.pro.price_usd} a month and opens Trade, the chart markup and the order tickets.`;
  },
} as const;

/** 80% consumed is where the warning starts. */
export const WARN_AT_PCT = 80;

/** `subscriptions.tier` → the plan it means.
 *
 *  'premium' is the ORIGINAL value and is still in the database. It is mapped
 *  to VIP because that is the plan at the price premium was sold at ($99). No
 *  row has to be rewritten for this to be correct. */
export function planForTier(tier: string | null | undefined): Plan {
  switch (tier) {
    case 'vip':
    case 'premium':
      return PLANS.vip;
    case 'pro':
      return PLANS.pro;
    default:
      return PLANS.free;
  }
}
