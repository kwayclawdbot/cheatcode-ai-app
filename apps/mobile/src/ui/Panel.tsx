import React from 'react';
import { View, ViewStyle, StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { alpha, gradient, gradientAngle, radius } from './tokens';

export type PanelTone = 'default' | 'volt' | 'kai' | 'gold' | 'live' | 'kaiCard' | 'voltCard';

const TONES: Record<PanelTone, { colors: readonly string[]; locations?: readonly number[]; border: string; borderWidth: number }> = {
  default:  { colors: gradient.panel,     locations: gradient.panelLocations,     border: alpha.ivory16,  borderWidth: 0.5 },
  volt:     { colors: gradient.voltPanel, locations: gradient.voltPanelLocations, border: alpha.volt60,   borderWidth: 1 },
  kai:      { colors: gradient.kai,                                               border: alpha.violet50, borderWidth: 0.5 },
  gold:     { colors: gradient.gold,      locations: gradient.goldLocations,      border: alpha.gold60,   borderWidth: 0.5 },
  live:     { colors: gradient.live,                                              border: alpha.red45,    borderWidth: 0.5 },
  kaiCard:  { colors: gradient.kaiCard,                                           border: alpha.violet45, borderWidth: 0.5 },
  voltCard: { colors: gradient.voltCard,                                          border: alpha.volt50,   borderWidth: 0.5 },
};

/**
 * ObjectCard — the bordered object panel that carries every Kai object.
 * Artboard: linear-gradient(160deg, …) + 0.5px hairline + inset highlight.
 * RN can't do inset box-shadow; the top hairline highlight is a 1px overlay row.
 */
export function ObjectCard({
  children, tone = 'default', r = radius.xl, style, highlight = true, testID,
}: {
  children?: React.ReactNode;
  tone?: PanelTone;
  r?: number;
  style?: StyleProp<ViewStyle>;
  highlight?: boolean;
  testID?: string;
}) {
  const t = TONES[tone];
  return (
    <LinearGradient
      testID={testID}
      colors={t.colors as unknown as readonly [string, string, ...string[]]}
      locations={t.locations as unknown as readonly [number, number, ...number[]] | undefined}
      start={gradientAngle.start}
      end={gradientAngle.end}
      style={[
        { borderRadius: r, borderWidth: t.borderWidth, borderColor: t.border, overflow: 'hidden' },
        style,
      ]}
    >
      {highlight ? (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: tone === 'volt' ? 'rgba(222,255,102,0.24)' : alpha.ivory16 }}
        />
      ) : null}
      {children}
    </LinearGradient>
  );
}

/** Row list container: `padding:4px 15px` with hairline dividers between rows. */
export function RowList({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <ObjectCard style={[{ paddingHorizontal: 15, paddingVertical: 4 }, style]}>{children}</ObjectCard>;
}

export function Row({ children, last = false, style }: { children: React.ReactNode; last?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingVertical: 12,
          borderBottomWidth: last ? 0 : 0.5,
          borderBottomColor: alpha.ivory08,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
