import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { T, Eyebrow } from '../../ui/Text';
import { alpha, color } from '../../ui/tokens';
import type { AlsoWatchingRow } from '../../lib/types';

/**
 * V5-H1's "ALSO WATCHING" — compact rows, NOT cards (audit §9).
 * Dividers and rhythm carry the grouping; each row is symbol · one line · an
 * optional plain-language action. Nothing here competes with the priority.
 */
export function AlsoWatching({ rows, testID = 'also-watching' }: { rows: AlsoWatchingRow[]; testID?: string }) {
  const router = useRouter();
  if (!rows.length) return null;

  return (
    <View testID={testID}>
      <Eyebrow c={color.dim} style={{ paddingBottom: 9 }}>ALSO WATCHING</Eyebrow>
      {rows.map((r) => {
        const body = (
          <View
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 10,
              paddingVertical: 9, paddingHorizontal: 2,
              borderTopWidth: 0.5, borderTopColor: alpha.ivory08,
            }}
          >
            <T size={13} weight="bold" style={{ width: 52 }}>{r.symbol}</T>
            <T size={12} lh={17} c={r.tone === 'attention' ? color.gold : color.muted} style={{ flex: 1 }}>{r.text}</T>
            {r.action ? <T size={12} weight="semibold" c={color.volt}>{r.action.label}</T> : null}
          </View>
        );

        return r.action ? (
          <Pressable
            key={r.id}
            testID={`also-${r.symbol}`}
            accessibilityRole="button"
            accessibilityLabel={`${r.symbol}. ${r.text}. ${r.action.label}`}
            onPress={() => router.push(r.action!.route)}
            style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
          >
            {body}
          </Pressable>
        ) : (
          <View key={r.id} testID={`also-${r.symbol}`} accessibilityLabel={`${r.symbol}. ${r.text}`}>{body}</View>
        );
      })}
    </View>
  );
}
