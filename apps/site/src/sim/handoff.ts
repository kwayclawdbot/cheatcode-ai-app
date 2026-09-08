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
 */
export const PLACEMENT_FOR: Record<
  PathId,
  { stage: string; mode: string; room: string }
> = {
  learn: { stage: "beginner", mode: "invest", room: "beginners" },
  swing: { stage: "developing", mode: "swing", room: "swing" },
  pro: { stage: "trade_ready", mode: "day_trade", room: "day-trade" },
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
