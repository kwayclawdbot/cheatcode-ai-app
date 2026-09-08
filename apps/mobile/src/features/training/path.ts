import { TRAINING_DAYS, lessonNodeById, lessonsForDay } from './curriculum';
import { dayCompletedLessonIds, isLessonUnlocked } from './gates';
import type { TrainingLessonNode, TrainingProfile } from './types';

/**
 * THREE STEPS, NOT SEVEN DAYS — AND WHY THE PROMISE GOT SMALLER.
 * ===========================================================================
 *
 * The Training landing screen leads with a hero that says "Zero to Trade Ready
 * in 7 Days" over a seven-day path. ONE LESSON OF THIRTY-ONE IS WRITTEN. The
 * audit's F09 is exactly this gap: the product promises a five-and-a-half hour
 * programme and can deliver nine minutes of it, and a member who taps into Day
 * 2 finds a screen apologising.
 *
 * Board 08 reframes it, and the reframing is the fix. Three steps —
 *
 *     01 Market basics   ·   02 Read a chart   ·   03 Build a plan
 *
 * — with the second and third marked "Coming next" on their face, and a
 * "Foundations in development · More lessons coming soon" note underneath. That
 * is a SMALLER and more honest promise, it is the one the owner asked for when
 * he said to leave the lessons empty for now, and it is the one this file
 * models.
 *
 * ===========================================================================
 * THE SEVEN DAYS ARE NOT DELETED
 * ===========================================================================
 * They are still the curriculum, the gates still gate on them, and the day
 * detail is still on the screen — one tap down, under "the full programme",
 * instead of being the first thing a new member is asked to believe. A step is
 * a GROUP OF DAYS, and the mapping below is the one the board's own labels
 * imply: "Read a chart" is Day 2's outcome plus the setup work in Day 3, and
 * "Build a plan" is Day 4 onward, which is where a plan is actually built.
 *
 * A STEP IS "READY" ONLY IF SOMETHING IN IT IS WRITTEN. Not if it is unlocked —
 * `hasContent` is the only honest test, because an unlocked step full of
 * unwritten lessons is the promise this file exists to stop making.
 */

export type PathStepState = 'ready' | 'coming' | 'complete';

export type PathStep = {
  /** "01", "02", "03" — the numeral the board prints. */
  index: string;
  title: string;
  /** One line, in the member's language, about what they will be able to do. */
  outcome: string;
  dayIds: string[];
};

export const PATH_STEPS: PathStep[] = [
  {
    index: '01',
    title: 'Market basics',
    outcome: 'What you are looking at, and what you are actually buying.',
    dayIds: ['day-1'],
  },
  {
    index: '02',
    title: 'Read a chart',
    outcome: 'Up, down or sideways — and where price has reacted before.',
    dayIds: ['day-2', 'day-3'],
  },
  {
    index: '03',
    title: 'Build a plan',
    outcome: 'An entry, a stop where the idea is wrong, and a size that fits.',
    dayIds: ['day-4', 'day-5', 'day-6', 'day-7'],
  },
];

/** Every lesson node inside a step, in curriculum order. */
export function lessonsForStep(step: PathStep): TrainingLessonNode[] {
  return step.dayIds.flatMap((id) => lessonsForDay(id));
}

/** Is anything in this step actually written? The only honest readiness test. */
export function stepIsWritten(step: PathStep): boolean {
  return lessonsForStep(step).some((l) => l.hasContent);
}

export function stepState(profile: TrainingProfile, step: PathStep): PathStepState {
  const lessons = lessonsForStep(step);
  const written = lessons.filter((l) => l.hasContent);
  if (written.length === 0) return 'coming';
  const done = new Set(step.dayIds.flatMap((id) => dayCompletedLessonIds(profile, id)));
  // Complete means every WRITTEN lesson in the step is done. Counting the
  // unwritten ones would leave a step permanently unfinishable, which reads as
  // a bug rather than as an honest "more coming".
  return written.every((l) => done.has(l.id)) ? 'complete' : 'ready';
}

/**
 * The next lesson worth opening — and it is only ever one that EXISTS.
 *
 * `nextOpenLessonId` in `gates.ts` answers the curriculum's question ("what is
 * next in the programme"), which is the right answer for a gate and the wrong
 * one for a button: it happily returns `d1l2`, which has no content, and the
 * member lands on an apology. This answers the button's question instead.
 */
export function nextWrittenLesson(profile: TrainingProfile): TrainingLessonNode | null {
  for (const day of TRAINING_DAYS) {
    const done = dayCompletedLessonIds(profile, day.id);
    for (const id of day.lessonIds) {
      const node = lessonNodeById(id);
      if (!node?.hasContent) continue;
      if (done.includes(id)) continue;
      if (!isLessonUnlocked(profile, id)) continue;
      return node;
    }
  }
  return null;
}

/** The step the member is standing in: the first that is not complete. */
export function currentStep(profile: TrainingProfile): PathStep {
  return PATH_STEPS.find((s) => stepState(profile, s) !== 'complete') ?? PATH_STEPS[0];
}

/**
 * How much of the WRITTEN programme is done, as a percentage.
 *
 * `programmeProgressPct` in `gates.ts` divides by all thirty-one lessons, so
 * finishing the only lesson that exists reads as 3% — which is true about the
 * plan and useless to the person who just did everything available. This is the
 * number the landing screen shows, and the screen says which one it is:
 * "1 of 1 lesson available".
 */
export function writtenProgress(profile: TrainingProfile): { done: number; total: number } {
  const written = PATH_STEPS.flatMap(lessonsForStep).filter((l) => l.hasContent);
  const done = written.filter((l) => profile.completedLessonIds.includes(l.id)).length;
  return { done, total: written.length };
}
