/**
 * THE DAILY RISK BUDGET, on the screen where it decides something.
 *
 * The board ("Practice with confidence", Order Review) prints one line above
 * the primary action:
 *
 *     Daily risk budget        $26 of $100 planned
 *     ▓▓▓▓▓░░░░░░░░░░░░░░░░░                  26%
 *
 * $26 is THIS order's planned risk if the stop executes. $100 is the member's
 * own daily cap. The bar is what the day's risk becomes if this order is placed
 * and everything the member is holding stops out — today's already-committed
 * risk plus this order's. That is the number a cap is actually about, and it is
 * the number the API's blocker is computed from (`daily_used` + this order vs
 * `daily_cap`, see apps/api/src/lib/execution/preview.ts).
 *
 * THREE ANSWERS, AND ONLY ONE OF THEM DRAWS A BAR.
 *
 *   `bar`     — a cap exists and we know it. Draw it.
 *   `no_cap`  — the member has set no daily cap. This is a real, chosen state
 *               and it is SAID: "No daily risk cap set." A cap of 100 invented
 *               to give the bar something to fill would be the app making up a
 *               rule the member never agreed to.
 *   `unknown` — this build's preview did not carry the daily block at all. Also
 *               said, in different words, because "you have no cap" and "I do
 *               not know your cap" are not the same sentence and only one of
 *               them is true.
 *
 * The `unknown` case is not hypothetical: `adaptPreview` in `lib/trade-api.ts`
 * does not yet copy `risk.daily_cap` / `risk.daily_used` / `risk.daily_remaining`
 * off the wire, although `OrderPreviewResponse` has carried all three since
 * packages/shared/api.ts:3052. That adapter is outside this lane's ownership,
 * so the field here is OPTIONAL and its absence renders as a stated absence
 * rather than as a plausible-looking bar. When the adapter is wired, every
 * screen below starts drawing the real thing with no further change.
 */
import type { OrderPreview } from './types';

export type DailyRiskBlock = {
  /** The member's own cap. `null` means they have set none. */
  cap: number | null;
  /** Today's realised losses plus open risk, before this order. */
  used: number;
  /** `cap - used`, or null when there is no cap. */
  remaining: number | null;
};

export type DailyBudget =
  | {
    kind: 'bar';
    /** This order's planned risk. */
    planned: number | null;
    /** Today's risk before this order. */
    used: number;
    /** used + planned — what the day becomes if this is placed. */
    after: number;
    cap: number;
    /** What is left after this order. Negative means it goes over. */
    remaining: number;
    /** 0…1, clamped, for the bar's width. */
    fraction: number;
    /** The used-so-far share of the same bar, 0…1. */
    usedFraction: number;
    /** "$26 of $100 planned" */
    headline: string;
    /** "26%" */
    percent: string;
    over: boolean;
  }
  | { kind: 'no_cap'; planned: number | null; headline: string; plain: string }
  | { kind: 'unknown'; planned: number | null; headline: string; plain: string };

const usd = (n: number): string => {
  const abs = Math.abs(n);
  const dp = abs >= 100 || Number.isInteger(abs) ? 0 : 2;
  return `$${abs.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
};

const finite = (v: number | null | undefined): v is number =>
  typeof v === 'number' && Number.isFinite(v);

/**
 * The budget for one order preview.
 *
 * `planned` is `max_loss` — the same number the screen already prints as
 * "Maximum planned loss" and the same number `hard_stop_plain` puts in words.
 * It is planned risk, not a guaranteed ceiling, and the copy around it says so
 * (F08: "Present stop-based risk as planned risk, not a guaranteed loss
 * ceiling.").
 */
export function dailyBudget(preview: OrderPreview): DailyBudget {
  const planned = finite(preview.max_loss) ? Math.abs(preview.max_loss) : null;
  const block = preview.daily_risk;

  if (!block) {
    return {
      kind: 'unknown',
      planned,
      headline: planned == null ? 'Not known' : `${usd(planned)} planned`,
      plain: 'Your daily risk budget is not reported on this build, so I cannot show how much of it this order uses.',
    };
  }

  if (!finite(block.cap) || block.cap <= 0) {
    return {
      kind: 'no_cap',
      planned,
      headline: planned == null ? 'No cap set' : `${usd(planned)} planned · no cap`,
      plain: planned == null
        ? 'You have set no daily risk cap, so there is nothing for this order to be measured against.'
        : `You have set no daily risk cap. This order plans ${usd(planned)} if the stop executes.`,
    };
  }

  const cap = block.cap;
  const used = finite(block.used) ? Math.max(0, block.used) : 0;
  const after = used + (planned ?? 0);

  return {
    kind: 'bar',
    planned,
    used,
    after,
    cap,
    remaining: cap - after,
    fraction: Math.max(0, Math.min(1, after / cap)),
    usedFraction: Math.max(0, Math.min(1, used / cap)),
    headline: `${usd(after)} of ${usd(cap)} planned`,
    percent: `${Math.round((after / cap) * 100)}%`,
    over: after > cap,
  };
}
