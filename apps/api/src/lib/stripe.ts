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
  return Boolean(env('STRIPE_SECRET_KEY') && (env('STRIPE_PRICE_PREMIUM') || env('STRIPE_PRICE_PRO')));
}

/**
 * THE PRICE IDS, ONE PER THING THAT CAN BE BOUGHT.
 *
 *   STRIPE_PRICE_PRO      $59 a month
 *   STRIPE_PRICE_VIP      $99 a month
 *   STRIPE_PRICE_TOPUP    the one-off credit pack
 *   STRIPE_PRICE_PREMIUM  the ORIGINAL single price. Kept as the fallback for
 *                         VIP so an environment that predates the two-tier
 *                         ladder still sells the $99 plan rather than answering
 *                         "not configured".
 *
 * NOTHING IS INVENTED HERE either. A tier with no price id configured answers
 * BILLING_NOT_CONFIGURED — it never quietly sells a different one.
 */
export function priceIdFor(plan: 'pro' | 'vip' | 'topup'): string | undefined {
  if (plan === 'pro') return env('STRIPE_PRICE_PRO');
  if (plan === 'vip') return env('STRIPE_PRICE_VIP') ?? env('STRIPE_PRICE_PREMIUM');
  return env('STRIPE_PRICE_TOPUP');
}

/**
 * Which tier a completed Stripe subscription belongs to, by price id.
 *
 * WHY THIS IS NEEDED. The webhook used to have one plan to grant, so "paid"
 * meant 'premium' and nothing had to be read off the event. With two tiers the
 * price is the only thing that says WHICH one, and getting it wrong would give
 * a Pro subscriber VIP's allowance or the reverse.
 *
 * AN UNRECOGNISED PRICE IS NOT GUESSED. It returns null, the webhook records
 * the subscription as active under the legacy 'premium' name — which every gate
 * already understands — and logs the price so it can be added here. A wrong
 * tier is worse than a conservative one.
 */
export function tierForPrice(priceId: string | null | undefined): 'pro' | 'vip' | null {
  if (!priceId) return null;
  if (priceId === env('STRIPE_PRICE_PRO')) return 'pro';
  if (priceId === env('STRIPE_PRICE_VIP') || priceId === env('STRIPE_PRICE_PREMIUM')) return 'vip';
  return null;
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
  /** Which plan is being bought. Defaults to VIP, which is what the single
   *  original price sold, so an older caller keeps its behaviour exactly. */
  plan?: 'pro' | 'vip';
}): Promise<CheckoutSession> {
  const price = priceIdFor(opts.plan ?? 'vip');
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
 * A ONE-OFF CREDIT PACK. `mode: payment`, not `subscription` — the whole point
 * of a top-up is that it is bought once and the credits stay put.
 *
 * The metadata is what the webhook grants from: the user, the pack, and how
 * many credits it is worth. The credit count travels ON THE EVENT rather than
 * being looked up at grant time, so a pack somebody bought last month is
 * honoured at the size it was sold at even if the pack is resized tomorrow.
 */
export async function createTopupSession(opts: {
  userId: string;
  email: string | null;
  customerId: string | null;
  packKey: string;
  credits: number;
}): Promise<CheckoutSession> {
  const price = priceIdFor('topup');
  if (!price) throw billingNotConfigured();

  const form: Record<string, string> = {
    mode: 'payment',
    'line_items[0][price]': price,
    'line_items[0][quantity]': '1',
    success_url: 'cheatcodeai://billing/topup-success?session_id={CHECKOUT_SESSION_ID}',
    cancel_url: 'cheatcodeai://billing/cancel',
    client_reference_id: opts.userId,
    'metadata[user_id]': opts.userId,
    'metadata[kind]': 'credit_topup',
    'metadata[pack]': opts.packKey,
    'metadata[credits]': String(opts.credits),
  };
  if (opts.customerId) form.customer = opts.customerId;
  else if (opts.email) form.customer_email = opts.email;

  const session = await stripePost('checkout/sessions', form);
  const url = session.url;
  if (typeof url !== 'string') {
    throw new ApiError('INTERNAL', 'We could not open the payment page. Please try again.');
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
