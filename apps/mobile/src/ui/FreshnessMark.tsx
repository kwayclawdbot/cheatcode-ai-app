import React from 'react';
import { View } from 'react-native';
import { color } from './tokens';
import { T } from './Text';

export type Freshness = 'live' | 'delayed' | 'stale' | 'closed' | 'unknown';

/**
 * Freshness is mandatory next to every price (UX spec §10 "Live reliability").
 * Status = label + SHAPE + colour — never colour alone:
 *   live    filled circle  cyan
 *   delayed ring           gold
 *   stale   square         red
 *   closed  bar            muted
 */
const SPEC: Record<Freshness, { label: string; c: string; shape: 'dot' | 'ring' | 'square' | 'bar' }> = {
  live: { label: 'Live', c: color.cyan, shape: 'dot' },
  delayed: { label: 'Delayed', c: color.gold, shape: 'ring' },
  stale: { label: 'Stale', c: color.red, shape: 'square' },
  closed: { label: 'Market closed', c: color.muted, shape: 'bar' },
  unknown: { label: 'No data', c: color.muted, shape: 'bar' },
};

export function FreshnessDot({ freshness, size = 6 }: { freshness: Freshness; size?: number }) {
  const s = SPEC[freshness];
  if (s.shape === 'ring') {
    return <View style={{ width: size + 1, height: size + 1, borderRadius: (size + 1) / 2, borderWidth: 1.5, borderColor: s.c }} />;
  }
  if (s.shape === 'square') {
    return <View style={{ width: size, height: size, backgroundColor: s.c }} />;
  }
  if (s.shape === 'bar') {
    return <View style={{ width: size + 2, height: 2, borderRadius: 1, backgroundColor: s.c }} />;
  }
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: s.c }} />;
}

export function FreshnessMark({
  freshness, label, size = 11, testID,
}: { freshness: Freshness; label?: string; size?: number; testID?: string }) {
  const s = SPEC[freshness];
  return (
    <View
      testID={testID}
      accessibilityLabel={`Data ${s.label.toLowerCase()}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
    >
      <FreshnessDot freshness={freshness} />
      <T size={size} c={s.c}>{label ?? s.label}</T>
    </View>
  );
}
