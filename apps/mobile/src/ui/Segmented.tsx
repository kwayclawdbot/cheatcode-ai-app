import React from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import { alpha, color, radius } from './tokens';
import { T } from './Text';

/**
 * In-object view switch — Setup-detail.html:
 *   track `padding:4px; background:#17171C; border-radius:12px`
 *   segment `padding:8px 0; border-radius:9px; font:600 12.5px`
 * Volt fill on the active segment because switching the view is a USER action.
 */
export function Segmented<T extends string>({
  options, value, onChange, testID,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (k: T) => void;
  testID?: string;
}) {
  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      style={{ flexDirection: 'row', gap: 4, padding: 4, backgroundColor: color.surface2, borderRadius: radius.lg }}
    >
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            testID={`${testID ?? 'seg'}-${o.key}`}
            accessibilityRole="tab"
            accessibilityLabel={o.label}
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.key)}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 36,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 9,
              backgroundColor: active ? color.volt : 'transparent',
              opacity: pressed && !active ? 0.7 : 1,
            })}
          >
            <T size={12.5} weight="semibold" c={active ? color.bg : color.muted}>{o.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Horizontal chip rail (timeframes, explanation levels, mode lenses). */
export function ChipRail<T extends string>({
  options, value, onChange, tone = 'volt', testID,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (k: T) => void;
  /** volt = the user is choosing; violet = choosing how Kai speaks. */
  tone?: 'volt' | 'kai';
  testID?: string;
}) {
  const on = tone === 'volt' ? color.volt : color.violetLight;
  const onBg = tone === 'volt' ? alpha.volt14 : alpha.violet14;
  const onBd = tone === 'volt' ? alpha.volt50 : alpha.violet50;
  return (
    <ScrollView
      testID={testID}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ flexDirection: 'row', gap: 5 }}
    >
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            testID={`${testID ?? 'chip'}-${o.key}`}
            accessibilityRole="button"
            accessibilityLabel={o.label}
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.key)}
            hitSlop={{ top: 8, bottom: 8 }}
            style={({ pressed }) => ({
              height: 28,
              paddingHorizontal: 12,
              borderRadius: radius.md,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: active ? onBg : 'transparent',
              borderWidth: active ? 0.5 : 0,
              borderColor: onBd,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <T size={11} weight={active ? 'bold' : 'regular'} c={active ? on : color.muted}>{o.label}</T>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
