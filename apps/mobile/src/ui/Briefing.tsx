import React from 'react';
import { View } from 'react-native';
import { ObjectCard } from './Panel';
import { T, Eyebrow } from './Text';
import { RichText } from './RichText';
import { color, radius } from './tokens';
import type { Briefing as BriefingT } from '../lib/types';

const DOT: Record<string, string> = {
  market: color.cyan,      // market data
  attention: color.gold,   // needs attention
  quiet: color.muted,      // nothing to do
};

/** The morning report object — V3-H1's briefing card. */
export function BriefingCard({ briefing, testID }: { briefing: BriefingT; testID?: string }) {
  return (
    <ObjectCard testID={testID ?? 'briefing'} r={radius.xl} style={{ paddingVertical: 12, paddingHorizontal: 14, gap: 8 }}>
      <Eyebrow c={color.violetLight} style={{ fontSize: 10 }}>{briefing.title}</Eyebrow>
      {briefing.lines.map((l, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: DOT[l.tone] ?? color.muted }} />
          <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
            <RichText text={l.text} size={13} />
            {l.action ? <T size={13} weight="semibold" c={color.gold}>{` · ${l.action}`}</T> : null}
          </View>
        </View>
      ))}
    </ObjectCard>
  );
}
