import React from 'react';
import { View, Pressable, ViewStyle, StyleProp } from 'react-native';
import { alpha, color, radius } from '../../ui/tokens';
import { T, Eyebrow } from '../../ui/Text';

/**
 * Qualitative scorecard — docs/10 §4.
 * NEVER render component fractions (18/20, 4/5). A component is a plain-language
 * status plus a 3–5 segment strength meter. Internal points stay in the engine.
 */
export type ScoreStatus =
  | 'Strong' | 'Confirmed' | 'Healthy' | 'Forming' | 'Waiting'
  | 'Favorable' | 'Supportive' | 'Neutral';

export type ScoreComponent = {
  key: string;
  /** Trend · Structure · Volume · Risk / Reward · Market (mode-specific). */
  label: string;
  status: ScoreStatus | string;
  /** 0–5 segments filled. */
  strength: number;
  /** Expandable evidence. */
  explanation?: string | null;
};

/** Status → tone. The status WORD is the signal; colour only reinforces it. */
const POSITIVE = new Set(['Strong', 'Confirmed', 'Healthy', 'Favorable', 'Supportive']);
const CAUTION = new Set(['Forming', 'Waiting', 'Neutral']);

export function statusTone(status: string): string {
  if (POSITIVE.has(status)) return color.green;
  if (CAUTION.has(status)) return color.gold;
  return color.muted;
}

const SEGMENTS = 5;

export function StrengthMeter({ strength, tone, testID }: { strength: number; tone: string; testID?: string }) {
  const filled = Math.max(0, Math.min(SEGMENTS, Math.round(strength)));
  return (
    <View testID={testID} style={{ flexDirection: 'row', gap: 3 }}>
      {Array.from({ length: SEGMENTS }).map((_, i) => (
        <View
          key={i}
          style={{
            width: 13, height: 5, borderRadius: 3,
            backgroundColor: i < filled ? tone : alpha.ivory12,
          }}
        />
      ))}
    </View>
  );
}

export function ScoreRow({ component, expanded, onPress }: {
  component: ScoreComponent; expanded?: boolean; onPress?: () => void;
}) {
  const tone = statusTone(component.status);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${component.label}, ${component.status}`}
      testID={`score-${component.key}`}
      style={{ gap: 6 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
        <T size={11.5} c={color.muted} style={{ width: 74 }}>{component.label}</T>
        <StrengthMeter strength={component.strength} tone={tone} />
        <T size={11} c={tone} style={{ marginLeft: 'auto' }}>{component.status}</T>
      </View>
      {expanded && component.explanation ? (
        <T size={11} c={color.dim} lh={16} style={{ paddingLeft: 83 }}>{component.explanation}</T>
      ) : null}
    </Pressable>
  );
}

export type ScorecardProps = {
  components: ScoreComponent[];
  /** "WHY THIS GRADE" heading + "See evidence" affordance; on by default. */
  heading?: boolean;
  /** Show each component's explanation inline. */
  showEvidence?: boolean;
  onToggleEvidence?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function Scorecard({
  components, heading = true, showEvidence = false, onToggleEvidence, style, testID,
}: ScorecardProps) {
  if (!components?.length) return null;
  return (
    <View
      testID={testID ?? 'scorecard'}
      style={[{ gap: 7, paddingTop: 10, borderTopWidth: 0.5, borderTopColor: alpha.ivory10 }, style]}
    >
      {heading ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Eyebrow c={color.muted}>WHY THIS GRADE</Eyebrow>
          {onToggleEvidence ? (
            <Pressable onPress={onToggleEvidence} accessibilityRole="button" testID="scorecard-evidence">
              <T size={11} weight="semibold" c={color.violetLight}>
                {showEvidence ? 'Hide evidence' : 'See evidence'}
              </T>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {components.map((c) => (
        <ScoreRow key={c.key} component={c} expanded={showEvidence} />
      ))}
    </View>
  );
}

/** A compact single-meter readout used by the ticker page's Technicals block. */
export function MeterRow({ label, status, strength, width = 74 }: {
  label: string; status: string; strength: number; width?: number;
}) {
  const tone = statusTone(status);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }} accessibilityLabel={`${label}, ${status}`}>
      <T size={11.5} c={color.muted} style={{ width }}>{label}</T>
      <StrengthMeter strength={strength} tone={tone} />
      <T size={11} c={tone} style={{ marginLeft: 'auto' }}>{status}</T>
    </View>
  );
}

export const scorecardRadius = radius.lg;
