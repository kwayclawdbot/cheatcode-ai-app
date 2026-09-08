/**
 * THE EXAM PAPER, WITH THE ANSWERS TAKEN OUT.
 *
 * ===========================================================================
 * THE ONE JOB
 * ===========================================================================
 * `belt_exams.blueprint` holds the questions AND the answer key: `correct_id`
 * on every knowledge item, `expected` on every applied task, and a `because`
 * that explains each one. `start_belt_exam` copies the drawn items onto the
 * attempt row so that grading is against the paper the member actually saw.
 *
 * Neither of those rows may reach a phone intact. This file is the sieve, and
 * it is deliberately an ALLOW-LIST: it builds a new object out of the fields a
 * paper is allowed to carry, rather than deleting the fields it is not. A
 * blueprint that gains a `hint_answer` field next year is stripped by default
 * under this shape and would be published by a delete-list. That is the whole
 * argument for writing it this way round.
 *
 * The grading itself is in SQL and is revoked from `anon` and `authenticated`
 * (0047 §11) — the same posture 0039 takes for `award_points`. A belt a phone
 * can grant itself is not a belt.
 */
import { ExamPaper, type ExamAppliedItem, type ExamKnowledgeItem, type ExamOption } from '@shared/api';

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function option(raw: Record<string, unknown>): ExamOption {
  return {
    id: String(raw.id ?? ''),
    label: String(raw.label ?? ''),
    value: num(raw.value),
    detail: raw.detail === undefined || raw.detail === null ? null : String(raw.detail),
  };
}

function knowledge(raw: Record<string, unknown>): ExamKnowledgeItem {
  return {
    id: String(raw.id ?? ''),
    prompt: String(raw.prompt ?? ''),
    options: Array.isArray(raw.options)
      ? (raw.options as Record<string, unknown>[]).map(option)
      : [],
  };
}

function applied(raw: Record<string, unknown>): ExamAppliedItem {
  const kind = String(raw.kind ?? '');
  return {
    id: String(raw.id ?? ''),
    kind: kind === 'position_size' || kind === 'plan_choice' ? kind : 'level_choice',
    prompt: String(raw.prompt ?? ''),
    level:
      raw.level === 'entry' || raw.level === 'stop' || raw.level === 'target'
        ? raw.level
        : null,
    direction: raw.direction === 'short' ? 'short' : raw.direction === 'long' ? 'long' : null,
    entry: num(raw.entry),
    stop: num(raw.stop),
    target: num(raw.target),
    balance: num(raw.balance),
    risk_pct: num(raw.risk_pct),
    options: Array.isArray(raw.options)
      ? (raw.options as Record<string, unknown>[]).map(option)
      : [],
  };
}

/**
 * A stored paper, turned into the one a phone may hold.
 *
 * `series_label` is carried through verbatim and is not optional. The chart in
 * a Blue Belt applied task is SCHEMATIC — there is no real instrument behind it
 * and no dated feed — and 0047 §12(h) refuses to seed a blueprint whose label
 * does not say so. This is the other end of that: the sentence travels with the
 * bars, so the screen cannot draw one without the other.
 */
export function paperForClient(stored: unknown): ExamPaper | null {
  if (!stored || typeof stored !== 'object') return null;
  const raw = stored as Record<string, unknown>;
  const candidate = {
    belt: raw.belt,
    version: Number(raw.version ?? 0),
    pass_pct: Number(raw.pass_pct ?? 0),
    series: Array.isArray(raw.series)
      ? (raw.series as Record<string, unknown>[]).map((b) => ({
          t: Number(b.t),
          o: Number(b.o),
          h: Number(b.h),
          l: Number(b.l),
          c: Number(b.c),
        }))
      : [],
    series_label: String(raw.series_label ?? ''),
    knowledge: Array.isArray(raw.knowledge)
      ? (raw.knowledge as Record<string, unknown>[]).map(knowledge)
      : [],
    applied: Array.isArray(raw.applied)
      ? (raw.applied as Record<string, unknown>[]).map(applied)
      : [],
  };
  const parsed = ExamPaper.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/**
 * The sentence the app says about a result.
 *
 * The failing case names the applied half explicitly, because "78%, try again"
 * tells somebody nothing about what to go and learn — and because the applied
 * tasks are the reason this exam is worth sitting at all (spec §12).
 */
export function examPlain(result: {
  passed: boolean;
  score_pct: number;
  pass_pct: number;
  applied_correct: number;
  applied_total: number;
  belt_label: string;
}): string {
  if (result.passed) {
    return `You passed at ${Math.round(result.score_pct)}%. That is your ${result.belt_label} Belt, and it was earned by a test rather than a total.`;
  }
  if (result.applied_total > 0 && result.applied_correct < result.applied_total) {
    return `You scored ${Math.round(result.score_pct)}%, and ${result.applied_correct} of ${result.applied_total} chart tasks were right. The chart half is not optional — the belt is a claim about what you can do on one, so both have to be right.`;
  }
  return `You scored ${Math.round(result.score_pct)}%, and the pass mark is ${Math.round(result.pass_pct)}%. Every question you missed is explained below.`;
}
