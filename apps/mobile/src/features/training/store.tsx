import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_TRAINING_PROFILE, nextLesson } from './curriculum';
import type { TrainingProfile, TrainingSkill } from './types';

const KEY = 'ccai.training.profile.v1';

type TrainingContextValue = {
  profile: TrainingProfile;
  ready: boolean;
  completeLesson: (lessonId: string, skill: TrainingSkill, masteryGain?: number) => Promise<void>;
  setCurrentLesson: (lessonId: string) => Promise<void>;
  reset: () => Promise<void>;
};

const Ctx = createContext<TrainingContextValue | null>(null);

export function TrainingProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState(DEFAULT_TRAINING_PROFILE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (raw) setProfile({ ...DEFAULT_TRAINING_PROFILE, ...JSON.parse(raw) });
      })
      .finally(() => setReady(true));
  }, []);

  const persist = useCallback(async (next: TrainingProfile) => {
    setProfile(next);
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
    await persist(DEFAULT_TRAINING_PROFILE);
  }, [persist]);

  const value = useMemo(() => ({ profile, ready, completeLesson, setCurrentLesson, reset }), [
    profile, ready, completeLesson, setCurrentLesson, reset,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTraining() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTraining must be inside TrainingProvider');
  return ctx;
}
