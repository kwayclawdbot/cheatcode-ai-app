/**
 * THE STOREFRONT SWITCH — who is allowed to be shown a price.
 *
 * ===========================================================================
 * WHY THIS FILE EXISTS. Apple's App Store rule 3.1.3(b) ("multiplatform
 * services") is what lets this app work at all without In-App Purchase: a
 * person buys a subscription on the website, and the app simply honours it.
 * That permission comes with ONE hard condition, and it is absolute:
 *
 *     THE APP MAY CONTAIN NO PRICE AND NO ROUTE TO BUY ANYTHING.
 *
 * Not a price list. Not an "upgrade" button. Not a link to the website's
 * checkout. Not a sentence in Kai's mouth naming a monthly figure. Apple
 * rejects on exactly this, routinely, and it is a rejection that costs a review
 * cycle each time.
 *
 * The business still needs the purchase paths — they ARE the business — so the
 * Stripe routes are not deleted. They are CLOSED TO THE APP and open only to a
 * caller that has identified itself as the website.
 *
 * ---------------------------------------------------------------------------
 * IT FAILS CLOSED, AND THAT IS THE WHOLE DESIGN.
 * ---------------------------------------------------------------------------
 * A guard that reads "block the app" is wrong: an older app build already on
 * someone's phone does not send the header, a future client might forget it,
 * and a reviewer's proxy can strip it. Any of those silently reopens the
 * storefront inside the app — which is the failure this file exists to prevent.
 *
 * So the question is inverted. A caller sees money only if it PROVES it is a
 * client that is allowed to see money. Anything unproven — including every app
 * build that ever shipped — sees none. The default with no configuration at all
 * is: nobody sees a price, and the checkout routes answer NOT_FOUND.
 *
 * ---------------------------------------------------------------------------
 * HOW THE WEBSITE OPENS IT
 * ---------------------------------------------------------------------------
 * Two things, both the owner's to set, neither of them in this repo:
 *
 *   1. Set `STOREFRONT_CLIENTS=web` in the API's environment.
 *   2. Have the website send `X-CheatCode-Client: web` on its calls.
 *
 * Until both are done the checkout routes are closed to everyone, which is the
 * correct state for the App Store submission and costs the business nothing
 * today: nothing but the app has ever called them.
 *
 * `app` is refused even if it is listed. That is deliberate — it makes the one
 * mistake that matters impossible to make by editing an environment variable.
 */
import { ApiError } from './errors';

/** Every client of this API states who it is on this header. */
export const CLIENT_HEADER = 'x-cheatcode-client';

/** What the mobile app sends. Hard-coded here so it can never be allow-listed. */
export const APP_CLIENT = 'app';

/**
 * Client identifiers that may be shown prices and reach a purchase page.
 * Comma-separated, lower-cased, `app` stripped out unconditionally.
 * Empty by default: with no configuration, nothing is a storefront.
 */
function allowedClients(): Set<string> {
  const raw = process.env.STOREFRONT_CLIENTS ?? '';
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0 && s !== APP_CLIENT)
  );
}

/**
 * May this caller be shown prices and purchase paths?
 *
 * TRUE only for a caller that names itself as an allow-listed client. Absent
 * header, unknown value, or the app itself: false.
 */
export function isStorefrontClient(req: { headers: { get(name: string): string | null } }): boolean {
  const claimed = req.headers.get(CLIENT_HEADER)?.trim().toLowerCase() ?? '';
  if (!claimed || claimed === APP_CLIENT) return false;
  return allowedClients().has(claimed);
}

/**
 * The refusal a purchase route gives a caller that is not a storefront.
 *
 * NOT_FOUND, not FORBIDDEN, and for the same reason the admin routes answer
 * NOT_FOUND: a checkout endpoint that says "you are not allowed here" has
 * confirmed to an App Store reviewer that a purchase path exists inside the
 * app's own API surface. The honest answer for a client that must never use
 * this route is that, for that client, the route is not there.
 */
export function storefrontClosed(): ApiError {
  return new ApiError('NOT_FOUND', 'That is not something this app does.');
}
