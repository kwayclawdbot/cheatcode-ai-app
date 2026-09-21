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
      {/*
        THE HEADER WRAPS; IT NEVER CUTS (owner, 21 September: "Delayed 15m ·
        Aug 26, 9:41 AM" was clipped at 390pt, and at 130% text the time lost
        its last letter — "9:41 AN"). A time and a state are facts; when the
        row cannot hold them beside the symbol they drop to a second line of
        their own, right-aligned, whole.
      */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 10, rowGap: 4 }}>
        <T variant="sectionTitle" weight="bold" testID="priority-symbol">{title}</T>
        {priority.grade_display ? (
          <View style={{ paddingHorizontal: 9, paddingVertical: 2, borderRadius: radius.sm, backgroundColor: alpha.violet14, borderWidth: 0.5, borderColor: alpha.violet50 }}>
            <T variant="meta" weight="bold" c={color.violet}>{priority.grade_display}</T>
          </View>
        ) : null}
        {/* Freshness rides in the header so the card keeps the artboard's
            rhythm — a price on screen is never unlabelled (07 §10). */}
        <View style={{ marginLeft: 'auto', flexShrink: 1, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', columnGap: 9, rowGap: 2 }}>
          {priority.quote ? (
            <FreshnessMark
              freshness={priority.quote.freshness ?? 'unknown'}
              delayReason={priority.quote.delay_reason}
              at={priority.quote.source_ts}
              size={10}
              testID="priority-freshness"
            />
          ) : null}
          {priority.state_label ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tone }} />
              <T variant="meta" c={tone}>{priority.state_label}</T>
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
        <T variant="body" lh={20} weight="semibold">{priority.title}</T>
      ) : null}

      {priority.detail ? (
        <T variant="meta" lh={19} c={color.muted} testID="priority-detail">{priority.detail}</T>
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
