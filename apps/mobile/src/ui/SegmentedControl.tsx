import React from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { alpha, color, radius, tap } from './tokens';
import { Num, T } from './Text';

/**
 * THE MARKET-MODE SEGMENTED CONTROL — "Day Trade | Swing | Invest".
 *
 * One selector per screen (spec: "use one segmented selector"). The track is
 * the card surface with a 1px border; the chosen segment is filled action
 * orange. Its label is DARK ink on the orange: white on #FF5A1F measures
 * 2.8:1 and fails the small-text floor (scripts/contrast-test.mts), so the
 * boards' white label is the one place this build knowingly departs from them.
 * Every segment is a full 44-tall target.
 */
export function SegmentedControl<K extends string>({
  options, value, onChange, style, testID = 'segmented',
}: {
  options: { key: K; label: string }[];
  value: K;
  onChange: (k: K) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      style={[
        {
          flexDirection: 'row', padding: 3, gap: 3,
          backgroundColor: color.surface, borderRadius: radius.control,
          borderWidth: 1, borderColor: alpha.border,
        },
        style,
      ]}
    >
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            testID={`${testID}-${o.key}`}
            accessibilityRole="tab"
            accessibilityLabel={o.label}
            accessibilityState={{ selected: on }}
            onPress={() => { if (!on) onChange(o.key); }}
            style={({ pressed }) => ({
              flex: 1, minHeight: tap.min - 6, alignItems: 'center', justifyContent: 'center',
              borderRadius: radius.control - 3,
              backgroundColor: on ? color.action : pressed ? color.raised : 'transparent',
            })}
            hitSlop={{ top: 3, bottom: 3 }}
          >
            <T variant="body" weight={on ? 'semibold' : 'medium'} c={on ? color.onAction : color.textSecondary} numberOfLines={1}>
              {o.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * SECTION TABS — "Active 12 · Community 1 · History 30".
 *
 * Text tabs under the segmented control. The active tab is primary ink with
 * an orange underline and an orange count badge; the others are secondary ink
 * with a plain count. Counts are mono (they are numbers). Each tab is 44 tall.
 */
export function SectionTabs<K extends string>({
  tabs, value, onChange, style, testID = 'section-tabs',
}: {
  tabs: { key: K; label: string; count?: number | null }[];
  value: K;
  onChange: (k: K) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      style={[{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: alpha.divider }, style]}
    >
      {tabs.map((t) => {
        const on = t.key === value;
        return (
          <Pressable
            key={t.key}
            testID={`${testID}-${t.key}`}
            accessibilityRole="tab"
            accessibilityLabel={t.count != null ? `${t.label}, ${t.count}` : t.label}
            accessibilityState={{ selected: on }}
            onPress={() => { if (!on) onChange(t.key); }}
            style={{ flex: 1, minHeight: tap.min, alignItems: 'center', justifyContent: 'center' }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <T variant="body" weight={on ? 'semibold' : 'medium'} c={on ? color.textPrimary : color.textSecondary}>{t.label}</T>
              {t.count != null ? (
                on ? (
                  <View style={{ minWidth: 24, height: 20, paddingHorizontal: 6, borderRadius: radius.pill, backgroundColor: color.action, alignItems: 'center', justifyContent: 'center' }}>
                    <Num variant="meta" weight="semibold" c={color.onAction}>{t.count}</Num>
                  </View>
                ) : (
                  <Num variant="meta" weight="medium" c={color.textSecondary}>{t.count}</Num>
                )
              ) : null}
            </View>
            <View
              style={{
                position: 'absolute', left: 12, right: 12, bottom: -1, height: 2, borderRadius: 1,
                backgroundColor: on ? color.action : 'transparent',
              }}
            />
          </Pressable>
        );
      })}
    </View>
  );
}
