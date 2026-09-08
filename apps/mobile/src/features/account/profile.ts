import type { Experience, FocusKey, GoalMode } from '../../lib/types';

/**
 * The Kai profile vocabulary — prototype-logic.js `__onboard()` / `__voice()`.
 * Experience drives Kai's VOICE, not just a label:
 *   new  → explains each term the first time it appears (glossary)
 *   some → plain language, skips the basics
 *   pro  → leads with levels and numbers, no preamble
 */

export const FOCUS_ORDER: FocusKey[] = ['tech', 'ai', 'energy', 'etf', 'crypto', 'earnings'];

/** Chip copy on the personalize board. */
export const FOCUS_CHIP: Record<FocusKey, string> = {
  tech: 'Big tech',
  ai: 'AI & semis',
  energy: 'Energy',
  etf: 'Index ETFs',
  crypto: 'Crypto-linked',
  earnings: 'Earnings plays',
};

/** Prose form used in the summary line and the plan checklist. */
export const FOCUS_NAME: Record<FocusKey, string> = {
  tech: 'big tech',
  ai: 'AI & semis',
  energy: 'energy',
  etf: 'index ETFs',
  crypto: 'crypto-linked names',
  earnings: 'earnings plays',
};

export function focusList(focus: FocusKey[]): string {
  const picked = focus.map((k) => FOCUS_NAME[k]).filter(Boolean);
  if (picked.length === 0) return 'the whole market';
  if (picked.length === 1) return picked[0];
  return `${picked.slice(0, -1).join(', ')} and ${picked[picked.length - 1]}`;
}

export function focusSummary(focus: FocusKey[]): string {
  return focus.length ? `Kai will scan ${focusList(focus)} first.` : 'Pick at least one, or Kai scans everything.';
}

export const EXPERIENCE_LABEL: Record<Experience, string> = {
  new: 'New to this',
  some: 'Some experience',
  pro: 'Trades actively',
};

/** The choice-card consequence line on the personalize board. */
export const EXPERIENCE_CONSEQUENCE: Record<Experience, string> = {
  new: 'Kai explains every term as it comes up.',
  some: 'Plain language, less hand-holding.',
  pro: 'Levels and numbers first, no preamble.',
};

/** Kai's own voice line — Account board + onboarding plan checklist. */
export const EXPERIENCE_VOICE: Record<Experience, string> = {
  new: 'I explain every term the first time it appears.',
  some: 'I keep it plain but skip the basics.',
  pro: 'I lead with levels and numbers, no preamble.',
};

export const MODE_LABEL: Record<GoalMode, string> = {
  day_trade: 'Day Trade',
  swing: 'Swing',
  invest: 'Investing',
};

export const MODE_ORDER: GoalMode[] = ['day_trade', 'swing', 'invest'];

export const EXPERIENCE_ORDER: Experience[] = ['new', 'some', 'pro'];

/*
 * `nextMode()` AND `nextExperience()` ARE GONE AND MUST NOT COME BACK.
 *
 * They existed for one caller each: two rows on the Account board that
 * advanced a setting by one step per tap. Both rows drew the same chevron as
 * every row that opens a screen, so a person tapping to look at their mode
 * changed how Kai scans the market instead — and with three values, stepping
 * back one meant tapping forward twice with no list of the options anywhere on
 * screen. Both settings are chosen from an explicit sheet now
 * (`features/account/controls.tsx`), which needs the ORDER above and no
 * successor function at all.
 */

/* ==================================================================== */
/* GUIDANCE — the same three values, named for what they actually do    */
/* ==================================================================== */

/**
 * THIS IS THE `experience` SETTING, SAID HONESTLY.
 *
 * Stored as new/some/pro and labelled "Experience level" on the Account board,
 * which made it read as a judgement about the member — a readiness rung, right
 * next to the readiness rung. It is not one. All it decides is HOW MUCH KAI
 * EXPLAINS: the server maps it straight onto `explanation_level`
 * (`EXPERIENCE_TO_LEVEL` below, and `apps/api/.../settings/route.ts` writes
 * both from the one word). Nothing about it is earned and nothing about it is
 * a claim, so it is adjustable at any time and named for its effect.
 *
 * The audit's separation is: GOAL is what you are here to do (invest, swing,
 * day trade), GUIDANCE is how much Kai explains, READINESS is what you have
 * demonstrated, and a BELT is a community track record. This constant covers
 * exactly the second one. Onboarding still asks the question in the
 * first-person form a stranger can answer — `EXPERIENCE_LABEL` above — because
 * "how much should I explain?" is not answerable before you have heard Kai
 * explain anything.
 */
export const GUIDANCE_LABEL: Record<Experience, string> = {
  new: 'Explain everything',
  some: 'Plain language',
  pro: 'Straight to the numbers',
};

/** `experience` → the API's explanation_level / experience_level. */
export const EXPERIENCE_TO_LEVEL: Record<Experience, 'beginner' | 'intermediate' | 'advanced'> = {
  new: 'beginner',
  some: 'intermediate',
  pro: 'advanced',
};

export function experienceFromLevel(level?: string | null): Experience {
  if (level === 'advanced') return 'pro';
  if (level === 'intermediate') return 'some';
  return 'new';
}

/**
 * Fixture-side voice shaping so the difference between `new` and `pro` is
 * VISIBLE without the API. Real Kai text comes shaped from the server.
 */
const GLOSSARY: Record<string, string> = {
  confirmed: 'Confirmed means the move Kai was waiting for actually happened — not just a guess.',
  cleared: 'Cleared the level means price moved above a price that had been holding it back.',
  drift: 'Drift is how far your mix has wandered from the split you chose.',
  volume: 'Volume is how many shares changed hands — more of it makes a move more believable.',
  invalidating: 'Invalidating means price is close to proving the idea wrong, so Kai would drop it.',
  thesis: 'A thesis is the reason you own something and what would make you stop.',
};

export function kaiVoice(text: string, experience: Experience, term?: string): string {
  if (experience === 'pro') return text.replace(/^Good morning, [^.]+\.\s*/, '');
  if (experience !== 'new' || !term) return text;
  const note = GLOSSARY[term];
  return note ? `${text} — ${note}` : text;
}
