import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ObjectCard } from '../../ui/Panel';
import { T, Num } from '../../ui/Text';
import { TickerMark } from '../../ui/Ticker';
import { alpha, color, radius } from '../../ui/tokens';
import { Avatar } from '../community/ui/Chrome';
import { BeltChip } from './BeltChip';
import type { SharedTrade } from '../../lib/types';

/**
 * A TRADE SOMEBODY ACTUALLY TOOK, AND CHOSE TO SHOW.
 *
 * A ROW, NOT A CARD, and the difference is the point. A community call is an
 * argument — it has a thesis, it is asking to be read. A shared trade is a
 * record: this person was in this name, at these levels, and here is how it
 * ended. It belongs in the feed at the weight of a fact, which is one line of
 * identity and one line of numbers, not a bordered object competing with the
 * calls around it.
 *
 * WHAT IS NOT HERE, AND CANNOT BE ADDED: quantity, notional, dollar risk,
 * dollar P/L. The type has no such field because the table has no such column
 * (migration 0038), and the privacy promise the app makes on the settings
 * screen — "direction and levels are shown, size and dollars never are" — is
 * only worth making because it is enforced there rather than here.
 *
 * `result_pct` is a percentage move off the entry. That is a fact about the
 * instrument. It says nothing about how much money anybody made.
 */

const DIRECTION_LABEL = { long: 'Long', short: 'Short' } as const;

const price = (n: number | null): string | null =>
  n == null ? null : Number.isInteger(n) ? String(n) : n.toFixed(2);

export function SharedTradeRow({ trade, testID }: { trade: SharedTrade; testID?: string }) {
  const router = useRouter();
  const tone = trade.outcome === 'target' ? color.green
    : trade.outcome === 'stop' ? color.red
    : trade.outcome === 'closed' ? color.muted
    : color.gold;

  const levels = [
    { label: 'Entry', value: price(trade.entry), c: color.cyan },
    { label: 'Stop', value: price(trade.stop), c: color.red },
    { label: 'Target', value: price(trade.target), c: color.green },
  ].filter((l) => l.value);

  return (
    <ObjectCard
      testID={testID ?? `shared-trade-${trade.id}`}
      r={radius.xl}
      style={{ paddingVertical: 12, paddingHorizontal: 14, gap: 9 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${trade.author.display_name}'s profile`}
          onPress={() => router.push(`/contributor/${encodeURIComponent(trade.author.user_id)}` as never)}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Avatar initial={trade.author.initial} url={trade.author.avatar_url} size={24} />
        </Pressable>
        <T size={12} weight="semibold" numberOfLines={1}>{trade.author.display_name}</T>
        <BeltChip belt={trade.author.belt} />
        <T size={10} c={color.dim} style={{ marginLeft: 'auto' }}>{trade.time_label}</T>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
        <TickerMark symbol={trade.symbol} size={24} />
        <T size={14} weight="bold">{trade.symbol}</T>
        <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 5, backgroundColor: alpha.ivory08 }}>
          <T size={10} weight="semibold" c={color.muted}>{DIRECTION_LABEL[trade.direction]}</T>
        </View>
        <View style={{ flex: 1 }} />
        {trade.outcome_label ? (
          <T size={11} weight="semibold" c={tone} testID={`shared-outcome-${trade.id}`}>{trade.outcome_label}</T>
        ) : null}
        {trade.result_pct != null ? (
          <Num size={11.5} weight="semibold" c={tone}>
            {`${trade.result_pct > 0 ? '+' : ''}${trade.result_pct.toFixed(1)}%`}
          </Num>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', gap: 14, flexWrap: 'wrap' }}>
        {levels.map((l) => (
          <View key={l.label} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
            <T size={10} c={color.muted}>{l.label}</T>
            <Num size={11.5} weight="semibold" c={l.c}>{l.value!}</Num>
          </View>
        ))}
      </View>
    </ObjectCard>
  );
}
