import React, { useState } from 'react';
import { View, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { T } from '../../ui/Text';
import { Button } from '../../ui/Button';
import { ProgressBars } from '../../ui/Progress';
import { KaiOrb } from '../../ui/KaiOrb';
import { Check } from '../../ui/Icons';
import { alpha, color, radius } from '../../ui/tokens';
import { api } from '../../lib/api';
import { capFor, clampBalance, useOnboardingDraft, useSession } from '../../lib/session';
import { EXPERIENCE_TO_LEVEL, EXPERIENCE_VOICE, MODE_LABEL, focusList } from '../../features/account/profile';

/**
 * Onboarding 4 of 4 — prototype board "Onboarding plan".
 *
 * Kai states how he will work, in his own voice, using the answers just given:
 * the mode, the focus list, the person's own daily cap, and the voice line
 * their experience level produced. Then the honest rows — no broker, paper on,
 * briefing time — and the one action.
 */
const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

function Line({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', gap: 11, alignItems: 'flex-start' }}>
      <View style={{ marginTop: 2 }}><Check size={16} color={color.violetLight} strokeWidth={2.4} /></View>
      <T size={14} lh={21} style={{ flex: 1 }}>{children}</T>
    </View>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 9 }}>
      <T size={13} c={color.muted}>{label}</T>
      {children}
    </View>
  );
}

export default function KaiPlan() {
  const router = useRouter();
  const { draft } = useOnboardingDraft();
  const { patchProfile, refreshProfile } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mode = draft.goal_mode ?? 'day_trade';
  const cap = capFor(draft.risk_answer, draft.starting_balance);
  const focusShort = focusList(draft.focus);

  const start = async () => {
    setError(null);
    setBusy(true);
    try {
      if (api.available()) {
        await api.completeOnboardingRound4({
          goal_mode: mode,
          starting_balance: clampBalance(draft.starting_balance),
          risk_answer: draft.risk_answer ?? 'balanced',
          involvement: draft.involvement ?? 'hands_on',
          experience: draft.experience,
          focus: draft.focus,
          practice_choice: 'paper',
        });
        await patchProfile({
          primary_mode: mode,
          involvement: draft.involvement ?? 'hands_on',
          experience: EXPERIENCE_TO_LEVEL[draft.experience],
        });
        // `onboarding.completed` is written by the server, and the route gate
        // reads it — without this refresh the gate bounces straight back here.
        await refreshProfile();
      }
      router.replace('/home');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We could not save your setup. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen variant="dome" layout="stack" testID="screen-kai-plan">
      <ProgressBars total={4} done={4} />

      <View style={{ alignItems: 'center', gap: 14 }}>
        <KaiOrb size={62} />
        <T size={22} weight="bold" align="center" lh={29}>{'Here\'s how I\'ll\nwork for you'}</T>
      </View>

      <ScrollView style={{ flex: 1, marginTop: 24 }} contentContainerStyle={{ gap: 13 }} showsVerticalScrollIndicator={false}>
        <Line>
          I grade <T size={14} lh={21} weight="bold">{MODE_LABEL[mode]}</T> setups across {focusShort} before you look.
        </Line>
        <Line>
          Every idea leads with what it risks — <T size={14} lh={21} weight="bold">{usd(cap)}</T> is your daily ceiling.
        </Line>
        <Line>{EXPERIENCE_VOICE[draft.experience]}</Line>
        <Line>
          Nothing reaches a broker <T size={14} lh={21} weight="bold">without your confirmation</T>.
        </Line>

        <View
          testID="plan-rows"
          style={{ marginTop: 8, borderRadius: radius.xl, paddingVertical: 5, paddingHorizontal: 16, backgroundColor: alpha.ivory04, borderWidth: 0.5, borderColor: alpha.ivory14 }}
        >
          <Row label="Brokerage">
            <T size={13} weight="semibold">Connect later</T>
          </Row>
          <Row label="Practice mode">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color.cyan }} />
              <T size={12.5} c={color.cyan}>Paper trading on</T>
            </View>
          </Row>
          <Row label="Morning briefing">
            <T size={13} weight="semibold">9:15 AM ET</T>
          </Row>
        </View>

        {error ? <T size={12} c={color.red} align="center">{error}</T> : null}
      </ScrollView>

      <Button testID="cta-start" label="Start with Kai" height={52} arrow loading={busy} onPress={() => { void start(); }} />
      <T size={11.5} c={color.muted} align="center" style={{ marginTop: 10 }}>Connect a brokerage anytime in Account</T>
    </Screen>
  );
}
