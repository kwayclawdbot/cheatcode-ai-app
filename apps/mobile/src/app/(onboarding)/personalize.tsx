import React from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { T } from '../../ui/Text';
import { Button } from '../../ui/Button';
import { alpha, color, radius } from '../../ui/tokens';
import { useOnboardingDraft } from '../../lib/session';
import { FOCUS_CHIP, FOCUS_ORDER, focusSummary } from '../../features/account/profile';
import type { FocusKey } from '../../lib/types';

/**
 * "What should Kai watch?" — OPTIONAL, and no longer a step.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT CHANGED HERE
 * ─────────────────────────────────────────────────────────────────────────────
 * This screen used to be step 4 of 6 and asked two things. The first — "How
 * much have you traded?" — is GONE, because it was the placement question from
 * step 1 asked a second time in different words, which is the first half of
 * audit F01. Guidance is now confirmed on step 2 beside the goal, in the words
 * that describe its effect rather than the member (`GUIDANCE_LABEL`).
 *
 * The second — the focus chips — survives, and it is worth keeping: it changes
 * what Kai scans first, which is a real effect and not a profile decoration.
 * What it is not is a thing worth standing between a stranger and the product.
 * F01: "Move focus and username to the moment they are useful." So it is a link
 * on the plan screen that somebody may ignore, and Account edits the same
 * setting afterwards through `PUT /settings`.
 *
 * NOTHING IS PRE-TICKED, which is the other correction. The draft used to start
 * at `['tech', 'ai']`, so a member who never opened this screen was recorded as
 * having asked Kai to watch big tech and semis — a preference nobody expressed,
 * stored in their profile. `focusList` already reads an empty list as "the
 * whole market", which is the truth about a member who has not answered.
 *
 * IT SAVES INTO THE DRAFT, not to the server, because it is reached before
 * `POST /onboarding/complete` runs — the plan screen sends `focus` with the
 * rest. The draft is on disk, so backing out of here and closing the app does
 * not lose the chips.
 */
export default function Personalize() {
  const router = useRouter();
  const { draft, set } = useOnboardingDraft();
  const focus = draft.focus;

  const toggle = (k: FocusKey) =>
    set({ focus: focus.includes(k) ? focus.filter((f) => f !== k) : [...focus, k] });

  const done = () => (router.canGoBack() ? router.back() : router.replace('/kai-plan'));

  return (
    <Screen variant="dome" layout="stack" testID="screen-personalize">
      <T size={26} weight="bold" ls={-0.4} lh={31}>What should Kai watch?</T>
      <T size={14} c={color.muted} style={{ marginTop: 8 }}>
        Optional. It changes what Kai looks at first, never what may be risked. Account edits it any time.
      </T>

      <ScrollView style={{ flex: 1, marginTop: 24 }} contentContainerStyle={{ gap: 20 }} showsVerticalScrollIndicator={false}>
        <View>
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

      <Button testID="cta-continue" label="Done" height={52} onPress={done} />
    </Screen>
  );
}
