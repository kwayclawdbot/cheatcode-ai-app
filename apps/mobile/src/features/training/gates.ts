import {
  TRAINING_DAYS,
  dayById,
  dayForLesson,
  lessonNodeById,
  lessonsForDay,
} from './curriculum';
import type { TrainingDay, TrainingProfile, TrainingXpLedger } from './types';
import { XP_AWARD, addLedgers, competencyEarned, emptyLedger, totalXp } from './xp';

/**
 * THE GATES — pure functions, no React, no storage, no side effects.
 * ===========================================================================
 *
 * Two questions, and only two:
 *
 *   1. Has the member EARNED the next day? A day's gate is the spec's promise
 *      that the product will not hand somebody a stop-loss lesson while they
 *      still cannot say which way price is going. `evaluateDayGate` answers it
 *      and, more usefully, says exactly which requirement is short and by how
 *      much — a locked door with no sign on it is a bug.
 *
 *   2. What is OPEN right now? Day 1 is always open. Day N opens when Day N−1's
 *      gate passes. Inside a day, lesson N opens when lesson N−1 is complete.
 *
 * Everything here reads the profile and returns a value. That is deliberate:
 * these are the rules most likely to be argued about and adjusted, so they are
 * the ones that must be testable without mounting a screen.
 */

export type GateRequirementResult = {
  label: string;
  needed: number;
  actual: number;
  met: boolean;
};

export type GateResult = {
  dayId: string;
  passed: boolean;
  /** The day's best score against its floor. */
  score: GateRequirementResult;
  /** Per-skill mastery floors. */
  requirements: GateRequirementResult[];
  /** Every lesson node in the day was completed. */
  lessonsComplete: boolean;
  /**
   * THE ANTI-FARMING REQUIREMENT. The day must contain a PASSED assessment.
   * Watching does not open a day, and neither does a day of teaching screens
   * with the measurement skipped. See the note on `evaluateDayGate`.
   */
  assessment: GateRequirementResult;
  /** What the day earned, split by kind, so a UI can show the provenance. */
  xp: TrainingXpLedger;
};

/**
 * XP earned on a day, by kind — the sum of that day's per-lesson rows. A day
 * with no rows has earned nothing, which is the correct reading of both a fresh
 * profile and one written before the ledger existed.
 */
export function dayXp(profile: TrainingProfile, dayId: string): TrainingXpLedger {
  const rows = profile.dayProgress[dayId]?.lessonXp;
  if (!rows) return emptyLedger();
  return Object.values(rows).reduce<TrainingXpLedger>(
    (acc, l) => addLedgers(acc, l),
    emptyLedger(),
  );
}

/** XP earned across the whole programme, by kind. */
export function totalXpLedger(profile: TrainingProfile): TrainingXpLedger {
  return TRAINING_DAYS.reduce<TrainingXpLedger>(
    (acc, d) => addLedgers(acc, dayXp(profile, d.id)),
    emptyLedger(),
  );
}

/** The number on the profile header. */
export function totalXpPoints(profile: TrainingProfile): number {
  return totalXp(totalXpLedger(profile));
}

/** Best score posted on this day, or 0 when the member has not been measured. */
export function dayBestScore(profile: TrainingProfile, dayId: string): number {
  return profile.dayProgress[dayId]?.bestScorePct ?? 0;
}

export function dayCompletedLessonIds(profile: TrainingProfile, dayId: string): string[] {
  const stored = profile.dayProgress[dayId]?.completedLessonIds ?? [];
  // The day record is the fast path; `completedLessonIds` is the source of
  // truth, so a profile written by an older build still reads correctly.
  const fromFlat = lessonsForDay(dayId)
    .map((l) => l.id)
    .filter((id) => profile.completedLessonIds.includes(id));
  return Array.from(new Set([...stored, ...fromFlat]));
}

export function isDayComplete(profile: TrainingProfile, dayId: string): boolean {
  const lessons = lessonsForDay(dayId);
  if (lessons.length === 0) return false;
  const done = dayCompletedLessonIds(profile, dayId);
  return lessons.every((l) => done.includes(l.id));
}

