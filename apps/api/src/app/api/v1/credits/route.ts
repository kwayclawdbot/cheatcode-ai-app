/**
 * GET /api/v1/credits — what this person has left, and when it comes back.
 *
 * WHAT IT DELIBERATELY DOES NOT RETURN. Tokens, dollars, model names, or what
 * anything cost us. The person is shown CREDITS and one plain sentence about
 * what a credit buys. The money is the owner's business and lives behind
 * `staffed()` on the admin route.
 *
 * IT IS NOT A GATE EITHER. Nothing the app learns here decides whether a
 * message goes through — that is decided on the server, on the message route,
 * every single time. This exists so the strip above the composer can be honest
 * BEFORE somebody types, which is a courtesy, not a control.
 *
 * ===========================================================================
 * AND IT NO LONGER SENDS A PRICE LIST TO THE APP.
 * ===========================================================================
 * It used to answer with all three plans, each carrying `price_usd`, plus the
 * top-up pack and its price. The app drew that as a ladder with an Upgrade
 * button on the end. That is a storefront inside the app, and it breaks App
 * Store rule 3.1.3(b) — the rule that lets this app honour a subscription
 * bought on the website without In-App Purchase at all.
 *
 * SO THE ANSWER NOW DEPENDS ON WHO IS ASKING, and it fails closed:
 *
 *   an allow-listed storefront client   the full ladder, prices, the top-up
 *   anything else, the app included     the caller's OWN plan, no price,
 *                                       no other plans, no top-up pack
 *
 * The app is left knowing everything it needs to be honest with the person —
 * how many credits they have, when they come back, which plan they are on and
 * what that plan covers — and nothing it could sell with. See
 * `lib/storefront.ts` for the rule and how the website opens the other branch.
 */
import type { NextRequest } from 'next/server';
import { authed, ok, type Ctx } from '@/lib/http';
import { creditBlock, creditState } from '@/lib/kai/credits';
import { PLANS, TOPUP_PACK, planForTier, type Plan } from '@/lib/kai/plans';
import { isStorefrontClient } from '@/lib/storefront';

export const dynamic = 'force-dynamic';

/**
 * A plan as the STOREFRONT sees it: everything, price included.
 *
 * `typical_runs_per_day` is TYPICAL, and every piece of copy built on it says
 * "about". Credits are proportional to the work a question causes, so a day of
 * simple questions buys more than the number and a day of heavy chart lookups
 * buys fewer. A hard promise here is a promise the system would break.
 */
function storefrontRow(p: Plan) {
  return {
    key: p.key,
    name: p.name,
    price_usd: p.price_usd,
    daily_credits: p.daily_credits,
    typical_runs_per_day: p.typical_runs_per_day,
    trade_panel: p.trade_panel,
    blurb: p.blurb,
  };
}

/**
 * A plan as the APP sees it: the same facts with the money taken out.
 *
 * `price_usd` is null rather than absent so the shape does not change under the
 * app — a missing key reads as "an old build of the API" to the client, which
 * is a different and misleading thing from "you are not shown prices here".
 *
 * The blurb is replaced too. `PLANS.free.blurb` ends "The Trade section is on
 * the paid plans", which is a nudge towards a purchase even without a figure
 * attached. `app_blurb` says the same fact about what the plan covers and stops
 * there.
 */
function appRow(p: Plan) {
  return {
    key: p.key,
    name: p.name,
    price_usd: null,
    daily_credits: p.daily_credits,
    typical_runs_per_day: p.typical_runs_per_day,
    trade_panel: p.trade_panel,
    blurb: appBlurb(p),
  };
}

function appBlurb(p: Plan): string {
  const runs = `About ${p.typical_runs_per_day} questions a day with Kai, and the community.`;
  return p.trade_panel
    ? `${runs} The Trade section is open on this plan.`
    : `${runs} The Trade section is not part of this plan.`;
}

export const GET = authed(async (req: NextRequest, ctx: Ctx) => {
  const state = await creditState(ctx.user.id, ctx.requestId);
  const storefront = isStorefrontClient(req);

  if (storefront) {
    return ok({
      credits: creditBlock(state),
      plans: Object.values(PLANS).map(storefrontRow),
      topup: {
        key: TOPUP_PACK.key,
        name: TOPUP_PACK.name,
        credits: TOPUP_PACK.credits,
        price_usd: TOPUP_PACK.price_usd,
        blurb: TOPUP_PACK.blurb,
      },
    });
  }

  /**
   * ONE PLAN — THE CALLER'S OWN — AND NO TOP-UP.
   *
   * Sending the other two rungs without their prices would still be a ladder,
   * and a ladder is an upsell whether or not it carries figures. The person is
   * told what THEIR plan is and what it covers. `planForTier` is the same
   * function the enforcement path uses, so the described plan can never drift
   * from the enforced one.
   */
  const plan = planForTier(state.plan.key);
  return ok({
    credits: creditBlock(state),
    plans: [appRow(plan)],
    topup: null,
  });
});
