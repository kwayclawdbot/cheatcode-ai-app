import { alpha, color } from '../../ui/tokens';

/**
 * Grade families — docs/10 §4 "Grade bands".
 *   90–100  A+ / A     gold gradient border, highest emphasis
 *   85–89   A-         gold, slightly restrained
 *   80–84   B+         violet
 *   70–79   B / B-     violet → graphite
 *   60–69   C family   amber → graphite
 *   <60     unqualified neutral, never promoted as actionable
 *
 * Borders express SETUP QUALITY only. Gold never means profit; green/red never
 * express grade. A bearish A-grade setup still gets gold.
 */
export type GradeFamily = 'a-high' | 'a-low' | 'b-high' | 'b' | 'c' | 'unqualified';

export type GradeBand = {
  family: GradeFamily;
  /** medallion ring + letter colour */
  ring: string;
  letter: string;
  /** medallion inner radial wash (top colour) */
  wash: string;
  /**
   * card border + card veil for a card carrying this grade.
   * REDESIGN 2026-09-21: "do not tint the whole card by grade" — both are the
   * NEUTRAL card border and the flat card surface for every band now. The
   * grade shows as the badge plus `edge`, a subtle left-edge indicator.
   */
  cardBorder: string;
  cardVeil: string;
  /** The left-edge indicator colour: gold for A/A+, Kai ink for B, grey below. */
  edge: string;
  /** does the medallion carry the emphasis glow */
  glow: boolean;
  /** spoken/label form — grade is never colour alone */
  quality: string;
};

const NEUTRAL_CARD = { cardBorder: alpha.border, cardVeil: color.surface } as const;

const BANDS: Record<GradeFamily, GradeBand> = {
  'a-high': {
    family: 'a-high', ring: color.grade, letter: color.grade, wash: alpha.grade14,
    ...NEUTRAL_CARD, edge: color.grade, glow: false, quality: 'High quality',
  },
  'a-low': {
    family: 'a-low', ring: color.grade, letter: color.grade, wash: alpha.grade14,
    ...NEUTRAL_CARD, edge: color.grade, glow: false, quality: 'High quality',
  },
  'b-high': {
    family: 'b-high', ring: color.kaiInk, letter: color.kaiInk, wash: alpha.kai08,
    ...NEUTRAL_CARD, edge: color.kaiInk, glow: false, quality: 'Good quality',
  },
  b: {
    family: 'b', ring: alpha.ivory24, letter: color.textPrimary, wash: alpha.ivory06,
    ...NEUTRAL_CARD, edge: alpha.ivory24, glow: false, quality: 'Fair quality',
  },
  c: {
    family: 'c', ring: alpha.ivory20, letter: color.textSecondary, wash: alpha.ivory05,
    ...NEUTRAL_CARD, edge: alpha.ivory16, glow: false, quality: 'Weak quality',
  },
  unqualified: {
    family: 'unqualified', ring: alpha.ivory16, letter: color.textSecondary, wash: alpha.ivory04,
    ...NEUTRAL_CARD, edge: alpha.ivory12, glow: false, quality: 'Not qualified',
  },
};

/** Score is authoritative when present; otherwise the letter is parsed. */
export function gradeFamily(grade?: string | null, score?: number | null): GradeFamily {
  if (typeof score === 'number' && Number.isFinite(score)) {
    if (score >= 90) return 'a-high';
    if (score >= 85) return 'a-low';
    if (score >= 80) return 'b-high';
    if (score >= 70) return 'b';
    if (score >= 60) return 'c';
    return 'unqualified';
  }
  const g = (grade ?? '').trim().toUpperCase().replace('−', '-');
  if (g.startsWith('A')) return g.includes('-') ? 'a-low' : 'a-high';
  if (g.startsWith('B')) return g === 'B+' ? 'b-high' : 'b';
  if (g.startsWith('C')) return 'c';
  if (!g) return 'unqualified';
  return 'unqualified';
}

export function gradeBand(grade?: string | null, score?: number | null): GradeBand {
  return BANDS[gradeFamily(grade, score)];
}

/** The minus sign in the boards is U+2212, not a hyphen. */
export function displayGrade(grade?: string | null): string {
  const g = (grade ?? '').trim();
  if (!g) return '—';
  return g.replace(/-/g, '−');
}
