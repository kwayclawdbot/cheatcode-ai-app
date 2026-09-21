import React from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { alpha, color, radius } from './tokens';
import { T } from './Text';
import { hitSlopFor } from './touch';

/**
 * PILLS AND CHIPS — the small rounded things, in three jobs.
 *
 *   Pill        a static label. Neutral unless told otherwise.
 *   ContextChip a tappable chip with an optional leading icon — "Watchlist",
 *               "News", "Technicals" under Kai's briefing; "Explain the
 *               thesis", "Compare AMD" under a Kai reply. Drawn 36 tall,
 *               touchable 44 tall.
 *   StatusChip  the state of a setup, said as a verb: "Entry triggered",
 *               "Watching resistance", "Target 1 hit". Its tone carries
 *               meaning, so the tones are named by meaning, not by colour.
 */

export type ChipTone = 'neutral' | 'action' | 'kai' | 'up' | 'down' | 'grade';

function inkFor(tone: ChipTone): { ink: string; border: string; fill: string } {
  switch (tone) {
    case 'action': return { ink: color.action, border: alpha.action40, fill: alpha.action10 };
    case 'kai': return { ink: color.kaiInk, border: alpha.kai40, fill: alpha.kai08 };
    case 'up': return { ink: color.marketUp, border: alpha.marketUp40, fill: alpha.marketUp12 };
    case 'down': return { ink: color.marketDown, border: alpha.marketDown40, fill: alpha.marketDown12 };
    case 'grade': return { ink: color.grade, border: alpha.grade40, fill: alpha.grade14 };
    default: return { ink: color.textSecondary, border: alpha.border, fill: 'transparent' };
  }
}

/** A static label in a pill. */
export function Pill({
  label, tone = 'neutral', icon, style, testID,
}: { label: string; tone?: ChipTone; icon?: React.ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  const t = inkFor(tone);
  return (
    <View
      testID={testID}
      style={[
        {
          flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
          height: 26, paddingHorizontal: 10, borderRadius: radius.pill,
          borderWidth: 1, borderColor: t.border, backgroundColor: t.fill,
        },
        style,
      ]}
    >
      {icon}
      <T variant="meta" c={t.ink} numberOfLines={1}>{label}</T>
    </View>
  );
}

/** A tappable context chip. Neutral by default; `tone="kai"` only for a Kai action. */
export function ContextChip({
  label, icon, onPress, selected = false, tone = 'neutral', accessibilityHint, style, testID,
}: {
  label: string;
  icon?: React.ReactNode;
  onPress?: () => void;
  selected?: boolean;
  tone?: 'neutral' | 'kai';
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const H = 36;
  const ink = selected ? color.textPrimary : tone === 'kai' ? color.kaiInk : color.textPrimary;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ selected }}
      onPress={onPress}
      hitSlop={hitSlopFor(H, H)}
      style={({ pressed }) => [
        {
          flexDirection: 'row', alignItems: 'center', gap: 8,
          height: H, paddingHorizontal: 14, borderRadius: radius.control,
          borderWidth: 1,
          borderColor: selected ? alpha.action40 : tone === 'kai' ? alpha.kai40 : alpha.border,
          backgroundColor: selected ? color.raised : pressed ? color.raised : color.surface,
        },
        style,
      ]}
    >
      {icon}
      <T variant="meta" c={ink} numberOfLines={1}>{label}</T>
    </Pressable>
  );
}

/**
 * A setup's state, as a verb. Map state -> tone by MEANING:
 *   entry triggered / target hit -> 'up'      stopped / invalidated -> 'down'
 *   watching / waiting           -> 'neutral' the member's own action  -> 'action'
 */
export function StatusChip({
  label, tone = 'neutral', style, testID,
}: { label: string; tone?: ChipTone; style?: StyleProp<ViewStyle>; testID?: string }) {
  const t = inkFor(tone);
  return (
    <View
      testID={testID}
      accessibilityRole="text"
      style={[
        {
          alignSelf: 'flex-start', height: 22, paddingHorizontal: 8, justifyContent: 'center',
          borderRadius: 6, borderWidth: 1, borderColor: t.border, backgroundColor: t.fill,
        },
        style,
      ]}
    >
      <T variant="meta" weight="semibold" c={t.ink} numberOfLines={1}>{label}</T>
    </View>
  );
}
