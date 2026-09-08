/**
 * TRAINING AND BELTS, OVER THE WIRE.
 *
 * ===========================================================================
 * WHY THIS FILE EXISTS INSTEAD OF SEVEN METHODS ON `lib/api.ts`
 * ===========================================================================
 * `lib/api.ts` is where every other call in this app lives and is where these
 * belong. This lane does not own that file — several agents are editing this
 * one working tree — so the calls live here, built on the same two pieces
 * `lib/api.ts` builds on (`env` and `getAccessToken`) and answering the same
 * envelope. FOLDING THESE INTO `lib/api.ts` IS A MECHANICAL MOVE and should
 * happen the moment one hand owns both; this comment is the note to whoever
 * does it.
 *
 * ===========================================================================
 * EVERYTHING HERE FAILS SOFT, AND THAT IS A DESIGN DECISION
 * ===========================================================================
 * A member who has just finished a lesson on a train is not the person to hand
 * a networking error to. So a write that cannot land returns a value saying so
 * and the store keeps its own copy; the next mount re-sends it. What must NOT
 * happen is the opposite failure — a screen that says "Saved to your account"
 * when nothing was saved, which is exactly the sentence Board 08 prints and
 * exactly the thing that was untrue before this lane. `saved` comes back from
 * the server or it does not come back at all.
 */
import type {
  BeltProfileResponse,
  ExamStartResponse,
  ExamSubmitResponse,
  TrainingClaimResponse,
  TrainingCompleteResponse,
  TrainingProgressResponse,
} from '@cheatcode/shared';
import { env } from '../../lib/env';
import { getAccessToken, recoverSession } from '../../lib/auth-token';
import { supabase } from '../../lib/supabase';

export class TrainingApiError extends Error {
  code: string;
  constructor(code: string, messagePlain: string) {
    super(messagePlain);
    this.code = code;
  }
}

/** False in fixtures mode or before the env is wired: the store stays local. */
export const trainingApiAvailable = (): boolean => env.hasApi && !env.FIXTURES;

async function request<T>(path: string, init?: RequestInit, retried = false): Promise<T> {
  if (!env.hasApi) throw new TrainingApiError('NO_API', 'The service is not connected yet.');
  let res: Response;
  try {
    res = await fetch(`${env.apiBase}/api/v1${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'X-CheatCode-Client': 'app',
        ...(await authHeader()),
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new TrainingApiError('NETWORK', "I couldn't reach the service just now.");
  }
  // Same single retry `lib/api.ts` does: refresh once, and if the refresh token
  // is dead too, `recoverSession` signs out and the route gate takes over.
  if (res.status === 401 && !retried && supabase) {
    const fresh = await recoverSession();
    if (fresh) return request<T>(path, init, true);
    throw new TrainingApiError('UNAUTHENTICATED', 'Your session expired. Sign in again.');
  }

  const text = await res.text();
  type Envelope = { error?: { code?: string; message_plain?: string } };
  let json: Envelope | null = null;
  try {
    json = text ? (JSON.parse(text) as Envelope) : null;
  } catch {
    // A route the API lane has not deployed yet answers with Next's HTML 404
    // rather than our envelope. That has to become a typed NOT_FOUND, not a
    // JSON parse crash inside a lesson.
    throw new TrainingApiError(
      res.status === 404 ? 'NOT_FOUND' : 'INTERNAL',
      'That part of the service is not live yet.'
    );
  }
  if (!res.ok) {
    const err = json?.error ?? {};
    throw new TrainingApiError(
      err.code ?? (res.status === 404 ? 'NOT_FOUND' : 'INTERNAL'),
      err.message_plain ?? 'Something went wrong. Please try again.'
    );
  }
  return json as T;
}

async function authHeader(): Promise<Record<string, string>> {
  if (!supabase) return {};
  const token = await getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/* ── training ─────────────────────────────────────────────────────────────── */

export const fetchProgress = (): Promise<TrainingProgressResponse> =>
  request<TrainingProgressResponse>('/training/progress');

export const postLessonComplete = (
  lessonId: string,
  body: {
    day_id: string;
    skill: string;
    score_pct: number | null;
    mastery_gain: number;
    xp: { interactive: number; video: number; practice: number; assessment: number };
    assessment_passed: boolean;
    competencies: Record<string, string>;
  }
): Promise<TrainingCompleteResponse> =>
  request<TrainingCompleteResponse>(`/training/lessons/${encodeURIComponent(lessonId)}/complete`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const putCheckpoint = (
  lessonId: string,
  body: {
    screen_index: number;
    answers: Record<string, unknown>;
    correct: number;
    answered: number;
    assessment_passed: boolean;
  }
): Promise<{ saved: boolean }> =>
  request<{ saved: boolean }>(`/training/lessons/${encodeURIComponent(lessonId)}/checkpoint`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });

export const postClaim = (lessons: unknown[]): Promise<TrainingClaimResponse> =>
  request<TrainingClaimResponse>('/training/claim', {
    method: 'POST',
    body: JSON.stringify({ lessons }),
  });

/* ── belts ────────────────────────────────────────────────────────────────── */

export const fetchBeltProfile = (): Promise<BeltProfileResponse> =>
  request<BeltProfileResponse>('/belts/me');

export const startExam = (belt: string): Promise<ExamStartResponse> =>
  request<ExamStartResponse>(`/belts/exams/${encodeURIComponent(belt)}/start`, { method: 'POST' });

export const submitExam = (
  belt: string,
  attemptId: string,
  answers: Record<string, string>
): Promise<ExamSubmitResponse> =>
  request<ExamSubmitResponse>(`/belts/exams/${encodeURIComponent(belt)}/submit`, {
    method: 'POST',
    body: JSON.stringify({ attempt_id: attemptId, answers }),
  });
