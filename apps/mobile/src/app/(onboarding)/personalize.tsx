import React from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { T } from '../../ui/Text';
import { ObjectCard } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { ProgressBars } from '../../ui/Progress';
import { Check } from '../../ui/Icons';
import { alpha, color, radius } from '../../ui/tokens';
import { useOnboardingDraft } from '../../lib/session';
import {
  EXPERIENCE_CONSEQUENCE, EXPERIENCE_LABEL, FOCUS_CHIP, FOCUS_ORDER, focusSummary,
} from '../../features/account/profile';
import type { Experience, FocusKey } from '../../lib/types';

/**
 * Onboarding 3 of 4 — prototype board "Onboarding personalize".
 *
 * Two answers, and both of them change the product rather than decorate the
 * profile: experience sets Kai's VOICE (new = explains each term the first
 * time, some = plain and skips basics, pro = levels and numbers first), and
 * the focus chips set what Kai scans before anything else.
 */
const EXPERIENCES: Experience[] = ['new', 'some', 'pro'];

/** The board's own wording for the third card. */
const TITLE: Record<Experience, string> = {
  new: 'New to this',
  some: 'Some experience',
  pro: 'I trade actively',
};

export default function Personalize() {
  const router = useRouter();
  const { draft, set } = useOnboardingDraft();
  const experience = draft.experience;
  const focus = draft.focus;

  const toggle = (k: FocusKey) =>
    set({ focus: focus.includes(k) ? focus.filter((f) => f !== k) : [...focus, k] });

  return (
    <Screen variant="dome" layout="stack" testID="screen-personalize">
      <ProgressBars total={4} done={3} />
      <T size={26} weight="bold" ls={-0.4} lh={31}>{'Let\u2019s tune Kai to you'}</T>
      <T size={14} c={color.muted} style={{ marginTop: 8 }}>Two quick answers. You can change both later.</T>

      <ScrollView style={{ flex: 1, marginTop: 24 }} contentContainerStyle={{ gap: 20 }} showsVerticalScrollIndicator={false}>
        <View>
          <T size={12} weight="bold" ls={0.84} c={color.muted} style={{ marginBottom: 10 }}>HOW MUCH HAVE YOU TRADED?</T>
          <View style={{ gap: 8 }}>
            {EXPERIENCES.map((key) => {
              const on = experience === key;
              return (
                <Pressable
                  key={key}
                  testID={`experience-${key}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${TITLE[key]}. ${EXPERIENCE_CONSEQUENCE[key]}`}
                  accessibilityState={{ selected: on }}
                  onPress={() => set({ experience: key })}
                >
                  <ObjectCard tone={on ? 'volt' : 'default'} r={15} style={{ paddingVertical: 13, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <T size={15} weight="bold">{TITLE[key]}</T>
                      <T size={12} c={color.muted} style={{ marginTop: 2 }}>{EXPERIENCE_CONSEQUENCE[key]}</T>
                    </View>
                    {on ? <Check size={16} color={color.volt} strokeWidth={2.6} /> : null}
                  </ObjectCard>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View>
          <T size={12} weight="bold" ls={0.84} c={color.muted} style={{ marginBottom: 10 }}>WHAT SHOULD KAI WATCH?</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {FOCUS_ORDER.map((k) => {
              const on = focus.includes(k);
              return (
                <Pressable
                  key={k}
                  testID={`focus-${k}`}
                  accessibilityRole="button"
                  accessibilityLabel={FOCUS_CHIP[k]}
                  accessibilityState={{ selected: on }}
                  onPress={() => toggle(k)}
                  style={{
                    paddingVertical: 9, paddingHorizontal: 15, borderRadius: radius.pill, borderWidth: 0.5,
                    borderColor: on ? alpha.volt55 : alpha.ivory20,
                    backgroundColor: on ? alpha.volt10 : 'transparent',
                  }}
                >
                  <T size={13} c={on ? color.volt : color.muted}>{FOCUS_CHIP[k]}</T>
                </Pressable>
              );
            })}
          </View>
          <T size={11.5} c={color.muted} style={{ marginTop: 10 }} testID="focus-summary">{focusSummary(focus)}</T>
        </View>
      </ScrollView>

      <Button
        testID="cta-continue"
        label="Continue"
        height={52}
        arrow
        onPress={() => router.push('/kai-plan')}
        accessibilityHint={`Kai is set to ${EXPERIENCE_LABEL[experience]}`}
      />
    </Screen>
  );
}
