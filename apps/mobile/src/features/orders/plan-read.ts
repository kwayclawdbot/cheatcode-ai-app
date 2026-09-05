/**
 * A PRICE WITH A LABEL ON IT IS NOT A PLAN.
 *
 * This is the plan screen's half of the rule the Trade section already
 * enforces, and it exists because of one line on the server:
 *
 *     const suggestedEntry = entry ?? quote.price;      // symbols/[symbol]
 *
 * On a symbol with no graded setup that made the last traded price come back
 * labelled "entry". The Trade section catches it (`features/portal2/read.ts`,
 * rule 2). The plan screen did not: it printed the number in an Entry tile,
 * where it is indistinguishable from a level the grading engine produced. The
 * grading engine is the reason any of these numbers are worth trusting, and a
 * conjured entry quietly borrows that authority.
 *
 * The route has been fixed to stop sending it. This file assumes it will be
 * sent anyway — because a phone can be pointed at an API that has not been
 * redeployed, and because a rule that only holds when the server behaves is
 * not a rule.
 *
 * TWO DIFFERENT JOBS, and the difference matters:
 *
 *   `suggestedLevels` filters what the SERVER offers. A suggestion nobody
 *   decided is dropped whole.
 *
 *   `planStanding` describes where a plan STANDS, including one the user is
 *   halfway through typing. It never blanks a number the user entered — a
 *   price you chose yourself is a decision, and hiding it would be its own
 *   kind of dishonesty. It says what is still missing instead.
 */
import type { Plan } from './types';

const n = (v: number | null | undefined): v is number =>
  typeof v === 'number' && Number.isFinite(v);

/** Both messages, so the screens and the tests read the same words. */
export const NO_SETUP_PLAIN = (symbol: string) =>
  `I have no graded setup on ${symbol}, so I have no entry and no stop to offer you. `
  + 'What it last traded at is not an entry — putting that number here would make a '
  + 'guess look like a plan. Set the levels yourself if you want to build one anyway.';

/**
 * For a number the USER put in. It is safe to call it an entry, because they
 * decided it.
 */
export const NO_STOP_PLAIN = (symbol: string) =>
  `There is an entry on ${symbol} but no level that says the idea failed, so this is `
  + 'not a plan yet and there is nothing to size. Set the stop and the rest follows.';

/**
 * For a number the SERVER offered, where the client cannot tell what it is.
 *
 * This is the honest limit of what a phone knows. An old API sends the same
 * shape — a price, no stop — whether that price came out of a graded setup or
 * is simply what the stock last traded at, and there is nothing in the payload
 * that separates them. So this sentence never vouches for the number. It says
 * what is certainly true: with no invalidation there is no plan, and a price
 * on its own is not an entry. The fixed route knows which case it is in and
 * sends its own, more specific words, which are preferred when they arrive.
 */
export const NO_STOP_SUGGESTED = (symbol: string) =>
  `This is not a plan yet: there is no level on ${symbol} that says the idea failed. `
  + 'A price on its own is not an entry — it might be a graded level or it might be '
  + 'what the stock last traded at, and I am not going to present one as the other. '
  + 'Set both and I will size it.';

export const NO_ENTRY_PLAIN = (symbol: string) =>
  `There is a stop on ${symbol} but no entry, so there is nothing to size against yet.`;

/**
 * What the server suggested, after the rule.
 *
 * An entry with no invalidation is dropped ALONG WITH the entry, not softened
 * into a warning next to it. Half a plan on screen is read as a plan.
 */
export function suggestedLevels(input: {
  symbol: string;
  entry: number | null;
  stop: number | null;
  targets: number[];
  /** The server's own words, when it is new enough to send them. */
  noPlanPlain?: string | null;
}): { entry: number | null; stop: number | null; targets: number[]; noPlanPlain: string | null } {
  const hasPlan = n(input.entry) && n(input.stop);
  if (hasPlan) {
    return { entry: input.entry, stop: input.stop, targets: input.targets, noPlanPlain: null };
  }
  const said = input.noPlanPlain?.trim()
    || (n(input.entry) ? NO_STOP_SUGGESTED(input.symbol) : NO_SETUP_PLAIN(input.symbol));
  return { entry: null, stop: null, targets: [], noPlanPlain: said };
}

/**
 * Where a plan stands right now, and what is missing, in words.
 *
 * Called on every render of the plan screen, on the user's own working draft
 * as much as on the server's suggestion.
 */
export function planStanding(plan: Pick<Plan, 'symbol' | 'entry' | 'stop'> & {
  no_plan_plain?: string | null;
}): { hasPlan: boolean; blockedPlain: string | null } {
  if (n(plan.entry) && n(plan.stop)) return { hasPlan: true, blockedPlain: null };

  /*
   * THE SERVER'S SENTENCE GOES STALE THE MOMENT THE USER TYPES.
   *
   * `no_plan_plain` arrives saying "I have no entry and no stop to give you",
   * which is true when the screen loads and false the second the user fills in
   * an entry themselves. So it is only used for the case it was written about
   * — nothing filled in at all. Once either number exists, what is MISSING is
   * described instead, from what is actually on the screen.
   *
   * A number the user typed is a decision and is never taken off the screen.
   * Only the sentence underneath changes.
   */
  if (n(plan.entry)) return { hasPlan: false, blockedPlain: NO_STOP_PLAIN(plan.symbol) };
  if (n(plan.stop)) return { hasPlan: false, blockedPlain: NO_ENTRY_PLAIN(plan.symbol) };
  return {
    hasPlan: false,
    blockedPlain: plan.no_plan_plain?.trim() || NO_SETUP_PLAIN(plan.symbol),
  };
}

/**
 * What goes in the Entry tile.
 *
 * A separate function purely so a test can assert on the exact string that
 * reaches the screen, rather than on the reasoning behind it. It returns a
 * price only when the plan actually carries one; the em dash is the whole of
 * the alternative, with the reason printed underneath the row.
 */
export function entrySlot(plan: Pick<Plan, 'entry'>): string {
  return n(plan.entry) ? String(plan.entry) : '—';
}
