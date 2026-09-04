/**
 * THE READ — is this trade worth taking, and what would prove it wrong?
 *
 * This file is the whole reason the Trade section was rebuilt. The old portal
 * put five panels on one screen and let the user work out which of them was the
 * answer. Here there is one answer, and it is computed the same way every time,
 * from rows that already exist.
 *
 * THE RULE IT EXISTS TO ENFORCE
 * A graded setup and a conjured one look identical once they are on a screen:
 * both have an entry, both have a stop, both have a number next to the word
 * "target". The grading engine is what makes this product worth trusting, so
 * anything that did NOT come out of it has to be visibly, unmistakably not a
 * plan. That means:
 *
 *   1. A setup is graded only when a real alert row carries a letter grade.
 *   2. A plan is a plan only when it has an entry AND an invalidation. An entry
 *      with no stop is not a cautious plan; it is a price with a label on it.
 *   3. `/trade/portal/:symbol` fills its suggested entry with the LAST TRADED
 *      PRICE when the symbol has no setup (`suggestedEntry = entry ?? quote.price`
 *      in the route). So "there is an entry" is never on its own evidence that
 *      anyone decided anything. Rule 2 is what catches it.
 *   4. Nothing here invents a number. Every price returned came off the payload.
 *
 * When those rules say there is nothing to take, `takeable` is false and
 * `blocked_plain` says so in words a person can act on. Kai says he has nothing
 * rather than assembling something that looks like he does.
 */
import type { PortalAlert, TradePortal } from '../portal/types';

/** The three beats. One is primary on screen at a time. */
export type Beat = 'look' | 'decide' | 'take';
export const BEATS: Beat[] = ['look', 'decide', 'take'];
export const BEAT_LABEL: Record<Beat, string> = { look: 'Look', decide: 'Decide', take: 'Take' };
export const BEAT_STEP: Record<Beat, string> = { look: '1', decide: '2', take: '3' };

/** One level that carries weight in the read, with why it is there. */
export type ReadLevel = {
  key: 'entry' | 'stop' | 'target' | 'trigger';
  label: string;
  price: number;
  /** the far edge of a zone — entry 504–507 */
  price2: number | null;
  plain: string;
};

export type TradeRead = {
  symbol: string;
  /** A real alert row with a letter grade on it. Nothing else counts. */
  gradeable: boolean;
  grade_display: string | null;
  score: number | null;
  /** "Day Trade · Long" — from the alert, never guessed. */
  descriptor: string | null;
  /** One sentence: is this worth taking, and on what basis. */
  headline: string;
  /** Kai's own words about the setup, when a graded one exists. */
  interpretation: string | null;
  /** The levels that justify the read. Empty when there is no plan. */
  because: ReadLevel[];
  /** The line that would prove the trade wrong. */
  wrong_if: string | null;
  /** True only when there is an entry AND an invalidation to build an order on. */
  takeable: boolean;
  /** Why Take is not available, in words. Null when it is. */
  blocked_plain: string | null;
  /**
   * What Kai CAN point at when there is no graded setup: the levels computed
   * from real bars — the previous session's high and low, the averages, the
   * opening range, VWAP. He names them; the server resolves the numbers.
   */
  offer_plain: string | null;
  /** Long or short, for the order side. Defaults long only when it is stated. */
  direction: 'long' | 'short' | null;
};

const n = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);
/**
 * A level, written the way a trader says it.
 *
 * 504, not 504.00 — the trailing zeros are noise on a whole-dollar level and
 * they make a three-level list read like a spreadsheet. Anything with real cents
 * keeps both of them.
 */
const money = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2));

/** Long or short, read off whatever the alert actually said. */
export function directionOf(a: PortalAlert | null): 'long' | 'short' | null {
  const d = (a?.direction ?? '').toLowerCase();
  if (!d) return null;
  if (d.includes('short') || d.includes('put') || d.includes('reduce')) return 'short';
  if (d.includes('long') || d.includes('call') || d.includes('buy') || d.includes('accumulate')) return 'long';
  return null;
}

/**
 * The sentence Kai says on a symbol with nothing graded on it.
 *
 * Deliberately not an apology and not a hedge. It states the absence, says what
 * the absence means, and offers the thing he can actually do — which is mark the
 * levels that are arithmetic on the bars rather than a judgement about them.
 */
export const NO_SETUP_HEADLINE = (symbol: string) =>
  `I have no graded setup on ${symbol} right now, so I am not going to hand you a plan.`;

export const NO_SETUP_OFFER =
  'What I can do is mark what is actually on this chart — the previous session’s high and low, the averages, the opening range, VWAP — and talk you through it. Those are measurements, not opinions.';

