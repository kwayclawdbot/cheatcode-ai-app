import React from 'react';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { color } from './tokens';
import { hitSlopFor } from './touch';

/**
 * THE CHEATCODE MARK — an orange circle holding a dark diamond.
 *
 * Drawn from the redesign boards (docs/design/redesign-2026-09-21): the mark
 * sits at the left of every primary screen's app bar. The circle is the
 * action orange with its light partner as a top-left highlight — the one place
 * `actionLight` is allowed, as a gradient and never flat. The diamond is the
 * canvas colour, so the mark reads as a cut-out rather than a second colour.
 */
export function BrandMark({ size = 36, testID }: { size?: number; testID?: string }) {
  const d = size * 0.3; // half-diagonal of the diamond
  const c = size / 2;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} testID={testID}>
      <Defs>
        <LinearGradient id="cc-mark" x1="0.15" y1="0" x2="0.85" y2="1">
          <Stop offset="0" stopColor={color.actionLight} />
          <Stop offset="0.55" stopColor={color.action} />
        </LinearGradient>
      </Defs>
      <Circle cx={c} cy={c} r={c} fill="url(#cc-mark)" />
      <Path
        d={`M ${c} ${c - d} L ${c + d} ${c} L ${c} ${c + d} L ${c - d} ${c} Z`}
        fill={color.canvas}
        stroke={color.canvas}
        strokeWidth={size * 0.04}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * The mark as the app bar's leading button. What it opens is the screen's
 * call (Home by default); it is a 44×44 target whatever size it is drawn at.
 */
export function BrandMarkButton({
  onPress, size = 36, accessibilityLabel = 'CheatCode home', style, testID = 'brand-mark',
}: {
  onPress?: () => void; size?: number; accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>; testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={hitSlopFor(size)}
      style={({ pressed }) => [{ width: size, height: size, opacity: pressed ? 0.8 : 1 }, style]}
    >
      <BrandMark size={size} />
    </Pressable>
  );
}
