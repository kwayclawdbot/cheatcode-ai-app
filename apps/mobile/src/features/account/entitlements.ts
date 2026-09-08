/**
 * ONE ENTITLEMENT CONTRACT, READ BY EVERY SURFACE THAT CLAIMS OR REFUSES.
 *
 * ===========================================================================
 * WHY THIS FILE EXISTS: THE PLAN SCREEN COULD TELL A PAYING MEMBER THAT A
 * FEATURE WAS OPEN TO THEM IMMEDIATELY BEFORE THE SERVER BLOCKED THEM FROM IT.
 * ===========================================================================
 * `account/subscription.tsx` used to build its second list by filtering
 * `included === false`, and then decide what that list MEANT from the tier:
 *
 *     <Eyebrow>{onFree ? 'Not on your plan' : 'Also open to you'}</Eyebrow>
 *     ...
 *     {onFree ? null : <Check color={green} />}
 *
 * Every row in that list is a capability the API said this account does NOT
 * have. On any paid plan they were drawn with a green tick under the words
 * "Also open to you". That is not a cosmetic slip — it is the screen telling
 * somebody the opposite of what the enforcement path is about to tell them.
 *
 * It is not hypothetical either. Migration 0031 runs
 * `update entitlement_flags set value = 'false' where flag = 'circles_create'`
 * with no tier filter, so a premium account carries a `false` flag today and
 * saw exactly that green tick.
 *
 * ---------------------------------------------------------------------------
 * THE RULES, WHICH ARE THE WHOLE POINT OF PUTTING THIS IN ONE PLACE
 * ---------------------------------------------------------------------------
 * 1. EVERY CAPABILITY IS RENDERED FROM ITS OWN `included` VALUE. The tier is
 *    never allowed to decide what a flag means. A tier is a shorthand for a
 *    set of flags, and the shorthand is the thing that goes stale.
 *
 * 2. THERE ARE THREE STATES, NOT TWO. `included`, `excluded`, and `unknown`.
 *    A service failure produces `unknown` for everything and a `planName` of
 *    null — never "Free". A screen that answers "we could not read your plan"
 *    is annoying; a screen that quietly downgrades a paying member to the free
 *    plan because a request timed out is a lie about what they bought.
 *
 * 3. `unknown` NEVER LOCKS AND NEVER GRANTS. `locked()` is true only on an
 *    explicit `excluded`, so an API that cannot answer does not put a padlock
 *    on a section a paying customer has — the rule the tab bar already
 *    followed and which is now written down once. `allows()` is true only on
 *    an explicit `included`, so nothing here can be used to skip a gate.
 *
 * 4. THE ENFORCEMENT PATH WINS. `trade_panel` arrives twice: in
 *    `entitlement_flags` (which is what every `/api/v1/trade` route actually
 *    reads) and in the credits block. `apps/api/src/lib/kai/plans.ts` states
 *    the tie-break in its own words — "If the two ever disagree, THE FLAG
 *    WINS: it is the one on the enforcement path" — so that is what
 *    `tradePanel` below does.
 *
 * NOTHING IN THIS FILE IS A GATE. Every one of these answers is a courtesy on
 * top of a server that refuses on its own with `ENTITLEMENT_REQUIRED`. What it
 * buys is that the courtesy and the refusal agree.
 *
 * NO REACT HERE, ON PURPOSE: `scripts/entitlement-test.mts` imports this
 * module directly under Node. The hook lives next door in `useEntitlements.ts`.
 */
import type { CreditsPayload, EntitlementFlag, Me } from '../../lib/types';

/** Three states, and the third one is the reason this type exists. */
export type EntitlementState = 'included' | 'excluded' | 'unknown';

/**
 * One capability, as a screen should draw it. `state` here is only ever
 * `included` or `excluded` — a capability the server never mentioned has no
 * row, because inventing one would be inventing a claim.
 */
export type Capability = {
  key: string;
  label: string;
  /** "5 at a time", "Beginner rooms", "Not on your plan". Never a raw value. */
  value_plain: string;
  state: 'included' | 'excluded';
};

