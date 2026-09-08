/**
 * WHAT HOME PUTS FIRST — the object, not just its order (audit F03).
 *
 * `features/stage/home-order.ts` already answers a narrower version of this
 * question: which SIDE of the conversation the training object is drawn on. It
 * is deliberately ordering-only, and it says so — it never moves training above
 * the opening message, so a beginner still reads the market state, the lead,
 * the evidence and the aside before reaching anything they can act on. F03 is
 * exactly that complaint, and its acceptance test is physical: at 390px the
 * first actionable object and its button must be visible without scrolling.
 *
 * So this decides WHICH object opens the screen, and `homeOrderFor` keeps
 * deciding where training sits relative to the wall for the members whose
 * opening object is not training. The two do not disagree: when this returns
 * `training`, the object is drawn once, in the opening, and the wall's copy is
 * suppressed by the screen.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE RULE, WHICH IS F03'S OWN SENTENCE
 * ─────────────────────────────────────────────────────────────────────────────
 * "a lesson for beginners; a company for investors; a setup or position for
 * traders."
 *
 *   beginner / developing   → the next lesson. The alerts below it are about a
 *                             job they cannot do yet.
 *   invest                  → the priority object, which in Invest mode is the
 *                             name the desk argued for.
 *   trade_ready             → the priority object: the setup or the position.
 *
 * WHEN THERE IS NO PRIORITY, the opening is the standing — quiet, or honestly
 * unverified. That is not a fallback to emptiness: "I checked and there is
 * nothing" is a finding and it is the most useful thing the screen can say on
 * that morning. It is never `training` by default, because sending a trade-ready
 * member to a lesson because the market is quiet is the app changing the
 * subject.
 *
 * A member still in Foundations DOES lead with training on a quiet morning —
 * the lesson is the useful thing for them whether or not the market is doing
 * anything, which is the whole reason `homeOrderFor` puts it above the wall.
 */
import type { GoalMode, Stage } from '../../lib/types';

export type OpeningKind = 'training' | 'priority' | 'standing';

export type Opening = {
  kind: OpeningKind;
  /**
   * True when the training object has already been drawn in the opening, so
   * the wall must not draw it a second time.
   */
  trainingInOpening: boolean;
};

/** Foundations and mid-programme members lead with the lesson. */
function learning(stage: Stage | null | undefined): boolean {
  return stage !== 'trade_ready';
}

export function openingFor(opts: {
  stage: Stage | null | undefined;
  mode: GoalMode;
  hasPriority: boolean;
}): Opening {
  if (learning(opts.stage)) return { kind: 'training', trainingInOpening: true };
  if (opts.hasPriority) return { kind: 'priority', trainingInOpening: false };
  return { kind: 'standing', trainingInOpening: false };
}
