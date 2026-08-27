import React from 'react';
import { Pressable, View, ViewStyle, StyleProp, ActivityIndicator } from 'react-native';
import { alpha, color, radius } from './tokens';
import { T } from './Text';
import { ArrowRight } from './Icons';

export type ButtonKind = 'volt' | 'outline' | 'kai' | 'ghost';

/**
 * Volt = user action (primary). Violet = Kai action. Never swapped.
 * Artboard heights are 42/46/48/52; anything under 44 gets hitSlop so the real
 * touch target stays >= 44 (UX spec §10 accessibility).
 */
export function Button({
  label, onPress, kind = 'volt', height = 52, arrow = false, icon, disabled, loading,
  style, accessibilityHint, testID, full = true, size,
}: {
  label: string;
  onPress?: () => void;
  kind?: ButtonKind;
  height?: number;
  arrow?: boolean;
  icon?: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  testID?: string;
  full?: boolean;
  size?: number;
}) {
  const pad = Math.max(0, Math.ceil((44 - height) / 2));
  const fs = size ?? (height >= 52 ? 16 : height >= 46 ? 15 : 13);

  const base: ViewStyle = {
    height,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    opacity: disabled ? 0.45 : 1,
    ...(full ? {} : { paddingHorizontal: 15 }),
  };

  const skin: ViewStyle =
    kind === 'volt'
      ? { backgroundColor: color.volt }
      : kind === 'kai'
      ? { borderWidth: 0.5, borderColor: alpha.violet50, backgroundColor: alpha.violet08 }
      : kind === 'outline'
      ? { borderWidth: 0.5, borderColor: alpha.ivory24 }
      : {};

  const fg = kind === 'volt' ? color.bg : kind === 'kai' ? color.violetLight : color.muted;
  const weight = kind === 'volt' ? 'bold' : 'semibold';

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      disabled={disabled || loading}
      onPress={onPress}
      hitSlop={{ top: pad, bottom: pad, left: 0, right: 0 }}
      style={({ pressed }) => [base, skin, pressed && !disabled ? { opacity: 0.82 } : null, style]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <>
          {icon}
          <T size={fs} weight={weight} c={fg}>{label}</T>
          {arrow ? <ArrowRight size={fs === 16 ? 15 : 12} color={fg} /> : null}
        </>
      )}
    </Pressable>
  );
}

/** Pill chip used for Kai's inline choices (O0) and for filters. */
export function Chip({
  label, onPress, selected = false, muted = false, disabled = false, testID, accessibilityHint,
}: {
  label: string; onPress?: () => void; selected?: boolean; muted?: boolean; disabled?: boolean;
  testID?: string; accessibilityHint?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={{ top: 2, bottom: 2 }}
      style={({ pressed }) => [
        {
          height: 40,
          paddingHorizontal: 16,
          borderRadius: radius.pill,
          flexDirection: 'row',
          alignItems: 'center',
          opacity: disabled ? 0.5 : pressed ? 0.82 : 1,
        },
        selected
          ? { backgroundColor: color.volt }
          : { borderWidth: 0.5, borderColor: alpha.ivory24 },
      ]}
    >
      <T size={13} weight={selected ? 'bold' : 'semibold'} c={selected ? color.bg : muted ? color.muted : color.text}>
        {label}
      </T>
    </Pressable>
  );
}

/** Small tag: `font-size:9px; padding:2px 7px; border-radius:5px; border:0.5px` */
export function Tag({ label, c = color.gold, border }: { label: string; c?: string; border?: string }) {
  return (
    <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, borderWidth: 0.5, borderColor: border ?? `${c}80` }}>
      <T size={9} c={c}>{label}</T>
    </View>
  );
}
