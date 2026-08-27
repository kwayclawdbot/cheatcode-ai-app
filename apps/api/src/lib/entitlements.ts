/**
 * Entitlements (02 §11).
 *
 * Tier comes from `subscriptions` (no row = free — `handle_new_user` does not
 * create one). Flags come from `entitlement_flags`, which is seeded config, so
 * gate PLACEMENT lives in the database and never in a constant here.
 */
import { serviceClient } from './db';
import { ApiError } from './errors';

export type Tier = 'free' | 'premium';

export type Entitlements = {
  tier: Tier;
  status: string;
  current_period_end: string | null;
  flags: Record<string, unknown>;
};

const UNLIMITED = 'unlimited';

export async function loadEntitlements(userId: string): Promise<Entitlements> {
  const db = serviceClient();
  const [sub, flags] = await Promise.all([
    db
      .from('subscriptions')
      .select('tier,status,current_period_end')
      .eq('user_id', userId)
      .maybeSingle(),
    db.from('entitlement_flags').select('tier,flag,value'),
  ]);

  const row = (sub.data ?? null) as { tier?: string; status?: string; current_period_end?: string } | null;
  const active = row?.status === 'active' || row?.status === 'trialing';
  const tier: Tier = row?.tier === 'premium' && active ? 'premium' : 'free';

  const map: Record<string, unknown> = {};
  for (const f of (flags.data ?? []) as { tier: string; flag: string; value: unknown }[]) {
    if (f.tier === tier) map[f.flag] = f.value;
  }

  return {
    tier,
    status: row?.status ?? 'none',
    current_period_end: row?.current_period_end ?? null,
    flags: map,
  };
}

/** `null` means unlimited. */
export function numericFlag(flags: Record<string, unknown>, key: string): number | null {
  const v = flags[key];
  if (v === UNLIMITED || v === `"${UNLIMITED}"`) return null;
  const n = Number(typeof v === 'string' ? v.replace(/"/g, '') : v);
  return Number.isFinite(n) ? n : null;
}

export const PREMIUM_PRICE_PLAIN = '$99 a month';

/** 02 §11: ENTITLEMENT_REQUIRED carries the tier, price and upgrade route. */
export function entitlementRequired(messagePlain: string, upgradeLink = '/account/subscription'): ApiError {
  return new ApiError('ENTITLEMENT_REQUIRED', messagePlain, {
    detail: { tier: 'premium', price: PREMIUM_PRICE_PLAIN, upgrade_link: upgradeLink },
  });
}
