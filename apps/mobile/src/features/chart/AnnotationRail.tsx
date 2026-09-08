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
import { ScrollView, View } from 'react-native';
import { Num } from '../../ui/Text';
import { alpha, color, radius } from '../../ui/tokens';
import type { Annotation } from '../portal/types';
import { KIND_LABEL, PROVENANCE_LABEL } from '../portal/types';
import { kindColor } from './semantics';
import { useMotion } from '../a11y/context';
import { Focusable } from '../../ui/Focus';

export function AnnotationRail({
  annotations,
  onSelect,
  testID = 'annotation-rail',
}: {
  annotations: Annotation[];
  onSelect?: (a: Annotation) => void;
  testID?: string;
}) {
  /**
   * PRESS FEEDBACK IS MOTION TOO (audit F19).
   *
   * F19 names "sheets, chart annotations and feedback" and this rail is two of
   * the three at once: it is the chart's annotations, and a chip that shrinks
   * under the thumb is feedback. Twenty-four chips each shrinking 4% as a
   * finger drags across the rail is a lot of small movement over a chart that
   * is itself panning.
   *
   * The chip still answers the press under the preference — it dims instead.
   * Opacity is not position, so it stays inside what reduced motion permits,
   * and the alternative (no feedback at all) would take a real affordance away
   * from somebody in exchange for their accessibility setting.
   */
  const { reduced } = useMotion();

  /**
   * THE RAIL IS THE OVERFLOW.
   *
   * The chart itself now caps how many horizontal lines it will draw at once and
   * merges the ones sitting on top of each other, because a plot carrying every
   * level at full weight is a plot you cannot read. Nothing is LOST when it
   * does: every mark is still a chip here, in price order, reachable and
   * speakable, including the ones the chart folded away. That is what makes the
   * cap safe — the chart is edited for legibility, the rail stays complete.
   */
  const visible = useMemo(
    () => annotations
      .filter((a) => a.status === 'valid' || a.status === 'invalidated')
      // Price order, high to low — the same order they sit in on the chart, so
      // the rail reads as a legend rather than as a list in insertion order.
      // CURVES GO LAST, whatever their price: an average is context, and leading
      // with four of them buries the stop behind a scroll.
      .sort((a, b) => {
        const ai = a.kind === 'indicator' ? 1 : 0;
        const bi = b.kind === 'indicator' ? 1 : 0;
        if (ai !== bi) return ai - bi;
        return (b.price ?? -Infinity) - (a.price ?? -Infinity);
      }),
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
        // An overlay's name IS its label — "EMA 21", "VWAP" — and there is no
        // generic word for it that is not worse than the name.
        const label = a.kind === 'indicator' ? (a.text || KIND_LABEL[a.kind]) : KIND_LABEL[a.kind];
        const value = a.price == null
          ? null
          : a.price2 != null
            ? `${a.price.toFixed(2)}-${a.price2.toFixed(2)}`
            : a.price.toFixed(2);
        return (
          <Focusable
            key={a.id}
            testID={`annotation-${a.id}`}
            accessibilityRole="button"
            accessibilityLabel={
              // "at 604" is true of a level and false of a curve, which is
              // somewhere different on every bar. Spoken aloud, the difference
              // between "support at 604" and "the twenty-one day, 604 right now"
              // is the whole distinction this chip is making visually.
              `${label}${a.price != null ? (a.kind === 'indicator' ? `, ${a.price.toFixed(2)} right now` : ` at ${a.price.toFixed(2)}`) : ''}. ` +
              `${PROVENANCE_LABEL[a.provenance]}.${a.reason ? ` ${a.reason}` : ''}`
            }
            accessibilityHint="Opens why this level is on the chart"
            onPress={() => onSelect?.(a)}
            hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
            // The chips sit 6px apart in a horizontal rail, so the ring is
            // pulled in to 2 — at the default 3 two neighbouring rings would
            // touch and the rail would look ruled rather than focused.
            ringInset={2}
            ringRadius={radius.sm}
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
              opacity: (dead ? 0.55 : 1) * (pressed && reduced ? 0.7 : 1),
              // Feedback on the press itself, not on the release.
              transform: [{ scale: pressed && !reduced ? 0.96 : 1 }],
            })}
          >
            <Num size={9.5} weight="medium" c={dead ? color.dim : c}>{label}</Num>
            {value ? (
              <Num size={9.5} weight="medium" c={dead ? color.dim : color.text}>{value}</Num>
            ) : null}
            {a.provenance === 'kai' ? (
              <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: color.violet }} />
            ) : null}
          </Focusable>
        );
      })}
    </ScrollView>
  );
}
