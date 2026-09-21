import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { alpha, color, radius } from './tokens';
import { T } from './Text';
import { displayGrade, gradeBand } from '../features/grade/bands';

/**
 * THE SETUP-GRADE BADGE — a compact letter in a rounded box.
 *
 * Spec: "Grade appears as a compact badge plus a subtle left-edge indicator.
 * A/A+ may use restrained gold; B uses neutral/violet; pass uses gray." The
 * band (and so the colour) comes from `features/grade/bands.ts`, the one
 * place a grade is turned into a look — pair this badge with
 * `<Card edge={gradeBand(grade, score).edge}>` for the left edge.
 *
 * The quality word is the accessibility label, so the grade is never carried
 * by colour alone.
 */
export function GradeBadge({
  grade, score, size = 'md', style, testID = 'grade-badge',
}: {
  grade: string | null | undefined;
  score?: number | null;
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const band = gradeBand(grade ?? null, score ?? null);
  const letter = displayGrade(grade ?? null);
  const box = size === 'sm' ? 24 : 30;
  const isA = band.family === 'a-high' || band.family === 'a-low';
  return (
    <View
      testID={testID}
      accessibilityRole="text"
      accessibilityLabel={`Grade ${letter}. ${band.quality}.`}
      style={[
        {
          minWidth: box, height: box, paddingHorizontal: 6, borderRadius: radius.sm + 2,
          alignItems: 'center', justifyContent: 'center',
          borderWidth: 1, borderColor: band.ring,
          backgroundColor: isA ? alpha.grade14 : 'transparent',
        },
        style,
      ]}
    >
      <T variant={size === 'sm' ? 'meta' : 'body'} weight="semibold" c={isA ? color.grade : band.letter}>{letter}</T>
    </View>
  );
}
