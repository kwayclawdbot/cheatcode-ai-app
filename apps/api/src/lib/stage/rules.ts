/**
 * READINESS STAGE — the rules, in one file, on the server.
 *
 * A member's stage (0042) is where the funnel thinks they are: `beginner` →
 * `developing` → `trade_ready`, with room above it later. The owner's note is
 * explicit that this is NOT a label somebody picks once — it EVOLVES as they
 * prove competence in Training Mode.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE RULES ARE HERE AND NOT IN THE APP, GIVEN TRAINING IS ON THE PHONE
 * ─────────────────────────────────────────────────────────────────────────────
 * Training progress is currently stored ONLY on the device, in AsyncStorage
 * under `ccai.training.profile.v2`. There is no training table and no route
 * that records a lesson. So the server cannot go and look up whether somebody
 * passed Day 2 — the honest description of today's architecture is that the
 * phone is the only thing that knows.
 *
 * That leaves two ways to build this, and only one of them is defensible:
 *
 *   (a) the phone decides it has graduated and tells the server the CONCLUSION
 *       ("set me to trade_ready"), or
 *   (b) the phone reports the EVIDENCE — scores and completed lessons — and the
 *       server decides what that evidence is worth.
 *
 * This file is (b). The thresholds below are the server's own copy, the ratchet
 * is applied here, and `stage` is not writable from a client at all (0042 §4
 * puts a trigger on the column). A phone that lies has to lie about scores it
 * would otherwise have had to earn, rather than simply naming the outcome it
 * wants. That is a meaningfully harder lie and it is the best available until
 * training progress has a table.
 *
 * WHEN TRAINING GETS SERVER PERSISTENCE, the evidence argument disappears and
 * `evaluate()` should read the rows instead of trusting the body. Nothing else
 * in this file changes — which is the reason the rules live here now rather
 * than being written twice later.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE THRESHOLDS ARE A MIRROR, AND A TEST HOLDS THE MIRROR STRAIGHT
 * ─────────────────────────────────────────────────────────────────────────────
 * `DAY_GATES` below duplicates the Day 2 and Day 7 gates from the training
 * lane's `apps/mobile/src/features/training/curriculum.ts`. Duplication is the
 * cost of the server owning the decision, and duplication drifts. So
 * `apps/mobile/scripts/stage-rules-test.mts` reads BOTH and fails `npm test` if
 * they stop agreeing. Change a gate in the curriculum and that test tells you
 * this file needs the same edit, rather than the funnel quietly grading against
 * last month's numbers.
 */

/** The ladder, in order. Extending it means appending — see 0042 §1. */
export const STAGE_ORDER = ['beginner', 'developing', 'trade_ready'] as const;

export type Stage = (typeof STAGE_ORDER)[number];

export function isStage(v: unknown): v is Stage {
  return typeof v === 'string' && (STAGE_ORDER as readonly string[]).includes(v);
}

/** Position on the ladder. Higher is further along. */
export function rankOf(stage: Stage): number {
  return STAGE_ORDER.indexOf(stage);
}

/**
 * The two gates that move a stage, mirrored from the training curriculum.
 *
 * Day 2 is the promotion to `developing` because the spec calls it "the most
 * important day" — it is the one where somebody can look at a chart and say up,
 * down or sideways, which is the first thing that makes the rest of the product
 * usable. Day 7 is graduation, and the spec's own words for it are "You're
 * Trade Ready."
 */
export const DAY_GATES = {
  'day-2': {
    stage: 'developing' as Stage,
    minScorePct: 75,
    lessonIds: ['d2l1', 'd2l2', 'd2l3', 'd2kai', 'd2challenge'],
    requirements: [
      { skill: 'trend', minPct: 80 },
      { skill: 'market_structure', minPct: 75 },
      { skill: 'support_resistance', minPct: 70 },
    ],
  },
  'day-7': {
    stage: 'trade_ready' as Stage,
    minScorePct: 80,
    lessonIds: ['d7exam1', 'd7exam2', 'd7handoff'],
    requirements: [] as { skill: string; minPct: number }[],
  },
} as const;

/**
 * What the phone sends. Deliberately the shape of the training profile's facts
 * and not a summary of them: `{ graduated: true }` would be the conclusion this
 * file exists to refuse to take on trust.
 */
export type StageEvidence = {
  mastery: Record<string, number>;
  dayProgress: Record<string, { completedLessonIds: string[]; bestScorePct: number | null }>;
};

