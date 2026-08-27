import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { T } from '../../ui/Text';
import { alpha, color, radius } from '../../ui/tokens';
import type { SymbolWorkspace } from '../../lib/types';

/**
 * The persistent Sell / Buy pair (audit §7, V5-W1 footer).
 *
 * It is always present on the workspace — the brokerage expectation is that a
 * tradable asset can always be traded — while the note beside it carries Kai's
 * honest read of the state ("Setup forming — Kai suggests waiting"). Labels are
 * state-driven: with a position, Sell closes it; without one, Sell is a short.
 * Both route into MOBILE-B's order ticket; nothing is sent from here.
 */
export function BuySellBar({ w, testID = 'buy-sell' }: { w: SymbolWorkspace; testID?: string }) {
  const router = useRouter();
  const go = (side: string) =>
    router.push(
      `/order/new?symbol=${encodeURIComponent(w.symbol)}&side=${side}` +
      `${w.plan.existing_plan_id ? `&plan=${encodeURIComponent(w.plan.existing_plan_id)}` : ''}` +
      `${w.overview.setup_module ? `&setup=${encodeURIComponent(w.overview.setup_module.id)}` : ''}`,
    );

  const pill = (label: string, c: string, border: string, id: string, side: string) => (
    <Pressable
      testID={id}
      accessibilityRole="button"
      accessibilityLabel={`${label} ${w.symbol}`}
      accessibilityHint={
        side === 'sell_short'
          ? 'Opens the paper order ticket to sell short. Nothing is sent until you confirm.'
          : side === 'sell_to_close'
            ? 'Opens the paper order ticket to close your position. Nothing is sent until you confirm.'
            : 'Opens the paper order ticket. Nothing is sent until you confirm.'
      }
      onPress={() => go(side)}
      style={({ pressed }) => ({
        height: 40, paddingHorizontal: 20, borderRadius: radius.pill,
        borderWidth: 0.5, borderColor: border,
        alignItems: 'center', justifyContent: 'center',
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <T size={13} weight="semibold" c={c}>{label}</T>
    </Pressable>
  );

  return (
    <View testID={testID} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 2 }}>
      {pill(w.actions.sell_label, color.red, alpha.red40, 'cta-sell', w.actions.sell_side)}
      {pill(w.actions.buy_label, color.volt, alpha.volt50, 'cta-buy', w.actions.buy_side)}
      {w.actions.note ? (
        <T size={10} lh={14} c={color.dim} align="right" style={{ flex: 1 }}>{w.actions.note}</T>
      ) : null}
    </View>
  );
}
