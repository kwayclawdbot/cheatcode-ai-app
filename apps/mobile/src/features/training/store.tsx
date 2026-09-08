import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { DEFAULT_TRAINING_PROFILE, lessonNodeById, nextLessonNode } from './curriculum';
import { nextOpenLessonId } from './gates';
import { bestOfEach } from './xp';
import { useSession } from '../../lib/session';
import {
  fetchProgress,
  postClaim,
  postLessonComplete,
  putCheckpoint,
  trainingApiAvailable,
} from './remote';
import type {
  CompetencySignal,
  LessonRunResult,
  TrainingCheckpointState,
  TrainingProfile,
  TrainingSkill,
} from './types';

/**
 * THE LEARNER PROFILE — WHICH BELONGS TO THE LEARNER, NOT TO THE HANDSET.
 * ===========================================================================
 *
 * WHAT THIS FILE USED TO DO, AND WHY IT WAS THE AUDIT'S ONLY P0 (F10)
 * ---------------------------------------------------------------------------
 * One AsyncStorage key, read once at mount:
 *
 *     const KEY = 'ccai.training.profile.v2';
 *
 * No account id in it. No reset on sign-out. Three consequences, every one of
 * them confirmed against the code rather than suspected:
 *
 *   1. TWO ACCOUNTS ON ONE HANDSET INHERITED EACH OTHER'S LEARNING.
 *   2. A NEW DEVICE COULD NOT RECOVER PROGRESS. Not the streak — the lessons.
 *   3. IT REACHED THE FUNNEL. `useStageEvolution` fed this same local profile
 *      to the server as readiness evidence, so somebody else's lessons could
 *      promote your `profiles.stage`.
 *
 * And Board 08 prints "Progress saved" and "Saved to your account" under the
 * lesson screens, neither of which was true.
 *
 * WHAT IT DOES NOW
 * ---------------------------------------------------------------------------
 * The SERVER holds the profile (0046: `training_lesson_completions`,
 * `training_competencies`, `training_checkpoints`, all keyed on the
 * authenticated user). This file is a cache in front of it and a queue behind
 * it, and it is honest about which of the three states it is in:
 *
 *   'account'  the server answered; writes are landing. The app may say
 *              "Saved to your account", and only here.
 *   'device'   signed in, the service is unreachable. Work is kept on this
 *              device UNDER THIS ACCOUNT'S KEY and replayed on the next mount.
 *   'guest'    no session. Nothing is written to disk at all — see below.
 *
 * THE THREE RULES THAT MAKE IT ISOLATED RATHER THAN MERELY STORED
 * ---------------------------------------------------------------------------
 *   (a) EVERY DEVICE KEY CARRIES THE ACCOUNT ID. `ccai.training.v3.<user id>`.
 *       Two accounts on one handset cannot collide, because they do not share
 *       a key.
 *   (b) THE ACCOUNT ID IS A DEPENDENCY OF THE LOAD, AND STATE IS CLEARED FIRST.
 *       When it changes — sign-out, sign-in, account switch — in-memory state
 *       goes back to the empty default in the same tick, BEFORE anything is
 *       read. There is no window in which one member's screen shows another
 *       member's mastery.
 *   (c) A GUEST WRITES NOTHING. Practice before sign-in lives in memory for
 *       that session and dies with it. That is a smaller promise than the old
 *       code made and it is one the app can keep; the alternative is another
 *       ownerless blob on the disk, which is the bug.
 *
 * THE OLD KEY IS NOT SILENTLY ADOPTED, EITHER
 * ---------------------------------------------------------------------------
 * `ccai.training.profile.v2` still exists on the phones of everybody who has
 * trained, and deleting it would punish exactly the people who used the
 * feature. But it carries no owner, so this file will not decide whose it is:
 * it is surfaced as an OFFER (`unclaimed`), the member is asked out loud, and
 * the server honours the claim only if that account has no progress of its own
 * (0046 §8). Answered either way, the key is removed, so the offer is made once
 * on that device and a second account signing in inherits nothing.
 */

/** The pre-account key. Read once, offered once, then deleted. Never written. */
const LEGACY_KEY = 'ccai.training.profile.v2';

/** Per-account cache and queue. The account id is the point of both. */
const cacheKey = (userId: string) => `ccai.training.v3.${userId}`;
const queueKey = (userId: string) => `ccai.training.queue.v3.${userId}`;

