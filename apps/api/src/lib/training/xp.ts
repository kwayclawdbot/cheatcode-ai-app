/**
 * THE ANTI-FARMING RULE, ON THE SERVER, WORD FOR WORD.
 *
 * ===========================================================================
 * This is `apps/mobile/src/features/training/xp.ts` moved to where a belt can
 * depend on it. Nothing in it is reworded, because a rule that exists in two
 * phrasings is a rule with two answers, and after the belt merge this one
 * decides whether somebody may sit an exam.
 *
 * The rule, precisely:
 *
 *     A COMPETENCY IS SATISFIED ONLY BY A PASSED ASSESSMENT.
 *     Not by watching. Not by watching a lot. Not by a full lesson of teaching
 *     screens with the assessment skipped.
 *
 * The curated-YouTube spec states why in one sentence — "Assessment +
 * application are load-bearing; belts cannot be farmed by letting videos play"
 * — and `apps/mobile/scripts/training-gates-test.mts` walks a member down every
 * farming route there is and checks that all of them stop here.
 *
 * ===========================================================================
 * WHY THE SERVER RE-GRADES A BODY IT WAS SENT
 * ===========================================================================
 * The curriculum lives in the app bundle: `features/training/curriculum.ts` is
 * TypeScript that Metro compiles into the binary, and the screens a lesson
 * contains are not knowable from here. So the phone reports what a run
 * produced, and this file decides what that report is allowed to be worth —
 * the same argument `lib/stage/rules.ts` makes about readiness evidence, and
 * for the same reason: the choice is between believing a client's evidence and
 * believing its conclusions, and this believes neither without checking.
 *
 * Three things are checked and they are the three that matter:
 *
 *   1. AN AWARD IS THE CONFIG'S NUMBER OR IT IS ZERO. A phone claiming 4,000
 *      practice XP gets 20, because 20 is what a practice screen is worth.
 *   2. ASSESSMENT XP REQUIRES `assessment_passed`. Enforced twice, here and in
 *      `record_lesson_completion`, because it is the load-bearing one.
 *   3. THE LESSON MUST EXIST. `curriculum.ts` in this directory is the server's
 *      own index of the thirty-one lesson nodes; an id that is not in it earns
 *      nothing, so "complete lesson `free-money`" is not a route onto a belt.
 */

export type TrainingXpKind = 'interactive' | 'video' | 'practice' | 'assessment';
export type TrainingXpLedger = Record<TrainingXpKind, number>;

/**
 * The spec's numbers, verbatim, and the same four that 0046 puts into
 * `points_config()->'training_xp'`. They are duplicated here rather than read
 * from the database on every lesson completion because this module is also the
 * thing `belt-merge-test.ts` runs without a database — and 0046 §11(a) asserts
 * the deployed config equals these, so a drift fails the migration rather than
 * quietly re-pricing a belt.
 */
export const XP_AWARD: Record<TrainingXpKind, number> = {
  interactive: 10,
  video: 10,
  practice: 20,
  assessment: 30,
};

export const XP_KINDS: TrainingXpKind[] = ['interactive', 'video', 'practice', 'assessment'];

export const emptyLedger = (): TrainingXpLedger => ({
  interactive: 0,
  video: 0,
  practice: 0,
  assessment: 0,
});

export function totalXp(ledger: TrainingXpLedger): number {
  return ledger.interactive + ledger.video + ledger.practice + ledger.assessment;
}

/**
 * THE RULE. A non-zero assessment balance is proof that a measurement happened
 * and was cleared, because the runner never writes assessment XP for a failed
 * challenge and `sanitiseLedger` below refuses to accept one that claims
 * otherwise.
 */
export function competencyEarned(ledger: TrainingXpLedger): boolean {
  return ledger.assessment >= XP_AWARD.assessment;
}

/** The shape being defended against: XP that is all watching. */
export function isVideoOnly(ledger: TrainingXpLedger): boolean {
  return (
    ledger.video > 0 &&
    ledger.interactive === 0 &&
    ledger.practice === 0 &&
    ledger.assessment === 0
  );
}

/**
 * What a reported run is ALLOWED to be worth.
 *
 * Each kind is the config's award or zero — never a number the client chose,
 * and never more than one award per kind per lesson, which is the same "each
 * kind is paid at most once per lesson" rule `ledgerForScreens` applies on the
 * phone. The assessment line is forced to zero unless the run says it cleared
 * the pass mark.
 */
export function sanitiseLedger(
  reported: Partial<Record<TrainingXpKind, unknown>> | null | undefined,
  assessmentPassed: boolean
): TrainingXpLedger {
  const out = emptyLedger();
  if (!reported) return out;
  for (const kind of XP_KINDS) {
    if (kind === 'assessment' && !assessmentPassed) continue;
    const raw = Number(reported[kind]);
    if (!Number.isFinite(raw) || raw <= 0) continue;
    out[kind] = XP_AWARD[kind];
  }
  return out;
}
