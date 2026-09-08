/**
 * RISK IS ASKED BEFORE THE FIRST PAPER ORDER, NOT BEFORE HOME.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY IT MOVED
 * ─────────────────────────────────────────────────────────────────────────────
 * Audit F01: "Ask risk questions before paper execution." It used to be step 3
 * of six, between "what do you want to do?" and "how much have you traded?",
 * and it asked a stranger to pick a daily loss cap in dollars before they had
 * seen a single price in the app. The screen is a good screen — it teaches by
 * example, in the member's own money — and it was asked at the one moment its
 * examples mean nothing, because the account it describes did not exist yet.
 *
 * It is also the only step of the six that was load-bearing for something other
 * than personalisation: the cap it sets is enforced by the server on every
 * paper order (`RISK_LIMIT_DAILY_LOSS`). Asked before the first order, it is a
 * question with a visible consequence. Asked during signup, it is a quiz.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT HAPPENS TO SOMEBODY WHO NEVER ANSWERS IT
 * ─────────────────────────────────────────────────────────────────────────────
 * They get `balanced`, and the app SAYS SO rather than presenting it as their
 * choice. `POST /onboarding/complete` has always written a risk policy — the
 * account cannot exist without one — so the honest description is not "no cap"
 * but "a default cap nobody chose". `RISK_DEFAULT_NOTE` is the sentence for
 * that, and the plan screen prints it.
 *
 * `onboarding.risk_confirmed` is what distinguishes the two. It is written by
 * `POST /api/v1/onboarding/risk` when a human picks, and by
 * `POST /api/v1/onboarding/complete` as `false` when signup finishes without
 * one. An account that predates all of this has neither, and `needsRiskSetup`
 * treats a missing flag as "not confirmed" — the safe reading, because the cost
 * is one screen and the cost of the other reading is a cap somebody never chose
 * silently governing their orders forever.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE HALF THIS LANE COULD NOT WIRE
 * ─────────────────────────────────────────────────────────────────────────────
 * The screen itself is `features/onboarding/RiskSetup.tsx`, mounted today by
 * `(onboarding)/risk.tsx`. The route group `(onboarding)` is closed to an
 * onboarded member — `src/app/_layout.tsx` bounces it to Home — so the order
 * lane cannot link to `/risk` after signup. Mounting `RiskSetup` at a route the
 * gate allows (`/account/risk`, say) and calling `needsRiskSetup(profile)`
 * before `Review paper order` is the one wiring step this module cannot do for
 * itself: `app/order/**`, `app/account/**` and `_layout.tsx` belong to other
 * lanes. Everything on this side of that line is finished and typed.
 */
import type { Profile, RiskAnswer } from '../../lib/types';

/**
 * Has a human chosen a risk level?
 *
 * `profile.onboarding` is typed as a closed object in `lib/types.ts`, which
 * this lane does not own, so the new key is read through a widening cast rather
 * than by adding a field to a shared type mid-wave. The cast is narrow — one
 * property, checked for `=== true` — and the fallback is the conservative one.
 */
export function needsRiskSetup(profile: Profile | null | undefined): boolean {
  if (!profile) return false; // Not loaded. Never prompt on an unknown.
  const bag = (profile.onboarding ?? {}) as Record<string, unknown>;
  return bag.risk_confirmed !== true;
}

/** The level applied to an account whose owner has not chosen one. */
export const RISK_DEFAULT: RiskAnswer = 'balanced';

export const RISK_DEFAULT_NOTE =
  'Balanced until you choose — you will be asked before your first paper order.';

/** The heading the screen wears when it is reached before an order. */
export const RISK_BEFORE_ORDER_TITLE = 'Before your first paper order';

export const RISK_BEFORE_ORDER_SUB =
  'This sets the daily loss cap the app enforces on your practice account. You can change it any time.';
