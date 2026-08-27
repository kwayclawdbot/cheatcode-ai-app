/**
 * POST /api/v1/webhooks/stripe
 *
 * UNAUTHENTICATED by design — Stripe has no bearer token. The signature IS the
 * authentication, so the handler verifies it before parsing anything and
 * answers 400 when it fails. Without `STRIPE_WEBHOOK_SECRET` configured every
 * request is rejected rather than trusted: an unverified webhook that can flip
 * a subscription tier is an authorization hole, not a convenience.
 *
 * Untested end to end (no keys on this account); the signature check has its
 * own unit-shaped assertion in scripts/smoke.sh, which posts an unsigned body
 * and requires a 400.
 */
import type { NextRequest } from 'next/server';
import { serviceClient } from '@/lib/db';
import { env } from '@/lib/env';
import { log, newRequestId } from '@/lib/log';
import { emitUserEvent } from '@/lib/events';
import { verifyStripeSignature } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

type StripeEvent = {
  id?: string;
  type?: string;
  data?: { object?: Record<string, unknown> };
};

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = newRequestId();
  const raw = await req.text();
  const signature = req.headers.get('stripe-signature');

  if (!env('STRIPE_WEBHOOK_SECRET')) {
    log('warn', requestId, 'stripe.webhook_unconfigured', {});
    return Response.json(
      { error: { code: 'INTERNAL', message_plain: 'Billing is not switched on here.' } },
      { status: 503, headers: { 'x-request-id': requestId } }
    );
  }
  if (!verifyStripeSignature(raw, signature)) {
    log('warn', requestId, 'stripe.signature_invalid', {});
    return Response.json(
      { error: { code: 'UNAUTHENTICATED', message_plain: 'That request could not be verified.' } },
      { status: 400, headers: { 'x-request-id': requestId } }
    );
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(raw) as StripeEvent;
  } catch {
    return Response.json(
      { error: { code: 'VALIDATION_FAILED', message_plain: 'That request could not be read.' } },
      { status: 400, headers: { 'x-request-id': requestId } }
    );
  }

  const object = event.data?.object ?? {};
  const userId = resolveUserId(object);
  log('info', requestId, 'stripe.webhook', { type: event.type, has_user: Boolean(userId) });

  if (!userId) return Response.json({ received: true }, { headers: { 'x-request-id': requestId } });

  const db = serviceClient();

  switch (event.type) {
    case 'checkout.session.completed':
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const status = String(object.status ?? 'active');
      const active = status === 'active' || status === 'trialing';
      await db.from('subscriptions').upsert(
        {
          user_id: userId,
          stripe_customer_id: strOrNull(object.customer),
          stripe_subscription_id: strOrNull(object.subscription ?? object.id),
          tier: active ? 'premium' : 'free',
          status,
          current_period_end: epochToIso(object.current_period_end),
        } as never,
        { onConflict: 'user_id' }
      );
      await emitUserEvent(
        userId,
        'system',
        'subscription',
        userId,
        { event: 'subscription_changed', status, tier: active ? 'premium' : 'free' },
        requestId
      );
      break;
    }
    case 'customer.subscription.deleted': {
      await db
        .from('subscriptions')
        .upsert(
          { user_id: userId, tier: 'free', status: 'canceled', current_period_end: epochToIso(object.current_period_end) } as never,
          { onConflict: 'user_id' }
        );
      await emitUserEvent(userId, 'system', 'subscription', userId, { event: 'subscription_cancelled' }, requestId);
      break;
    }
    default:
      break;
  }

  return Response.json({ received: true }, { headers: { 'x-request-id': requestId } });
}

function resolveUserId(object: Record<string, unknown>): string | null {
  const meta = (object.metadata as Record<string, unknown>) ?? {};
  const fromMeta = meta.user_id;
  if (typeof fromMeta === 'string' && fromMeta) return fromMeta;
  const ref = object.client_reference_id;
  return typeof ref === 'string' && ref ? ref : null;
}

function strOrNull(v: unknown): string | null {
  return typeof v === 'string' && v ? v : null;
}

function epochToIso(v: unknown): string | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : null;
}
