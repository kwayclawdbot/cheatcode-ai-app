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

export function nextMode(m: GoalMode): GoalMode {
  return MODE_ORDER[(MODE_ORDER.indexOf(m) + 1) % MODE_ORDER.length];
}

export const EXPERIENCE_ORDER: Experience[] = ['new', 'some', 'pro'];

export function nextExperience(e: Experience): Experience {
  return EXPERIENCE_ORDER[(EXPERIENCE_ORDER.indexOf(e) + 1) % EXPERIENCE_ORDER.length];
}

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