/**
 * The gate itself. A day passes when every one of its lessons is complete, the
 * day's best score clears the floor, every named skill floor is met, AND the
 * day contains at least one passed assessment.
 *
 * THAT LAST CONDITION IS NOT REDUNDANT, and it is worth saying why, because it
 * looks like it duplicates the score floor. The score floor asks "how well did
 * you do on what you were measured on"; a member who was never measured has no
 * score to fail. Once the human layer of this curriculum is a YouTube video,
 * the cheapest path through a day is to open each lesson, let the video play
 * and tap on — and the spec is explicit that this must not move a belt:
 *
 *     "Assessment + application are load-bearing; belts cannot be farmed by
 *      letting videos play."
 *
 * So the day gate reads the XP ledger's provenance, not just its total. 100 XP
 * of watching does not open Day 2. One passed assessment does.
 */
export function evaluateDayGate(profile: TrainingProfile, dayId: string): GateResult {
  const day = dayById(dayId);
  if (!day) {
    return {
      dayId,
      passed: false,
      score: { label: 'Day score', needed: 0, actual: 0, met: false },
      requirements: [],
      lessonsComplete: false,
      assessment: {
        label: 'Assessment passed',
        needed: XP_AWARD.assessment,
        actual: 0,
        met: false,
      },
      xp: emptyLedger(),
    };
  }

  const actualScore = dayBestScore(profile, dayId);
  const score: GateRequirementResult = {
    label: 'Day score',
    needed: day.gate.minScorePct,
    actual: actualScore,
    met: actualScore >= day.gate.minScorePct,
  };

  const requirements = day.gate.requirements.map((r) => {
    const actual = profile.mastery[r.skill] ?? 0;
    return { label: r.label, needed: r.minPct, actual, met: actual >= r.minPct };
  });

  const lessonsComplete = isDayComplete(profile, dayId);

  const xp = dayXp(profile, dayId);
  const assessment: GateRequirementResult = {
    label: 'Assessment passed',
    needed: XP_AWARD.assessment,
    actual: xp.assessment,
    // `competencyEarned` is the single definition of this rule. The gate does
    // not re-implement it, so there is exactly one place to change it.
    met: competencyEarned(xp),
  };

  return {
    dayId,
    passed:
      lessonsComplete && score.met && assessment.met && requirements.every((r) => r.met),
    score,
    requirements,
    lessonsComplete,
    assessment,
    xp,
  };
}

/** Day 1 is always open. Every other day waits on the one before it. */
export function isDayUnlocked(profile: TrainingProfile, dayId: string): boolean {
  const day = dayById(dayId);
  if (!day) return false;
  if (day.index === 1) return true;
  const previous = TRAINING_DAYS.find((d) => d.index === day.index - 1);
  if (!previous) return true;
  return evaluateDayGate(profile, previous.id).passed;
}

/**
 * A lesson is open when its day is open AND everything before it in that day
 * is complete. The first lesson of an open day is always open.
 */
export function isLessonUnlocked(profile: TrainingProfile, lessonId: string): boolean {
  const node = lessonNodeById(lessonId);
  if (!node) return false;
  const day = dayForLesson(lessonId);
  if (!day || !isDayUnlocked(profile, day.id)) return false;

  const position = day.lessonIds.indexOf(lessonId);
  if (position <= 0) return true;
  const done = dayCompletedLessonIds(profile, day.id);
  return day.lessonIds.slice(0, position).every((id) => done.includes(id));
}

export type DayState = 'locked' | 'active' | 'complete';

export function dayState(profile: TrainingProfile, dayId: string): DayState {
  if (!isDayUnlocked(profile, dayId)) return 'locked';
  return evaluateDayGate(profile, dayId).passed ? 'complete' : 'active';
}

/** The day the member is standing in — the lowest unlocked, unpassed day. */
export function currentDay(profile: TrainingProfile): TrainingDay {
  const open = TRAINING_DAYS.find((d) => dayState(profile, d.id) === 'active');
  return open ?? TRAINING_DAYS[TRAINING_DAYS.length - 1];
}

/** The next lesson worth opening: first incomplete unlocked lesson, in order. */
export function nextOpenLessonId(profile: TrainingProfile): string | null {
  for (const day of TRAINING_DAYS) {
    if (!isDayUnlocked(profile, day.id)) continue;
    const done = dayCompletedLessonIds(profile, day.id);
    const next = day.lessonIds.find((id) => !done.includes(id));
    if (next) return next;
  }
  return null;
}

/** Overall progress across the programme, by completed lessons. */
export function programmeProgressPct(profile: TrainingProfile): number {
  const total = TRAINING_DAYS.reduce((n, d) => n + d.lessonIds.length, 0);
  if (total === 0) return 0;
  const done = TRAINING_DAYS.reduce(
    (n, d) => n + dayCompletedLessonIds(profile, d.id).length,
    0,
  );
  return Math.round((done / total) * 100);
}
