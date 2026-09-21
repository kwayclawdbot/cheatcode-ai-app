import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { color } from './tokens';
import { Num, T } from './Text';

/**
 * THE PRICE TRIPLET — Entry · Stop · Target, on one numeric grid.
 *
 * Spec: "Values use semantic colours only: entry neutral/off-white, stop red,
 * target green", and "all prices align on a consistent numeric grid". So the
 * three columns are equal thirds, the labels are the meta style in secondary
 * ink, and the values are Geist Mono with tabular figures in their meaning
 * colour. An optional `r` column (the R multiple, e.g. "3.0R") sits at the
 * right in primary ink — R is a ratio, not a gain, so it is not green.
 *
 * A missing level prints an em dash rather than a made-up number.
 */
export function PriceTriplet({
  entry, stop, target, r, decimals = 2, size = 'body', style, testID = 'price-triplet',
}: {
  entry: number | null | undefined;
  stop: number | null | undefined;
  target: number | null | undefined;
  /** R multiple, already computed. Shown as e.g. "3.0R". */
  r?: number | null;
  decimals?: number;
  /** `body` (15) in a card; `cardTitle` (17) on a detail screen. */
  size?: 'body' | 'cardTitle';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const fmt = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(decimals));
  const cols: Array<[string, string, string]> = [
    ['Entry', fmt(entry), color.priceEntry],
    ['Stop', fmt(stop), color.priceStop],
    ['Target', fmt(target), color.priceTarget],
  ];
  return (
    // `gap` keeps three mono columns from running into each other in a narrow
    // card (a chat tool card at 360 wide printed "504.00460.00540.00").
    // A price never breaks across lines: each column is at least as wide as its
    // number (large text at 360 wide printed "504." over "00"). The R column
    // gives way instead, its label wrapping under itself.
    <View testID={testID} style={[{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }, style]}>
      {cols.map(([label, value, ink]) => (
        <View key={label} style={{ flexGrow: 1, flexShrink: 0, flexBasis: 'auto', gap: 2 }} accessible accessibilityLabel={`${label} ${value}`}>
          <T variant="meta" c={color.textSecondary}>{label}</T>
          <Num variant={size} weight="semibold" c={ink} testID={`${testID}-${label.toLowerCase()}`}>{value}</Num>
        </View>
      ))}
      {r != null && Number.isFinite(r) ? (
        <View style={{ flexShrink: 1, minWidth: 0, alignItems: 'flex-end', gap: 2 }} accessible accessibilityLabel={`${r.toFixed(1)} R`}>
          <T variant="meta" c={color.textSecondary} style={{ textAlign: 'right' }}>Risk / reward</T>
          <Num variant={size} weight="semibold" c={color.textPrimary} testID={`${testID}-r`}>{`${r.toFixed(1)}R`}</Num>
        </View>
      ) : null}
    </View>
  );
}
