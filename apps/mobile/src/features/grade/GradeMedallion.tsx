import React from 'react';
import { View, ViewStyle, StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { alpha, color } from '../../ui/tokens';
import { T, Num } from '../../ui/Text';
import { gradeBand, displayGrade } from './bands';

export type GradeMedallionProps = {
  /** Letter grade as issued by the grading engine: "A−", "B+", "C+", "B". */
  grade?: string | null;
  /** 0–100 supporting score. Shown small under the letter. */
  score?: number | null;
  /** Diameter in px. Boards use 90; spec allows 72–88 for tighter rows. */
  size?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Oversized grade medallion — docs/10 §4 "GRADE HIERARCHY".
 * The letter is dominant, the 0–100 score is supporting. The ring colour is the
 * grade family; the letter itself carries the meaning so the grade is never
 * conveyed by colour alone.
 *
 * Component fractions (18/20) are banned by spec; the 0–100 score is the ONE
 * numeric the spec mandates ("Display grade and 0–100 score together").
 */
export function GradeMedallion({ grade, score, size = 90, style, testID }: GradeMedallionProps) {
  const band = gradeBand(grade, score);
  const letter = displayGrade(grade);
  const letterSize = Math.round(size * (letter.length > 1 ? 0.378 : 0.4));
  const scoreSize = Math.max(8, Math.round(size * 0.1));

  return (
    <View
      testID={testID ?? 'grade-medallion'}
      accessibilityRole="image"
      accessibilityLabel={
        letter === '—'
          ? 'Not graded — Kai has no view of its own on this one.'
          : `Grade ${letter.replace('−', ' minus')}${typeof score === 'number' ? `, score ${score} of one hundred` : ''}. ${band.quality}.`
      }
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: Math.max(2, size * 0.028),
          borderColor: band.ring,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
          ...(band.glow
            ? { shadowColor: band.ring, shadowOpacity: 0.3, shadowRadius: size * 0.29, shadowOffset: { width: 0, height: 0 } }
            : null),
        },
        style,
      ]}
    >
      <LinearGradient
        colors={[band.wash, alpha.surface95]}
        start={{ x: 0.35, y: 0.3 }}
        end={{ x: 0.9, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <T size={letterSize} weight="bold" c={band.letter} lh={letterSize} testID="grade-letter">
        {letter}
      </T>
      {typeof score === 'number' && Number.isFinite(score) ? (
        <Num size={scoreSize} weight="regular" c={color.muted} style={{ marginTop: 2 }} testID="grade-score">
          {`${Math.round(score)}/100`}
        </Num>
      ) : null}
    </View>
  );
}

/**
 * Inline grade chip for dense rows (history rows, Kai objects, the ticker
 * page's active-alert line). Letter + family border, no score.
 */
export function GradeChip({ grade, score, testID }: { grade?: string | null; score?: number | null; testID?: string }) {
  const band = gradeBand(grade, score);
  return (
    <View
      testID={testID ?? 'grade-chip'}
      accessibilityLabel={`Grade ${displayGrade(grade)}, ${band.quality}`}
      style={{
        paddingHorizontal: 6, paddingVertical: 1, borderRadius: 5,
        borderWidth: 0.5, borderColor: band.cardBorder, backgroundColor: band.cardVeil,
      }}
    >
      <T size={10} weight="bold" c={band.letter}>{displayGrade(grade)}</T>
    </View>
  );
}
