import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { alpha, color, radius } from './tokens';
import { T, Num } from './Text';
import { ObjectCard } from './Panel';
import { Button } from './Button';
import { Clock } from './Icons';
import { FreshnessMark } from './FreshnessMark';
import type { GradedSetup, SetupState } from '../lib/types';

/** state = label + shape + colour (never colour alone). */
const STATE: Record<SetupState, { label: string; c: string }> = {
  forming: { label: 'Forming', c: color.cyan },
  ready: { label: 'Ready', c: color.green },
  confirmed: { label: 'Confirmed', c: color.green },
  triggered: { label: 'Triggered', c: color.green },
  invalidated: { label: 'Invalidated', c: color.red },
  expired: { label: 'Expired', c: color.muted },
  watching: { label: 'Watching', c: color.muted },
};

function Level({ label, value, c, bg, border }: { label: string; value: string; c: string; bg: string; border: string }) {
  return (
    <View style={{ flex: 1, paddingVertical: 9, paddingHorizontal: 4, borderRadius: radius.lg, backgroundColor: bg, borderWidth: 0.5, borderColor: border, alignItems: 'center' }}>
      <T size={10} c={color.muted}>{label}</T>
      <Num size={13} weight="semibold" c={c} style={{ marginTop: 2 }}>{value}</Num>
    </View>
  );
}

/**
 * The graded-setup object — V3-H1's dominant card.
 * ticker · grade badge · state dot+label / Entry-Target-Invalid triplet in mono /
 * risk line / one dominant volt action + Kai "Why?".
 */
export function SetupObject({
  setup, onOpen, onWhy, compact = false, testID,
}: { setup: GradedSetup; onOpen?: () => void; onWhy?: () => void; compact?: boolean; testID?: string }) {
  const st = STATE[setup.state] ?? STATE.watching;
  const fresh = setup.quote?.freshness ?? 'unknown';
  const router = useRouter();
  /** Default destinations: the object IS the link to its detail, and "Why?"
   *  lands directly on the Learn view (round-2 brief, Setup detail §1). */
  const open = onOpen ?? (() => router.push(`/setup/${encodeURIComponent(setup.id)}`));
  const why = onWhy ?? (() => router.push(`/setup/${encodeURIComponent(setup.id)}?view=learn`));

  return (
    <ObjectCard
      testID={testID ?? `setup-${setup.symbol}`}
      r={radius.xxl}
      style={{ padding: 14, gap: 11 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <T size={18} weight="bold">{setup.symbol}</T>
        <View style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: 7, backgroundColor: alpha.violet14, borderWidth: 0.5, borderColor: alpha.violet50 }}>
          <T size={12} weight="bold" c={color.violet}>{setup.grade_display}</T>
        </View>
        {/* Non-negotiable: no price on screen without its freshness. It sits in
            the header so the artboard's single-line risk row is preserved. */}
        <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <FreshnessMark freshness={fresh} delayReason={setup.quote?.delay_reason} testID={`freshness-${setup.symbol}`} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: st.c }} />
            <T size={11} c={st.c}>{setup.state_label ?? st.label}</T>
          </View>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Level label="Entry" value={setup.entry ?? '—'} c={color.cyan} bg={color.cyanTint} border={alpha.cyan40} />
        <Level label="Target" value={setup.target ?? '—'} c={color.green} bg={color.greenTint} border={alpha.green40} />
        <Level label="Invalid" value={setup.invalid ?? '—'} c={color.red} bg={color.redTint} border={alpha.red40} />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <Clock size={12} color={color.gold} />
        <T size={12} c={color.gold} style={{ flexShrink: 1 }}>{setup.risk_line ?? 'Risk not computed yet'}</T>
      </View>

      {compact ? null : (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button
            testID="open-setup"
            label={setup.next_action ?? 'Open setup'}
            kind="volt"
            height={42}
            arrow
            onPress={open}
            style={{ flex: 1 }}
          />
          <Button testID="why" label="Why?" kind="kai" height={42} full={false} onPress={why} />
        </View>
      )}
    </ObjectCard>
  );
}
