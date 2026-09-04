/**
 * Kai's transcript panel under the portal chart, and the one-line notice.
 *
 * There used to be four panels here — Kai, Alert, Plan, Community — plus the
 * execution object, all stacked on one screen. That was the round-4 portal.
 * The Trade section is now one spine (look → decide → take) and says those
 * things in its own beats, so the other four were removed with the old portal;
 * nothing rendered them any more.
 *
 * Spec 10 §8: rich objects appear inside the conversation only when relevant.
 * Kai never claims an order was accepted, filled or monitored before
 * confirmation, and every assessment is labelled as analysis.
 */
import React from 'react';
import { View } from 'react-native';
import { T } from '../../ui/Text';
import { KaiOrb } from '../../ui/KaiOrb';
import { alpha, color, radius } from '../../ui/tokens';
import type { PortalTurn } from './useKaiPortal';

/* ------------------------------------------------------------------ */
/* Kai panel                                                            */
/* ------------------------------------------------------------------ */

export function KaiPanel({ turns, symbol }: { turns: PortalTurn[]; symbol: string }) {
  return (
    <View testID="panel-kai" style={{ gap: 11 }}>
      {turns.map((t) => {
        if (t.kind === 'user') {
          return (
            <View
              key={t.id}
              style={{
                alignSelf: 'flex-end', maxWidth: '86%', paddingVertical: 8, paddingHorizontal: 13,
                borderTopLeftRadius: 14, borderTopRightRadius: 4, borderBottomLeftRadius: 14, borderBottomRightRadius: 14,
                backgroundColor: alpha.volt14, borderWidth: 0.5, borderColor: alpha.volt50,
              }}
            >
              <T size={13} lh={19}>{t.text}</T>
            </View>
          );
        }
        if (t.kind === 'typing') {
          return (
            <View key={t.id} testID="kai-typing" style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
              <KaiOrb size={24} />
              <T size={13} c={color.muted}>Kai is reading the chart…</T>
            </View>
          );
        }
        if (t.kind === 'narration') {
          return (
            <View
              key={t.id}
              testID="chart-narration"
              style={{
                flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 7, paddingHorizontal: 11,
                borderRadius: radius.lg, backgroundColor: alpha.violet08, borderLeftWidth: 2, borderLeftColor: color.violet,
              }}
            >
              <T size={12.5} lh={18} c={color.violetLight} style={{ flex: 1 }}>{t.text}</T>
            </View>
          );
        }
        return (
          <View key={t.id} style={{ flexDirection: 'row', gap: 9, alignItems: 'flex-start' }}>
            <KaiOrb size={24} />
            <View
              style={{
                flex: 1, paddingVertical: 9, paddingHorizontal: 13,
                borderTopLeftRadius: 4, borderTopRightRadius: 14, borderBottomLeftRadius: 14, borderBottomRightRadius: 14,
                backgroundColor: alpha.violet14, borderWidth: 0.5, borderColor: alpha.violet50,
              }}
            >
              <T size={13} lh={19} testID="kai-reply">{t.text}</T>
            </View>
          </View>
        );
      })}
      {!turns.length ? (
        <T size={12.5} lh={18} c={color.muted}>{`Ask Kai anything about the ${symbol} chart.`}</T>
      ) : null}
    </View>
  );
}

export function PortalNotice({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 7, alignItems: 'flex-start', paddingTop: 2 }}>
      <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: color.dim, marginTop: 6 }} />
      <T size={10.5} lh={15} c={color.dim} style={{ flex: 1 }} testID="portal-notice">{text}</T>
    </View>
  );
}
