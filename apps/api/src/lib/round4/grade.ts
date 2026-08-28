/**
 * Grades and the qualitative scorecard (spec §4).
 *
 * TWO RULES, AND THEY ARE THE WHOLE FILE
 *
 * 1. The letter is dominant; the 0–100 score is supporting detail. So the
 *    medallion carries both, and `plain` spells the pair out for a screen
 *    reader — grade is never communicated by border colour alone (spec §10).
 *
 * 2. NO FRACTIONS CROSS THE WIRE. The scanner writes `score_components` as
 *    0–100 numbers per component. Those numbers are the grading engine's
 *    business. What the interface receives is a WORD from spec §4's vocabulary
 *    plus a 0–5 segment count, and an explanation in English. `18/20` never
 *    appears in a payload, so it cannot appear in a screen.
 *
 * The five components per mode are spec §4's defaults. A component the scanner
 * had no read on comes back `Unknown` with strength 0 and says so — a missing
 * measurement is not a zero, and it is not a silent pass either.
 */
import type { AppMode, GradeBand, GradeFamily, GradeMedallion, MeterStatus, ScoreComponent } from '@shared/api';

/* ------------------------------------------------------------------ */
/* Bands (spec §4 "Grade bands")                                        */
/* ------------------------------------------------------------------ */

export function gradeFamily(score: number | null, display: string | null): GradeFamily {
  const s = score === null || !Number.isFinite(score) ? null : score;
  if (s !== null) {
    if (s >= 90) return 'gold';
    if (s >= 85) return 'gold_restrained';
    if (s >= 80) return 'violet';
    if (s >= 70) return 'violet_graphite';
    if (s >= 60) return 'amber';
    return 'neutral';
  }
  // No score: read the letter instead of guessing a number for it.
  const d = (display ?? '').trim().toUpperCase();
  if (d.startsWith('A')) return d.includes('-') || d.includes('−') ? 'gold_restrained' : 'gold';
  if (d === 'B+') return 'violet';
  if (d.startsWith('B')) return 'violet_graphite';
  if (d.startsWith('C')) return 'amber';
  return 'neutral';
}

const FAMILY_PLAIN: Record<GradeFamily, string> = {
  gold: 'top quality of the setups I grade',
  gold_restrained: 'high quality',
  violet: 'good quality',
  violet_graphite: 'decent quality',
  amber: 'marginal quality',
  neutral: 'below the bar I would call actionable',
};

/**
 * The medallion. `plain` is what a screen reader announces, in decision order:
 * grade, then score, then what the grade means, then what it does NOT mean.
 */
export function medallion(opts: {
  display: string | null;
  band: string | null;
  score: number | null;
}): GradeMedallion {
  const score = opts.score === null || !Number.isFinite(opts.score) ? null : Math.round(opts.score);
  const family = gradeFamily(score, opts.display);
  const band = (opts.band ?? (opts.display ? opts.display[0].toUpperCase() : null)) as GradeBand | null;
  const letter = opts.display ?? band ?? null;

  return {
    display: letter,
    band: band === 'A' || band === 'B' || band === 'C' ? band : null,
    score,
    family,
    plain: letter
      ? `Grade ${letter}${score === null ? '' : `, score ${score} out of 100`} — ${FAMILY_PLAIN[family]}. A grade is about quality, never about permission to trade.`
      : 'Not graded yet.',
  };
}

export const UNGRADED: GradeMedallion = {
  display: null,
  band: null,
  score: null,
  family: 'neutral',
  plain: 'Not graded yet.',
};

/* ------------------------------------------------------------------ */
/* The five components per mode (spec §4)                               */
/* ------------------------------------------------------------------ */

type ComponentSpec = {
  key: string;
  label: string;
  /** Keys the scanner might have written for this component, in order. */
  sources: string[];
  /** The word used at the top of the scale for this particular component. */
  high: MeterStatus;
  mid: MeterStatus;
  low: MeterStatus;
  /** What "high" actually means, in a sentence a beginner can read. */
  high_plain: string;
  mid_plain: string;
  low_plain: string;
};