export const NO_SETUP_BLOCKED =
  'There is nothing to take. A trade needs an entry and a level that says it was wrong, and this symbol has neither today.';

export const NO_STOP_BLOCKED =
  'There is an entry here but no invalidation level, so there is no trade to size. I need to know where this idea is wrong before you risk anything on it.';

/**
 * Read the portal payload into a decision.
 *
 * Pure. No network, no clock, no randomness — the same payload always reads the
 * same way, which is what makes it testable and what stops the answer drifting
 * between the screen and the order ticket.
 */
export function readPortal(p: TradePortal): TradeRead {
  const symbol = p.symbol;
  const alert = p.alert;
  const grade = alert?.grade_display?.trim() || null;
  const gradeable = Boolean(alert && grade);

  // Levels come from the plan first and the alert second, because a saved plan
  // is the user's own decision and outranks the suggestion that produced it.
  const entry = n(p.plan?.entry) ? p.plan!.entry! : n(alert?.entry) ? alert!.entry! : null;
  const entryHigh = n(alert?.entry_high) ? alert!.entry_high! : null;
  const stop = n(p.plan?.stop) ? p.plan!.stop! : n(alert?.stop) ? alert!.stop! : null;
  const target = p.plan?.targets?.length && n(p.plan.targets[0])
    ? p.plan.targets[0]
    : n(alert?.target) ? alert!.target! : null;

  /**
   * RULE 2, AND IT IS THE WHOLE FILE. An entry without an invalidation is not a
   * plan, whatever else the payload carries — see the header note about the
   * route filling `entry` with the last traded price.
   */
  const hasPlan = n(entry) && n(stop);

  const because: ReadLevel[] = [];
  if (hasPlan) {
    because.push({
      key: 'entry',
      label: entryHigh ? `Entry ${money(entry!)}–${money(entryHigh)}` : `Entry ${money(entry!)}`,
      price: entry!,
      price2: entryHigh,
      plain: alert?.condition
        ? alert.condition
        : 'Where the idea is still worth paying for.',
    });
    because.push({
      key: 'stop',
      label: `Stop ${money(stop!)}`,
      price: stop!,
      price2: null,
      plain: 'Past this the reason for the trade is gone.',
    });
    if (n(target)) {
      because.push({
        key: 'target',
        label: `Target ${money(target)}`,
        price: target,
        price2: null,
        plain: 'The first place the move has somewhere to stop.',
      });
    }
  }

  const wrongIf = hasPlan
    ? `${(directionOf(alert) ?? 'long') === 'short' ? 'Above' : 'Below'} ${money(stop!)} this is wrong and you are out.`
    : null;

  // "a A− setup" is the kind of sentence that makes a person stop trusting the
  // writing, and the writing is how the grade is explained.
  const article = grade && /^[AEF]/i.test(grade) ? 'an' : 'a';
  const headline = gradeable
    ? `${symbol} is ${article} ${grade} setup${alert?.rr ? ` at ${alert.rr}` : ''}${hasPlan ? '.' : ', but there is no complete plan attached to it yet.'}`
    : NO_SETUP_HEADLINE(symbol);

  const blocked = hasPlan
    ? null
    : gradeable || n(entry)
      ? NO_STOP_BLOCKED
      : NO_SETUP_BLOCKED;

  return {
    symbol,
    gradeable,
    grade_display: grade,
    score: n(alert?.score) ? alert!.score! : null,
    descriptor: alert ? [alert.mode, alert.direction].filter(Boolean).join(' · ') || null : null,
    headline,
    interpretation: gradeable ? (alert?.kai_interpretation ?? null) : null,
    because,
    wrong_if: wrongIf,
    takeable: hasPlan,
    blocked_plain: blocked,
    offer_plain: gradeable ? null : NO_SETUP_OFFER,
    direction: directionOf(alert),
  };
}

/**
 * Risk and reward, from the three levels and a share count.
 *
 * Returned as nulls rather than zeros when a piece is missing: a "$0 risk" on an
 * order card reads as a free trade, and it is the single most dangerous number
 * this screen could print.
 */
export function riskOf(entry: number | null, stop: number | null, target: number | null, shares: number | null) {
  const perShare = n(entry) && n(stop) ? Math.abs(entry - stop) : null;
  const reward = n(entry) && n(target) ? Math.abs(target - entry) : null;
  return {
    per_share: perShare,
    risk_usd: perShare != null && n(shares) ? perShare * shares : null,
    reward_usd: reward != null && n(shares) ? reward * shares : null,
    r_multiple: perShare != null && reward != null && perShare > 0 ? reward / perShare : null,
  };
}

/** "2.7R" — one decimal, never rounded up to a whole number it did not earn. */
export const rPlain = (r: number | null) => (r == null ? null : `${r.toFixed(1)}R`);
