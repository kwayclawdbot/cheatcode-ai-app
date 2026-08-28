/**
 * Grade medallion + qualitative scorecard, spec 10 §4.
 *
 * CROSS-LANE: lane MOBILE-A owns `src/features/grade/` and ships the canonical
 * `GradeMedallion` / `Scorecard`. This module is the portal's single import
 * point for them — while A's module is in flight it renders a local
 * implementation of the SAME spec, and switching to A's is a one-line change
 * here rather than an edit in five screens.
 *
 * The rule that matters either way: a component NEVER shows a fraction.
 * Status word + 3–5 lit segments, and the 0–100 score stays small beside a
 * large letter.
 */
import React from 'react';
import { Pressable, View } from 'react-native';
import { T, Num } from '../../ui/Text';
import { alpha, color, radius } from '../../ui/tokens';
import { gradeColor } from '../chart/semantics';
import type { ScoreComponent } from './types';

export function GradeMedallion({
  grade, score, size = 72, testID = 'grade-medallion',
}: { grade: string | null; score?: number | null; size?: number; testID?: string }) {
  const c = gradeColor(grade);

  /**
   * Spec §4: below 60 (and with no grade at all) the treatment is NEUTRAL and
   * the object is not promoted as actionable. An ungraded alert is a real thing
   * — a price condition you asked Kai to watch — so it keeps its place in the
   * hierarchy and simply says it has no grade, at a smaller size.
   */
  if (!grade) {
    const d = Math.round(size * 0.62);
    return (
      <View
        testID={testID}
        accessibilityLabel="Not graded. This is a condition Kai is watching, not a graded setup."
        style={{ width: size, alignItems: 'center', gap: 4 }}
      >
        <View
          style={{
            width: d, height: d, borderRadius: d / 2, borderWidth: 1,
            borderColor: alpha.ivory20, backgroundColor: alpha.ivory06,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <T size={d * 0.3} weight="bold" c={color.dim}>—</T>
        </View>
        <T size={9.5} c={color.dim} align="center">Not graded</T>
      </View>
    );
  }

  return (
    <View
      testID={testID}
      accessibilityLabel={`Grade ${grade}${score != null ? `, score ${score} out of 100` : ''}`}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 1.5,
        borderColor: c,
        backgroundColor: `${c}14`,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <T size={size * 0.38} weight="bold" c={c}>{grade}</T>
      {score != null ? <Num size={Math.max(9, size * 0.14)} weight="regular" c={color.muted}>{`${score}/100`}</Num> : null}
    </View>
  );
}

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

/** The small inline grade chip used inside Kai objects and rows. */
export function GradeChip({ grade, testID }: { grade: string | null; testID?: string }) {
  if (!grade) return null;
  const c = gradeColor(grade);
  return (
    <View
      testID={testID}
      style={{
        paddingHorizontal: 6,
        paddingVertical: 1,
        borderRadius: radius.sm,
        backgroundColor: `${c}1F`,
        borderWidth: 0.5,
        borderColor: `${c}88`,
      }}
    >
      <T size={10} weight="bold" c={c}>{grade}</T>
    </View>
  );
}
