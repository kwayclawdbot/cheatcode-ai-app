/**
 * Entitlements (02 §11).
 *
 * Tier comes from `subscriptions` (no row = free — `handle_new_user` does not
 * create one). Flags come from `entitlement_flags`, which is seeded config, so
 * gate PLACEMENT lives in the database and never in a constant here.
 */
import { serviceClient } from './db';
import { ApiError } from './errors';
import { CREDIT_COPY } from './kai/plans';

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

/**
 * The subscription price, in words, for SERVER-SIDE use only — the Stripe
 * checkout's own confirmation sentence, and nothing else. It must never travel
 * to the app; see the note on `entitlementRequired` below.
 */
export const PREMIUM_PRICE_PLAIN = '$99 a month';

/**
 * 02 §11: ENTITLEMENT_REQUIRED says the plan does not cover this.
 *
 * ===========================================================================
 * IT USED TO CARRY A PRICE AND AN UPGRADE ROUTE. BOTH ARE GONE, ON PURPOSE.
 * ===========================================================================
 * The detail block was `{ tier, price: '$99 a month', upgrade_link:
 * '/account/subscription' }` and it was delivered straight into the iOS app on
 * every gated route. That is a price and a route to buy, inside the app, which
 * is precisely what App Store rule 3.1.3(b) forbids in an app that honours a
 * subscription sold on the web. See `lib/storefront.ts` for the whole rule.
 *
 * WHAT THE APP STILL GETS IS THE PART THAT WAS ACTUALLY USEFUL: the code
 * `ENTITLEMENT_REQUIRED`, which tells it this is a fact about the account and
 * not a fault on our side, and a plain sentence saying what is closed and what
 * is not. Nothing that depended on `price` or `upgrade_link` remains — the app
 * never read either field.
 *
 * THE GATE ITSELF IS UNCHANGED AND JUST AS STRICT. This function only decides
 * what the refusal SAYS.
 */
export function entitlementRequired(messagePlain: string): ApiError {
  return new ApiError('ENTITLEMENT_REQUIRED', messagePlain, {
    detail: { tier: 'premium' },
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
  // The sentence comes from plans.ts, which is the one file allowed to hold
  // plan copy — and which is now under a standing rule that none of that copy
  // may name a price or a way to buy. Nothing here restates it.
  throw entitlementRequired(CREDIT_COPY.tradeLocked());
}
