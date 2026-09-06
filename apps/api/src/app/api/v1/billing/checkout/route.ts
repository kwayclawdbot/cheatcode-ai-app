/**
 * POST /api/v1/billing/checkout — THE WEBSITE'S CHECKOUT. NOT THE APP'S.
 *
 * Creates a Stripe Checkout session in subscription mode. With no keys
 * configured it answers `BILLING_NOT_CONFIGURED` — never a placeholder URL,
 * never a fake price.
 *
 * ==========================================================================
 * IT IS CLOSED TO THE APP AND FAILS CLOSED TO EVERYONE ELSE.
 * ==========================================================================
 * A purchase path reachable from the iOS app breaks App Store rule 3.1.3(b),
 * which is the rule that lets this app honour a web subscription without In-App
 * Purchase at all. The route is kept because the website needs it — that is the
 * business — but it now answers NOT_FOUND to any caller that has not proved it
 * is an allow-listed storefront client. With no `STOREFRONT_CLIENTS` set, that
 * is everybody, which is the correct state for an App Store submission and
 * costs nothing today: the app was the only caller and no longer calls it.
 *
 * The whole rule, and how the owner opens this for the website, is written out
 * in `lib/storefront.ts`.
 */
import type { NextRequest } from 'next/server';
import { BillingCheckoutResponse } from '@shared/api';
import { authed, ok, type Ctx } from '@/lib/http';
import { serviceClient } from '@/lib/db';
import { emitUserEvent } from '@/lib/events';
import { loadEntitlements, PREMIUM_PRICE_PLAIN } from '@/lib/entitlements';
import { ApiError } from '@/lib/errors';
import { stripeConfigured, billingNotConfigured, createCheckoutSession } from '@/lib/stripe';
import { isStorefrontClient, storefrontClosed } from '@/lib/storefront';

export const dynamic = 'force-dynamic';

export const POST = authed(async (req: NextRequest, ctx: Ctx) => {
  // THE FIRST LINE, BEFORE ANYTHING ELSE HAPPENS. Not after the Stripe check:
  // "billing is not configured" is itself an answer that tells the caller a
  // purchase path lives here.
  if (!isStorefrontClient(req)) throw storefrontClosed();
  if (!stripeConfigured()) throw billingNotConfigured();

  const ent = await loadEntitlements(ctx.user.id);
  if (ent.tier === 'premium') {
    throw new ApiError('STATE_CONFLICT', `You are already on Premium at ${PREMIUM_PRICE_PLAIN}.`);
  }

  const db = serviceClient();
  const sub = await db
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', ctx.user.id)
    .maybeSingle();

  const session = await createCheckoutSession({
    userId: ctx.user.id,
    email: ctx.user.email,
    customerId: ((sub.data as Record<string, unknown> | null)?.stripe_customer_id as string) ?? null,
  });

  await emitUserEvent(
    ctx.user.id,
    'system',
    'subscription',
    ctx.user.id,
    { event: 'checkout_started', session_id: session.id },
    ctx.requestId
  );

  return ok(
    BillingCheckoutResponse.parse({
      url: session.url,
      session_id: session.id,
      plain: `Premium is ${PREMIUM_PRICE_PLAIN}. You will finish this in your browser and land back here.`,
    }),
    { status: 201 }
  );
});
