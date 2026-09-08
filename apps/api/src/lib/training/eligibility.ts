/**
 * WHAT XP BUYS: THE RIGHT TO SIT, NOT THE BELT.
 *
 * `belt_eligibility(user_id)` (0047 §4) is the single computation behind both
 * the Belt Profile screen and the gate on the exam route, so the ring a member
 * looks at and the door they walk into cannot disagree about whether they are
 * ready. This file only turns its jsonb into the wire shape.
 *
 * THE RING FILLS TO *ELIGIBLE*, NOT TO A BELT. Spec §10: "A ring that fills to
 * 100% and then hands over a belt is the design this decision rejected." So
 * `progressToEligible` counts the checks that are met, and the action under it
 * is a sentence with a verb in it — "Sit the Blue Belt test" — never a
 * congratulation.
 */
import type { BeltCheck, BeltNextRung } from '@shared/api';
import { BeltCheck as BeltCheckSchema, BeltNextRung as BeltNextRungSchema } from '@shared/api';
import { log } from '../log';

export type Eligibility = {
  belt: string;
  belt_source: 'legacy_points' | 'exam';
  xp_calls: number;
  xp_training: number;
  calls_resolved: number;
  clean_paper_plans: number;
  next: BeltNextRung | null;
  may_convert_legacy: boolean;
};

function check(raw: Record<string, unknown>): BeltCheck | null {
  const parsed = BeltCheckSchema.safeParse({
    kind: raw.kind,
    label: raw.label,
    met: raw.met === true,
    have: raw.have === undefined || raw.have === null ? null : (raw.have as number | string),
    need: raw.need === undefined || raw.need === null ? null : Number(raw.need),
    taught_by: raw.taught_by === undefined || raw.taught_by === null ? null : String(raw.taught_by),
    key: raw.key === undefined || raw.key === null ? null : String(raw.key),
  });
  return parsed.success ? parsed.data : null;
}

export function parseEligibility(raw: unknown, requestId = '-'): Eligibility | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;

  let next: BeltNextRung | null = null;
  if (d.next && typeof d.next === 'object') {
    const n = d.next as Record<string, unknown>;
    const checks = Array.isArray(n.checks)
      ? (n.checks as Record<string, unknown>[]).map(check).filter((c): c is BeltCheck => c !== null)
      : [];
    const parsed = BeltNextRungSchema.safeParse({
      key: n.key,
      label: n.label,
      title: n.title,
      proposed: n.proposed === true,
      checks,
      eligible: n.eligible === true,
      exam: n.exam ?? null,
      exam_written: n.exam_written === true,
      attempts_30d: Number(n.attempts_30d ?? 0),
      attempts_cap: Number(n.attempts_cap ?? 0),
      cooldown_until: n.cooldown_until === undefined || n.cooldown_until === null ? null : String(n.cooldown_until),
      may_sit: n.may_sit === true,
    });
    if (parsed.success) next = parsed.data;
    else log('warn', requestId, 'belts.next_rung_unreadable', {
      issue: parsed.error.issues[0]?.message ?? 'unknown',
    });
  }

  return {
    belt: String(d.belt ?? 'white'),
    belt_source: d.belt_source === 'exam' ? 'exam' : 'legacy_points',
    xp_calls: Number(d.xp_calls ?? 0),
    xp_training: Number(d.xp_training ?? 0),
    calls_resolved: Number(d.calls_resolved ?? 0),
    clean_paper_plans: Number(d.clean_paper_plans ?? 0),
    next,
    may_convert_legacy: d.may_convert_legacy === true,
  };
}

/**
 * How full the ring is: the share of the next rung's checks that are met.
 *
 * DELIBERATELY NOT WEIGHTED BY HOW FAR EACH ONE IS. Averaging "you have 12 of
 * 250 XP" with "you have 1 of 3 calls" produces a number that moves when
 * nothing meaningful happened and stalls when something did. Counting checks
 * gives a member four honest steps and a screen that can name the next one.
 *
 * Null when there is no next rung, which at Black is the truthful answer rather
 * than a full ring.
 */
export function progressToEligible(next: BeltNextRung | null): number | null {
  if (!next || next.checks.length === 0) return null;
  const met = next.checks.filter((c) => c.met).length;
  return Math.round((met / next.checks.length) * 100) / 100;
}
