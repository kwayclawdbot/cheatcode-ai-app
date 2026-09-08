/**
 * THE SHAPE OF SIGNUP — three steps, and where a half-finished one resumes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS REPLACED
 * ─────────────────────────────────────────────────────────────────────────────
 * Audit F01 (P1). Before Home the app asked, in order: placement ("Where are
 * you right now?"), goal, risk, experience + focus, username, and then a plan
 * screen. Six screens, and two of them were the same question:
 *
 *     start:       "Where are you right now?"      → I'm brand new / I swing trade / …
 *     personalize: "How much have you traded?"     → New to this / Some / I trade actively
 *
 * Somebody who had just said "I'm brand new" was asked to say it again four
 * screens later, in different words, with a different set of answers. The
 * audit's separation page is the reason this is worse than untidy: PLACEMENT is
 * readiness (what you have demonstrated, which moves) and EXPERIENCE is
 * guidance (how much Kai explains, which is a preference). Asking them as two
 * versions of one question taught members that they mean the same thing, and
 * the app then disagreed with itself — an active trader could be placed Trade
 * Ready while the draft experience stayed New.
 *
 * So placement is asked once, and the guidance it implies is SHOWN on the goal
 * screen as a default the member confirms or overrules in the same tap. Three
 * steps:
 *
 *     1 start   Where are you right now?          → readiness placement
 *     2 goal    What do you want to do, and how   → goal mode + guidance, one screen
 *               much should Kai explain?
 *     3 plan    Here is how I will work for you   → the honest rows, and Start
 *
 * Focus and username left the required path entirely. Neither blocks anything:
 * `POST /rooms/:id/messages` already refuses a post from an account with no
 * username (server-side, whatever the phone thinks), and Account already edits
 * focus through `PUT /settings`. They are offered on the plan screen as
 * optional detours instead of being gates in front of Home. Risk left too —
 * see `risk-gate.ts` for where it went and why.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE STEP IS DERIVED, NOT STORED
 * ─────────────────────────────────────────────────────────────────────────────
 * F01's acceptance is: complete signup, close and reopen, resume the same step
 * with the same choices. The obvious implementation stores a cursor beside the
 * answers, and the obvious implementation is wrong — a cursor is a second
 * source of truth that can disagree with the answers it points at, and the way
 * it disagrees is by sending somebody to a screen they already finished or past
 * one they never saw.
 *
 * `furthestStep()` is a function of the answers. There is nothing to get out of
 * sync, and "resume the same step with the same choices" is true by
 * construction rather than by bookkeeping.
 *
 * `confirmed_goal` is the one flag, and it earns its place: `goal_mode` and
 * `guidance` are both PRE-SELECTED from the placement answer, so their being
 * set proves nothing about whether the member ever saw step 2. The flag records
 * the only thing the answers cannot: that a human pressed Continue there.
 */
import type { Experience, FocusKey, GoalMode, RiskAnswer, StartAnswer } from '../../lib/types';
import type { FunnelIntent } from './intent';

export const ONBOARDING_STEPS = ['start', 'goal', 'plan'] as const;
export type OnboardingStepId = (typeof ONBOARDING_STEPS)[number];

/** The route each step lives at, so nothing hard-codes a path twice. */
export const STEP_ROUTE: Record<OnboardingStepId, string> = {
  start: '/start',
  goal: '/goal',
  plan: '/kai-plan',
};

/** "2 of 3" — the progress bars read this so they cannot count a stale total. */
export function stepNumber(id: OnboardingStepId): number {
  return ONBOARDING_STEPS.indexOf(id) + 1;
}

export const STEP_TOTAL = ONBOARDING_STEPS.length;

/**
 * The answers, as they exist before `POST /onboarding/complete` accepts them.
 *
 * `guidance` is `experience` under the name that says what it does. The wire
 * still calls it experience, because that is what the server column is called
 * and renaming a column is not this lane's to do; the screen says "How much
 * should Kai explain?" and `GUIDANCE_LABEL` in `features/account/profile.ts`
 * already had the honest words for the three values.
 *
 * Every field is nullable except `starting_balance`, and the nulls are load
 * bearing: null is "not answered", and an unanswered question must never look
 * like an answer. The old draft defaulted `focus` to `['tech', 'ai']`, which
 * meant a member who never saw the focus screen was recorded as having asked
 * Kai to watch big tech and semis. That is a fabricated preference, and the
 * house rule against fabricating data on a screen applies at least as strongly
 * to fabricating one into someone's profile.
 */
