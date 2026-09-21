import React from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { color, layout, radius, tap } from './tokens';
import { T } from './Text';
import { BrandMarkButton } from './BrandMark';

/**
 * A 44×44 icon button. The glyph is drawn at 22 on the spec's one optical
 * grid; the box around it is the full touch target, so no hitSlop is needed.
 * `badge` draws the small orange dot the boards put on the bell.
 */
export function IconButton({
  icon, onPress, accessibilityLabel, badge = false, disabled = false, style, testID,
}: {
  icon: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel: string;
  badge?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          width: tap.min, height: tap.min, borderRadius: radius.control,
          alignItems: 'center', justifyContent: 'center',
          opacity: disabled ? 0.45 : pressed ? 0.7 : 1,
        },
        style,
      ]}
    >
      {icon}
      {badge ? (
        <View
          testID={testID ? `${testID}-badge` : undefined}
          style={{
            position: 'absolute', top: 10, right: 10, width: 8, height: 8, borderRadius: 4,
            backgroundColor: color.action, borderWidth: 1.5, borderColor: color.canvas,
          }}
        />
      ) : null}
    </Pressable>
  );
}

/**
 * THE APP BAR — brand mark, title, one status line, trailing icon buttons.
 *
 * Every primary screen on the boards opens the same way: the orange mark at
 * the left, the screen title beside it — `sectionTitle` size in bold, because
 * it shares a row with the mark and up to three actions (a 32px `screenTitle`
 * would not fit "CheatCode Community" at 360 wide), an
 * optional status line under it ("Monitoring 8 positions", "10,842 members
 * online") with a live dot, and at most three 44×44 actions on the right.
 *
 * `status.live` paints the dot market-green — "live / online" is a market-ish
 * state on these boards. The title is never uppercase and never mono.
 */
export function AppBar({
  title, status, actions, onBrandPress, style, testID = 'app-bar',
}: {
  title: string;
  status?: { text: string; live?: boolean } | null;
  actions?: React.ReactNode;
  /** Defaults to going Home. */
  onBrandPress?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const router = useRouter();
  return (
    <View
      testID={testID}
      accessibilityRole="header"
      style={[
        {
          flexDirection: 'row', alignItems: 'center', gap: 12,
          paddingHorizontal: layout.gutter, paddingVertical: 8, minHeight: 60,
        },
        style,
      ]}
    >
      <BrandMarkButton onPress={onBrandPress ?? (() => router.navigate('/home'))} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <T variant="sectionTitle" weight="bold" numberOfLines={1} testID={`${testID}-title`}>{title}</T>
        {status ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1 }}>
            {status.live ? (
              <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: color.marketUp }} />
            ) : null}
            <T variant="meta" c={color.textSecondary} numberOfLines={1}>{status.text}</T>
          </View>
        ) : null}
      </View>
      {actions ? <View style={{ flexDirection: 'row', alignItems: 'center' }}>{actions}</View> : null}
    </View>
  );
}
