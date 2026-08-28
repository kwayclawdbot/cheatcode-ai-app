/**
 * The round-4 profile: experience, focus, Kai's voice line, rule adherence.
 *
 * WHERE THIS LIVES AND WHY. `profiles.experience_level` is the schema's word
 * (beginner / intermediate / advanced). The prototype's word is new / some /
 * pro, and it is the one the user actually picked, so it is stored verbatim in
 * `profiles.onboarding.experience` alongside the mapped level. Two fields, one
 * truth, and neither has to be reverse-engineered from the other.
 *
 * `focus[]` goes in `profiles.onboarding.focus`, which is where the brief puts
 * it and which needs no migration. It is a scanning preference, not a risk
 * control, so it belongs with the onboarding answers rather than in a column of
 * its own.
 *
 * RULE ADHERENCE is computed from `debriefs.process_review`. A session is one
 * debrief; a session is "followed" when every receipt item in that review came
 * back ok. It is hidden below three sessions — a 1-of-2 is noise, and this
 * product does not do streaks or scores, so a ratio that is not yet meaningful
 * is simply not shown (`show:false`) rather than shown small.
 */
import {
  EXPERIENCE_TO_LEVEL,
  EXPERIENCE_VOICE_LINE,
  FOCUS_LABELS,
  FOCUS_SYMBOLS,
  type AppMode,
  type Experience,
  type ExperienceLevel,
  type FocusKey,
  type FocusSummary,
  type KaiProfile,
  type RuleAdherence,
} from '@shared/api';
import { serviceClient } from '../db';
import { experienceOf } from '../kai/voice';
import { hasRuleAdherenceView } from './schema-probe';

const MODE_LABEL: Record<AppMode, string> = {
  day_trade: 'Day Trade',
  swing: 'Swing',
  invest: 'Invest',
};

const EXPERIENCE_LABEL: Record<Experience, string> = {
  new: 'New to this',
  some: 'Some experience',
  pro: 'Trades actively',
};

/** "Kai will scan big tech and AI & semis first." */
export function focusSummary(keys: unknown): FocusSummary {
  const valid = (Array.isArray(keys) ? keys : []).filter(
    (k): k is FocusKey => typeof k === 'string' && k in FOCUS_LABELS
  );
  const labels = valid.map((k) => FOCUS_LABELS[k]);
  const symbols = [...new Set(valid.flatMap((k) => FOCUS_SYMBOLS[k]))];

  const list =
    labels.length === 0
      ? 'the whole market'
      : labels.length === 1
        ? labels[0]
        : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;

  return {
    keys: valid,
    labels,
    symbols,
    plain: labels.length ? `Kai will scan ${list} first.` : 'Pick at least one, or Kai scans everything.',
  };
}

export function readExperience(onboarding: Record<string, unknown> | null | undefined, fallbackLevel: string): Experience {
  return experienceOf((onboarding ?? {}).experience ?? fallbackLevel);
}

export function readFocus(onboarding: Record<string, unknown> | null | undefined): FocusSummary {
  return focusSummary((onboarding ?? {}).focus);
}

export function kaiProfile(opts: {
  mode: AppMode;
  onboarding: Record<string, unknown> | null;
  experienceLevel: string;
}): KaiProfile {
  const exp = readExperience(opts.onboarding, opts.experienceLevel);
  return {
    mode: opts.mode,
    mode_label: MODE_LABEL[opts.mode],
    experience: exp,
    experience_label: EXPERIENCE_LABEL[exp],
    focus: readFocus(opts.onboarding),
    voice_line: EXPERIENCE_VOICE_LINE[exp],
  };
}

/** Write experience + focus into the onboarding bag without losing anything. */
export function writeKaiProfile(
  onboarding: Record<string, unknown> | null | undefined,
  patch: { experience?: Experience; focus?: FocusKey[] }
): { onboarding: Record<string, unknown>; explanationLevel: ExperienceLevel | null } {
  const base = { ...(onboarding ?? {}) };
  let level: ExperienceLevel | null = null;
  if (patch.experience) {
    base.experience = patch.experience;
    level = EXPERIENCE_TO_LEVEL[patch.experience];
  }
  if (patch.focus) base.focus = patch.focus;
  return { onboarding: base, explanationLevel: level };
}

/* ------------------------------------------------------------------ */
/* Rule adherence                                                       */
/* ------------------------------------------------------------------ */

const MIN_SESSIONS = 3;

function followedFrom(review: unknown): boolean | null {
  if (!review || typeof review !== 'object') return null;
  const r = review as Record<string, unknown>;

  // `process_review` is written by the debrief writer as a set of receipt
  // items. Two shapes exist in the wild: an array of {ok} and a flat map of
  // booleans. Both are read; anything else answers "unknown" rather than a
  // guessed pass, because "you followed your rules" is a claim about the user.
  const items = Array.isArray(r.items) ? r.items : Array.isArray(review) ? (review as unknown[]) : null;
  if (items) {
    const oks = items
      .map((i) => (i && typeof i === 'object' ? (i as Record<string, unknown>).ok : undefined))
      .filter((v) => typeof v === 'boolean') as boolean[];
    return oks.length ? oks.every(Boolean) : null;
  }
  const bools = Object.values(r).filter((v) => typeof v === 'boolean') as boolean[];
  return bools.length ? bools.every(Boolean) : null;
}

export async function ruleAdherence(userId: string): Promise<RuleAdherence> {
  const db = serviceClient();

  if (await hasRuleAdherenceView()) {
    const { data } = await db
      .from('rule_adherence_v')
      .select('sessions,followed')
      .eq('user_id', userId)
      .maybeSingle();
    const row = (data as Record<string, unknown> | null) ?? null;
    if (row) {
      const sessions = Number(row.sessions ?? 0);
      const followed = Number(row.followed ?? 0);
      return shape(sessions, followed);
    }
  }

  const { data } = await db
    .from('debriefs')
    .select('id,process_review,created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  const rows = (data ?? []) as Record<string, unknown>[];
  const judged = rows.map((r) => followedFrom(r.process_review)).filter((v): v is boolean => v !== null);
  return shape(judged.length, judged.filter(Boolean).length);
}

function shape(sessions: number, followed: number): RuleAdherence {
  const show = sessions >= MIN_SESSIONS;
  return {
    sessions,
    followed,
    show,
    plain: show
      ? `You've followed your rules ${followed} of the last ${sessions} sessions.`
      : sessions === 0
        ? 'Nothing to measure yet — this appears once you have reviewed a few trades.'
        : `${sessions} session${sessions === 1 ? '' : 's'} reviewed so far. I will start showing this at ${MIN_SESSIONS}.`,
    route: show ? '/debriefs' : null,
  };
}
