/**
 * Stripe, behind env, with no SDK.
 *
 * The whole integration is two REST calls and one signature check, so pulling
 * in the `stripe` package would add a dependency for less code than it saves.
 *
 * NO KEYS ARE INVENTED. When `STRIPE_SECRET_KEY` / `STRIPE_PRICE_PREMIUM` are
 * absent the checkout endpoint answers `BILLING_NOT_CONFIGURED` with plain copy
 * ("Upgrades open soon.") — it does not fall back to a fake session, a test
 * link, or a placeholder price.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from './env';
import { ApiError } from './errors';

export const BILLING_NOT_CONFIGURED_PLAIN = 'Upgrades open soon.';

export function stripeConfigured(): boolean {
  return Boolean(env('STRIPE_SECRET_KEY') && env('STRIPE_PRICE_PREMIUM'));
}

/** Not in the canonical code list — carried as INTERNAL with the code in detail. */
export function billingNotConfigured(): ApiError {
  return new ApiError('INTERNAL', BILLING_NOT_CONFIGURED_PLAIN, {
    status: 503,
    detail: { code: 'BILLING_NOT_CONFIGURED' },
  });
}

async function stripePost(path: string, form: Record<string, string>): Promise<Record<string, unknown>> {
  const key = env('STRIPE_SECRET_KEY');
  if (!key) throw billingNotConfigured();

  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(form).toString(),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const message = ((json.error as Record<string, unknown>)?.message as string) ?? 'unknown';
    throw new ApiError('INTERNAL', 'We could not open the upgrade page. Please try again.', {
      detail: { stripe: message },
    });
  }
  return json;
}

export type CheckoutSession = { id: string; url: string };

export async function createCheckoutSession(opts: {
  userId: string;
  email: string | null;
  customerId: string | null;
}): Promise<CheckoutSession> {
  const price = env('STRIPE_PRICE_PREMIUM');
  if (!price) throw billingNotConfigured();

  const form: Record<string, string> = {
    mode: 'subscription',
    'line_items[0][price]': price,
    'line_items[0][quantity]': '1',
    success_url: 'cheatcodeai://billing/success?session_id={CHECKOUT_SESSION_ID}',
    cancel_url: 'cheatcodeai://billing/cancel',
    client_reference_id: opts.userId,
    'metadata[user_id]': opts.userId,
    'subscription_data[metadata][user_id]': opts.userId,
    allow_promotion_codes: 'true',
  };
  if (opts.customerId) form.customer = opts.customerId;
  else if (opts.email) form.customer_email = opts.email;

  const session = await stripePost('checkout/sessions', form);
  const url = session.url;
  if (typeof url !== 'string') {
    throw new ApiError('INTERNAL', 'We could not open the upgrade page. Please try again.');
  }
  return { id: String(session.id), url };
}

/**
 * Stripe's `t=…,v1=…` scheme: HMAC-SHA256 over `${timestamp}.${rawBody}`.
 * Compared with `timingSafeEqual`, and a stale timestamp is rejected — a valid
 * signature replayed days later must not be able to change a subscription.
 */
export function verifyStripeSignature(rawBody: string, header: string | null, toleranceS = 300): boolean {
  const secret = env('STRIPE_WEBHOOK_SECRET');
  if (!secret || !header) return false;

  const parts = Object.fromEntries(
    header.split(',').map((p) => {
      const [k, ...rest] = p.split('=');
      return [k.trim(), rest.join('=')];
    })
  ) as Record<string, string>;

  const ts = Number(parts.t);
  const sig = parts.v1;
  if (!Number.isFinite(ts) || !sig) return false;
  if (Math.abs(Date.now() / 1000 - ts) > toleranceS) return false;

  const expected = createHmac('sha256', secret).update(`${ts}.${rawBody}`).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(sig, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}
