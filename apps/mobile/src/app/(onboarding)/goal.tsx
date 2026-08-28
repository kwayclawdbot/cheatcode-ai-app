import React from 'react';
import { View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { T } from '../../ui/Text';
import { ObjectCard } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { ProgressBars } from '../../ui/Progress';
import { Bolt, Calendar, Bars, Check } from '../../ui/Icons';
import { alpha, color, radius } from '../../ui/tokens';
import { useOnboardingDraft } from '../../lib/session';
import type { GoalMode } from '../../lib/types';

/**
 * S01-Goal.html.
 * Invest is v1.1 in the backend — it is selectable, sets mode=invest, and Home
 * shows the honest "coming in a later release" state. It never dead-ends.
 */
const GOALS: { key: GoalMode; title: string; sub: string; Icon: React.ComponentType<{ size?: number; color?: string }> }[] = [
  { key: 'day_trade', title: 'Trade Today', sub: 'Enter and exit opportunities in one day.', Icon: Bolt },
  { key: 'swing', title: 'Trade Over Time', sub: 'Hold opportunities for days or weeks.', Icon: Calendar },
  { key: 'invest', title: 'Build My Portfolio', sub: 'Grow long-term wealth with less involvement.', Icon: Bars },
];

export default function Goal() {
  const router = useRouter();
  const { draft, set } = useOnboardingDraft();
  const selected = draft.goal_mode ?? 'day_trade';

  return (
    <Screen variant="corner" layout="stack" testID="screen-goal">
      <ProgressBars total={4} done={1} />
      <T size={27} weight="bold" ls={-0.4} lh={32}>What do you want to do?</T>
      <T size={14} c={color.muted} style={{ marginTop: 8 }}>Pick your main focus. You can switch anytime.</T>

      <View style={{ gap: 12, marginTop: 26, flex: 1 }}>
        {GOALS.map(({ key, title, sub, Icon }) => {
          const on = selected === key;
          return (
            <Pressable
              key={key}
              testID={`goal-${key}`}
              accessibilityRole="button"
              accessibilityLabel={`${title}. ${sub}`}
              accessibilityState={{ selected: on }}
              onPress={() => set({ goal_mode: key })}
            >
              <ObjectCard tone={on ? 'volt' : 'default'} r={radius.xxxl} style={{ padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: on ? alpha.volt14 : alpha.ivory06, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={20} color={on ? color.volt : color.muted} />
                </View>
                <View style={{ flex: 1 }}>
                  <T size={17} weight="bold">{title}</T>
                  <T size={13} c={color.muted} style={{ marginTop: 2 }}>{sub}</T>
                </View>
                {on ? <Check size={18} color={color.volt} strokeWidth={2.6} /> : null}
              </ObjectCard>
            </Pressable>
          );
        })}
      </View>

      <Button testID="cta-continue" label="Continue" height={52} arrow onPress={() => { set({ goal_mode: selected }); router.push('/risk'); }} />
    </Screen>
  );
}