/** A stronger signal never gets overwritten by a weaker one on a re-run. */
const SIGNAL_RANK: Record<CompetencySignal, number> = {
  unproven: 0,
  developing: 1,
  passed: 2,
  strong: 3,
  mastered: 4,
};

export type TrainingStorage = 'account' | 'device' | 'guest';

export type UnclaimedLocalProfile = {
  lessonIds: string[];
  /** What the app hands the server if the member says the work is theirs. */
  payload: {
    lesson_id: string;
    day_id: string;
    skill: string;
    score_pct: number | null;
    mastery_gain: number;
    xp: { interactive: number; video: number; practice: number; assessment: number };
    assessment_passed: boolean;
    competencies: Record<string, string>;
  }[];
};

export type CompleteOutcome = {
  /** True only when the SERVER recorded it. The screen prints nothing else. */
  saved: boolean;
  /** What this walk paid. Zero on a replay, and that is not a failure. */
  xpAwarded: number;
  repeat: boolean;
};

type TrainingContextValue = {
  profile: TrainingProfile;
  ready: boolean;
  /**
   * True once we know this learner has actually begun. Not the same question as
   * "is `profile` populated": everyone holds the empty default while the
   * account is being read. Home needs the difference — "Continue training" is a
   * lie told to somebody who has never opened a lesson.
   */
  enrolled: boolean;
  /** Where progress is being kept right now. The UI must not overstate it. */
  storage: TrainingStorage;
  /** A local pre-account profile on this handset that nobody has claimed. */
  unclaimed: UnclaimedLocalProfile | null;
  claimUnclaimed: () => Promise<{ claimed: boolean; lessons: number }>;
  dismissUnclaimed: () => Promise<void>;
  /** The full result of one walk through a lesson. Written once, on completion. */
  completeLessonRun: (result: LessonRunResult) => Promise<CompleteOutcome>;
  /** Where the member is inside an unfinished lesson (audit F11). */
  checkpointFor: (lessonId: string) => TrainingCheckpointState | null;
  saveCheckpoint: (lessonId: string, cp: TrainingCheckpointState) => void;
  setCurrentLesson: (lessonId: string) => Promise<void>;
  refresh: () => Promise<void>;
  reset: () => Promise<void>;
};

const Ctx = createContext<TrainingContextValue | null>(null);

const emptyProfile = (): TrainingProfile => ({
  ...DEFAULT_TRAINING_PROFILE,
  mastery: { ...DEFAULT_TRAINING_PROFILE.mastery },
  competencies: {},
  dayProgress: {},
  checkpoints: {},
});

