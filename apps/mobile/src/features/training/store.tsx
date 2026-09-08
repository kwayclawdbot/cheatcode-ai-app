import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_TRAINING_PROFILE, nextLessonNode } from './curriculum';
import { nextOpenLessonId } from './gates';
import { bestOfEach } from './xp';
import type {
  CompetencySignal,
  LessonRunResult,
  TrainingProfile,
  TrainingSkill,
} from './types';

/**
 * The stored key is versioned. `v2` is the seven-day profile — it carries
 * `competencies` and `dayProgress`, which `v1` did not have. A `v1` row is not
 * migrated: it belonged to a ten-lesson curriculum whose lesson ids no longer
 * exist, so carrying it forward would credit a member with lessons that are
 * not in the product. Reading nothing and starting at zero is the honest
 * outcome, and it is what a member who has not done Day 1 should see.
 */
const KEY = 'ccai.training.profile.v2';

/** A stronger signal never gets overwritten by a weaker one on a re-run. */
const SIGNAL_RANK: Record<CompetencySignal, number> = {
  unproven: 0,
  developing: 1,
  passed: 2,
  strong: 3,
  mastered: 4,
};

type TrainingContextValue = {
  profile: TrainingProfile;
  ready: boolean;
  /**
   * True once this device has a STORED learner profile — i.e. the member has
   * actually begun. It is not the same question as "is `profile` populated",
   * because `profile` always holds the empty default while AsyncStorage is
   * still being read and for anyone who never started. Home needs the
   * difference: "Continue training" is a lie told to someone who has never
   * opened a lesson, and "Start training" is a lie told to someone on lesson
   * six. `ready` says whether we know yet; `enrolled` says what the answer is.
   */
  enrolled: boolean;
  /** The full result of one walk through a lesson. Written once, on completion. */
  completeLessonRun: (result: LessonRunResult) => Promise<void>;
  setCurrentLesson: (lessonId: string) => Promise<void>;
  reset: () => Promise<void>;
};

const Ctx = createContext<TrainingContextValue | null>(null);

export function TrainingProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState(DEFAULT_TRAINING_PROFILE);
  const [ready, setReady] = useState(false);
  const [enrolled, setEnrolled] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!raw) return;
        // A row that will not parse is a corrupt row, not a reason to crash the
        // provider that wraps the whole app. Fall back to "never started".
        try {
          const stored = JSON.parse(raw) as Partial<TrainingProfile>;
          setProfile({
            ...DEFAULT_TRAINING_PROFILE,
            ...stored,
            // Merged rather than replaced: a row written before a new skill
            // existed must not leave that skill undefined on the profile.
            mastery: { ...DEFAULT_TRAINING_PROFILE.mastery, ...(stored.mastery ?? {}) },
            competencies: { ...(stored.competencies ?? {}) },
            dayProgress: { ...(stored.dayProgress ?? {}) },
          });
          setEnrolled(true);
        } catch {
          /* keep the empty default */
        }
      })
      .catch(() => { /* storage unavailable — the app still runs, untrained */ })
      .finally(() => setReady(true));
  }, []);

  const persist = useCallback(async (next: TrainingProfile) => {
    setProfile(next);
    setEnrolled(true);
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  }, []);

  const completeLessonRun = useCallback(async (result: LessonRunResult) => {
    const completed = profile.completedLessonIds.includes(result.lessonId)
      ? profile.completedLessonIds
      : [...profile.completedLessonIds, result.lessonId];

    const mastery: Record<TrainingSkill, number> = {
      ...profile.mastery,
      [result.skill]: Math.min(100, (profile.mastery[result.skill] ?? 0) + result.masteryGain),
    };

    const competencies = { ...profile.competencies };
    for (const [key, signal] of Object.entries(result.competencies)) {
      const held = competencies[key];
      if (!held || SIGNAL_RANK[signal] > SIGNAL_RANK[held]) competencies[key] = signal;
    }

    const day = profile.dayProgress[result.dayId] ?? { completedLessonIds: [], bestScorePct: null };
    const alreadyDone = day.completedLessonIds.includes(result.lessonId);
    const dayProgress = {
      ...profile.dayProgress,
      [result.dayId]: {
        completedLessonIds: alreadyDone
          ? day.completedLessonIds
          : [...day.completedLessonIds, result.lessonId],
        bestScorePct:
          result.scorePct === null
            ? day.bestScorePct
            : Math.max(day.bestScorePct ?? 0, result.scorePct),
        /**
         * XP BANKS ONCE PER LESSON. A member may re-walk a lesson as often as
         * they like — that is how a weak score gets fixed, and `bestScorePct`
         * above rewards it. Paying the awards again on every replay would hand
         * back exactly the farm the ledger exists to prevent: re-open the one
         * lesson with a video in it and collect video XP forever. Writing the
         * row under the lesson's own key makes a replay overwrite rather than
         * accumulate, so a second walk through d1l1 is still one lesson's XP.
         *
         * The exception that matters: a member who failed the assessment the
         * first time banked no assessment XP, and on the run where they pass it
         * they should get it. Taking the best of each kind does that, while
         * still never paying the same kind twice.
         */
        lessonXp: {
          ...(day.lessonXp ?? {}),
          [result.lessonId]: bestOfEach(day.lessonXp?.[result.lessonId], result.xp),
        },
      },
    };

    const next: TrainingProfile = {
      ...profile,
      completedLessonIds: completed,
      mastery,
      competencies,
      dayProgress,
      readiness: readinessFor(mastery),
      currentLessonId: profile.currentLessonId,
    };

    // Point the member at whatever is genuinely open next — which respects the
    // gates, so a locked Day 2 does not become "your current lesson".
    next.currentLessonId =
      nextOpenLessonId(next) ?? nextLessonNode(result.lessonId)?.id ?? result.lessonId;

    await persist(next);
  }, [persist, profile]);

  const setCurrentLesson = useCallback(async (lessonId: string) => {
    await persist({ ...profile, currentLessonId: lessonId });
  }, [persist, profile]);

  const reset = useCallback(async () => {
    setProfile(DEFAULT_TRAINING_PROFILE);
    setEnrolled(false);
    await AsyncStorage.removeItem(KEY);
  }, []);

  const value = useMemo(
    () => ({ profile, ready, enrolled, completeLessonRun, setCurrentLesson, reset }),
    [profile, ready, enrolled, completeLessonRun, setCurrentLesson, reset],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function readinessFor(mastery: Record<TrainingSkill, number>): TrainingProfile['readiness'] {
  const values = Object.values(mastery);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return avg >= 82 ? 'assisted' : avg >= 60 ? 'guided' : 'beginner';
}

export function useTraining() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTraining must be inside TrainingProvider');
  return ctx;
}
