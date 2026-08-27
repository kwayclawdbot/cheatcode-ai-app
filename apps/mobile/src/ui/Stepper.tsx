import React from 'react';
import { ScrollView, View } from 'react-native';
import { alpha, color, radius } from './tokens';
import { T } from './Text';
import { Check } from './Icons';
import type { StepperStep, Confirmation } from '../lib/types';

/**
 * Setup-detail.html's step rail: a scrolling row of 10.5px chips whose mark
 * carries the state as a SHAPE as well as a colour —
 *   done    check
 *   active  filled dot
 *   todo    hollow ring
 *   failed  square
 */
function Mark({ state }: { state: StepperStep['state'] }) {
  if (state === 'done') return <Check size={11} color={color.green} strokeWidth={3} />;
  if (state === 'active') return <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: color.cyan }} />;
  if (state === 'failed') return <View style={{ width: 7, height: 7, backgroundColor: color.red }} />;
  return <View style={{ width: 7, height: 7, borderRadius: 3.5, borderWidth: 1, borderColor: color.dim }} />;
}

const SKIN: Record<StepperStep['state'], { bg: string; bd: string; c: string }> = {
  done: { bg: color.greenTint, bd: alpha.green40, c: color.green },
  active: { bg: color.cyanTint, bd: alpha.cyan40, c: color.cyan },
  failed: { bg: color.redTint, bd: alpha.red40, c: color.red },
  todo: { bg: 'transparent', bd: alpha.ivory12, c: color.muted },
};

export function Stepper({ steps, testID }: { steps: StepperStep[]; testID?: string }) {
  if (!steps.length) return null;
  return (
    <ScrollView
      testID={testID}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ flexDirection: 'row', gap: 6, paddingRight: 16 }}
    >
      {steps.map((s) => {
        const skin = SKIN[s.state];
        return (
          <View
            key={s.label}
            accessibilityLabel={`${s.label} — ${s.state}`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: radius.pill,
              backgroundColor: skin.bg,
              borderWidth: 1,
              borderColor: skin.bd,
            }}
          >
            <Mark state={s.state} />
            <T size={10.5} weight="medium" c={skin.c}>{s.label}</T>
          </View>
        );
      })}
    </ScrollView>
  );
}

/** The evidence / confirmation checklist. ok = met, not-ok = still missing. */
export function ChecklistRow({ item }: { item: Confirmation }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 9 }}>
      {item.ok ? (
        <View style={{ paddingTop: 2 }}><Check size={13} color={color.green} strokeWidth={2.8} /></View>
      ) : (
        <View style={{ width: 13, height: 13, borderRadius: 6.5, borderWidth: 1.2, borderColor: color.gold, marginTop: 2 }} />
      )}
      <View style={{ flex: 1 }}>
        <T size={13} lh={19} c={item.ok ? color.text : color.muted}>{item.label}</T>
        {item.detail ? <T size={11} c={color.dim} style={{ marginTop: 2 }}>{item.detail}</T> : null}
      </View>
    </View>
  );
}