export function TrainingProvider({ children }: { children: React.ReactNode }) {
  const { session } = useSession();
  const userId = session?.user?.id ?? null;

  const [profile, setProfile] = useState<TrainingProfile>(emptyProfile);
  const [ready, setReady] = useState(false);
  const [enrolled, setEnrolled] = useState(false);
  const [storage, setStorage] = useState<TrainingStorage>('guest');
  const [unclaimed, setUnclaimed] = useState<UnclaimedLocalProfile | null>(null);

  /**
   * The account this state belongs to. Every async write checks it before
   * committing, so a response that arrives after a sign-out cannot land on the
   * next member's screen — which is the same bug as the shared key, one race
   * further down.
   */
  const owner = useRef<string | null>(null);

  const writeCache = useCallback(async (id: string, next: TrainingProfile) => {
    try {
      await AsyncStorage.setItem(cacheKey(id), JSON.stringify(next));
    } catch {
      /* a cache that cannot be written is a slower app, not a broken one */
    }
  }, []);

  /* ── loading, and clearing, on every account change ─────────────────────── */

  useEffect(() => {
    let cancelled = false;
    owner.current = userId;

    // RULE (b). Clear first, read second. Nothing from the previous account
    // survives into the next one's first frame.
    setProfile(emptyProfile());
    setEnrolled(false);
    setUnclaimed(null);
    setReady(false);
    setStorage(userId ? 'device' : 'guest');

    if (!userId) {
      // RULE (c). A guest practises in memory and nothing reaches the disk.
      setReady(true);
      return () => { cancelled = true; };
    }

    void (async () => {
      // The cache first, so a cold start on a train shows the real profile
      // rather than an empty one that fills in half a second later.
      try {
        const raw = await AsyncStorage.getItem(cacheKey(userId));
        if (raw && !cancelled && owner.current === userId) {
          const stored = JSON.parse(raw) as Partial<TrainingProfile>;
          setProfile(hydrate(stored));
          setEnrolled((stored.completedLessonIds ?? []).length > 0);
        }
      } catch {
        /* a corrupt cache is not a reason to crash the provider that wraps the app */
      }

      await flushQueue(userId);
      await loadFromServer(userId, cancelled);
      await lookForUnclaimed(userId, cancelled);

      if (!cancelled && owner.current === userId) setReady(true);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const loadFromServer = useCallback(
    async (id: string, cancelled = false) => {
      if (!trainingApiAvailable()) {
        // Signed in, no service. Work is kept under this account's key and
        // replayed later; the UI says "on this device", never "in your account".
        if (!cancelled && owner.current === id) setStorage('device');
        return;
      }
      try {
        const res = await fetchProgress();
        if (cancelled || owner.current !== id) return;
        const next = fromServer(res);
        setProfile(next);
        setEnrolled(next.completedLessonIds.length > 0);
        setStorage('account');
        await writeCache(id, next);
      } catch {
        if (!cancelled && owner.current === id) setStorage('device');
      }
    },
    [writeCache]
  );

  /* ── the queue: a lesson finished offline is not a lesson lost ──────────── */

  const enqueue = useCallback(async (id: string, result: LessonRunResult) => {
    try {
      const raw = await AsyncStorage.getItem(queueKey(id));
      const queue = raw ? (JSON.parse(raw) as LessonRunResult[]) : [];
      // Keyed by lesson: a second offline walk replaces the first rather than
      // queueing two writes for one lesson.
      const next = [...queue.filter((q) => q.lessonId !== result.lessonId), result];
      await AsyncStorage.setItem(queueKey(id), JSON.stringify(next));
    } catch {
      /* nothing to do: the cache above still holds the profile */
    }
  }, []);

  const flushQueue = useCallback(async (id: string) => {
    if (!trainingApiAvailable()) return;
    let queue: LessonRunResult[] = [];
    try {
      const raw = await AsyncStorage.getItem(queueKey(id));
      queue = raw ? (JSON.parse(raw) as LessonRunResult[]) : [];
    } catch {
      return;
    }
    if (queue.length === 0) return;

    const stuck: LessonRunResult[] = [];
    for (const item of queue) {
      const node = lessonNodeById(item.lessonId);
      // A queued lesson that is no longer in the programme is dropped rather
      // than retried forever. The server would refuse it anyway.
      if (!node) continue;
      try {
        await postLessonComplete(item.lessonId, {
          day_id: item.dayId,
          skill: item.skill,
          score_pct: item.scorePct,
          mastery_gain: item.masteryGain,
          xp: item.xp,
          assessment_passed: item.assessmentPassed,
          competencies: item.competencies,
        });
      } catch {
        stuck.push(item);
      }
    }
    try {
      if (stuck.length) await AsyncStorage.setItem(queueKey(id), JSON.stringify(stuck));
      else await AsyncStorage.removeItem(queueKey(id));
    } catch {
      /* it will be tried again next mount */
    }
  }, []);

  /* ── the pre-account blob: offered, never assumed ───────────────────────── */

  const lookForUnclaimed = useCallback(async (id: string, cancelled = false) => {
    try {
      const raw = await AsyncStorage.getItem(LEGACY_KEY);
      if (!raw) return;
      const stored = JSON.parse(raw) as Partial<TrainingProfile>;
      const lessonIds = stored.completedLessonIds ?? [];
      if (lessonIds.length === 0) {
        // Nothing worth offering. Take the ownerless key off the device: that
        // is the whole bug, and an empty one is still one.
        await AsyncStorage.removeItem(LEGACY_KEY);
        return;
      }
      if (cancelled || owner.current !== id) return;
      setUnclaimed({ lessonIds, payload: claimPayload(stored) });
    } catch {
      /* an unreadable legacy blob is offered to nobody */
    }
  }, []);

  const claimUnclaimed = useCallback(async () => {
    const id = owner.current;
    if (!id || !unclaimed) return { claimed: false, lessons: 0 };
    try {
      const res = await postClaim(unclaimed.payload);
      if (owner.current !== id) return { claimed: false, lessons: 0 };
      if (res.claimed) {
        const next = fromServer(res.progress);
        setProfile(next);
        setEnrolled(next.completedLessonIds.length > 0);
        setStorage('account');
        await writeCache(id, next);
      }
      // Answered either way: the ownerless key comes off the device so no
      // second account is ever offered somebody else's work.
      await AsyncStorage.removeItem(LEGACY_KEY);
      setUnclaimed(null);
      return { claimed: res.claimed, lessons: res.lessons };
    } catch {
      return { claimed: false, lessons: 0 };
    }
  }, [unclaimed, writeCache]);

  const dismissUnclaimed = useCallback(async () => {
    setUnclaimed(null);
    try {
      await AsyncStorage.removeItem(LEGACY_KEY);
    } catch {
      /* it will simply be offered again; not worth failing over */
    }
  }, []);

  /* ── finishing a lesson ─────────────────────────────────────────────────── */

  const completeLessonRun = useCallback(
    async (result: LessonRunResult): Promise<CompleteOutcome> => {
      const id = owner.current;

      // The local view updates immediately either way, because the member is
      // standing on the completion screen and the numbers on it have to be
      // right. What changes with `saved` is what the screen is allowed to CLAIM.
      const optimistic = applyRun(profile, result);
      setProfile(optimistic);
      setEnrolled(true);

      if (!id) {
        // A guest. Nothing is written anywhere; the run counts for this session
        // and the screen says so rather than promising an account it does not
        // have.
        return { saved: false, xpAwarded: 0, repeat: false };
      }

      await writeCache(id, optimistic);

      if (!trainingApiAvailable()) {
        setStorage('device');
        await enqueue(id, result);
        return { saved: false, xpAwarded: 0, repeat: false };
      }

      try {
        const res = await postLessonComplete(result.lessonId, {
          day_id: result.dayId,
          skill: result.skill,
          score_pct: result.scorePct,
          mastery_gain: result.masteryGain,
          xp: result.xp,
          assessment_passed: result.assessmentPassed,
          competencies: result.competencies,
        });
        if (owner.current !== id) return { saved: false, xpAwarded: 0, repeat: false };
        // The server's answer replaces the optimistic one. It is the authority
        // on what was actually paid — a replay pays nothing, and the screen
        // must not print an award that did not happen (audit F12).
        const next = fromServer(res.progress);
        setProfile(next);
        setStorage('account');
        await writeCache(id, next);
        return { saved: true, xpAwarded: res.xp_awarded, repeat: res.repeat };
      } catch {
        setStorage('device');
        await enqueue(id, result);
        return { saved: false, xpAwarded: 0, repeat: false };
      }
    },
    [profile, enqueue, writeCache]
  );

  /* ── checkpoints (audit F11) ────────────────────────────────────────────── */

  const checkpointFor = useCallback(
    (lessonId: string): TrainingCheckpointState | null => profile.checkpoints[lessonId] ?? null,
    [profile]
  );

  /**
   * Written on EVERY interaction, and deliberately fire-and-forget.
   *
   * The runner must never wait on a network call to advance a screen — a lesson
   * that stalls because a checkpoint is in flight is worse than a lesson that
   * forgets. So the in-memory copy is updated synchronously, the device cache
   * follows, and the server call is allowed to fail silently: losing one costs
   * the tail of one lesson.
   */
  const saveCheckpoint = useCallback(
    (lessonId: string, cp: TrainingCheckpointState) => {
      const id = owner.current;
      setProfile((p) => {
        const next = { ...p, checkpoints: { ...p.checkpoints, [lessonId]: cp } };
        if (id) void writeCache(id, next);
        return next;
      });
      if (!id || !trainingApiAvailable()) return;
      void putCheckpoint(lessonId, {
        screen_index: cp.screenIndex,
        answers: cp.answers,
        correct: cp.correct,
        answered: cp.answered,
        assessment_passed: cp.assessmentPassed,
      }).catch(() => {
        /* see above: a lost checkpoint costs the tail of one lesson */
      });
    },
    [writeCache]
  );

  const setCurrentLesson = useCallback(
    async (lessonId: string) => {
      const id = owner.current;
      const next = { ...profile, currentLessonId: lessonId };
      setProfile(next);
      if (id) await writeCache(id, next);
    },
    [profile, writeCache]
  );

  const refresh = useCallback(async () => {
    const id = owner.current;
    if (!id) return;
    await flushQueue(id);
    await loadFromServer(id);
  }, [flushQueue, loadFromServer]);

  /**
   * Everything this device holds for THIS account, gone.
   *
   * It does not delete the server's rows: a member clearing local state has not
   * asked to unlearn Day 1, and the next load brings the account's real profile
   * back. Deleting the account's training history is what account deletion is
   * for (0032).
   */
  const reset = useCallback(async () => {
    const id = owner.current;
    setProfile(emptyProfile());
    setEnrolled(false);
    if (!id) return;
    try {
      await AsyncStorage.multiRemove([cacheKey(id), queueKey(id)]);
    } catch {
      /* nothing to do */
    }
    await loadFromServer(id);
  }, [loadFromServer]);

  const value = useMemo(
    () => ({
      profile,
      ready,
      enrolled,
      storage,
      unclaimed,
      claimUnclaimed,
      dismissUnclaimed,
      completeLessonRun,
      checkpointFor,
      saveCheckpoint,
      setCurrentLesson,
      refresh,
      reset,
    }),
    [
      profile,
      ready,
      enrolled,
      storage,
      unclaimed,
      claimUnclaimed,
      dismissUnclaimed,
      completeLessonRun,
      checkpointFor,
      saveCheckpoint,
      setCurrentLesson,
      refresh,
      reset,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/* ────────────────────────────── pure helpers ─────────────────────────────── */

/** A stored blob, made safe to render. */
function hydrate(stored: Partial<TrainingProfile>): TrainingProfile {
  return {
    ...DEFAULT_TRAINING_PROFILE,
    ...stored,
    // Merged rather than replaced: a row written before a new skill existed
    // must not leave that skill undefined on the profile.
    mastery: { ...DEFAULT_TRAINING_PROFILE.mastery, ...(stored.mastery ?? {}) },
    competencies: { ...(stored.competencies ?? {}) },
    dayProgress: { ...(stored.dayProgress ?? {}) },
    checkpoints: { ...(stored.checkpoints ?? {}) },
  };
}

/** The server's answer, in the shape every training screen already renders. */
export function fromServer(res: {
  completed_lesson_ids: string[];
  mastery: Record<string, number>;
  day_progress: Record<
    string,
    {
      completed_lesson_ids: string[];
      best_score_pct: number | null;
      lesson_xp: Record<string, { interactive: number; video: number; practice: number; assessment: number }>;
    }
  >;
  competencies: Record<string, string>;
  checkpoints: Record<
    string,
    {
      screen_index: number;
      answers: Record<string, unknown>;
      correct: number;
      answered: number;
      assessment_passed: boolean;
      updated_at: string | null;
    }
  >;
}): TrainingProfile {
  const mastery = { ...DEFAULT_TRAINING_PROFILE.mastery };
  for (const [skill, value] of Object.entries(res.mastery ?? {})) {
    if (skill in mastery) mastery[skill as TrainingSkill] = Math.min(100, Math.round(value));
  }

  const next: TrainingProfile = {
    ...DEFAULT_TRAINING_PROFILE,
    completedLessonIds: res.completed_lesson_ids ?? [],
    mastery,
    competencies: (res.competencies ?? {}) as Record<string, CompetencySignal>,
    dayProgress: Object.fromEntries(
      Object.entries(res.day_progress ?? {}).map(([dayId, d]) => [
        dayId,
        {
          completedLessonIds: d.completed_lesson_ids ?? [],
          bestScorePct: d.best_score_pct,
          lessonXp: d.lesson_xp ?? {},
        },
      ])
    ),
    checkpoints: Object.fromEntries(
      Object.entries(res.checkpoints ?? {}).map(([lessonId, c]) => [
        lessonId,
        {
          screenIndex: c.screen_index,
          answers: c.answers ?? {},
          correct: c.correct ?? 0,
          answered: c.answered ?? 0,
          assessmentPassed: c.assessment_passed === true,
          updatedAt: c.updated_at,
        },
      ])
    ),
    readiness: 'beginner',
    currentLessonId: DEFAULT_TRAINING_PROFILE.currentLessonId,
  };
  next.readiness = readinessFor(next.mastery);
  next.currentLessonId = nextOpenLessonId(next) ?? next.currentLessonId;
  return next;
}

/**
 * One finished run, applied to the local view.
 *
 * NOTE WHAT IS NOT HERE ANY MORE. The old version did this:
 *
 *     mastery[skill] = min(100, mastery[skill] + result.masteryGain)
 *
 * unconditionally, two lines after carefully de-duplicating the lesson id — so
 * re-walking a lesson moved the bar again, every time. That is the audit's F12,
 * and it is fixed in the only place that can actually fix it: the server derives
 * mastery from ONE ROW PER LESSON (0046 §7), so there is no accumulator left to
 * increment. This function mirrors that rule locally by taking the best of the
 * held and earned gain rather than adding to it, so the optimistic view and the
 * server's answer agree.
 */
export function applyRun(profile: TrainingProfile, result: LessonRunResult): TrainingProfile {
  const done = profile.completedLessonIds.includes(result.lessonId);
  const completed = done
    ? profile.completedLessonIds
    : [...profile.completedLessonIds, result.lessonId];

  const day = profile.dayProgress[result.dayId] ?? { completedLessonIds: [], bestScorePct: null };
  const heldGain = done ? (profile.mastery[result.skill] ?? 0) : (profile.mastery[result.skill] ?? 0) + result.masteryGain;

  const mastery: Record<TrainingSkill, number> = {
    ...profile.mastery,
    [result.skill]: Math.min(100, heldGain),
  };

  const competencies = { ...profile.competencies };
  for (const [key, signal] of Object.entries(result.competencies)) {
    const held = competencies[key];
    if (!held || SIGNAL_RANK[signal] > SIGNAL_RANK[held]) competencies[key] = signal;
  }

  const dayProgress = {
    ...profile.dayProgress,
    [result.dayId]: {
      completedLessonIds: day.completedLessonIds.includes(result.lessonId)
        ? day.completedLessonIds
        : [...day.completedLessonIds, result.lessonId],
      bestScorePct:
        result.scorePct === null
          ? day.bestScorePct
          : Math.max(day.bestScorePct ?? 0, result.scorePct),
      // Best of each kind, never a sum: walking one lesson ten times pays once,
      // but an assessment passed on the second try does get picked up.
      lessonXp: {
        ...(day.lessonXp ?? {}),
        [result.lessonId]: bestOfEach(day.lessonXp?.[result.lessonId], result.xp),
      },
    },
  };

  // The lesson is finished, so there is no work in progress to resume.
  const checkpoints = { ...profile.checkpoints };
  delete checkpoints[result.lessonId];

  const next: TrainingProfile = {
    ...profile,
    completedLessonIds: completed,
    mastery,
    competencies,
    dayProgress,
    checkpoints,
    readiness: readinessFor(mastery),
    currentLessonId: profile.currentLessonId,
  };

  // Point the member at whatever is genuinely open next — which respects the
  // gates, so a locked Day 2 does not become "your current lesson".
  next.currentLessonId =
    nextOpenLessonId(next) ?? nextLessonNode(result.lessonId)?.id ?? result.lessonId;

  return next;
}

/** The pre-account blob, in the shape `POST /training/claim` takes. */
function claimPayload(stored: Partial<TrainingProfile>): UnclaimedLocalProfile['payload'] {
  const rows: UnclaimedLocalProfile['payload'] = [];
  for (const lessonId of stored.completedLessonIds ?? []) {
    const node = lessonNodeById(lessonId);
    if (!node) continue;
    const day = stored.dayProgress?.[node.dayId];
    const xp = day?.lessonXp?.[lessonId] ?? { interactive: 0, video: 0, practice: 0, assessment: 0 };
    rows.push({
      lesson_id: lessonId,
      day_id: node.dayId,
      skill: node.skill,
      score_pct: day?.bestScorePct ?? null,
      // The local blob never stored the per-lesson gain, only the running
      // total, so nothing here can honestly reconstruct it. Zero is the honest
      // number: the completion and its XP are carried up, and the mastery bar
      // is rebuilt by the lessons the member walks from here. Inventing a gain
      // would be inventing a measurement.
      mastery_gain: 0,
      xp,
      // A local profile that recorded assessment XP recorded a PASS: the runner
      // never wrote that line for a failed challenge.
      assessment_passed: xp.assessment > 0,
      competencies: (stored.competencies ?? {}) as Record<string, string>,
    });
  }
  return rows;
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