export type EntitlementView = {
  /** Did `/me` answer? False means every state below is `unknown`. */
  known: boolean;
  /** Null when neither `/me` nor `/credits` answered. NEVER defaulted to Free. */
  planName: string | null;
  planBlurb: string | null;
  /** Null when unknown. A failed read is not a free account. */
  tier: 'free' | 'premium' | null;
  /** Every capability the server described, in the order it described them. */
  capabilities: Capability[];
  included: Capability[];
  excluded: Capability[];
  state: (key: string) => EntitlementState;
  /** True ONLY on an explicit `included`. */
  allows: (key: string) => boolean;
  /** True ONLY on an explicit `excluded`. Unknown never draws a padlock. */
  locked: (key: string) => boolean;
  /** The Trade section, with the enforcement-path flag preferred (rule 4). */
  tradePanel: EntitlementState;
};

/**
 * THE WORDS EVERY SURFACE USES FOR A CAPABILITY, IN ONE MAP.
 *
 * The adapter humanises unknown keys well enough for a list ("Trade panel"),
 * but the Trade refusal screen calls the same thing "the Trade section" and
 * the two must not drift. Anything absent here keeps the adapter's label,
 * which is the honest degrade: a new flag appears with a plain name rather
 * than disappearing.
 */
export const CAPABILITY_LABEL: Record<string, string> = {
  trade_panel: 'The Trade section',
  circles_create: 'Starting a circle',
};

/**
 * What an excluded row SAYS in its value column.
 *
 * The adapter writes "Premium" there, which reads as a shop sign next to a
 * padlock. This says the same fact without pointing anywhere: App Store rule
 * 3.1.3(b) is why this app carries no route to buy, and a value column is a
 * route if it is written like one. See `apps/api/src/lib/storefront.ts`.
 */
const EXCLUDED_VALUE = 'Not on your plan';

function capabilityOf(f: EntitlementFlag): Capability {
  const label = CAPABILITY_LABEL[f.key] ?? f.label;
  // RULE 1, AND IT IS THE ONLY PLACE THIS DECISION IS MADE.
  if (f.included) return { key: f.key, label, value_plain: f.value_plain, state: 'included' };
  return { key: f.key, label, value_plain: EXCLUDED_VALUE, state: 'excluded' };
}

/**
 * Build the view every entitlement surface reads.
 *
 * `me` null means `/me` did not answer — a fault at our end, and the caller
 * must say so rather than drawing the free plan. `credits` is only ever used
 * for the plan's NAME and as the fallback source for `trade_panel`; it can
 * never turn an excluded capability into an included one.
 */
export function buildEntitlementView(
  me: Me | null,
  credits: CreditsPayload | null,
): EntitlementView {
  const capabilities = (me?.entitlements ?? []).map(capabilityOf);
  const byKey = new Map(capabilities.map((c) => [c.key, c]));
  const known = me !== null;

  const state = (key: string): EntitlementState => {
    if (!known) return 'unknown';
    return byKey.get(key)?.state ?? 'unknown';
  };

  const balance = credits?.credits ?? me?.credits ?? null;
  const plan = credits?.plans?.find((p) => p.key === balance?.plan) ?? null;

  /**
   * THE FLAG FIRST, THE CREDIT BLOCK SECOND, `unknown` LAST. Reading the
   * credit block first would let a stale plan row overrule the row the trade
   * routes are actually enforcing.
   */
  const flagged = state('trade_panel');
  const tradePanel: EntitlementState =
    flagged !== 'unknown'
      ? flagged
      : balance
        ? (balance.trade_panel ? 'included' : 'excluded')
        : 'unknown';

  return {
    known,
    // A name is only ever READ. With neither source answering there is no
    // name, and the screen says so.
    planName: balance?.plan_name ?? plan?.name ?? (me ? (me.subscription.tier === 'premium' ? 'Premium' : 'Free') : null),
    planBlurb: plan?.blurb ?? null,
    tier: me ? me.subscription.tier : null,
    capabilities,
    included: capabilities.filter((c) => c.state === 'included'),
    excluded: capabilities.filter((c) => c.state === 'excluded'),
    state,
    allows: (key) => state(key) === 'included',
    locked: (key) => state(key) === 'excluded',
    tradePanel,
  };
}

/**
 * What a screen says when the entitlement service did not answer.
 *
 * Kept here so the plan screen, the Trade refusal and anything added later use
 * the same sentence, and so nobody writes a cheerier one that implies the plan
 * itself changed.
 */
export const ENTITLEMENT_UNKNOWN_PLAIN =
  'We could not read your plan just now. That is a fault at our end — nothing about your account has changed, and nothing you pay for has been taken away.';
