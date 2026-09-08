/**
 * THE DISK HALF OF A RESUMABLE SIGNUP.
 *
 * Two keys, and the fact that there are two is the design:
 *
 *   cc.onboarding.draft.v1    { [userId]: draft }   — ANSWERS, per member
 *   cc.onboarding.intent.v1   one intent            — WANTS, per device
 *
 * The draft is keyed by member because two accounts on one device must not
 * inherit each other's answers. The intent is NOT keyed by member because at
 * the moment it is written there is no member — somebody tapped a link from the
 * website's confirmation and the app has never seen them before. That is the
 * audit's "keep identity and intent separate until an account exists", and it
 * is a property of these two lines rather than of a promise in a comment: the
 * intent record (see `intent.ts`) has no field that can hold a person.
 *
 * EVERY READ AND WRITE IS WRAPPED. A device that cannot remember gets today's
 * behaviour — signup starts at question one — and that is a worse day, not a
 * broken app. AsyncStorage throwing is never a reason for onboarding not to
 * open. `features/community/last-room.ts` made the same call in its own header.
 *
 * WRITES ARE FIRE-AND-FORGET, and the screens do not await them. A member who
 * taps Continue must not wait on a disk write to see the next question; the
 * cost of losing the last write to a hard kill in that same millisecond is one
 * answer, and the cost of an awaited write is a visible stutter on every tap.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseDraftFile, serialiseDraftFile, type OnboardingAnswersFile } from './draft-codec';
import type { OnboardingAnswers } from './steps';
import { parseIntent, type FunnelIntent } from './intent';

const DRAFT_KEY = 'cc.onboarding.draft.v1';
const INTENT_KEY = 'cc.onboarding.intent.v1';

export async function readDraft(userId: string): Promise<OnboardingAnswers | null> {
  try {
    const all = parseDraftFile(await AsyncStorage.getItem(DRAFT_KEY));
    return all[userId] ?? null;
  } catch {
    return null;
  }
}

export async function writeDraft(userId: string, answers: OnboardingAnswers): Promise<void> {
  try {
    const all: OnboardingAnswersFile = parseDraftFile(await AsyncStorage.getItem(DRAFT_KEY));
    all[userId] = answers;
    await AsyncStorage.setItem(DRAFT_KEY, serialiseDraftFile(all));
  } catch {
    /* A device that cannot remember starts signup over. Nothing else breaks. */
  }
}

/**
 * Forget one member's answers.
 *
 * Called after `POST /onboarding/complete` succeeds. The server has them now,
 * and a draft that outlives its completion is a stale copy waiting to overwrite
 * a setting somebody changed in Account afterwards.
 */
export async function clearDraft(userId: string): Promise<void> {
  try {
    const all = parseDraftFile(await AsyncStorage.getItem(DRAFT_KEY));
    if (!(userId in all)) return;
    delete all[userId];
    await AsyncStorage.setItem(DRAFT_KEY, serialiseDraftFile(all));
  } catch {
    /* Ignored — see the file header. */
  }
}

export async function readIntent(): Promise<FunnelIntent | null> {
  try {
    const raw = await AsyncStorage.getItem(INTENT_KEY);
    return raw ? parseIntent(JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

export async function writeIntent(intent: FunnelIntent): Promise<void> {
  try {
    await AsyncStorage.setItem(INTENT_KEY, JSON.stringify(intent));
  } catch {
    /* The prefill is a courtesy. Losing it costs two taps, not the signup. */
  }
}

/** Dropped once it has been folded into a completed profile. */
export async function clearIntent(): Promise<void> {
  try {
    await AsyncStorage.removeItem(INTENT_KEY);
  } catch {
    /* Ignored — see the file header. */
  }
}
