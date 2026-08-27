import React, { useState } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { T } from '../../ui/Text';
import { KaiOrb } from '../../ui/KaiOrb';
import { KaiBubble, UserBubble } from '../../ui/Bubble';
import { ObjectCard } from '../../ui/Panel';
import { Chip } from '../../ui/Button';
import { Composer } from '../../ui/Composer';
import { Bolt, Calendar, Bars, Check } from '../../ui/Icons';
import { alpha, color, radius } from '../../ui/tokens';
import { useOnboardingDraft, useSession } from '../../lib/session';
import type { FundingChoice, GoalMode } from '../../lib/types';

/** V3-O0-Conversational-onboarding.html — Kai asks, you tap. */
const MODES: { key: GoalMode; title: string; sub: string; echo: string; Icon: React.ComponentType<{ size?: number; color?: string }> }[] = [
  { key: 'day_trade', title: 'Day trade', sub: 'In and out within a day', echo: 'Day trade — in and out within a day.', Icon: Bolt },
  { key: 'swing', title: 'Swing trade', sub: 'Hold for days or weeks', echo: 'Swing trade — hold for days or weeks.', Icon: Calendar },
  { key: 'invest', title: 'Invest', sub: 'Grow long-term wealth', echo: 'Invest — grow long-term wealth.', Icon: Bars },
];

function ChoiceCard({ title, sub, Icon, selected, onPress, testID }: {
  title: string; sub: string; Icon: React.ComponentType<{ size?: number; color?: string }>;
  selected: boolean; onPress: () => void; testID: string;
}) {
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={`${title}. ${sub}`} accessibilityState={{ selected }} onPress={onPress}>
      <ObjectCard tone={selected ? 'volt' : 'default'} r={radius.xxl} style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 13 }}>
        <View style={{ width: 40, height: 40, borderRadius: 11, backgroundColor: selected ? alpha.volt14 : alpha.ivory06, alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={19} color={selected ? color.volt : color.muted} />
        </View>
        <View style={{ flex: 1 }}>
          <T size={16} weight="bold">{title}</T>
          <T size={12} c={color.muted} style={{ marginTop: 2 }}>{sub}</T>
        </View>
        {selected ? <Check size={17} color={color.volt} strokeWidth={2.6} /> : null}
      </ObjectCard>
    </Pressable>
  );
}

export default function OnboardingKai() {
  const router = useRouter();
  const { draft, set } = useOnboardingDraft();
  const { profile } = useSession();
  const name = profile?.display_name ? ` ${profile.display_name}` : '';
  const [echo, setEcho] = useState<string | null>(null);

  const pickMode = (m: (typeof MODES)[number]) => {
    set({ goal_mode: m.key });
    setEcho(m.echo);
  };

  const pickFunding = (f: FundingChoice) => {
    set({ funding: f });
    router.push('/goal');
  };

  return (
    <Screen variant="dome" layout="tab" testID="screen-onboarding-kai">
      {/* header: Kai identity + progress + skip */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6, paddingHorizontal: 20, paddingBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <KaiOrb size={28} />
          <T size={15} weight="bold">Kai</T>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <T size={11} c={color.muted}>Setting up · 1 of 4</T>
          <Pressable
            testID="skip-onboarding"
            accessibilityRole="button"
            accessibilityLabel="Skip for now"
            hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
            onPress={() => router.push('/goal')}
            style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, borderWidth: 0.5, borderColor: alpha.ivory20 }}
          >
            <T size={11} c={color.muted}>Skip for now</T>
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 8, paddingHorizontal: 18, gap: 12 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <KaiBubble size={15} maxWidth={350}>{`Hey${name} — I'm Kai. What are you here to do first?`}</KaiBubble>

        <View style={{ gap: 10 }}>
          {MODES.map((m) => (
            <ChoiceCard
              key={m.key}
              testID={`mode-${m.key}`}
              title={m.title}
              sub={m.sub}
              Icon={m.Icon}
              selected={draft.goal_mode === m.key}
              onPress={() => pickMode(m)}
            />
          ))}
        </View>

        {echo ? (
          <>
            <UserBubble maxWidth={328}>{echo}</UserBubble>
            <KaiBubble size={15} maxWidth={350}>
              Got it — small and careful. Practicing first, or connecting an account?
            </KaiBubble>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <Chip testID="funding-paper" label="Start with paper trading" selected onPress={() => pickFunding('paper')} />
              <Chip
                testID="funding-broker"
                label="Connect my broker"
                onPress={() => pickFunding('broker')}
                accessibilityHint="Broker connections open in a later release — you'll start on paper either way."
              />
              <Chip testID="funding-later" label="Decide later" muted onPress={() => pickFunding('later')} />
            </View>
          </>
        ) : null}
      </ScrollView>

      <View style={{ paddingTop: 10, paddingHorizontal: 18, paddingBottom: 40 }}>
        <Composer placeholder="Type or talk to Kai…" disabled onSend={() => {}} />
      </View>
    </Screen>
  );
}
