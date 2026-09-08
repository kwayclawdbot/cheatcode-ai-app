/**
 * TRAINING PROGRESS — THE ONE PLACE THE ROWS ARE READ AND WRITTEN.
 *
 * Everything here goes through a `security definer` function from 0046. No
 * route touches `training_lesson_completions` directly, for the same reason no
 * route touches `point_events` directly: the rules about what a lesson is worth
 * and how often it may be paid live in one function, and a second writer is how
 * they get out of step.
 *
 * WHAT THE ROUTES DO NOT GET TO DECIDE:
 *   - the day and the skill (from `curriculum.ts` in this directory, never the body)
 *   - what an award is worth (from `xp.ts`, clamped to the config's numbers)
 *   - whether a replay pays (it does not; the ledger's unique constraint says so)
 */
import type { TrainingProgressResponse } from '@shared/api';
import { TrainingProgressResponse as TrainingProgressSchema } from '@shared/api';
import { log } from '../log';
import { callRpc } from '../rpc';
import { lessonEntry } from './curriculum';
import { sanitiseLedger, type TrainingXpLedger } from './xp';

/**
 * A learner profile with nothing in it.
 *
 * IT IS NOT AN ERROR STATE. Somebody who has not started training has exactly
 * this profile, and so does somebody whose database has not had 0046 applied
 * yet — the difference is logged, never rendered, because a member opening
 * Training to be told the service is broken is worse than being told they have
 * not started, which is also true.
 */
export const EMPTY_PROGRESS: TrainingProgressResponse = {
  curriculum_version: 1,
  completed_lesson_ids: [],
  mastery: {},
  day_progress: {},
  competencies: {},
  checkpoints: {},
  xp: { interactive: 0, video: 0, practice: 0, assessment: 0 },
  xp_training: 0,
  xp_calls: 0,
};

function parseProgress(raw: unknown, requestId: string): TrainingProgressResponse {
  const parsed = TrainingProgressSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  log('warn', requestId, 'training.progress_unreadable', {
    issue: parsed.error.issues[0]?.message ?? 'unknown',
  });
  return EMPTY_PROGRESS;
}

export async function readProgress(
  userId: string,
  requestId: string
): Promise<TrainingProgressResponse> {
  const rpc = await callRpc<unknown>('training_profile', { p_user_id: userId }, requestId);
  if (!rpc.ok) {
    log('warn', requestId, 'training.profile_unavailable', {
      missing: rpc.ok === false ? rpc.missing : null,
    });
    return EMPTY_PROGRESS;
  }
  return parseProgress(rpc.data, requestId);
}

export type CompletionInput = {
  userId: string;
  lessonId: string;
  scorePct: number | null;
  masteryGain: number;
  xp: Partial<TrainingXpLedger>;
  assessmentPassed: boolean;
  competencies: Record<string, string>;
  requestId: string;
};

export type CompletionOutcome = {
  ok: boolean;
  xpAwarded: number;
  repeat: boolean;
};

/**
 * One walk through one lesson, recorded.
 *
 * `xpAwarded` is what this walk actually PAID, which is zero on every replay.
 * That number is not cosmetic: it is what the completion screen uses to decide
 * between "+70 XP" and "you have already been paid for this one", and printing
 * an award that did not happen is the audit's F12 wearing a different hat.
 */
