/**
 * POST /api/v1/billing/checkout
 *
 * Creates a Stripe Checkout session in subscription mode with deep links back
 * into the app. With no keys configured it answers `BILLING_NOT_CONFIGURED`
 * ("Upgrades open soon.") — never a placeholder URL, never a fake price.
 */
import type { NextRequest } from 'next/server';
import { BillingCheckoutResponse } from '@shared/api';
import { authed, ok, type Ctx } from '@/lib/http';
import { serviceClient } from '@/lib/db';
import { emitUserEvent } from '@/lib/events';
import { loadEntitlements, PREMIUM_PRICE_PLAIN } from '@/lib/entitlements';
import { ApiError } from '@/lib/errors';
import { stripeConfigured, billingNotConfigured, createCheckoutSession } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

export const POST = authed(async (_req: NextRequest, ctx: Ctx) => {
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
