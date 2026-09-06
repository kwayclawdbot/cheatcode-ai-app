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
import { modeBadge, modeIsLive } from '../../features/nav/second-tab';
import { ComingSoonPill } from '../../features/home/ModeSheet';
import type { GoalMode } from '../../lib/types';

/**
 * S01-Goal.html.
 * Invest is a real mode now: it sets mode=invest, and the second tab becomes
 * the research desk rather than today's alerts. What is still a later release
 * is Kai placing the trades — Home says so, and it never dead-ends.
 *
 * DAY TRADE IS MARKED, AND IS NO LONGER THE DEFAULT. The same-day picker is
 * not publishing, so this screen used to put a brand-new account into the one
 * mode with nothing in it before they had touched anything. It is still
 * offered and still selectable — somebody who wants it should be allowed to
 * say so, and the tab then tells them where it stands — but the pre-selection
 * moved to Swing, which is live. Both facts come from `nav/second-tab.ts`, so
 * this screen cannot disagree with the tab about what is running.
 */
const GOALS: { key: GoalMode; title: string; sub: string; Icon: React.ComponentType<{ size?: number; color?: string }> }[] = [
  // "Kai is not calling these yet" was true while the mode was archived and is
  // not any more: the unusual-options-activity engine publishes same-day alerts
  // into this lane. The line now says what the mode is rather than apologising
  // for it — and says that it is selective, because a person who picks this and
  // then sees nothing on a quiet day should have been told that here.
  { key: 'day_trade', title: 'Trade Today', sub: 'Enter and exit in one day. Alerts only on the days the setup appears.', Icon: Bolt },
  { key: 'swing', title: 'Trade Over Time', sub: 'Hold opportunities for days or weeks.', Icon: Calendar },
  { key: 'invest', title: 'Build My Portfolio', sub: 'Grow long-term wealth with less involvement.', Icon: Bars },
];

export default function Goal() {
  const router = useRouter();
  const { draft, set } = useOnboardingDraft();
  // Was `day_trade`. A person who taps Continue without choosing lands in the
  // mode that is actually running, not in the one that says "not live yet".
  const selected = draft.goal_mode ?? 'swing';

  return (
    <Screen variant="corner" layout="stack" testID="screen-goal">
      <ProgressBars total={5} done={1} />
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
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <T size={17} weight="bold" c={modeIsLive(key) ? color.text : color.muted}>{title}</T>
                    {modeBadge(key) ? (
                      <ComingSoonPill label={modeBadge(key) as string} testID={`goal-soon-${key}`} />
                    ) : null}
                  </View>
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
