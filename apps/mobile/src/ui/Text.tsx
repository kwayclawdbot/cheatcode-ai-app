import React from 'react';
import { Text as RNText, TextProps, StyleProp, TextStyle } from 'react-native';
import { color } from './tokens';
import { family, Weight } from './fonts';

export type TProps = TextProps & {
  size?: number;
  weight?: Weight;
  mono?: boolean;
  c?: string;
  ls?: number;
  lh?: number;
  align?: 'left' | 'center' | 'right';
  style?: StyleProp<TextStyle>;
};

const monoFor: Record<Weight, string> = {
  regular: family.mono,
  medium: family.monoMedium,
  semibold: family.monoSemibold,
  bold: family.monoBold, // JetBrains Mono ships 400/500/600/700
};

/** Every text in the app goes through here so the two families are the only ones used. */
export function T({
  size = 14, weight = 'regular', mono = false, c = color.text,
  ls, lh, align, style, ...rest
}: TProps) {
  return (
    <RNText
      {...rest}
      style={[
        {
          fontFamily: mono ? monoFor[weight] : family[weight],
          fontSize: size,
          color: c,
          ...(ls !== undefined ? { letterSpacing: ls } : null),
          ...(lh !== undefined ? { lineHeight: lh } : null),
          ...(align ? { textAlign: align } : null),
          // tabular figures for prices/times (web + iOS honour this)
          ...(mono ? { fontVariant: ['tabular-nums'] as TextStyle['fontVariant'] } : null),
        },
        style,
      ]}
    />
  );
}

/** Section eyebrow: 11px / 700 / 0.08em, colour carries the section's role. */
export function Eyebrow({ children, c = color.muted, style }: { children: React.ReactNode; c?: string; style?: StyleProp<TextStyle> }) {
  return <T size={11} weight="bold" ls={0.88} c={c} style={style}>{children}</T>;
}

/** Price / level / time. Always mono + tabular; never plain text. */
export function Num({ children, size = 13, weight = 'semibold', c = color.text, style, testID, accessibilityLabel }: {
  children: React.ReactNode; size?: number; weight?: Weight; c?: string; style?: StyleProp<TextStyle>;
  testID?: string; accessibilityLabel?: string;
}) {
  return <T mono size={size} weight={weight} c={c} style={style} testID={testID} accessibilityLabel={accessibilityLabel}>{children}</T>;
}
