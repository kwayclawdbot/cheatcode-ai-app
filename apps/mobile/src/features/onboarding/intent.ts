/**
 * WHAT THE WEBSITE TAUGHT US, BEFORE ANYBODY HAD AN ACCOUNT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PROBLEM THIS EXISTS FOR
 * ─────────────────────────────────────────────────────────────────────────────
 * Audit F21 (P1). `apps/site` runs a genuinely good conversational funnel —
 * three doors, a cinematic reveal, two branching checkpoints, a personalised
 * recap — and then ended at `mailto:`. The most engaged visitor in the product
 * was asked to leave the flow and compose an email by hand. Nothing was
 * recorded, so F01's other half followed automatically: a visitor who had just
 * taught the funnel exactly what they wanted opened the app and answered the
 * same questions again.
 *
 * The site now posts the request (see `apps/site/src/app/api/early-access`),
 * the API records it in the CRM that already exists, and this module is the
 * app's side of the handoff.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * INTENT IS NOT IDENTITY, AND THIS FILE IS WHERE THAT IS ENFORCED ON THE PHONE
 * ─────────────────────────────────────────────────────────────────────────────
 * A `FunnelIntent` holds what somebody wants. It holds no email, no name and no
 * person id, and it never will — the type has no field for one. Two consequences
 * follow, and both are the point:
 *
 *   · It can be stored on the DEVICE, before a session exists, without storing
 *     anything about a person. `storage.ts` keeps it under a device-wide key
 *     while the onboarding DRAFT is keyed per user id. That is the mechanical
 *     form of the audit's "keep identity and intent separate until an account
 *     exists".
 *
 *   · A leaked or guessed `token` gets somebody a path preference. It cannot be
 *     used to become anybody: the server's claim route returns intent only, and
 *     authentication — not the token — establishes who is asking.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PATHS ARE THE SITE'S VOCABULARY AND STAY THAT WAY
 * ─────────────────────────────────────────────────────────────────────────────
 * `apps/site/src/sim/handoff.ts` explains why the wire carries `learn | swing |
 * pro` rather than this app's `StartAnswer` values: the site asks a coarser
 * question, `investor` has no door of its own, and sending our vocabulary would
 * tie a re-wording of three marketing doors to a coordinated app release. So
 * the translation happens here, on arrival, where it can be argued about.
 */
import type { Experience, GoalMode, StartAnswer } from '../../lib/types';

/** The site's three doors. Its vocabulary, not ours. */
export type FunnelPath = 'learn' | 'swing' | 'pro';

export function isFunnelPath(v: unknown): v is FunnelPath {
  return v === 'learn' || v === 'swing' || v === 'pro';
}

/**
 * One completed funnel, as the app understands it.
 *
 * `interest` and `priority` are the two checkpoint answers, kept as the site's
 * own feature ids (`lesson`, `alert`, `chart`, `kai`, …). The app does not act
 * on them yet — they are carried so the first-minute work has something real to
 * open — and they are deliberately typed as plain strings rather than mirrored
 * as a union, because the site owns that list and a stale mirror here would
 * silently drop a new answer.
 */
export type FunnelIntent = {
  path: FunnelPath;
  interest: string | null;
  priority: string | null;
  /** The mode the path implies. A preference, prefilled. */
  goal_mode: GoalMode;
  /** How much Kai explains, implied by the path. A preference, prefilled. */
  guidance: Experience;
  /**
   * The placement this path SUGGESTS. Shown on step 1 as "From the website",
   * never written into the draft on arrival. See `steps.ts` → `prefillFromIntent`.
   */
  suggested_placement: StartAnswer;
  /**
   * The opaque token the site's confirmation handed back, when there was one.
   * Present for a device that arrived by deep link; absent when the intent was
   * recovered after sign-in from the member's own email address.
   */
  token: string | null;
};

const GOAL_FOR_PATH: Record<FunnelPath, GoalMode> = {
  learn: 'invest',
  swing: 'swing',
  pro: 'day_trade',
};

/**
 * Guidance from the door somebody walked through.
 *
 * `learn` is "I'm new, or still building confidence" in the site's own words,
 * so Kai explains everything. `pro` is "I want advanced tools" — numbers first.
 * `swing` is the middle. All three are visible and one tap from being changed
 * on step 2, which is what makes it acceptable to guess at all.
 */
const GUIDANCE_FOR_PATH: Record<FunnelPath, Experience> = {
  learn: 'new',
  swing: 'some',
  pro: 'pro',
};

/**
 * The placement the door suggests.
 *
 * This mirrors `START_ANSWER_FOR` in the site's `handoff.ts`. It is a
 * SUGGESTION and nothing here applies it — see the file header, and F01's
 * "do not silently promote readiness from a marketing persona".
 */
const PLACEMENT_SUGGESTED_BY: Record<FunnelPath, StartAnswer> = {
  learn: 'brand_new',
  swing: 'swing',
  pro: 'active',
};

/** Build an intent from whatever arrived — a deep link, or the claim route. */
export function intentFromPath(
  path: FunnelPath,
  extra: { interest?: string | null; priority?: string | null; token?: string | null } = {},
): FunnelIntent {
  return {
    path,
    interest: extra.interest ?? null,
    priority: extra.priority ?? null,
    goal_mode: GOAL_FOR_PATH[path],
    guidance: GUIDANCE_FOR_PATH[path],
    suggested_placement: PLACEMENT_SUGGESTED_BY[path],
    token: extra.token ?? null,
  };
}

/**
 * Parse whatever a deep link or a claim response handed over.
 *
 * Returns null rather than a partial intent for anything it does not
 * recognise. A funnel answer that arrives malformed is worth exactly nothing,
 * and half of one is worth less than nothing — it would prefill a mode from a
 * string nobody chose.
 */
export function parseIntent(raw: unknown): FunnelIntent | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!isFunnelPath(o.path)) return null;
  const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 && v.length <= 64 ? v : null);
  return intentFromPath(o.path, {
    interest: str(o.interest),
    priority: str(o.priority),
    token: str(o.token),
  });
}

/**
 * The sentence step 1 shows above the suggested option.
 *
 * It names the source out loud. A prefill the member cannot see the origin of
 * is indistinguishable from the app having decided something about them.
 */
export const INTENT_CREDIT = 'From your answers on the website. Confirm it or pick something else.';
