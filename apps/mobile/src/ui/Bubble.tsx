import React from 'react';
import { View, ViewStyle, StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { alpha, color, gradient, gradientAngle } from './tokens';
import { T } from './Text';

/** Kai bubble: radius 4/16/16/16, violet gradient, 0.5px violet hairline. */
export function KaiBubble({ children, style, maxWidth, size = 14 }: {
  children: React.ReactNode; style?: StyleProp<ViewStyle>; maxWidth?: number; size?: 14 | 15;
}) {
  return (
    <LinearGradient
      colors={gradient.kai as unknown as readonly [string, string, ...string[]]}
      start={gradientAngle.start}
      end={gradientAngle.end}
      style={[
        {
          paddingVertical: size === 15 ? 12 : 10,
          paddingHorizontal: size === 15 ? 15 : 14,
          borderTopLeftRadius: 4,
          borderTopRightRadius: 16,
          borderBottomRightRadius: 16,
          borderBottomLeftRadius: 16,
          borderWidth: 0.5,
          borderColor: alpha.violet50,
          ...(maxWidth ? { maxWidth } : null),
        },
        style,
      ]}
    >
      {typeof children === 'string'
        ? <T size={size} lh={Math.round(size * 1.45)}>{children}</T>
        : children}
    </LinearGradient>
  );
}

/** User bubble: radius 14/4/14/14, volt gradient, right aligned. */
export function UserBubble({ children, style, maxWidth }: {
  children: React.ReactNode; style?: StyleProp<ViewStyle>; maxWidth?: number;
}) {
  return (
    <LinearGradient
      colors={gradient.user as unknown as readonly [string, string, ...string[]]}
      start={gradientAngle.start}
      end={gradientAngle.end}
      style={[
        {
          alignSelf: 'flex-end',
          paddingVertical: 9,
          paddingHorizontal: 14,
          borderTopLeftRadius: 14,
          borderTopRightRadius: 4,
          borderBottomRightRadius: 14,
          borderBottomLeftRadius: 14,
          borderWidth: 0.5,
          borderColor: alpha.volt50,
          ...(maxWidth ? { maxWidth } : null),
        },
        style,
      ]}
    >
      {typeof children === 'string' ? <T size={14}>{children}</T> : children}
    </LinearGradient>
  );
}

/** Kai typing indicator: three violet dots at 0.9 / 0.6 / 0.35 opacity. */
export function TypingDots({ testID }: { testID?: string }) {
  return (
    <LinearGradient
      testID={testID}
      colors={gradient.kai as unknown as readonly [string, string, ...string[]]}
      start={gradientAngle.start}
      end={gradientAngle.end}
      accessibilityLabel="Kai is thinking"
      style={{
        // hugs its three dots — never stretches to the column like a text bubble
        alignSelf: 'flex-start',
        flexDirection: 'row',
        gap: 4,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderTopLeftRadius: 4,
        borderTopRightRadius: 16,
        borderBottomRightRadius: 16,
        borderBottomLeftRadius: 16,
        borderWidth: 0.5,
        borderColor: alpha.violet50,
      }}
    >
      {[0.9, 0.6, 0.35].map((o) => (
        <View key={o} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color.violetLight, opacity: o }} />
      ))}
    </LinearGradient>
  );
}