const DAY: ComponentSpec[] = [
  {
    key: 'trend',
    label: 'Trend',
    sources: ['trend'],
    high: 'Strong',
    mid: 'Forming',
    low: 'Waiting',
    high_plain: 'The bigger picture points the same way as the trade.',
    mid_plain: 'The trend is starting to agree, but it is not settled.',
    low_plain: 'The trend is not backing this direction yet.',
  },
  {
    key: 'structure',
    label: 'Structure',
    sources: ['structure'],
    high: 'Confirmed',
    mid: 'Forming',
    low: 'Waiting',
    high_plain: 'There is a clear level to trade against and price is respecting it.',
    mid_plain: 'The shape is forming but the level has not proved itself.',
    low_plain: 'There is no clean level here to lean on.',
  },
  {
    key: 'volume',
    label: 'Volume',
    sources: ['volume'],
    high: 'Healthy',
    mid: 'Forming',
    low: 'Waiting',
    high_plain: 'Real participation — enough shares changed hands to believe the move.',
    mid_plain: 'Some participation, but not the conviction I want to see.',
    low_plain: 'The move is happening on very little trading.',
  },
  {
    key: 'risk_reward',
    label: 'Risk / Reward',
    sources: ['risk_reward', 'rr'],
    high: 'Favorable',
    mid: 'Neutral',
    low: 'Waiting',
    high_plain: 'What you stand to make is comfortably more than what you stand to lose.',
    mid_plain: 'The reward covers the risk, but not by much.',
    low_plain: 'The reward does not pay for the risk at these levels.',
  },
  {
    key: 'market',
    label: 'Market',
    sources: ['market', 'market_alignment'],
    high: 'Supportive',
    mid: 'Neutral',
    low: 'Waiting',
    high_plain: 'The broad market is moving with this trade, not against it.',
    mid_plain: 'The broad market is not helping or hurting.',
    low_plain: 'The broad market is leaning the other way.',
  },
];

const SWING: ComponentSpec[] = [
  DAY[0],
  {
    key: 'entry_quality',
    label: 'Entry',
    sources: ['entry_quality', 'structure'],
    high: 'Confirmed',
    mid: 'Forming',
    low: 'Waiting',
    high_plain: 'The entry sits close to the level that defines the idea, so the risk is small and honest.',
    mid_plain: 'The entry is workable but not at the best part of the level.',
    low_plain: 'Entering here means paying up and carrying a wide stop.',
  },
  {
    key: 'catalyst',
    label: 'Catalyst risk',
    sources: ['catalyst', 'catalyst_risk'],
    high: 'Supportive',
    mid: 'Neutral',
    low: 'Waiting',
    high_plain: 'There is a reason for the move, and no known event sitting inside the hold window to break it.',
    mid_plain: 'There is a story here, and also an event that could rewrite it.',
    low_plain: 'Nothing identified is driving this, or an event lands right in the middle of the hold.',
  },
  DAY[3],
  DAY[4],
];

const INVEST: ComponentSpec[] = [
  {
    key: 'business_quality',
    label: 'Business quality',
    sources: ['business_quality', 'structure'],
    high: 'Strong',
    mid: 'Neutral',
    low: 'Waiting',
    high_plain: 'The business earns well and is not fighting for its life.',
    mid_plain: 'A workable business with real weak spots.',
    low_plain: 'The economics of the business are the reason to be careful here.',
  },
  {
    key: 'valuation',
    label: 'Valuation',
    sources: ['valuation'],
    high: 'Favorable',
    mid: 'Neutral',
    low: 'Waiting',
    high_plain: 'The price is reasonable against what the business earns.',
    mid_plain: 'The price is full but not absurd.',
    low_plain: 'You are paying a lot for what the business currently earns.',
  },
  {
    key: 'financial_strength',
    label: 'Financial strength',
    sources: ['financial_strength', 'volume'],
    high: 'Healthy',
    mid: 'Neutral',
    low: 'Waiting',
    high_plain: 'The balance sheet can take a bad year without a rescue.',
    mid_plain: 'The balance sheet is adequate.',
    low_plain: 'Debt or cash burn is the thing to watch here.',
  },
  {
    key: 'growth',
    label: 'Growth outlook',
    sources: ['growth', 'trend'],
    high: 'Strong',
    mid: 'Forming',
    low: 'Waiting',
    high_plain: 'Revenue and earnings are still growing at a rate that matters.',
    mid_plain: 'Growth is real but slowing.',
    low_plain: 'Growth is not the reason to own this right now.',
  },
  {
    key: 'portfolio_fit',
    label: 'Portfolio fit',
    sources: ['portfolio_fit', 'market'],
    high: 'Supportive',
    mid: 'Neutral',
    low: 'Waiting',
    high_plain: 'This adds something your book does not already own.',
    mid_plain: 'This overlaps a little with what you already hold.',
    low_plain: 'This doubles down on exposure you already carry.',
  },
];

