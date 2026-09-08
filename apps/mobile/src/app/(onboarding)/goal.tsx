import React from 'react';
import { View, Pressable, ScrollView } from 'react-native';
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
import { EXPERIENCE_CONSEQUENCE, GUIDANCE_LABEL } from '../../features/account/profile';
import { STEP_ROUTE, STEP_TOTAL, stepNumber } from '../../features/onboarding/steps';
import { GUIDANCE_FOR_PLACEMENT } from '../../features/onboarding/steps';
import type { Experience, GoalMode } from '../../lib/types';

/**
 * Step 2 of 3 — the goal and the guidance, on ONE screen.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THEY ARE TOGETHER NOW
 * ─────────────────────────────────────────────────────────────────────────────
 * Audit F01 asked for it in six words: "Confirm the goal and guidance in one
 * short step." They used to be two screens with another one between them, and
 * the second of the two — "How much have you traded?" — was the placement
 * question asked again in different words. Somebody who had just said "I'm
 * brand new" on step 1 was asked to say it again on step 4.
 *
 * The audit's separation page is why that was worse than repetitive. GOAL is
 * what you are here to do. GUIDANCE is how much Kai explains. READINESS is what
 * you have demonstrated. Three different things, and asking guidance in the
 * vocabulary of readiness taught members they were the same thing — which the
 * app then contradicted, because an active trader could be placed Trade Ready
 * while the draft experience stayed New.
 *
 * So step 1 asks readiness once. This screen asks the two preferences, both
 * pre-selected from that answer, both changeable in one tap, and both said in
 * the words that describe their EFFECT rather than the member. `GUIDANCE_LABEL`
 * in `features/account/profile.ts` already carried those words — Explain
 * everything / Plain language / Straight to the numbers — and the header there
 * makes the same argument at length.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DAY TRADE IS MARKED AND IS NOT THE DEFAULT
 * ─────────────────────────────────────────────────────────────────────────────
 * Both facts come from `features/nav/second-tab.ts`, so this screen cannot
 * disagree with the tab about what is running. The pre-selection arrives from
 * step 1's placement; the `'swing'` fallback below is for anybody who reaches
 * this screen without one, and it is Swing because Swing is the mode that is
 * actually live.
 *
 * PRESSING CONTINUE HERE IS WHAT MARKS THE STEP DONE. `confirmed_goal` is the
 * one flag in the draft that is not an answer, and it exists because both
 * answers on this screen arrive pre-filled: their being set proves nothing
 * about whether a human ever saw this screen. Without it, a resumed signup
 * would skip step 2 for somebody who never reached it.
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

const GUIDANCE_ORDER: Experience[] = ['new', 'some', 'pro'];

export default function Goal() {
  const router = useRouter();
  const { draft, set } = useOnboardingDraft();

  const mode = draft.goal_mode ?? 'swing';
  // The placement's guidance, or the gentlest option for somebody who somehow
  // got here without a placement. Never `pro` by default: see the argument in
  // `GUIDANCE_FOR_PLACEMENT`.
  const guidance = draft.guidance ?? (draft.start_answer ? GUIDANCE_FOR_PLACEMENT[draft.start_answer] : 'new');

  return (
    <Screen variant="corner" layout="stack" testID="screen-goal">
      <ProgressBars total={STEP_TOTAL} done={stepNumber('goal')} />
      <T size={27} weight="bold" ls={-0.4} lh={32}>What do you want to do?</T>
      <T size={14} c={color.muted} style={{ marginTop: 8 }}>
        Pick your main focus and how much Kai explains. Both change any time.
      </T>

      <ScrollView style={{ flex: 1, marginTop: 22 }} contentContainerStyle={{ gap: 22, paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
        <View style={{ gap: 12 }}>
          {GOALS.map(({ key, title, sub, Icon }) => {
            const on = mode === key;
            return (
              <Pressable
                key={key}
                testID={`goal-${key}`}
                accessibilityRole="button"
                accessibilityLabel={`${title}. ${sub}`}
                accessibilityState={{ selected: on }}
                onPress={() => set({ goal_mode: key })}
              >
                <ObjectCard tone={on ? 'volt' : 'default'} r={radius.xxxl} style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
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

        <View>
          <T size={12} weight="bold" ls={0.84} c={color.muted} style={{ marginBottom: 10 }}>HOW MUCH SHOULD KAI EXPLAIN?</T>
          <View style={{ gap: 8 }}>
            {GUIDANCE_ORDER.map((key) => {
              const on = guidance === key;
              return (
                <Pressable
                  key={key}
                  testID={`guidance-${key}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${GUIDANCE_LABEL[key]}. ${EXPERIENCE_CONSEQUENCE[key]}`}
                  accessibilityState={{ selected: on }}
                  onPress={() => set({ guidance: key })}
                >
                  <ObjectCard tone={on ? 'volt' : 'default'} r={15} style={{ paddingVertical: 12, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <T size={15} weight="bold">{GUIDANCE_LABEL[key]}</T>
                      <T size={12.5} c={color.muted} style={{ marginTop: 2 }}>{EXPERIENCE_CONSEQUENCE[key]}</T>
                    </View>
                    {on ? <Check size={16} color={color.volt} strokeWidth={2.6} /> : null}
                  </ObjectCard>
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>

      <Button
        testID="cta-continue"
        label="Continue"
        height={52}
        arrow
        onPress={() => {
          set({ goal_mode: mode, guidance, confirmed_goal: true });
          router.push(STEP_ROUTE.plan);
        }}
      />
    </Screen>
  );
}
