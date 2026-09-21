/**
 * THE OVERFLOW — where everything that is not the screen's one action lives.
 *
 * The spec allows one dominant action per screen and gives it to "Add to
 * watchlist". The paper order is the other real thing a person does here, so it
 * is the FIRST row of this sheet — one tap from the "…" in the header — and it
 * is also offered as a quiet outline button on the Details tab, where the
 * levels it would be built from are on screen. It is never orange and never
 * competes with the watchlist button.
 *
 * The rows the old header carried as chips — the paper account, the drawers of
 * positions, orders and watchlist — moved here as well.
 */
import React from 'react';
import { Pressable, View } from 'react-native';
import { Sheet } from '../../ui/Sheet';
import { T, Divider, color, radius, tap } from '../../ui/kit';

export type MoreRow = {
  key: string;
  label: string;
  /** Why it is unavailable, in words. A row with a reason is drawn but inert. */
  blocked?: string | null;
  hint?: string | null;
  onPress: () => void;
};

export function MoreSheet({
  visible, onClose, symbol, rows, paper,
}: {
  visible: boolean;
  onClose: () => void;
  symbol: string;
  rows: MoreRow[];
  paper: boolean;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title={symbol} testID="trade-more-sheet">
      <T variant="meta" c={color.textSecondary}>{paper ? 'Paper account — practice money, nothing reaches a broker.' : 'Live account.'}</T>
      <View style={{ borderRadius: radius.card, backgroundColor: color.surface, overflow: 'hidden' }}>
        {rows.map((r, i) => (
          <View key={r.key}>
            {i > 0 ? <Divider /> : null}
            <Pressable
              testID={`more-${r.key}`}
              accessibilityRole="button"
              accessibilityLabel={r.label}
              accessibilityHint={r.blocked ?? r.hint ?? undefined}
              accessibilityState={{ disabled: Boolean(r.blocked) }}
              disabled={Boolean(r.blocked)}
              onPress={r.onPress}
              style={({ pressed }) => ({
                minHeight: tap.min + 8, paddingHorizontal: 16, paddingVertical: 10, justifyContent: 'center', gap: 2,
                backgroundColor: pressed ? color.raised : 'transparent',
              })}
            >
              <T variant="body" weight="medium" c={r.blocked ? color.textSecondary : color.textPrimary}>{r.label}</T>
              {r.blocked || r.hint ? (
                <T variant="meta" c={color.textSecondary}>{r.blocked ?? r.hint}</T>
              ) : null}
            </Pressable>
          </View>
        ))}
      </View>
    </Sheet>
  );
}
