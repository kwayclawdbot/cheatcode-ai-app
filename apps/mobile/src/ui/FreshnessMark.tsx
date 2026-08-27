import React from 'react';
import { View } from 'react-native';
import { color } from './tokens';
import { T } from './Text';
import type { DelayReason } from '../lib/types';

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

/**
 * Round-2 rule (build brief): when the plan/entitlement is the only reason a
 * price is not live, the server sends freshness 'delayed' with
 * delay_reason:'entitlement'. That must read as "Delayed 15m" — never as
 * stale — and it must never disable an action.
 */
export function resolveFreshness(freshness: Freshness | undefined, reason?: DelayReason | null): {
  freshness: Freshness; label: string;
} {
  if (reason === 'entitlement') return { freshness: 'delayed', label: 'Delayed 15m' };
  const f = freshness ?? 'unknown';
  return { freshness: f, label: SPEC[f].label };
}

export function FreshnessMark({
  freshness, label, size = 11, testID, delayReason,
}: { freshness: Freshness; label?: string; size?: number; testID?: string; delayReason?: DelayReason | null }) {
  const resolved = resolveFreshness(freshness, delayReason);
  const s = SPEC[resolved.freshness];
  const text = label ?? resolved.label;
  return (
    <View
      testID={testID}
      accessibilityLabel={`Data ${text.toLowerCase()}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
    >
      <FreshnessDot freshness={resolved.freshness} />
      <T size={size} c={s.c}>{text}</T>
    </View>
  );
}
