/**
 * WHERE AN ORDER GOES — and the seam where a broker will one day be.
 *
 * There is exactly one venue today and it is the paper account. This file exists
 * so that when a real brokerage is connected it is added HERE, in one place,
 * rather than by scattering `if (broker)` through the confirmation card.
 *
 * NOTHING IN THIS FILE CONNECTS TO ANYTHING. No credentials, no OAuth, no
 * account linking. Spec 10 §10: a broker is never presented as execution-enabled
 * until the integration itself confirms that capability, so the second entry
 * below does not exist until there is something behind it to confirm.
 *
 * WHAT ADDING A BROKER WOULD MEAN, so the next person does not have to guess:
 *   1. a second `Venue` here, with `capability` reported by the integration and
 *      never assumed;
 *   2. `useTake` taking a venue and routing its preview/submit accordingly —
 *      the two-step preview→confirm shape does not change, because it is the
 *      shape that makes an order deliberate;
 *   3. the confirmation card printing the venue's own name where it now prints
 *      "Paper account", and the receipt saying which account filled it.
 * Nothing else on the Trade screen should need to know.
 */
export type VenueId = 'paper';

export type Venue = {
  id: VenueId;
  label: string;
  /** The one line that must be unmistakable on every order screen. */
  plain: string;
  /** True only when the venue itself has confirmed it can accept an order. */
  can_execute: boolean;
};

export const PAPER_VENUE: Venue = {
  id: 'paper',
  label: 'Paper account',
  plain: 'Practice money. Paper fills use delayed prices, and nothing here can be withdrawn.',
  can_execute: true,
};

export const VENUES: Venue[] = [PAPER_VENUE];

/** The venue an order goes to. One answer today, on purpose. */
export const venueFor = (): Venue => PAPER_VENUE;
