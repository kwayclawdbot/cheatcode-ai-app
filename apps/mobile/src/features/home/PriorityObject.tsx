import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { ObjectCard } from '../../ui/Panel';
import { T } from '../../ui/Text';
import { Button } from '../../ui/Button';
import { PriceLine } from '../../ui/MiniChart';
import { FreshnessMark } from '../../ui/FreshnessMark';
import { alpha, color, radius } from '../../ui/tokens';
import type { Candle, HomePriority } from '../../lib/types';

const TONE_COLOR: Record<NonNullable<HomePriority['state_tone']>, string> = {
  market: color.cyan,
  positive: color.green,
  attention: color.gold,
  risk: color.red,
  neutral: color.muted,
};

/**
 * V5-H1's dominant object: ONE priority, ONE primary action (audit §4).
 *
 * The card carries setup / alert / position / portfolio without changing shape —
 * the object's identity, its chart, one sentence of why, and the state-driven
 * primary. Everything else about it lives one tap deeper in the workspace, so
 * this screen never becomes a stack of equal-weight boxes (audit §9).
 */
export function PriorityObject({ priority, candles, testID = 'home-priority' }: { priority: HomePriority; candles?: Candle[]; testID?: string }) {
  const router = useRouter();
  const tone = TONE_COLOR[priority.state_tone ?? 'neutral'];
  const title = priority.symbol ?? priority.title ?? 'Today';

  return (
    <ObjectCard testID={testID} r={radius.xxxl} style={{ padding: 16, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <T size={20} weight="bold" testID="priority-symbol">{title}</T>
        {priority.grade_display ? (
          <View style={{ paddingHorizontal: 9, paddingVertical: 2, borderRadius: radius.sm, backgroundColor: alpha.violet14, borderWidth: 0.5, borderColor: alpha.violet50 }}>
            <T size={12} weight="bold" c={color.violet}>{priority.grade_display}</T>
          </View>
        ) : null}
        {/* Freshness rides in the header so the card keeps the artboard's
            rhythm — a price on screen is never unlabelled (07 §10). */}
        <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          {priority.quote ? (
            <FreshnessMark
              freshness={priority.quote.freshness ?? 'unknown'}
              delayReason={priority.quote.delay_reason}
              size={10}
              testID="priority-freshness"
            />
          ) : null}
          {priority.state_label ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tone }} />
              <T size={11} c={tone}>{priority.state_label}</T>
            </View>
          ) : null}
        </View>
      </View>

      {priority.symbol ? (
        <PriceLine
          testID="priority-chart"
          candles={candles ?? priority.candles}
          level={priority.levels.entry ?? null}
          note={priority.chart_note}
          height={88}
        />
      ) : null}

      {priority.title && priority.symbol ? (
        <T size={14} lh={20} weight="semibold">{priority.title}</T>
      ) : null}

      {priority.detail ? (
        <T size={13} lh={19} c={color.muted} testID="priority-detail">{priority.detail}</T>
      ) : null}

      <Button
        testID="priority-action"
        label={priority.primary_action.label}
        kind="volt"
        height={48}
        arrow
        onPress={() => router.push(priority.primary_action.route)}
      />
    </ObjectCard>
  );
}
