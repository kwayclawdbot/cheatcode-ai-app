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
 */
import type { NextRequest } from 'next/server';
import { authed, ok, type Ctx } from '@/lib/http';
import { creditBlock, creditState } from '@/lib/kai/credits';
import { PLANS, TOPUP_PACK } from '@/lib/kai/plans';

export const dynamic = 'force-dynamic';

export const GET = authed(async (_req: NextRequest, ctx: Ctx) => {
  const state = await creditState(ctx.user.id, ctx.requestId);
  return ok({
    credits: creditBlock(state),
    /**
     * The ladder, so the upgrade sheet describes the plans from the same file
     * the enforcement reads. A marketing list typed into the app is how a price
     * change ends up shipped in one half of the product.
     *
     * `typical_runs_per_day` is TYPICAL, and every piece of copy built on it
     * says "about". Credits are proportional to the work a question causes, so
     * a day of simple questions buys more than the number and a day of heavy
     * chart lookups buys fewer. A hard promise here is a promise the system
     * would break.
     */
    plans: Object.values(PLANS).map((p) => ({
      key: p.key,
      name: p.name,
      price_usd: p.price_usd,
      daily_credits: p.daily_credits,
      typical_runs_per_day: p.typical_runs_per_day,
      trade_panel: p.trade_panel,
      blurb: p.blurb,
    })),
    topup: {
      key: TOPUP_PACK.key,
      name: TOPUP_PACK.name,
      credits: TOPUP_PACK.credits,
      price_usd: TOPUP_PACK.price_usd,
      blurb: TOPUP_PACK.blurb,
    },
  });
});
