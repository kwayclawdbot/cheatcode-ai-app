/**
 * THE HANDOFF CONTRACT — the one thing the website owes the app.
 *
 * The persona and two checkpoint answers are carried to early access. The persona must
 * survive the jump into the app so onboarding's "Where are you right now?"
 * is already answered.
 *
 * Wire format: ?path=learn|swing|pro&interest=<feature>&priority=<feature>
 *
 * The app's own answer values live in apps/mobile/src/lib/types.ts as
 * `StartAnswer = 'brand_new' | 'investor' | 'swing' | 'active'`, and the
 * screen that asks is apps/mobile/src/app/(onboarding)/start.tsx.
 *
 * We deliberately do NOT send `start_answer` values over the wire. The site
 * asks a coarser question (three doors, not four answers), and `investor`
 * has no door of its own — a visitor who invests but does not trade picks
 * "Learn". Sending our own vocabulary keeps the site free to re-word its
 * three doors without a coordinated app release.
 *
 * Full write-up, including what the app has to change to consume this:
 * docs/SITE-APP-PARAM-CONTRACT.md
 */

import type { PathId } from "./personas";

/** What the app should store as `start_answer` for each site path. */
export const START_ANSWER_FOR: Record<
  PathId,
  "brand_new" | "swing" | "active"
> = {
  learn: "brand_new",
  swing: "swing",
  pro: "active",
};

/**
 * Where each path lands once the server has placed the account
 * (apps/api/src/lib/stage/rules.ts → START_PLACEMENT). Recorded here only so
 * the site's promise and the app's behaviour can be diffed later.
 *
 * THE ROOMS CHANGED. This used to name `swing` and `day-trade` as separate
 * rooms. Migration 0045 made it three chats — Traders, Investors, Beginners —
 * and swing and day_trade now share the Traders chat. The mode still differs,
 * because a mode is the member's desk and no longer picks a room at all.
 *
 * AND THE PLACEMENT IS A SUGGESTION, NOT A HANDOFF. Audit F01's acceptance:
 * "do not silently promote readiness from a marketing persona." The app shows
 * the door somebody walked through as a suggestion on its first screen and
 * still requires the tap — see
 * apps/mobile/src/features/onboarding/steps.ts → prefillFromIntent. What this
 * table records is where that tap WOULD land, so the two can be compared.
 */
export const PLACEMENT_FOR: Record<
  PathId,
  { stage: string; mode: string; chat: string }
> = {
  learn: { stage: "beginner", mode: "invest", chat: "beginners" },
  swing: { stage: "developing", mode: "swing", chat: "traders" },
  pro: { stage: "trade_ready", mode: "day_trade", chat: "traders" },
};

export function isPathId(value: string | null | undefined): value is PathId {
  return value === "learn" || value === "swing" || value === "pro";
}

/** The app's custom scheme, from apps/mobile/app.json. */
export const APP_SCHEME = "cheatcodeai";

/** Deep link for a device that already has the app. */
export function deepLink(path: PathId): string {
  return `${APP_SCHEME}://start?path=${path}`;
}

/** The on-site handoff page. Carries the answer until there is an app URL. */
export function getAppHref(
  path: PathId,
  intent: { interest?: string; priority?: string } = {},
): string {
  const params = new URLSearchParams({ path });
  if (intent.interest) params.set("interest", intent.interest);
  if (intent.priority) params.set("priority", intent.priority);
  return `/get-the-app?${params.toString()}`;
}

/**
 * The link a confirmed request hands back — the deep link, plus the opaque
 * token the API issued for that request.
 *
 * The token is why the app does not have to ask the same questions again
 * (audit F01/F21). It carries INTENT and nothing else: presenting it to
 * `POST /onboarding/intent/claim` returns a path and two feature preferences,
 * and who is asking is settled by the app's own authenticated session. It is
 * stored hashed server-side, so it is not a credential and losing it costs
 * somebody two taps.
 */
export function appLinkWithIntent(path: PathId, token: string | null): string {
  const params = new URLSearchParams({ path });
  if (token) params.set("intent", token);
  return `${APP_SCHEME}://start?${params.toString()}`;
}