export type GateEvaluation = {
  dayId: string;
  passed: boolean;
  lessonsComplete: boolean;
  scoreMet: boolean;
  requirementsMet: boolean;
};

/** Re-run one day's gate against reported evidence. Mirrors `evaluateDayGate`. */
export function evaluateGate(dayId: keyof typeof DAY_GATES, evidence: StageEvidence): GateEvaluation {
  const gate = DAY_GATES[dayId];
  const day = evidence.dayProgress?.[dayId];
  const done = new Set(day?.completedLessonIds ?? []);

  const lessonsComplete = gate.lessonIds.every((id) => done.has(id));
  const scoreMet = (day?.bestScorePct ?? -1) >= gate.minScorePct;
  const requirementsMet = gate.requirements.every(
    (r) => (evidence.mastery?.[r.skill] ?? 0) >= r.minPct
  );

  return {
    dayId,
    passed: lessonsComplete && scoreMet && requirementsMet,
    lessonsComplete,
    scoreMet,
    requirementsMet,
  };
}

/** The highest stage this evidence supports on its own. */
export function stageFromEvidence(evidence: StageEvidence): Stage {
  if (evaluateGate('day-7', evidence).passed) return 'trade_ready';
  if (evaluateGate('day-2', evidence).passed) return 'developing';
  return 'beginner';
}

export type StageDecision = {
  stage: Stage;
  changed: boolean;
  /** Why it did or did not move. One of a small set, never free text. */
  reason: 'locked' | 'promoted' | 'unchanged' | 'no_downgrade';
};

/**
 * THE RATCHET. Automatic evolution PROMOTES ONLY — it never sends anybody
 * backwards, and this is the single most important rule in the file.
 *
 * A member who told onboarding "I actively trade" starts at `trade_ready` and
 * has no training progress at all, so evidence-based recomputation would score
 * them `beginner` on their first day and publicly demote them next to their
 * name in a room. The stage is a floor that rises, not a live readout: what it
 * means is "has reached", not "is currently demonstrating".
 *
 * `locked` is the admin override from 0042 — a stage somebody set by hand is
 * not a suggestion, so nothing automatic touches it.
 */
export function decideStage(
  current: Stage,
  supported: Stage,
  opts: { locked: boolean }
): StageDecision {
  if (opts.locked) return { stage: current, changed: false, reason: 'locked' };
  if (rankOf(supported) > rankOf(current)) {
    return { stage: supported, changed: true, reason: 'promoted' };
  }
  if (rankOf(supported) < rankOf(current)) {
    return { stage: current, changed: false, reason: 'no_downgrade' };
  }
  return { stage: current, changed: false, reason: 'unchanged' };
}

/* ───────────────────────── onboarding placement ─────────────────────────── */

/**
 * "Where are you right now?" — the one question onboarding gained. The answer
 * places somebody on the ladder before they have proved anything, which is the
 * only way the first session can be pitched at the right level.
 *
 * THE JUDGEMENT CALL IS `investor`, and it is deliberate. Somebody who invests
 * but does not trade is placed at `beginner`, not `developing`, because this
 * ladder measures TRADE readiness and they have not made a trade decision under
 * a stop. The owner's own description of the beginner stage is "learns market,
 * starts with INVESTING + simple swing setups" — which is a description of
 * exactly this person, so `beginner` is where the product already intends to
 * meet them. They are also the fastest group through Training, so the stage
 * costs them days rather than weeks.
 *
 * Placement is a FLOOR, not a ceiling: the ratchet above means training can
 * only lift somebody off the rung this puts them on.
 */
export const START_ANSWERS = ['brand_new', 'investor', 'swing', 'active'] as const;

export type StartAnswer = (typeof START_ANSWERS)[number];

export const START_PLACEMENT: Record<
  StartAnswer,
  { stage: Stage; mode: 'invest' | 'swing' | 'day_trade'; room: 'beginners' | 'swing' | 'day-trade' }
> = {
  brand_new: { stage: 'beginner', mode: 'invest', room: 'beginners' },
  investor: { stage: 'beginner', mode: 'invest', room: 'beginners' },
  swing: { stage: 'developing', mode: 'swing', room: 'swing' },
  active: { stage: 'trade_ready', mode: 'day_trade', room: 'day-trade' },
};

export function isStartAnswer(v: unknown): v is StartAnswer {
  return typeof v === 'string' && (START_ANSWERS as readonly string[]).includes(v);
}
