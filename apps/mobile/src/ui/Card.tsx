import React from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { alpha, color, layout, radius, shadow } from './tokens';

/**
 * THE CARD — one surface, one radius, one border, one shadow, everywhere.
 *
 * Spec: "Cards use the same padding, radius and border system." Surface
 * #151518, radius 18, 1px border at 12% ink, 16 inside, shadow
 * `0 10px 30px rgba(0,0,0,.24)`. No gradients, no full-card tints.
 *
 * Three optional, spec-sanctioned accents — use at most one per card:
 *
 *   edge      a 3px left-edge indicator in the given colour. This is where a
 *             setup grade shows on an alert card ("a compact badge plus a
 *             subtle left-edge indicator"); pass `gradeBand(...).edge`.
 *   priority  the orange edge glow. The spec allows it on "the single
 *             highest-priority alert" on a screen — one card, not a list.
 *   tone      'kai' gives the violet outline + faint glow the Kai thesis card
 *             wears; 'raised' is the selected / modal surface.
 *
 * `onPress` makes the whole card the target ("entire card opens detail"), and
 * a card is always far larger than 44×44, so no slop is needed.
 */
export type CardTone = 'default' | 'raised' | 'kai';

export function Card({
  children, tone = 'default', edge, priority = false, padded = true, onPress,
  accessibilityLabel, accessibilityHint, style, testID,
}: {
  children?: React.ReactNode;
  tone?: CardTone;
  edge?: string | null;
  priority?: boolean;
  padded?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const skin: ViewStyle = {
    backgroundColor: tone === 'raised' ? color.raised : tone === 'kai' ? color.surface : color.surface,
    borderRadius: radius.card,
    borderWidth: layout.border,
    borderColor: priority ? alpha.action40 : tone === 'kai' ? alpha.kai40 : alpha.border,
    boxShadow: priority
      ? `${shadow.card}, 0 0 0 1px ${alpha.action14}, 0 0 24px ${alpha.action14}`
      : tone === 'kai'
      ? `${shadow.card}, 0 0 24px ${alpha.kai14}`
      : shadow.card,
    padding: padded ? layout.cardPad : 0,
    paddingLeft: padded ? layout.cardPad + (edge ? 3 : 0) : 0,
    overflow: 'hidden',
  };
  const edgeBar = edge ? (
    <View
      pointerEvents="none"
      testID={testID ? `${testID}-edge` : undefined}
      style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: edge }}
    />
  ) : null;

  if (onPress) {
    return (
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        onPress={onPress}
        style={({ pressed }) => [skin, pressed ? { backgroundColor: color.raised } : null, style]}
      >
        {edgeBar}
        {children}
      </Pressable>
    );
  }
  return (
    <View testID={testID} style={[skin, style]}>
      {edgeBar}
      {children}
    </View>
  );
}

/** The vertical rhythm between stacked cards: 12, per the spec. */
export function CardStack({ children, style, testID }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  return <View testID={testID} style={[{ gap: layout.cardGap }, style]}>{children}</View>;
}

/** A 1px divider inside a card. */
export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[{ height: 1, backgroundColor: alpha.divider }, style]} />;
}