export const MODE_COMPONENTS: Record<AppMode, ComponentSpec[]> = {
  day_trade: DAY,
  swing: SWING,
  invest: INVEST,
};

/* ------------------------------------------------------------------ */
/* Component → qualitative                                              */
/* ------------------------------------------------------------------ */

/** 0–100 → 0–5 segments. The number itself never leaves this function. */
function segments(raw: number): number {
  if (raw >= 90) return 5;
  if (raw >= 75) return 4;
  if (raw >= 60) return 3;
  if (raw >= 45) return 2;
  if (raw >= 25) return 1;
  return 0;
}

function pick(spec: ComponentSpec, seg: number): { status: MeterStatus; plain: string } {
  if (seg >= 4) return { status: spec.high, plain: spec.high_plain };
  if (seg >= 2) return { status: spec.mid, plain: spec.mid_plain };
  return { status: spec.low, plain: spec.low_plain };
}

/**
 * The scorecard for one setup.
 *
 * `components` is the scanner's `score_components` jsonb: a flat map of 0–100
 * numbers plus housekeeping keys (`seed`, `source`, `refreshed_at`), which are
 * skipped. Anything missing is `Unknown`, strength 0, and says why.
 */
export function scoreComponents(opts: {
  mode: AppMode;
  components: Record<string, unknown> | null;
  /** Computed reward:risk, used when the scanner did not score it. */
  rr?: number | null;
  minRr?: number | null;
}): ScoreComponent[] {
  const raw = (opts.components ?? {}) as Record<string, unknown>;
  const specs = MODE_COMPONENTS[opts.mode] ?? DAY;

  return specs.map((spec) => {
    let value: number | null = null;
    for (const key of spec.sources) {
      const n = Number(raw[key]);
      if (Number.isFinite(n)) {
        value = n;
        break;
      }
    }

    // Reward:risk is derivable from the plan even when the scanner never scored
    // it, and a derived value is better than an "Unknown" on a component the
    // user can work out themselves from the numbers on the same card.
    if (value === null && spec.key === 'risk_reward' && opts.rr !== null && opts.rr !== undefined) {
      const min = opts.minRr ?? 1.5;
      const ratio = opts.rr / min;
      value = Math.max(0, Math.min(100, Math.round(ratio * 60)));
      const seg = segments(value);
      const chosen = pick(spec, seg);
      return {
        key: spec.key,
        label: spec.label,
        status: chosen.status,
        strength: seg,
        explanation: chosen.plain,
        evidence: [`Reward against risk is ${opts.rr} to 1; your rule asks for at least ${min} to 1.`],
      };
    }

    if (value === null) {
      return {
        key: spec.key,
        label: spec.label,
        status: 'Unknown' as MeterStatus,
        strength: 0,
        explanation: `I have no read on ${spec.label.toLowerCase()} for this one, so I am not counting it either way.`,
        evidence: [],
      };
    }

    const seg = segments(value);
    const chosen = pick(spec, seg);
    return {
      key: spec.key,
      label: spec.label,
      status: chosen.status,
      strength: seg,
      explanation: chosen.plain,
      // Evidence is where a number is allowed — as prose in an expandable
      // panel, never as a fraction on the collapsed card.
      evidence: [`Graded ${Math.round(value)} on a hundred-point scale for ${spec.label.toLowerCase()}.`],
    };
  });
}

/** A fingerprint of the grade, used to decide whether a version bump is due. */
export function gradeFingerprint(g: GradeMedallion): string {
  return `${g.display ?? '-'}|${g.score ?? '-'}`;
}
