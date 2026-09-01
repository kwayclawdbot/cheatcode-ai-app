/**
 * The portal's grade imports — one file, so five screens do not each pick a
 * medallion.
 *
 * THIS FILE USED TO CARRY A SECOND IMPLEMENTATION. Its own header said lane
 * MOBILE-A owned the canonical one in `src/features/grade/` and that switching
 * to it was "a one-line change here rather than an edit in five screens". This
 * is that change. The Trade Portal and the club feed now render the SAME
 * medallion and the SAME chip as the alert cards, which is the only way the
 * grade can mean one thing across the app.
 *
 * The qualitative `Scorecard` stays local: it is typed against the portal's own
 * `ScoreComponent` and is a different component from A's, not a duplicate.
 *
 * The rule that matters either way: a component NEVER shows a fraction. Status
 * word + 3-5 lit segments, and the 0-100 score belongs to the medallion.
 */
import React from 'react';
import { Pressable, View } from 'react-native';
import { T } from '../../ui/Text';
import { alpha, color } from '../../ui/tokens';
import type { ScoreComponent } from './types';

export { GradeMedallion, GradeChip } from '../grade';

function Segments({ strength, c }: { strength: number; c: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 3 }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <View
          key={i}
          style={{
            width: 11,
            height: 4,
            borderRadius: 2,
            backgroundColor: i < strength ? c : alpha.ivory12,
          }}
        />
      ))}
    </View>
  );
}

/**
 * The five mode components. Tapping one reveals its evidence — spec §4 keeps
 * the explanation expandable rather than permanently on screen.
 */
export function Scorecard({
  components, testID = 'scorecard',
}: { components: ScoreComponent[]; testID?: string }) {
  const [open, setOpen] = React.useState<string | null>(null);
  if (!components.length) return null;
  return (
    <View testID={testID} style={{ gap: 8 }}>
      {components.map((c) => {
        const isOpen = open === c.key;
        const tone = c.strength >= 4 ? color.green : c.strength >= 3 ? color.cyan : color.muted;
        return (
          <View key={c.key}>
            <Pressable
              testID={`score-${c.key}`}
              accessibilityRole="button"
              accessibilityLabel={`${c.label}: ${c.status}`}
              accessibilityState={{ expanded: isOpen }}
              onPress={() => setOpen(isOpen ? null : c.key)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 26 }}
            >
              <T size={11.5} c={color.muted} style={{ width: 96 }}>{c.label}</T>
              <Segments strength={c.strength} c={tone} />
              <T size={11.5} weight="semibold" c={tone} style={{ flex: 1 }}>{c.status}</T>
            </Pressable>
            {isOpen && c.explanation ? (
              <T size={11.5} lh={17} c={color.muted} style={{ paddingLeft: 106, paddingTop: 3 }}>{c.explanation}</T>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

