/**
 * TRAINING XP — AND THE RULE THAT VIDEO XP CANNOT BUY A BELT.
 * ===========================================================================
 *
 * The curated-YouTube spec (docs/training/BELT-YOUTUBE-CURRICULUM-SPEC.md) sets
 * four award sizes and then states the reason they are not equal:
 *
 *     interactive +10 · video +10 · Kai practice +20 · assessment passed +30
 *     "Assessment + application are load-bearing; belts cannot be farmed by
 *      letting videos play."
 *
 * That second sentence is the whole point of this file. Once the human layer of
 * the curriculum is a YouTube video, the cheapest possible action a member can
 * take — open a lesson, let a video run, walk away — must not move a belt. It
 * is the one failure mode that would look like progress on every screen while
 * meaning nothing, so it is enforced here as arithmetic rather than trusted to
 * the UI.
 *
 * THE RULE, PRECISELY. A competency is satisfied only by a PASSED assessment.
 * Not by watching. Not by watching a lot. Not by a full lesson of teaching
 * screens with the assessment skipped. `competencyEarned` is the only function
 * allowed to answer that question, `gates.ts` is its only caller that matters,
 * and `training-gates-test.mts` walks a member through every farming route it
 * could take and checks that all of them stop here.
 *
 * WHY A LEDGER RATHER THAN A TOTAL. A single XP number cannot answer "how did
 * you get this?", and that is exactly the question the anti-farming rule has to
 * ask. Splitting the four kinds keeps the provenance of every point, so the
 * gate can look at 40 XP and see whether it was 10+10+20 of real work or four
 * videos left playing.
 */

import type {
  TrainingLessonKind,
  LessonScreenType,
  TrainingXpKind,
  TrainingXpLedger,
} from './types';

export type { TrainingXpKind, TrainingXpLedger };

/**
 * The spec's numbers, verbatim. Video is deliberately the same size as
 * interactive and smaller than practice — watching is the cheapest thing a
 * member does, so it pays the least per minute and, per the rule below, buys
 * nothing on its own.
 */
export const XP_AWARD: Record<TrainingXpKind, number> = {
  interactive: 10,
  video: 10,
  practice: 20,
  assessment: 30,
};

export const EMPTY_XP_LEDGER: TrainingXpLedger = {
  interactive: 0,
  video: 0,
  practice: 0,
  assessment: 0,
};

export const emptyLedger = (): TrainingXpLedger => ({ ...EMPTY_XP_LEDGER });

export function addLedgers(a: TrainingXpLedger, b: TrainingXpLedger): TrainingXpLedger {
  return {
    interactive: a.interactive + b.interactive,
    video: a.video + b.video,
    practice: a.practice + b.practice,
    assessment: a.assessment + b.assessment,
  };
}

/**
 * The better of two ledgers, kind by kind — what a replay of the same lesson is
 * worth. Never a sum, so walking one lesson ten times pays once; but a kind
 * that was zero and is now earned (the assessment passed on the second try)
 * does get picked up.
 */
export function bestOfEach(
  held: TrainingXpLedger | undefined,
  earned: TrainingXpLedger,
): TrainingXpLedger {
  if (!held) return { ...earned };
  return {
    interactive: Math.max(held.interactive, earned.interactive),
    video: Math.max(held.video, earned.video),
    practice: Math.max(held.practice, earned.practice),
    assessment: Math.max(held.assessment, earned.assessment),
  };
}

export function totalXp(ledger: TrainingXpLedger): number {
  return ledger.interactive + ledger.video + ledger.practice + ledger.assessment;
}

/**
 * THE ANTI-FARMING RULE.
 *
 * A competency is earned when, and only when, an assessment has been PASSED.
 * The runner never writes assessment XP for a failed challenge, so a non-zero
 * assessment balance is proof that a measurement happened and was cleared.
 *
 * Everything else — every teaching screen, every video, every Kai drill — is
 * preparation. Preparation is paid for, and preparation is not proof.
 */
export function competencyEarned(ledger: TrainingXpLedger): boolean {
  return ledger.assessment >= XP_AWARD.assessment;
}

/**
 * The specific shape being defended against: XP that is all watching. Kept as
 * its own named function because it is the sentence the test asserts and the
 * one a future reader will come looking for.
 */
export function isVideoOnly(ledger: TrainingXpLedger): boolean {
  return (
    ledger.video > 0 &&
    ledger.interactive === 0 &&
    ledger.practice === 0 &&
    ledger.assessment === 0
  );
}

/**
 * Which bucket a screen pays into. The mapping follows the spec's lesson shape
 * (Learn → Watch → Practice → Master) rather than the renderer's file layout:
 *
 *   interactive — the teaching and quiz screens the member taps through
 *   video       — the human layer, ours or curated
 *   practice    — Kai drills and applied building; the member produces something
 *   assessment  — the measurement at the end, and only that
 */
export function xpKindForScreen(type: LessonScreenType): TrainingXpKind {
  switch (type) {
    case 'video':
      return 'video';
    case 'kai_check':
    case 'trade_builder':
    case 'setup_triage':
    case 'paper_sim':
    case 'journal':
      return 'practice';
    case 'mastery_challenge':
    case 'final_exam':
      return 'assessment';
    default:
      return 'interactive';
  }
}

/** The same question asked of a lesson node, for the day board's estimate. */
export function xpKindForLessonKind(kind: TrainingLessonKind): TrainingXpKind {
  switch (kind) {
    case 'video':
      return 'video';
    case 'kai_practice':
    case 'chart_challenge':
    case 'trade_builder':
    case 'simulation':
    case 'journal':
      return 'practice';
    case 'mastery':
      return 'assessment';
    default:
      return 'interactive';
  }
}

/**
 * What one walk through a lesson is worth.
 *
 * Each KIND is paid at most once per lesson — a lesson with three concept
 * screens is one interactive award, not three — because the award is for
 * completing that part of the lesson shape, not for the number of taps it took.
 *
 * `assessmentPassed` is the load-bearing argument. When a lesson contains an
 * assessment screen and the member did not clear its pass mark, the assessment
 * line stays at zero and, per `competencyEarned`, nothing is satisfied. A
 * lesson with no assessment screen at all also earns no assessment XP, which is
 * the correct reading: a lesson that never measured anything has not proved
 * anything.
 */
export function ledgerForScreens(
  screenTypes: readonly LessonScreenType[],
  assessmentPassed: boolean,
): TrainingXpLedger {
  const ledger = emptyLedger();
  const paid = new Set<TrainingXpKind>();

  for (const type of screenTypes) {
    // The completion screen is bookkeeping, not learning. It pays nothing.
    if (type === 'completion') continue;
    const kind = xpKindForScreen(type);
    if (kind === 'assessment' && !assessmentPassed) continue;
    if (paid.has(kind)) continue;
    paid.add(kind);
    ledger[kind] = XP_AWARD[kind];
  }

  return ledger;
}
