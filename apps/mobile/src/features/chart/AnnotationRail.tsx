/**
 * The levels rail — every mark on the chart, as a row of chips.
 *
 * WHY THIS EXISTS. The chart's own labels are drawn on a canvas inside the
 * chart page. That is right for the drawing (a label and its line can never
 * drift apart if they are painted in the same pass) and wrong for two things a
 * canvas cannot do:
 *
 *  - REACH. A level 300 bars off screen is still a real level on this trade.
 *    Before this rail, the only way to reach one was to know it was there and
 *    scroll until it appeared.
 *  - SPEECH. Canvas pixels are invisible to VoiceOver and TalkBack. Without an
 *    accessible object per level, a blind user gets "chart" and nothing else.
 *
 * So the rail is not chrome around the chart, it is the chart's index: one
 * chip per mark, in price order, coloured by MEANING (semantics.ts), carrying
 * Kai's violet dot when Kai placed it, and tappable to open the same inspector
 * the on-chart chip opens.
 *
 * It renders nothing at all when there is nothing marked. An empty rail would
 * be a container looking for content.
 */
import React, { useMemo } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Num } from '../../ui/Text';
import { alpha, color, radius } from '../../ui/tokens';
import type { Annotation } from '../portal/types';
import { KIND_LABEL, PROVENANCE_LABEL } from '../portal/types';
import { kindColor } from './semantics';

export function AnnotationRail({
  annotations,
  onSelect,
  testID = 'annotation-rail',
}: {
  annotations: Annotation[];
  onSelect?: (a: Annotation) => void;
  testID?: string;
}) {
  const visible = useMemo(
    () => annotations
      .filter((a) => a.status === 'valid' || a.status === 'invalidated')
      // Price order, high to low — the same order they sit in on the chart, so
      // the rail reads as a legend rather than as a list in insertion order.
      .sort((a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity)),
    [annotations],
  );

  if (!visible.length) return null;

  return (
    <ScrollView
      testID={testID}
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ gap: 6, paddingRight: 4 }}
      style={{ flexGrow: 0 }}
    >
      {visible.map((a) => {
        const c = kindColor(a.kind);
        const dead = a.status === 'invalidated';
        // The KIND, then the NUMBER. Not the chip's own label: "Entry 504-507"
        // followed by "504.00" says the same thing twice and pushes the next
        // level off the screen.
        const label = KIND_LABEL[a.kind];
        const value = a.price == null
          ? null
          : a.price2 != null
            ? `${a.price.toFixed(2)}-${a.price2.toFixed(2)}`
            : a.price.toFixed(2);
        return (
          <Pressable
            key={a.id}
            testID={`annotation-${a.id}`}
            accessibilityRole="button"
            accessibilityLabel={
              `${KIND_LABEL[a.kind]}${a.price != null ? ` at ${a.price.toFixed(2)}` : ''}. ` +
              `${PROVENANCE_LABEL[a.provenance]}.${a.reason ? ` ${a.reason}` : ''}`
            }
            accessibilityHint="Opens why this level is on the chart"
            onPress={() => onSelect?.(a)}
            hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              height: 24,
              paddingHorizontal: 8,
              borderRadius: radius.sm,
              borderWidth: 0.5,
              borderColor: dead ? alpha.ivory12 : `${c}55`,
              backgroundColor: dead ? 'transparent' : `${c}12`,
              opacity: dead ? 0.55 : 1,
              // Feedback on the press itself, not on the release.
              transform: [{ scale: pressed ? 0.96 : 1 }],
            })}
          >
            <Num size={9.5} weight="medium" c={dead ? color.dim : c}>{label}</Num>
            {value ? (
              <Num size={9.5} weight="medium" c={dead ? color.dim : color.text}>{value}</Num>
            ) : null}
            {a.provenance === 'kai' ? (
              <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: color.violet }} />
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
