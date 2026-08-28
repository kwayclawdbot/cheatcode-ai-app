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
  /** card border + card gradient veil for a card carrying this grade */
  cardBorder: string;
  cardVeil: string;
  /** does the medallion carry the emphasis glow */
  glow: boolean;
  /** spoken/label form — grade is never colour alone */
  quality: string;
};

const BANDS: Record<GradeFamily, GradeBand> = {
  'a-high': {
    family: 'a-high', ring: color.gradeGold, letter: color.gradeGold, wash: alpha.gradeGold20,
    cardBorder: alpha.gradeGold55, cardVeil: alpha.gradeGold12, glow: true, quality: 'High quality',
  },
  'a-low': {
    family: 'a-low', ring: color.gradeGold, letter: color.gradeGold, wash: alpha.gradeGold20,
    cardBorder: alpha.gradeGold55, cardVeil: alpha.gradeGold12, glow: true, quality: 'High quality',
  },
  'b-high': {
    family: 'b-high', ring: '#8B5CF6', letter: color.violetLight, wash: alpha.violet20,
    cardBorder: alpha.violet50, cardVeil: alpha.violet09, glow: false, quality: 'Good quality',
  },
  b: {
    family: 'b', ring: color.violetLight, letter: color.violetLight, wash: alpha.violetLight14,
    cardBorder: alpha.violetLight50, cardVeil: alpha.violetLight14, glow: false, quality: 'Fair quality',
  },
  c: {
    family: 'c', ring: color.gold, letter: color.gold, wash: alpha.gold16,
    cardBorder: alpha.gold50, cardVeil: alpha.gold12, glow: false, quality: 'Weak quality',
  },
  unqualified: {
    family: 'unqualified', ring: alpha.ivory24, letter: color.muted, wash: alpha.ivory08,
    cardBorder: alpha.ivory14, cardVeil: alpha.ivory05, glow: false, quality: 'Not qualified',
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
