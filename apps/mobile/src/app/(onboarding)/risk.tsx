import React from 'react';
import { View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { T } from '../../ui/Text';
import { ObjectCard } from '../../ui/Panel';
import { Button, Tag } from '../../ui/Button';
import { ProgressBars } from '../../ui/Progress';
import { Check } from '../../ui/Icons';
import { alpha, color, radius } from '../../ui/tokens';
import { useOnboardingDraft } from '../../lib/session';
import type { Involvement, RiskAnswer } from '../../lib/types';

/**
 * S02-Risk.html — risk chosen by example, not by jargon.
 * Backend enum `involvement` has ONLY hands_on and guided, so "Mostly hands-off"
 * is shown disabled with "Unlocks later" exactly as drawn.
 */
const RISKS: { key: RiskAnswer; title: string; cap: number; tag?: string }[] = [
  { key: 'careful', title: 'Careful', cap: 20 },
  { key: 'balanced', title: 'Balanced', cap: 60 },
  { key: 'aggressive', title: 'Aggressive', cap: 140, tag: 'Higher swings' },
];

const INVOLVEMENT: { key: Involvement | 'auto'; label: string; disabled?: boolean; tag?: string }[] = [
  { key: 'hands_on', label: 'I confirm every action' },
  { key: 'guided', label: 'Kai prepares, I approve' },
  { key: 'auto', label: 'Mostly hands-off', disabled: true, tag: 'Unlocks later' },
];

export default function Risk() {
  const router = useRouter();
  const { draft, set } = useOnboardingDraft();
  const risk = draft.risk_answer ?? 'balanced';
  const involvement = draft.involvement ?? 'hands_on';

  return (
    <Screen variant="corner" layout="stack" testID="screen-risk">
      <ProgressBars total={3} done={2} />
      <T size={27} weight="bold" ls={-0.4} lh={32}>How much risk feels right?</T>
      <T size={14} c={color.muted} style={{ marginTop: 8 }}>Real examples, not jargon. This sets your daily loss cap.</T>

      <View style={{ gap: 10, marginTop: 22 }}>
        {RISKS.map(({ key, title, cap, tag }) => {
          const on = risk === key;
          return (
            <Pressable
              key={key}
              testID={`risk-${key}`}
              accessibilityRole="button"
              accessibilityLabel={`${title}. On a $2,000 account, a bad day costs about $${cap}.`}
              accessibilityState={{ selected: on }}
              onPress={() => set({ risk_answer: key })}
            >
              <ObjectCard tone={on ? 'volt' : 'default'} r={radius.xl} style={{ paddingVertical: 14, paddingHorizontal: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                    <T size={15} weight="bold">{title}</T>
                    {tag ? <Tag label={tag} c={color.gold} border={alpha.gold50} /> : null}
                  </View>
                  {on ? <Check size={16} color={color.volt} strokeWidth={2.6} /> : null}
                </View>
                <T size={12} c={color.muted} style={{ marginTop: 3 }}>
                  On a $2,000 account, a bad day costs about <T size={12} weight="bold" c={color.text}>${cap}</T>.
                </T>
              </ObjectCard>
            </Pressable>
          );
        })}
      </View>

      <T size={15} weight="bold" style={{ marginTop: 24 }}>How involved do you want to be?</T>
      <View style={{ gap: 8, marginTop: 12, flex: 1 }}>
        {INVOLVEMENT.map(({ key, label, disabled, tag }) => {
          const on = !disabled && involvement === key;
          return (
            <Pressable
              key={key}
              testID={`involvement-${key}`}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityHint={disabled ? 'Unlocks in a later release.' : undefined}
              accessibilityState={{ selected: on, disabled }}
              disabled={disabled}
              onPress={() => set({ involvement: key as Involvement })}
              style={{
                height: 44,
                borderRadius: radius.pill,
                paddingHorizontal: 18,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                borderWidth: on ? 1 : 0.5,
                borderColor: on ? alpha.volt60 : alpha.ivory16,
                backgroundColor: on ? alpha.volt10 : alpha.surface50,
                opacity: disabled ? 0.7 : 1,
              }}
            >
              <T size={14} weight={on ? 'semibold' : 'regular'} c={on ? color.text : color.muted}>{label}</T>
              {tag ? <Tag label={tag} c={color.muted} border={alpha.ivory25} /> : null}
              {on ? <View style={{ marginLeft: 'auto' }}><Check size={15} color={color.volt} strokeWidth={2.6} /></View> : null}
            </Pressable>
          );
        })}
      </View>

      <Button
        testID="cta-continue"
        label="Continue"
        height={52}
        arrow
        onPress={() => { set({ risk_answer: risk, involvement: involvement as Involvement }); router.push('/summary'); }}
      />
    </Screen>
  );
}
