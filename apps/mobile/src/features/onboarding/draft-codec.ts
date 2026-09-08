/**
 * THE DRAFT, ON DISK — and the parser that refuses to trust it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE DRAFT IS ON DISK AT ALL
 * ─────────────────────────────────────────────────────────────────────────────
 * Audit F01: "the draft is in React state". It lived in a `useState` inside
 * `SessionProvider`, which means every one of these ended signup:
 *
 *     · a phone call
 *     · the app being backgrounded long enough for iOS to reclaim it
 *     · a reload on Expo web
 *     · a crash on the risk screen
 *
 * and every one of them started it again from question one, with the answers
 * already given thrown away. The audit's acceptance is exactly this: complete
 * signup, close and reopen, resume the same step with the same choices.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IT IS KEYED BY MEMBER, AND THE INTENT IS NOT
 * ─────────────────────────────────────────────────────────────────────────────
 * The stored shape is `{ [userId]: StoredDraft }`, the same arrangement
 * `features/community/last-room.ts` uses and for the same reason: two accounts
 * on one device must not inherit each other's answers. A draft only exists
 * after sign-up — the route gate sends an authenticated, un-onboarded session
 * to `/start` — so there is always a user id to key on.
 *
 * The funnel INTENT is stored separately and NOT keyed by member, because at
 * the moment it arrives there is no member. That split is the audit's "keep
 * identity and intent separate until an account exists", made structural rather
 * than promised: see `intent.ts`, which has no field that could hold a person.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY PARSING IS PARANOID
 * ─────────────────────────────────────────────────────────────────────────────
 * What comes back off a device is a JSON blob written by an older build. It can
 * hold a `goal_mode` that no longer exists, an `experience` value from before
 * the field was renamed, a balance of `NaN` from a bad edit, or complete
 * rubbish from a partial write. Every one of those has to become "not answered"
 * rather than an answer, because the whole value of a resumed draft is that the
 * choices shown are the choices made.
 *
 * `parseDraft` therefore validates every field against its union and drops
 * anything it does not recognise. It never throws: an unreadable draft is a
 * fresh start, which is exactly what today's behaviour already is.
 *
 * This module is deliberately free of React and of AsyncStorage so that
 * `apps/mobile/scripts/onboarding-continuity-test.mts` can round-trip it in
 * Node. The IO lives next door in `storage.ts`.
 */
import type { Experience, FocusKey, GoalMode, RiskAnswer, StartAnswer } from '../../lib/types';
import type { OnboardingAnswers } from './steps';

/**
 * Practice money.
 *
 * These three numbers used to live in `lib/session.tsx`. They moved here, and
 * `session.tsx` re-exports them, so there is exactly one copy: this module is
 * free of React and of AsyncStorage precisely so that a Node test can load it,
 * and a second declaration of the clamp would be a second answer to "what is a
 * legal practice balance".
 *
 * $10,000 is not a decoration — it is the schema trigger's own default for a
 * new paper account, and `POST /onboarding/complete` clamps whatever we send
 * into $1k-$100k. Starting a draft anywhere else meant a brand-new account was
 * created at $10,000 and immediately lowered: at $2,000 the default
 * 10%-per-position rule leaves $200, and the cheapest seeded symbol costs more
 * than that. A new member could not place a single order.
 */
export const BALANCE_MIN = 1000;
export const BALANCE_MAX = 100000;
export const DEFAULT_BALANCE = 10000;

export function clampBalance(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_BALANCE;
  return Math.min(BALANCE_MAX, Math.max(BALANCE_MIN, Math.round(n)));
}

const START_ANSWERS: StartAnswer[] = ['brand_new', 'investor', 'swing', 'active'];
const GOAL_MODES: GoalMode[] = ['day_trade', 'swing', 'invest'];
const GUIDANCE: Experience[] = ['new', 'some', 'pro'];
const RISK_ANSWERS: RiskAnswer[] = ['careful', 'balanced', 'aggressive'];
const FOCUS_KEYS: FocusKey[] = ['tech', 'ai', 'energy', 'etf', 'crypto', 'earnings'];

