import React from 'react';
import { View } from 'react-native';
import { alpha, color, radius } from '../../../ui/tokens';
import { T } from '../../../ui/Text';
import { Check, Info } from '../../../ui/Icons';
import { CircleX } from '../../community/ui/Icons';
import type { ProcessReceipt } from '../types';

/**
 * The process receipt (V3-T2 icon row + S25 checklist).
 * Green/gold/red here are FINANCIAL/PROCESS semantics — allowed by the palette
 * lock. Status is always icon + label + colour, never colour alone.
 */

const SPEC = {
  ok: { c: color.green, border: alpha.ivory14, bg: alpha.ivory06, Icon: Check },
  warn: { c: color.gold, border: alpha.gold40, bg: alpha.gold14, Icon: Info },
  miss: { c: color.red, border: alpha.red40, bg: alpha.red10, Icon: CircleX },
} as const;

/** The four-up icon grid at the top of V3-T2. */
export function ReceiptGrid({ items }: { items: ProcessReceipt[] }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }} testID="receipt-grid">
      {items.slice(0, 4).map((r) => {
        const s = SPEC[r.status];
        const Icon = s.Icon;
        return (
          <View
            key={r.label}
            accessibilityLabel={`${r.label}: ${r.detail}`}
            style={{
              flex: 1, alignItems: 'center', gap: 6,
              paddingVertical: 12, paddingHorizontal: 4,
              borderRadius: 14, borderWidth: 0.5,
              borderColor: s.border, backgroundColor: s.bg,
            }}
          >
            <Icon size={16} color={s.c} />
            <T size={10} c={r.status === 'ok' ? color.muted : s.c} align="center">{r.label}</T>
          </View>
        );
      })}
    </View>
  );
}

/** The full sentences (S25). The grid says what; this says how much. */
export function ReceiptList({ items }: { items: ProcessReceipt[] }) {
  return (
    <View style={{ gap: 10 }}>
      {items.map((r) => {
        const s = SPEC[r.status];
        const Icon = s.Icon;
        return (
          <View key={r.detail} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
            <View style={{ paddingTop: 2 }}><Icon size={15} color={s.c} /></View>
            <T size={13} lh={19} style={{ flex: 1 }}>{r.detail}</T>
          </View>
        );
      })}
    </View>
  );
}

/** origin.simulated = true — never hidden, never dressed up as a real trade. */
export function SimulatedTag({ testID }: { testID?: string }) {
  return (
    <View
      testID={testID ?? 'simulated-tag'}
      accessibilityLabel="Simulated trade"
      style={{
        paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5,
        borderWidth: 0.5, borderColor: alpha.ivory25,
      }}
    >
      <T size={9} weight="bold" ls={0.6} c={color.muted}>SIMULATED</T>
    </View>
  );
}

export { radius };