export type OnboardingAnswers = {
  start_answer: StartAnswer | null;
  goal_mode: GoalMode | null;
  guidance: Experience | null;
  /** True once a human pressed Continue on step 2. Not inferable from the rest. */
  confirmed_goal: boolean;
  risk_answer: RiskAnswer | null;
  /**
   * What Kai scans first. NOT a step — it is the optional detour offered from
   * the plan screen, and Account edits it afterwards through `PUT /settings`.
   * It is persisted with the rest so that a member who wandered into it and got
   * interrupted does not lose the chips they ticked.
   */
  focus: FocusKey[];
  starting_balance: number;
};

export function furthestStep(a: Pick<OnboardingAnswers, 'start_answer' | 'confirmed_goal'>): OnboardingStepId {
  if (!a.start_answer) return 'start';
  if (!a.confirmed_goal) return 'goal';
  return 'plan';
}

export function resumeRoute(a: Pick<OnboardingAnswers, 'start_answer' | 'confirmed_goal'>): string {
  return STEP_ROUTE[furthestStep(a)];
}

/* ==================================================================== */
/* PLACEMENT → THE TWO DEFAULTS IT SUPPLIES                             */
/* ==================================================================== */

/**
 * The mode the placement pre-selects.
 *
 * Unchanged from what `start.tsx` has always written, and deliberately still
 * only a PRE-SELECTION: the server refuses to set `primary_mode` from the
 * placement precisely so that step 2 — which asks the question out loud — is
 * the decision.
 */
export const MODE_FOR_PLACEMENT: Record<StartAnswer, GoalMode> = {
  brand_new: 'invest',
  investor: 'invest',
  swing: 'swing',
  active: 'day_trade',
};

/**
 * The guidance the placement pre-selects — the answer the app used to ask for
 * a second time on the personalize screen.
 *
 * `investor` maps to `new` and not to `some`, and that is the one worth
 * arguing. "I invest but don't really trade" is a person who may know a great
 * deal about companies and nothing about a stop loss, and the cost of the two
 * mistakes is not symmetric: over-explaining is mildly irritating and is
 * changed in one tap on the very next screen, while under-explaining loses
 * somebody at the first unglossed term. The audit's own instruction is not to
 * hide basic explanations from experienced members.
 */
export const GUIDANCE_FOR_PLACEMENT: Record<StartAnswer, Experience> = {
  brand_new: 'new',
  investor: 'new',
  swing: 'some',
  active: 'pro',
};

/**
 * What the placement answer writes into the draft.
 *
 * Both are pre-selections and both are visible and changeable on step 2, which
 * is the difference between a default and a decision.
 */
export function answersForPlacement(answer: StartAnswer): Pick<OnboardingAnswers, 'start_answer' | 'goal_mode' | 'guidance'> {
  return {
    start_answer: answer,
    goal_mode: MODE_FOR_PLACEMENT[answer],
    guidance: GUIDANCE_FOR_PLACEMENT[answer],
  };
}

/* ==================================================================== */
/* FUNNEL INTENT → PREFILL                                              */
/* ==================================================================== */

/**
 * What the website's answers are allowed to fill in, and what they are not.
 *
 * F01's acceptance has a sentence that reads like a footnote and is the whole
 * rule: "Do not silently promote readiness from a marketing persona." The site
 * asks three doors — Learn / Swing / Pro — and its own `handoff.ts` carries a
 * `START_ANSWER_FOR` map. Applying that map on arrival would set the readiness
 * stage, which is what shows beside a member's name and what decides which
 * Home they get, from a button somebody pressed on a marketing page before
 * they had an account.
 *
 * So intent prefills the two things that are preferences and adjustable —
 * GOAL and GUIDANCE — and it does not answer the placement question at all. It
 * SUGGESTS one: `start.tsx` marks the suggested option "From the website" and
 * still requires a tap. A suggestion a person confirms is not a silent
 * promotion; the same answer written into the draft on arrival would be.
 */
export function prefillFromIntent(intent: FunnelIntent): Partial<OnboardingAnswers> {
  return {
    goal_mode: intent.goal_mode,
    guidance: intent.guidance,
  };
}