export async function recordCompletion(input: CompletionInput): Promise<CompletionOutcome> {
  const entry = lessonEntry(input.lessonId);
  if (!entry) return { ok: false, xpAwarded: 0, repeat: false };

  const xp = sanitiseLedger(input.xp, input.assessmentPassed);

  const rpc = await callRpc<Record<string, unknown>>(
    'record_lesson_completion',
    {
      p_user_id: input.userId,
      p_lesson_id: input.lessonId,
      // The server's own index, not the body. A caller cannot file a Day 1
      // lesson under Day 7 to open a gate.
      p_day_id: entry.dayId,
      p_skill: entry.skill,
      p_score_pct: input.scorePct,
      // Clamped: mastery is a percentage of one skill and a single lesson
      // cannot be worth more than a quarter of one. The curriculum's own gains
      // are 15-25; anything larger is a client that has been edited.
      p_mastery_gain: Math.max(0, Math.min(25, Number(input.masteryGain) || 0)),
      p_xp: xp,
      p_assessment_passed: input.assessmentPassed,
      p_competencies: input.competencies,
    },
    input.requestId
  );

  if (!rpc.ok) {
    log('warn', input.requestId, 'training.completion_failed', { lesson_id: input.lessonId });
    return { ok: false, xpAwarded: 0, repeat: false };
  }

  const data = (rpc.data ?? {}) as Record<string, unknown>;
  const awarded = Number(data.xp_awarded ?? 0);
  log('info', input.requestId, 'training.lesson_completed', {
    lesson_id: input.lessonId,
    xp_awarded: awarded,
    repeat: data.repeat === true,
  });
  return { ok: true, xpAwarded: Number.isFinite(awarded) ? awarded : 0, repeat: data.repeat === true };
}

/** Where the member is inside an unfinished lesson (audit F11). Best-effort. */
export async function saveCheckpoint(input: {
  userId: string;
  lessonId: string;
  screenIndex: number;
  answers: Record<string, unknown>;
  correct: number;
  answered: number;
  assessmentPassed: boolean;
  requestId: string;
}): Promise<boolean> {
  if (!lessonEntry(input.lessonId)) return false;
  const rpc = await callRpc(
    'save_training_checkpoint',
    {
      p_user_id: input.userId,
      p_lesson_id: input.lessonId,
      p_screen_index: input.screenIndex,
      p_answers: input.answers,
      p_correct: input.correct,
      p_answered: input.answered,
      p_assessment_passed: input.assessmentPassed,
    },
    input.requestId
  );
  return rpc.ok;
}

export type ClaimLesson = {
  lesson_id: string;
  score_pct: number | null;
  mastery_gain: number;
  xp: Partial<TrainingXpLedger>;
  assessment_passed: boolean;
  competencies: Record<string, string>;
};

/**
 * ONE HANDSET'S STORED PROFILE, CLAIMED ONCE.
 *
 * The blob has no account id on it — that is the bug this whole lane exists to
 * fix — so nothing about it can prove whose it is. `claim_local_training_profile`
 * therefore honours it only when the account has NO training rows of its own,
 * and the app asks the member out loud before calling this at all.
 *
 * Unknown lesson ids are dropped here rather than refused, because a member
 * whose device holds one lesson from a curriculum version that no longer names
 * it should still get the other four.
 */
export async function claimLocalProfile(input: {
  userId: string;
  lessons: ClaimLesson[];
  requestId: string;
}): Promise<{ claimed: boolean; lessons: number; reason: string | null }> {
  const rows = input.lessons
    .map((l) => {
      const entry = lessonEntry(l.lesson_id);
      if (!entry) return null;
      return {
        lesson_id: l.lesson_id,
        day_id: entry.dayId,
        skill: entry.skill,
        score_pct: l.score_pct,
        mastery_gain: Math.max(0, Math.min(25, Number(l.mastery_gain) || 0)),
        xp: sanitiseLedger(l.xp, l.assessment_passed),
        assessment_passed: l.assessment_passed === true,
        competencies: l.competencies ?? {},
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const rpc = await callRpc<Record<string, unknown>>(
    'claim_local_training_profile',
    { p_user_id: input.userId, p_profile: { lessons: rows } },
    input.requestId
  );
  if (!rpc.ok) return { claimed: false, lessons: 0, reason: 'unavailable' };

  const data = (rpc.data ?? {}) as Record<string, unknown>;
  const claimed = data.claimed === true;
  log('info', input.requestId, 'training.local_profile_claim', {
    claimed,
    lessons: Number(data.lessons ?? 0),
    reason: data.reason ?? null,
  });
  return {
    claimed,
    lessons: Number(data.lessons ?? 0),
    reason: data.reason === undefined ? null : String(data.reason),
  };
}
