import React from 'react';
import { View, Pressable, ViewStyle, StyleProp } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { alpha, color, radius } from './tokens';
import { T } from './Text';

const ChevronLeft = ({ size = 20, color: c = color.text }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M15 5l-7 7 7 7" stroke={c} strokeWidth={2.2} />
  </Svg>
);

/**
 * Stack screen header — Setup-detail.html / V4-TR2:
 * a 34px back control, the identity block, and at most one trailing slot.
 * The artboards' 9:41 status bar is presentation chrome and is not drawn.
 */
export function StackHeader({
  title, subtitle, right, onBack, style, testID, subtitleNode,
}: {
  title: string;
  subtitle?: string | null;
  subtitleNode?: React.ReactNode;
  right?: React.ReactNode;
  onBack?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const router = useRouter();
  const back = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/home')));

  return (
    <View
      testID={testID}
      style={[
        { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10 },
        style,
      ]}
    >
      <Pressable
        testID="back"
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={back}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={({ pressed }) => ({
          width: 34,
          height: 34,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: alpha.ivory10,
          backgroundColor: color.surface2,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.75 : 1,
        })}
      >
        <ChevronLeft size={18} />
      </Pressable>

      <View style={{ flex: 1 }}>
        <T size={17} weight="bold" ls={-0.17} numberOfLines={1}>{title}</T>
        {subtitleNode ?? (subtitle ? <T size={10} c={color.muted} style={{ marginTop: 2 }}>{subtitle}</T> : null)}
      </View>

      {right}
    </View>
  );
}
