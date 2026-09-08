import React from 'react';
import { View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { T } from '../../ui/Text';
import { ObjectCard } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { ProgressBars } from '../../ui/Progress';
import { Check } from '../../ui/Icons';
import { color, radius } from '../../ui/tokens';
import { useOnboardingDraft } from '../../lib/session';
import { START_OPTIONS } from '../../features/stage/labels';
import type { StartAnswer } from '../../lib/types';

/**
 * "Where are you right now?" — the one question the owner added to onboarding,
 * and the first thing the app asks.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY IT IS FIRST, AHEAD OF "WHAT DO YOU WANT TO DO?"
 * ─────────────────────────────────────────────────────────────────────────────
 * Because it is the question that changes the meaning of the others. The goal
 * screen offers Trade Today / Trade Over Time / Build My Portfolio, and which
 * of those a person should pick depends entirely on whether they have ever
 * placed a trade. Asked second, this would be checking up on an answer already
 * given; asked first, it lets the goal screen arrive pre-selected at something
 * sensible and lets the member simply agree.
 *
 * It is also the gentler order. A brand-new person meeting "what do you want to
 * do?" as the first screen of a trading app has to bluff; meeting "where are
 * you right now?" with "I'm brand new" as the first option is told immediately
 * that the answer is expected and provided for.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THE ANSWER DOES
 * ─────────────────────────────────────────────────────────────────────────────
 * It sets the starting readiness STAGE (0042) — the tag that shows beside their
 * name and the thing Training Mode then moves. The full mapping is
 * `START_PLACEMENT` in `apps/api/src/lib/stage/rules.ts`, on the server,
 * because placement and evolution have to agree about what a rung means:
 *
 *   I'm brand new                    -> beginner    · invest    · Beginners room
 *   I invest but don't really trade  -> beginner    · invest    · Beginners room
 *   I swing trade                    -> developing  · swing     · Swing room
 *   I actively trade                 -> trade_ready · day_trade · Day Trade room
 *
 * THE MODE IS A DEFAULT AND NOT A DECISION. This screen writes `goal_mode` into
 * the draft as a pre-selection, and the very next screen asks about it out
 * loud — so somebody brand new who nonetheless wants to day trade says so one
 * tap later and is believed. The server deliberately does not overwrite
 * `primary_mode` from this answer for that reason.
 *
 * THE STAGE IS A FLOOR AND NOT A CEILING. Automatic evolution only ever
 * promotes, so an answer that places somebody low costs them nothing they
 * cannot earn back in Training, and an honest "I'm brand new" is never punished
 * by the app.
 *
 * NOTHING IS WRITTEN HERE. Like every step before the last one, the answer sits
 * in the in-memory draft until `POST /onboarding/complete` accepts the lot.
 */
const MODE_FOR: Record<StartAnswer, 'day_trade' | 'swing' | 'invest'> = {
  brand_new: 'invest',
  investor: 'invest',
  swing: 'swing',
  active: 'day_trade',
};

export default function Start() {
  const router = useRouter();
  const { draft, set } = useOnboardingDraft();
  // No pre-selection. Every other onboarding screen defaults to something
  // reasonable, and this one must not: the whole value of the answer is that
  // the member gave it, and a pre-ticked "I swing trade" would place a beginner
  // two rungs up if they simply pressed Continue.
  const selected = draft.start_answer;

  return (
    <Screen variant="corner" layout="stack" testID="screen-start">
      <ProgressBars total={6} done={1} />
      <T size={27} weight="bold" ls={-0.4} lh={32}>Where are you right now?</T>
      <T size={14} c={color.muted} style={{ marginTop: 8 }}>
        So the app meets you where you are. This changes as you learn — it is not a label you are stuck with.
      </T>

      <View style={{ gap: 12, marginTop: 26, flex: 1 }}>
        {START_OPTIONS.map(({ key, title, sub }) => {
          const on = selected === key;
          return (
            <Pressable
              key={key}
              testID={`start-${key}`}
              accessibilityRole="button"
              accessibilityLabel={`${title}. ${sub}`}
              accessibilityState={{ selected: on }}
              onPress={() => set({ start_answer: key, goal_mode: MODE_FOR[key] })}
            >
              <ObjectCard
                tone={on ? 'volt' : 'default'}
                r={radius.xxxl}
                style={{ padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14 }}
              >
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

      <Button
        testID="cta-continue"
        label="Continue"
        height={52}
        arrow
        // Disabled until they answer. This is the one screen where continuing
        // without choosing would silently mean something, so it refuses to.
        disabled={!selected}
        onPress={() => {
          if (!selected) return;
          set({ start_answer: selected, goal_mode: MODE_FOR[selected] });
          router.push('/goal');
        }}
      />
    </Screen>
  );
}
