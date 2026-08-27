import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { T, Num } from '../../ui/Text';
import { KaiOrb } from '../../ui/KaiOrb';
import { ObjectCard } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { ProgressBars } from '../../ui/Progress';
import { Check } from '../../ui/Icons';
import { color, radius } from '../../ui/tokens';
import { RISK_EXAMPLES, capFor, useOnboardingDraft, useSession } from '../../lib/session';
import { api } from '../../lib/api';
import { env } from '../../lib/env';

const PROMISES = [
  ['I watch the market and grade setups ', 'before you ever look', '.'],
  ['You always get ', 'one clear next action', ' in plain English.'],
  ['Every idea shows ', 'its risk first', ' — what fails it and what it costs.'],
  ['Nothing touches real money ', 'without your confirmation', '.'],
];

const FOCUS_LABEL: Record<string, string> = {
  day_trade: 'Trade Today',
  swing: 'Trade Over Time',
  invest: 'Build My Portfolio',
};

/** S03-Summary.html → POST /api/v1/onboarding/complete → tap-to-learn. */
export default function Summary() {
  const router = useRouter();
  const { draft } = useOnboardingDraft();
  const { patchProfile } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cap = capFor(draft.risk_answer, draft.starting_balance);

  const start = async () => {
    setError(null);
    setBusy(true);
    try {
      if (api.available()) {
        await api.completeOnboarding({
          goal_mode: draft.goal_mode ?? 'day_trade',
          starting_balance: draft.starting_balance,
          risk_answer: draft.risk_answer ?? 'balanced',
          involvement: draft.involvement ?? 'hands_on',
          experience: draft.experience,
          practice_choice: draft.funding === 'later' ? 'decide_later' : (draft.funding ?? 'paper'),
        });
        await patchProfile({ primary_mode: draft.goal_mode ?? 'day_trade', involvement: draft.involvement ?? 'hands_on' });
      }
      router.push('/learn');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We could not save your setup. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen variant="dome" layout="stack" testID="screen-summary">
      <ProgressBars total={3} done={3} />

      <View style={{ alignItems: 'center', gap: 14, marginBottom: 22 }}>
        <KaiOrb size={64} />
        <T size={24} weight="bold" align="center" lh={30}>{'Here\'s how we\'ll\nwork together'}</T>
      </View>

      <View style={{ gap: 12, flex: 1 }}>
        {PROMISES.map(([a, b, c], i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            <View style={{ marginTop: 2 }}><Check size={17} color={color.violetLight} strokeWidth={2.4} /></View>
            <T size={14} lh={21} style={{ flex: 1 }}>
              {a}<T size={14} lh={21} weight="bold">{b}</T>{c}
            </T>
          </View>
        ))}

        <ObjectCard r={radius.xl} style={{ marginTop: 10, paddingVertical: 14, paddingHorizontal: 16, gap: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T size={13} c={color.muted}>Daily loss cap</T>
            <Num size={13} c={color.gold}>{`$${cap}`}</Num>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T size={13} c={color.muted}>Practice mode</T>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color.cyan }} />
              <T size={13} c={color.cyan}>Paper trading on</T>
            </View>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T size={13} c={color.muted}>Focus</T>
            <T size={13}>{FOCUS_LABEL[draft.goal_mode ?? 'day_trade']}</T>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T size={13} c={color.muted}>Risk style</T>
            <T size={13}>{RISK_EXAMPLES[draft.risk_answer ?? 'balanced'].title}</T>
          </View>
        </ObjectCard>

        {error ? <T size={12} c={color.red}>{error}</T> : null}
        {!api.available() && !env.FIXTURES ? (
          <T size={11} c={color.muted}>Your answers are saved on this device until the service is connected.</T>
        ) : null}
      </View>

      <Button testID="cta-start" label="Start with Kai" height={52} arrow loading={busy} onPress={start} />
    </Screen>
  );
}
