/**
 * THE TRADE DETAIL SCREEN'S NUMBERS AND WORDS — pure, so they have a test.
 *
 * The redesign (docs/design/redesign-2026-09-21, "Trade Detail") puts four
 * things on the top half of the screen that all have to be TRUE rather than
 * decorative: the R multiple in the corner, the setup summary, Kai's thesis and
 * the four-item checklist. Each is worked out here from rows that already
 * arrived with the portal payload. Nothing in this file invents a number, and
 * anything it cannot work out comes back as `null` or `unknown` with the reason
 * — never as a zero, and never as a tick.
 */
import type { PortalAlert, ScoreComponent, TradePortal } from '../portal/types';
import type { TradeRead } from './read';

const n = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

export const levelOf = (read: TradeRead, key: 'entry' | 'stop' | 'target'): number | null =>
  read.because.find((l) => l.key === key)?.price ?? null;

/* ------------------------------------------------------------------ */
/* R multiples                                                          */
/* ------------------------------------------------------------------ */

/**
 * What the plan pays for what it risks: distance to target over distance to
 * stop, from the planned entry. "3.0R" on the setup summary.
 */
export function plannedR(read: TradeRead): number | null {
  const e = levelOf(read, 'entry');
  const s = levelOf(read, 'stop');
  const t = levelOf(read, 'target');
  if (!n(e) || !n(s) || !n(t)) return null;
  const risk = Math.abs(e - s);
  return risk > 0 ? Math.abs(t - e) / risk : null;
}

/**
 * WHERE THE TRADE IS RIGHT NOW, MEASURED IN WHAT IT RISKS — the number in the
 * top-right corner of the screen.
 *
 * +1.0R means price has moved one full risk-unit in the trade's favour from the
 * planned entry; −0.5R means it is half-way to the stop. It is signed by the
 * trade's direction, so a short that is working reads positive. Null when there
 * is no plan (no entry or no stop) or no price — the corner then shows the
 * price instead, because a made-up R is worse than none.
 */
export function currentR(read: TradeRead, price: number | null | undefined): number | null {
  const e = levelOf(read, 'entry');
  const s = levelOf(read, 'stop');
  if (!n(e) || !n(s) || !n(price)) return null;
  const risk = Math.abs(e - s);
  if (!(risk > 0)) return null;
  const sign = read.direction === 'short' ? -1 : 1;
  return (sign * (price - e)) / risk;
}

/** "+0.1R" / "−0.4R" / "0.0R" — one decimal, a real minus sign. */
export function signedR(r: number): string {
  const v = Math.round(r * 10) / 10;
  if (v === 0) return '0.0R';
  return `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}R`;
}

/* ------------------------------------------------------------------ */
/* Words                                                                */
/* ------------------------------------------------------------------ */

/** "Swing Long" / "Day Trade Short" — from the alert, never guessed. Null when it said nothing. */
export function setupType(alert: PortalAlert | null): string | null {
  if (!alert) return null;
  const mode = alert.mode?.trim() || null;
  const dir = alert.direction?.trim() || null;
  const words = [mode, dir ? dir.charAt(0).toUpperCase() + dir.slice(1).toLowerCase() : null].filter(Boolean);
  return words.length ? words.join(' ') : null;
}

export type Thesis = { text: string; source: 'kai' | 'setup' } | null;

/**
 * KAI'S THESIS, OR NOTHING.
 *
 * Kai's own write-up on the alert first; the setup's stored thesis second
 * (`restored.thesis_plain` on the portal payload, which is what the scanner
 * wrote when it graded it). If neither exists the card says so — it does not
 * borrow the opening chat line, which is a greeting, not an argument.
 */
export function thesisOf(read: TradeRead, portal: TradePortal): Thesis {
  const kai = read.interpretation?.trim() || portal.alert?.kai_interpretation?.trim() || null;
  if (kai) return { text: kai, source: 'kai' };
  const stored = portal.thesis_plain?.trim() || null;
  if (stored) return { text: stored, source: 'setup' };
  return null;
}

/* ------------------------------------------------------------------ */
/* The checklist                                                        */
/* ------------------------------------------------------------------ */

export type CheckKey = 'trend' | 'catalyst' | 'volume' | 'risk';
export type CheckState = 'met' | 'not_met' | 'unknown';

export type CheckItem = {
  key: CheckKey;
  label: string;
  state: CheckState;
  /** The grade's own status word — "Strong", "Forming" — when it has one. */
  status: string | null;
  /** Why, in the grader's words; or why it is unknown. */
  plain: string;
};

/**
 * WHICH GRADE LEG ANSWERS WHICH LINE.
 *
 * The four words are the spec's; the legs are the grading engine's
 * (`apps/api/src/lib/round4/grade.ts`, `MODE_COMPONENTS`). A line is answered
 * only by a leg that measures the same thing — Volume by the volume leg, not by
 * "structure" because it is nearby. Day trades are not graded on catalyst and
 * swing trades are not graded on volume, so on those modes the line is honestly
 * unknown rather than filled in from something else.
 */
const LEGS: Record<CheckKey, { label: string; keys: string[] }> = {
  trend: { label: 'Trend', keys: ['trend'] },
  catalyst: { label: 'Catalyst', keys: ['catalyst', 'catalyst_risk'] },
  volume: { label: 'Volume', keys: ['volume'] },
  risk: { label: 'Risk', keys: ['risk_reward', 'rr'] },
};

/**
 * The grader draws a leg at 0–5 segments and calls 4 or more its top word
 * ("Strong", "Healthy", "Favorable", "Supportive") — see `pick` in grade.ts.
 * The same line is used here, so a tick means exactly what the grade means by
 * its top word and nothing looser.
 */
export const MET_AT = 4;

export function checklistOf(components: ScoreComponent[] | null | undefined, graded: boolean): CheckItem[] {
  const list = components ?? [];
  return (Object.keys(LEGS) as CheckKey[]).map((key) => {
    const leg = LEGS[key];
    if (!graded) {
      return { key, label: leg.label, state: 'unknown', status: null, plain: 'There is no graded setup here, so there is nothing to check this against.' };
    }
    const c = list.find((x) => leg.keys.includes(x.key.toLowerCase()));
    if (!c) {
      return { key, label: leg.label, state: 'unknown', status: null, plain: `This setup was not graded on ${leg.label.toLowerCase()}.` };
    }
    if (/^unknown$/i.test(c.status.trim())) {
      return { key, label: leg.label, state: 'unknown', status: null, plain: c.explanation ?? `No read on ${leg.label.toLowerCase()} for this one.` };
    }
    return {
      key,
      label: leg.label,
      state: c.strength >= MET_AT ? 'met' : 'not_met',
      status: c.status,
      plain: c.explanation ?? `${leg.label}: ${c.status}.`,
    };
  });
}
