import React from 'react';
import { Text as RNText, TextProps, StyleProp, TextStyle } from 'react-native';
import { color, FLOOR, typeScale, type TextVariant } from './tokens';
import { family, fontStack, Weight } from './fonts';
import { useTextScale } from '../features/a11y/context';

export type TProps = TextProps & {
  /**
   * One of the spec's six named styles — screenTitle, sectionTitle, cardTitle,
   * body, meta, keyPrice. Sets size, line height, weight, and (for keyPrice)
   * mono. Any of `size` / `lh` / `weight` / `mono` / `ls` passed alongside it
   * wins over the variant for that one property.
   */
  variant?: TextVariant;
  /** An off-scale size. Prefer `variant`; this exists for charts and art. */
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
  bold: family.monoBold, // Geist Mono ships 400/500/600/700
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

/**
 * Every text in the app goes through here so the two families are the only ones used.
 *
 * With no `variant` and no `size`, text is the spec's `body` (15/22 regular).
 * An explicit `size` with no `variant` keeps the old behaviour — the size
 * alone, no line height imposed — so an off-scale literal that has not been
 * migrated renders exactly as it did.
 */
export function T({
  variant, size, weight, mono, c = color.text,
  ls, lh, align, style, ...rest
}: TProps) {
  const scale = useTextScale();
  const v = typeScale[variant ?? 'body'];
  const fromScale = variant !== undefined || size === undefined;
  const authored = size ?? v.size;
  const w: Weight = weight ?? (fromScale ? v.weight : 'regular');
  const isMono = mono ?? (fromScale ? v.mono : false);
  const lhAuthored = lh ?? (fromScale ? v.lh : undefined);
  const lsAuthored = ls ?? (fromScale && v.ls !== 0 ? v.ls : undefined);
  const fontSize = resolveSize(authored, scale);
  // A line height that did not grow with the text would clip a two-line
  // paragraph the moment somebody picks "Larger" — or the moment the floor
  // lifts a small caption. So `lh` is treated as the RATIO against the size
  // that was authored, and re-applied to whatever size actually renders.
  const lineHeight = lhAuthored === undefined ? undefined : Math.round((lhAuthored / authored) * fontSize * 2) / 2;
  return (
    <RNText
      {...rest}
      style={[
        {
          fontFamily: fontStack(isMono ? monoFor[w] : family[w], isMono),
          fontSize,
          color: c,
          ...(lsAuthored !== undefined ? { letterSpacing: lsAuthored } : null),
          ...(lineHeight !== undefined ? { lineHeight } : null),
          ...(align ? { textAlign: align } : null),
          // tabular figures for prices/times (web + iOS honour this)
          ...(isMono ? { fontVariant: ['tabular-nums'] as TextStyle['fontVariant'] } : null),
        },
        style,
      ]}
    />
  );
}

/**
 * A section label. REDESIGN 2026-09-21: the spec retires the tracked,
 * uppercase eyebrow ("excessive uppercase mono text"), so this is the `meta`
 * style — 12/16 medium, secondary ink, no letter-spacing. The name is kept so
 * ~190 call sites did not have to move; write the label in sentence case.
 */
export function Eyebrow({ children, c = color.muted, style }: { children: React.ReactNode; c?: string; style?: StyleProp<TextStyle> }) {
  return <T variant="meta" c={c} style={style}>{children}</T>;
}

/**
 * Price / level / time / % / R. Always Geist Mono + tabular figures; never
 * plain text. Defaults to body size; `variant="keyPrice"` for the one price a
 * card is about, `variant="meta"` for a timestamp.
 */
export function Num({ children, variant, size, weight = 'semibold', c = color.text, style, testID, accessibilityLabel, numberOfLines }: {
  children: React.ReactNode; variant?: TextVariant; size?: number; weight?: Weight; c?: string; style?: StyleProp<TextStyle>;
  testID?: string; accessibilityLabel?: string; numberOfLines?: number;
}) {
  const v = variant ?? (size === undefined ? 'body' : undefined);
  return <T mono variant={v} size={size} weight={weight} c={c} style={style} testID={testID} accessibilityLabel={accessibilityLabel} numberOfLines={numberOfLines}>{children}</T>;
}
