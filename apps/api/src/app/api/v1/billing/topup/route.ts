/**
 * POST /api/v1/billing/topup
 *
 * A one-off credit pack through Stripe Checkout, in `payment` mode. With no
 * keys configured it answers `BILLING_NOT_CONFIGURED` ("Upgrades open soon.")
 * — never a placeholder URL, never a fake price. Same rule as the subscription
 * checkout next door.
 *
 * NOTHING IS GRANTED HERE. This opens a payment page and stops. The credits
 * arrive when Stripe says the money did, on the webhook, keyed on the Stripe
 * event id so a retried delivery grants once.
 *
 * ==========================================================================
 * CLOSED TO THE APP, AND FAILS CLOSED TO EVERYONE ELSE.
 * ==========================================================================
 * Same rule and same guard as the subscription checkout next door: a purchase
 * path reachable from the iOS app breaks App Store rule 3.1.3(b). Kept for the
 * website; NOT_FOUND to anything that has not proved it is an allow-listed
 * storefront client. See `lib/storefront.ts`.
 */
import type { NextRequest } from 'next/server';
import { authed, ok, type Ctx } from '@/lib/http';
import { serviceClient } from '@/lib/db';
import { emitUserEvent } from '@/lib/events';
import { TOPUP_PACK } from '@/lib/kai/plans';
import { stripeConfigured, billingNotConfigured, createTopupSession } from '@/lib/stripe';
import { isStorefrontClient, storefrontClosed } from '@/lib/storefront';

export const dynamic = 'force-dynamic';

export const POST = authed(async (req: NextRequest, ctx: Ctx) => {
  if (!isStorefrontClient(req)) throw storefrontClosed();
  if (!stripeConfigured()) throw billingNotConfigured();

  const db = serviceClient();
  const sub = await db
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', ctx.user.id)
    .maybeSingle();

  const session = await createTopupSession({
    userId: ctx.user.id,
    email: ctx.user.email,
    customerId: ((sub.data as Record<string, unknown> | null)?.stripe_customer_id as string) ?? null,
    packKey: TOPUP_PACK.key,
    credits: TOPUP_PACK.credits,
  });

  await emitUserEvent(
    ctx.user.id,
    'system',
    'subscription',
    ctx.user.id,
    { event: 'topup_started', session_id: session.id, credits: TOPUP_PACK.credits },
    ctx.requestId
  );

  return ok(
    {
      url: session.url,
      session_id: session.id,
      credits: TOPUP_PACK.credits,
      price_usd: TOPUP_PACK.price_usd,
      plain: `${TOPUP_PACK.credits} credits for $${TOPUP_PACK.price_usd}. They stay with you — they do not reset with the day. You will finish this in your browser and land back here.`,
    },
    { status: 201 }
  );
});
