import React from 'react';
import { View } from 'react-native';
import { alpha, color, layout, radius } from '../../ui/tokens';
import { T } from '../../ui/Text';
import { Card } from '../../ui/Card';
import { Spark } from '../../ui/Icons';
import type { KaiComparison } from '../../lib/types';

/**
 * THE COMPARISON TOOL CARD — Kai's case for and against one subject.
 *
 * Green and red here are market meaning (the case it goes up, the case it goes
 * down), so they appear only as the small markers beside each point. Kai's own
 * conclusion is the one violet-edged block, because it is the one thing on the
 * card that is his judgement rather than a listed fact; the limits of that
 * judgement sit under it in plain words, never hidden.
 */
function Side({ title, points, plain, ink }: { title: string; points: string[]; plain: string; ink: string }) {
  const lines = points.length ? points : plain ? [plain] : [];
  return (
    <View style={{ flex: 1, minWidth: 140, gap: 6 }}>
      <T variant="meta" weight="semibold" c={ink}>{title}</T>
      {lines.slice(0, 4).map((p, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: ink, marginTop: 7 }} />
          <T variant="meta" lh={18} c={color.textPrimary} style={{ flex: 1 }}>{p}</T>
        </View>
      ))}
    </View>
  );
}

export function ComparisonToolCard({ comparison, testID = 'comparison-card' }: { comparison: KaiComparison; testID?: string }) {
  return (
    <Card testID={testID} style={{ gap: 12 }}>
      <T variant="cardTitle">{comparison.subject}</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
        <Side title="The case for" points={comparison.bull.points} plain={comparison.bull.plain} ink={color.marketUp} />
        <Side title="The case against" points={comparison.bear.points} plain={comparison.bear.plain} ink={color.marketDown} />
      </View>
      <View
        style={{
          flexDirection: 'row', gap: 8, padding: 12, borderRadius: radius.control,
          borderWidth: layout.border, borderColor: alpha.kai40, backgroundColor: alpha.kai08,
        }}
      >
        <Spark size={14} />
        <T variant="meta" lh={18} c={color.textPrimary} style={{ flex: 1 }}>{comparison.kai_conclusion_plain}</T>
      </View>
      {comparison.confidence_limits ? (
        <T variant="meta" c={color.textSecondary}>{comparison.confidence_limits}</T>
      ) : null}
    </Card>
  );
}
