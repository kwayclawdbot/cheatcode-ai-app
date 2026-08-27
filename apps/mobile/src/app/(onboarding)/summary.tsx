import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { T, Num } from '../../ui/Text';
import { KaiOrb } from '../../ui/KaiOrb';
import { ObjectCard } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { Field } from '../../ui/Field';
import { Sheet } from '../../ui/Sheet';
import { ProgressBars } from '../../ui/Progress';
import { Check, ChevronRight } from '../../ui/Icons';
import { alpha, color, radius } from '../../ui/tokens';
import {
  BALANCE_CHOICES,
  BALANCE_MAX,
  BALANCE_MIN,
  RISK_EXAMPLES,
  capFor,
  clampBalance,
  useOnboardingDraft,
  useSession,
} from '../../lib/session';
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

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/** One row of the summary card — label left, value right, artboard's 13px rhythm. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <T size={13} c={color.muted}>{label}</T>
      {children}
    </View>
  );
}

/** S03-Summary.html → POST /api/v1/onboarding/complete → tap-to-learn. */
export default function Summary() {
  const router = useRouter();
  const { draft, set } = useOnboardingDraft();
  const { patchProfile } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [custom, setCustom] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);

  const balance = draft.starting_balance;
  const cap = capFor(draft.risk_answer, balance);

  const choose = (amount: number) => {
    set({ starting_balance: clampBalance(amount) });
    setCustom('');
    setCustomError(null);
    setPicking(false);
  };

  const useCustom = () => {
    const parsed = Number(custom.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setCustomError('Type an amount, like 7500.');
      return;
    }
    if (parsed < BALANCE_MIN || parsed > BALANCE_MAX) {
      setCustomError(`Practice accounts run from ${usd(BALANCE_MIN)} to ${usd(BALANCE_MAX)}.`);
      return;
    }
    choose(parsed);
  };

  const start = async () => {
    setError(null);
    setBusy(true);
    try {
      if (api.available()) {
        await api.completeOnboarding({
          goal_mode: draft.goal_mode ?? 'day_trade',
          starting_balance: clampBalance(balance),
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
          {/* The one line on this screen the person can still change, so it is
              volt and it is first. Everything under it is derived from it. */}
          <Pressable
            testID="row-practice-money"
            accessibilityRole="button"
            accessibilityLabel={`Practice money, ${usd(balance)}. Change it.`}
            onPress={() => setPicking(true)}
            hitSlop={{ top: 6, bottom: 6 }}
          >
            <Row label="Practice money">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Num testID="practice-money-value" size={13} c={color.volt}>{usd(balance)}</Num>
                <ChevronRight size={13} color={color.volt} />
              </View>
            </Row>
          </Pressable>
          <Row label="Daily loss cap">
            <Num testID="daily-cap-value" size={13} c={color.gold}>{usd(cap)}</Num>
          </Row>
          <Row label="Practice mode">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color.cyan }} />
              <T size={13} c={color.cyan}>Paper trading on</T>
            </View>
          </Row>
          <Row label="Focus">
            <T size={13}>{FOCUS_LABEL[draft.goal_mode ?? 'day_trade']}</T>
          </Row>
          <Row label="Risk style">
            <T size={13}>{RISK_EXAMPLES[draft.risk_answer ?? 'balanced'].title}</T>
          </Row>
        </ObjectCard>

        {error ? <T size={12} c={color.red}>{error}</T> : null}
        {!api.available() && !env.FIXTURES ? (
          <T size={11} c={color.muted}>Your answers are saved on this device until the service is connected.</T>
        ) : null}
      </View>

      <Button testID="cta-start" label="Start with Kai" height={52} arrow loading={busy} onPress={start} />

      <Sheet
        testID="sheet-practice-money"
        visible={picking}
        onClose={() => setPicking(false)}
        title="How much practice money?"
      >
        <T size={13} lh={19} c={color.muted}>
          Practice money is not real. Pick an amount that makes the numbers mean something to you — you can change it later in Account.
        </T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 }}>
          {BALANCE_CHOICES.map((amount) => {
            const on = amount === balance;
            return (
              <Pressable
                key={amount}
                testID={`balance-${amount}`}
                accessibilityRole="button"
                accessibilityLabel={usd(amount)}
                accessibilityState={{ selected: on }}
                onPress={() => choose(amount)}
                style={{
                  minHeight: 44,
                  paddingHorizontal: 16,
                  justifyContent: 'center',
                  borderRadius: radius.pill,
                  borderWidth: on ? 1 : 0.5,
                  borderColor: on ? alpha.volt60 : alpha.ivory16,
                  backgroundColor: on ? alpha.volt10 : alpha.surface50,
                }}
              >
                <Num size={14} weight={on ? 'semibold' : 'regular'} c={on ? color.volt : color.muted}>
                  {usd(amount)}
                </Num>
              </Pressable>
            );
          })}
        </View>

        <View style={{ gap: 8, marginTop: 4 }}>
          <Field
            testID="balance-custom"
            label="Or type your own"
            value={custom}
            onChangeText={(t) => { setCustom(t); setCustomError(null); }}
            onSubmitEditing={useCustom}
            keyboardType="number-pad"
            inputMode="numeric"
            returnKeyType="done"
            placeholder="7500"
            error={customError}
          />
          <Button testID="balance-custom-save" label="Use this amount" height={48} onPress={useCustom} />
        </View>

        <T size={11} c={color.dim}>
          {`Anything from ${usd(BALANCE_MIN)} to ${usd(BALANCE_MAX)}.`}
        </T>
      </Sheet>
    </Screen>
  );
}
