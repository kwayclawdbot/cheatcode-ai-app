/**
 * WHERE THE PRIVACY POLICY AND THE TERMS LIVE.
 *
 * ===========================================================================
 * THE DOCUMENTS THEMSELVES ARE NOT WRITTEN HERE, AND MUST NOT BE.
 * ===========================================================================
 * Another lane is drafting them. This file only knows where they will be
 * published, and every surface in the app reads the address from here so a
 * change lands in one place.
 *
 * WHY APPLE CARES. An App Store submission cannot be completed without a
 * privacy policy URL, and the reviewer follows it. App Review guideline 5.1.1
 * requires the policy to be reachable INSIDE the app as well as on the store
 * listing, and 3.1.2 requires terms to be reachable for anything with a
 * subscription behind it. "Reachable" means a person who is already signed in
 * can find it, AND a person who has not signed in yet can find it — which is
 * why these links appear on the welcome screen as well as in Account.
 *
 * ---------------------------------------------------------------------------
 * WHAT HAPPENS WHEN THEY ARE NOT SET
 * ---------------------------------------------------------------------------
 * The links are HIDDEN, not drawn dead. A "Privacy Policy" row that opens
 * nothing, or opens a 404, is worse than no row: a reviewer taps it, gets
 * nothing, and rejects for a broken required link rather than a missing one.
 * `legalReady()` is what every surface asks before drawing anything.
 *
 * SO THIS IS A BLOCKER ON SUBMISSION AND IS LISTED AS ONE. The app cannot be
 * submitted until both values are real, published, publicly reachable URLs.
 *
 * ---------------------------------------------------------------------------
 * HOW THE OWNER SETS THEM
 * ---------------------------------------------------------------------------
 * In `apps/mobile/.env` (and in the EAS build profile's `env` block, because a
 * cloud build does not read the laptop's .env file):
 *
 *     EXPO_PUBLIC_PRIVACY_URL=https://cheatcode.com/privacy
 *     EXPO_PUBLIC_TERMS_URL=https://cheatcode.com/terms
 *
 * The addresses above are ILLUSTRATIVE. The real paths are the owner's to
 * decide and depend on where the legal lane publishes.
 *
 * `https://` is required. A link that is not https is refused rather than
 * opened: an in-app browser sheet is where somebody would type a password.
 */

/** A configured URL, or null when it is absent or not a plain https address. */
function httpsOrNull(raw: string | undefined): string | null {
  const v = (raw ?? '').trim();
  if (!v) return null;
  return /^https:\/\/[^\s]+$/i.test(v) ? v : null;
}

export const PRIVACY_URL = httpsOrNull(process.env.EXPO_PUBLIC_PRIVACY_URL);
export const TERMS_URL = httpsOrNull(process.env.EXPO_PUBLIC_TERMS_URL);

/**
 * Is there anything to link to at all?
 *
 * Every legal surface asks this first and draws nothing when it is false — see
 * the note above on why a dead link is worse than an absent one.
 */
export function legalReady(): boolean {
  return PRIVACY_URL !== null || TERMS_URL !== null;
}
