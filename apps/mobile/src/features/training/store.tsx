import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_TRAINING_PROFILE, nextLesson } from './curriculum';
import type { TrainingProfile, TrainingSkill } from './types';

const KEY = 'ccai.training.profile.v1';

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
  completeLesson: (lessonId: string, skill: TrainingSkill, masteryGain?: number) => Promise<void>;
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
          setProfile({ ...DEFAULT_TRAINING_PROFILE, ...JSON.parse(raw) });
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

  const completeLesson = useCallback(async (
    lessonId: string,
    skill: TrainingSkill,
    masteryGain = 12,
  ) => {
    const completed = profile.completedLessonIds.includes(lessonId)
      ? profile.completedLessonIds
      : [...profile.completedLessonIds, lessonId];
    const after = nextLesson(lessonId);
    const mastery = {
      ...profile.mastery,
      [skill]: Math.min(100, (profile.mastery[skill] ?? 0) + masteryGain),
    };
    const avg = Object.values(mastery).reduce((a, b) => a + b, 0) / Object.values(mastery).length;
    await persist({
      ...profile,
      completedLessonIds: completed,
      currentLessonId: after?.id ?? lessonId,
      mastery,
      readiness: avg >= 82 ? 'assisted' : avg >= 60 ? 'guided' : 'beginner',
    });
  }, [persist, profile]);

  const setCurrentLesson = useCallback(async (lessonId: string) => {
    await persist({ ...profile, currentLessonId: lessonId });
  }, [persist, profile]);

  const reset = useCallback(async () => {
    setProfile(DEFAULT_TRAINING_PROFILE);
    setEnrolled(false);
    await AsyncStorage.removeItem(KEY);
  }, []);

  const value = useMemo(() => ({ profile, ready, enrolled, completeLesson, setCurrentLesson, reset }), [
    profile, ready, enrolled, completeLesson, setCurrentLesson, reset,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTraining() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTraining must be inside TrainingProvider');
  return ctx;
}
