import React from 'react';
import { View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { T, Num } from '../../ui/Text';
import { ObjectCard } from '../../ui/Panel';
import { Button, Tag } from '../../ui/Button';
import { ProgressBars } from '../../ui/Progress';
import { Check } from '../../ui/Icons';
import { alpha, color, radius } from '../../ui/tokens';
import { capFor, useOnboardingDraft } from '../../lib/session';
import type { RiskAnswer } from '../../lib/types';

/**
 * S02-Risk.html — risk chosen by example, not by jargon.
 * Round 4: the involvement question is gone — the plan step states the rule
 * plainly ("Nothing reaches a broker without your confirmation"), which is
 * `hands_on`, and one screen asking one thing beats two half-questions.
 *
 * The dollar figures are the POINT of this screen, so they are the person's own
 * money, not a teaching example: every cap is `capFor` against the practice
 * balance in the draft. The artboard's "$2,000 account" numbers survive as the
 * ratios inside `RISK_EXAMPLES`.
 */
const RISKS: { key: RiskAnswer; title: string; tag?: string }[] = [
  { key: 'careful', title: 'Careful' },
  { key: 'balanced', title: 'Balanced' },
  { key: 'aggressive', title: 'Aggressive', tag: 'Higher swings' },
];

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

export default function Risk() {
  const router = useRouter();
  const { draft, set } = useOnboardingDraft();
  const risk = draft.risk_answer ?? 'balanced';
  const account = usd(draft.starting_balance);

  return (
    <Screen variant="corner" layout="stack" testID="screen-risk">
      <ProgressBars total={4} done={2} />
      <T size={27} weight="bold" ls={-0.4} lh={32}>How much risk feels right?</T>
      <T size={14} c={color.muted} style={{ marginTop: 8 }}>
        {`Real examples, not jargon. This sets your daily loss cap on the ${account} you'll practice with.`}
      </T>

      <View style={{ gap: 10, marginTop: 22 }}>
        {RISKS.map(({ key, title, tag }) => {
          const on = risk === key;
          const cap = capFor(key, draft.starting_balance);
          return (
            <Pressable
              key={key}
              testID={`risk-${key}`}
              accessibilityRole="button"
              accessibilityLabel={`${title}. On ${account}, a bad day costs about ${usd(cap)}.`}
              accessibilityState={{ selected: on }}
              onPress={() => set({ risk_answer: key })}
            >
              <ObjectCard tone={on ? 'volt' : 'default'} r={radius.xl} style={{ paddingVertical: 14, paddingHorizontal: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                    <T size={15} weight="bold">{title}</T>
                    {tag ? <Tag label={tag} c={color.gold} border={alpha.gold50} /> : null}
                  </View>
                  {on ? <Check size={16} color={color.volt} strokeWidth={2.6} /> : null}
                </View>
                <T size={12} c={color.muted} style={{ marginTop: 3 }}>
                  On {account}, a bad day costs about <T size={12} weight="bold" c={color.text}>{usd(cap)}</T>.
                </T>
              </ObjectCard>
            </Pressable>
          );
        })}
      </View>

      {/* What the choice actually produced — the cap in their own money, and
          the honest state of the account it applies to. */}
      <View
        testID="risk-summary"
        style={{
          marginTop: 18, borderRadius: radius.xl, paddingVertical: 13, paddingHorizontal: 15,
          backgroundColor: alpha.ivory06, borderWidth: 0.5, borderColor: alpha.ivory16, gap: 7,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <T size={13} c={color.muted}>Daily loss cap</T>
          <Num size={13} weight="semibold" c={color.gold} testID="risk-cap">{usd(capFor(risk, draft.starting_balance))}</Num>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <T size={13} c={color.muted}>Practice mode</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color.cyan }} />
            <T size={13} c={color.cyan}>Paper trading on</T>
          </View>
        </View>
      </View>

      <View style={{ flex: 1 }} />

      <Button
        testID="cta-continue"
        label="Continue"
        height={52}
        arrow
        onPress={() => { set({ risk_answer: risk, involvement: 'hands_on' }); router.push('/personalize'); }}
      />
    </Screen>
  );
}