export const EMPTY_ANSWERS: OnboardingAnswers = {
  start_answer: null,
  goal_mode: null,
  guidance: null,
  confirmed_goal: false,
  risk_answer: null,
  /*
   * EMPTY, and this is a correction rather than a tidy-up. The draft used to
   * start at `['tech', 'ai']`, so an account whose owner never opened the focus
   * screen was recorded as having asked Kai to watch big tech and semis. The
   * house rule against fabricating a number onto a screen applies at least as
   * hard to fabricating a preference into somebody's profile — and `focusList`
   * already reads an empty list as "the whole market", which is the truth.
   */
  focus: [],
  starting_balance: DEFAULT_BALANCE,
};

function oneOf<T extends string>(allowed: T[], v: unknown): T | null {
  return typeof v === 'string' && (allowed as string[]).includes(v) ? (v as T) : null;
}

/** Everything this build knows how to store. */
export type StoredDraft = OnboardingAnswers & {
  /** Schema marker. A draft written by a build with a different one is dropped. */
  v: 1;
};

export const DRAFT_VERSION = 1 as const;

export function toStored(answers: OnboardingAnswers): StoredDraft {
  return { ...answers, starting_balance: clampBalance(answers.starting_balance), v: DRAFT_VERSION };
}

/**
 * Read one member's draft back.
 *
 * A field that does not validate comes back null — "not answered" — and never
 * a plausible-looking substitute. The one exception is `starting_balance`,
 * which has no meaningful null: an absent or unreadable balance becomes the
 * schema trigger's own $10,000 default, which is what a brand-new paper account
 * is created with anyway.
 */
export function parseDraft(raw: unknown): OnboardingAnswers | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== DRAFT_VERSION) return null;
  return {
    start_answer: oneOf(START_ANSWERS, o.start_answer),
    goal_mode: oneOf(GOAL_MODES, o.goal_mode),
    guidance: oneOf(GUIDANCE, o.guidance),
    confirmed_goal: o.confirmed_goal === true,
    risk_answer: oneOf(RISK_ANSWERS, o.risk_answer),
    focus: Array.isArray(o.focus)
      ? (o.focus.map((f) => oneOf(FOCUS_KEYS, f)).filter((f): f is FocusKey => f !== null))
      : [],
    starting_balance:
      typeof o.starting_balance === 'number' ? clampBalance(o.starting_balance) : DEFAULT_BALANCE,
  };
}

/**
 * The whole file, parsed. Anything that is not an object of member → draft is
 * an empty map, because a corrupt bag must not take the readable drafts in it
 * down as well as the unreadable one.
 */
export type OnboardingAnswersFile = Record<string, OnboardingAnswers>;

export function parseDraftFile(text: string | null): OnboardingAnswersFile {
  if (!text) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const out: Record<string, OnboardingAnswers> = {};
  for (const [userId, value] of Object.entries(parsed as Record<string, unknown>)) {
    const draft = parseDraft(value);
    if (draft) out[userId] = draft;
  }
  return out;
}

/**
 * Nothing has been answered.
 *
 * The provider uses this to decide between writing a draft and deleting one:
 * an empty draft on disk is indistinguishable from no draft when it is read
 * back, so keeping the key would be storing a fact about a member that says
 * nothing. It is also what makes `reset()` after a completed signup clear the
 * device rather than leave a husk behind for the next read to find.
 */
export function isEmptyAnswers(a: OnboardingAnswers): boolean {
  return (
    a.start_answer === null &&
    a.goal_mode === null &&
    a.guidance === null &&
    a.confirmed_goal === false &&
    a.risk_answer === null &&
    a.focus.length === 0 &&
    a.starting_balance === DEFAULT_BALANCE
  );
}

export function serialiseDraftFile(all: OnboardingAnswersFile): string {
  const out: Record<string, StoredDraft> = {};
  for (const [userId, answers] of Object.entries(all)) out[userId] = toStored(answers);
  return JSON.stringify(out);
}
