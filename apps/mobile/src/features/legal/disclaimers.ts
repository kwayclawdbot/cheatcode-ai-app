/**
 * "THIS IS NOT INVESTMENT ADVICE", IN THE PLACES WHERE IT ACTUALLY MATTERS.
 *
 * ===========================================================================
 * THIS WORDING NEEDS THE OWNER'S REVIEW BEFORE THE APP IS SUBMITTED.
 * ===========================================================================
 * It is a plain-English DRAFT written by an engineer, not by a lawyer, and it
 * must not be treated as legally sufficient because it is committed. What it is
 * good for is that the sentences exist, appear in the right places, and say
 * something true. What they are NOT is reviewed by anyone qualified to say
 * whether they discharge a duty. An app that discusses entries, stops and
 * position sizes sits close to territory that is regulated in most places the
 * App Store operates, and the exact required wording differs by jurisdiction.
 *
 * THE OWNER'S JOB HERE IS TO HAVE THESE READ BY SOMEONE QUALIFIED AND THEN
 * EDIT THIS FILE. Nothing else in the app has to change when he does — every
 * surface reads its sentence from here.
 *
 * ---------------------------------------------------------------------------
 * WHY THESE PLACES AND NOT OTHERS
 * ---------------------------------------------------------------------------
 * A disclaimer everywhere is a disclaimer nowhere: it becomes furniture and
 * stops being read. These four go where a person is closest to acting on
 * something:
 *
 *   NOT_ADVICE_SHORT   under Kai's answers — he discusses setups and levels
 *   NOT_ADVICE_ALERTS  on the alerts surface — an alert reads as a call
 *   NOT_ADVICE_SETUP   on the setup card — a grade with an entry, a stop and a
 *                      target is the most advice-shaped thing in the app
 *   NOT_ADVICE_PAPER   on the paper account — the money is not real, and the
 *                      fills are not real either
 *   NOT_ADVICE_LONG    the full sentence, on the account and plan screens
 *
 * ---------------------------------------------------------------------------
 * THE WORDING IS DELIBERATELY NOT HEDGED INTO MEANINGLESSNESS
 * ---------------------------------------------------------------------------
 * The house rule on this app is that the honest thing gets said in normal
 * words. "Past performance is not indicative of future results" is a phrase
 * nobody reads. "Kai can be wrong" is a phrase everybody understands, and it is
 * the same claim. Where a legal review insists on the formula, the formula
 * wins — but it should be added to these sentences, not swapped for them.
 */

/** Under Kai's answers, and anywhere he has just discussed a trade. */
export const NOT_ADVICE_SHORT =
  'Kai is not a financial adviser and this is not investment advice. He can be wrong. Every decision, and every loss, is yours.';

/** On the alerts surface. An alert is the thing most easily mistaken for a call. */
export const NOT_ADVICE_ALERTS =
  'An alert is a thing Kai noticed, not a recommendation to buy or sell. It is not investment advice, it can be wrong, and what you do about it is your decision.';

/**
 * On the setup card — the grade beside an entry, a target and an invalidation.
 *
 * ADDED BECAUSE THE LEGAL LANE ASKED FOR IT. `legal/DISCLAIMERS.md` names this
 * as the one gap in the original set: it is the single most advice-shaped
 * surface in the app, and it had no line. The wording below is theirs, and is
 * as much a draft as everything else here.
 */
export const NOT_ADVICE_SETUP =
  'A grade is our opinion of a pattern, not a forecast. The entry, stop and targets show how the idea could be structured — they are not a recommendation and not a plan for you.';

/** On the paper account and the order surfaces. */
export const NOT_ADVICE_PAPER =
  'Paper trading is practice with money that does not exist. Fills use delayed prices, so a real order would not have filled the same way. Nothing here is investment advice.';

/** The full sentence, for account-level screens. */
export const NOT_ADVICE_LONG =
  'Cheat Code AI is education and preparation. It is not investment advice and Kai is not a financial adviser. Kai never places a trade, never promises an outcome, and can be wrong. Trading involves risk, including the loss of everything you put in. Every decision is yours.';
