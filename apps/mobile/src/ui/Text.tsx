import React from 'react';
import { Text as RNText, TextProps, StyleProp, TextStyle } from 'react-native';
import { color, FLOOR } from './tokens';
import { family, fontStack, Weight } from './fonts';
import { useTextScale } from '../features/a11y/context';

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

/**
 * TWO ACCESSIBILITY RULES LIVE IN THIS ONE FUNCTION.
 * ===========================================================================
 *
 * `T` is the only text primitive in the app, which makes it the only place a
 * change can reach every screen at once without editing every screen. Audit
 * F19 and F20 both cash out here.
 *
 * F19 — THE MEMBER'S TEXT SIZE. `accessibility.text_scale` was saved and never
 * read. It is read here, and multiplied into `fontSize` and `lineHeight`. At
 * scale 1 the arithmetic is `size * 1`, so every existing screen renders
 * exactly as it did — the feature is invisible until somebody asks for it.
 *
 * NOTE WHAT IS *NOT* HERE: `allowFontScaling`. React Native scales `fontSize`
 * by the OS text-size setting by default, and this file does not turn that off.
 * The member's multiplier stacks ON TOP of the OS's. Somebody on a large-text
 * phone who also picks "Largest" gets both, which is the correct answer and
 * the one the audit asked for in as many words.
 *
 * F20 — THE LEGIBILITY FLOOR. The audit counted important copy at 8.5–12px.
 * `Math.max(size, FLOOR)` is the whole fix: no text in this app renders below
 * 11 logical pixels, wherever it was authored and whoever authored it. See the
 * note over `FLOOR` in tokens.ts for why 11 and not something rounder.
 *
 * The floor is applied BEFORE the member's multiplier, so "Larger" enlarges a
 * legible size rather than an illegible one.
 */
function resolveSize(size: number, scale: number): number {
  const floored = Math.max(size, FLOOR);
  if (scale === 1) return floored;
  // Half-pixel steps: the ramp itself uses 13.5 and 8.5, so rounding to whole
  // pixels here would quietly move sizes that the designer chose deliberately.
  return Math.round(floored * scale * 2) / 2;
}

/** Every text in the app goes through here so the two families are the only ones used. */
export function T({
  size = 15, weight = 'regular', mono = false, c = color.text,
  ls, lh, align, style, ...rest
}: TProps) {
  const scale = useTextScale();
  const fontSize = resolveSize(size, scale);
  // A line height that did not grow with the text would clip a two-line
  // paragraph the moment somebody picks "Larger" — or the moment the floor
  // lifts a 9px caption to 11 inside a 12px line box. So `lh` is treated as
  // the RATIO the caller asked for, measured against the size they authored,
  // and re-applied to whatever size actually renders. When nothing moved
  // (size at or above the floor, scale 1) the arithmetic returns `lh` exactly.
  const lineHeight = lh === undefined ? undefined : Math.round((lh / size) * fontSize * 2) / 2;
  return (
    <RNText
      {...rest}
      style={[
        {
          fontFamily: fontStack(mono ? monoFor[weight] : family[weight], mono),
          fontSize,
          color: c,
          ...(ls !== undefined ? { letterSpacing: ls } : null),
          ...(lineHeight !== undefined ? { lineHeight } : null),
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
export function Num({ children, size = 14, weight = 'semibold', c = color.text, style, testID, accessibilityLabel }: {
  children: React.ReactNode; size?: number; weight?: Weight; c?: string; style?: StyleProp<TextStyle>;
  testID?: string; accessibilityLabel?: string;
}) {
  return <T mono size={size} weight={weight} c={c} style={style} testID={testID} accessibilityLabel={accessibilityLabel}>{children}</T>;
}
