/**
 * Entitlements (02 §11).
 *
 * Tier comes from `subscriptions` (no row = free — `handle_new_user` does not
 * create one). Flags come from `entitlement_flags`, which is seeded config, so
 * gate PLACEMENT lives in the database and never in a constant here.
 */
import { serviceClient } from './db';
import { ApiError } from './errors';
import { CREDIT_COPY, PLANS } from './kai/plans';

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
  /**
   * THREE PAID NAMES, ONE FLAG SET. The owner's plans are Pro and VIP; the
   * original build only knew 'premium', and rows still say it. All three read
   * the SAME `entitlement_flags` rows, because what separates Pro from VIP is
   * how many credits a day they get — a question `kai/credits.ts` answers — and
   * not which features are open. If they ever do differ, this is the line that
   * splits them and `entitlement_flags` gains a third tier.
   */
  const paid = active && (row?.tier === 'premium' || row?.tier === 'pro' || row?.tier === 'vip');
  const tier: Tier = paid ? 'premium' : 'free';

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

/**
 * 02 §11: ENTITLEMENT_REQUIRED carries the tier, price and upgrade route.
 *
 * `pricePlain` exists because there are two paid plans now. The default is
 * still the $99 one — every existing caller keeps the answer it always gave —
 * but a gate whose sentence names Pro must not hand the app VIP's price in the
 * detail, or the screen and the message contradict each other.
 */
export function entitlementRequired(
  messagePlain: string,
  upgradeLink = '/account/subscription',
  pricePlain = PREMIUM_PRICE_PLAIN
): ApiError {
  return new ApiError('ENTITLEMENT_REQUIRED', messagePlain, {
    detail: { tier: 'premium', price: pricePlain, upgrade_link: upgradeLink },
  });
}

/* ==================================================================== */
/* The Trade section                                                     */
/* ==================================================================== */

/**
 * THE OWNER'S RULING: a free account gets Kai and the community, and does NOT
 * get the Trade section.
 *
 * THE GATE IS HERE, ON THE SERVER, AND NOT IN THE APP. Hiding the tab is a
 * courtesy — it stops a free account walking into a wall — but it grants
 * nothing and protects nothing. Anyone who reaches a Trade route by any other
 * means gets this refusal, which names the reason and the price rather than a
 * 404 or a crash.
 *
 * It reads `entitlement_flags`, which is how every other plan gate in this app
 * already works, so the answer can be changed by editing a row rather than by
 * shipping code.
 */
export function hasTradePanel(flags: Record<string, unknown>): boolean {
  const v = flags.trade_panel;
  if (v === undefined || v === null) return true; // a database that predates 0030 gates nothing
  return v === true || v === 'true' || v === '"true"';
}

export async function requireTradePanel(userId: string): Promise<void> {
  const ent = await loadEntitlements(userId);
  if (hasTradePanel(ent.flags)) return;
  // The sentence and the price both come from plans.ts. A second copy of "$59"
  // living here is exactly how a price change ends up half-applied.
  throw entitlementRequired(
    CREDIT_COPY.tradeLocked(),
    '/account/subscription',
    `$${PLANS.pro.price_usd} a month`
  );
}
