import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
import { T, Num } from '../../ui/Text';
import { ObjectCard } from '../../ui/Panel';
import { Button, Tag } from '../../ui/Button';
import { Check } from '../../ui/Icons';
import { alpha, color, radius } from '../../ui/tokens';
import { capFor } from '../../lib/session';
import { confirmRisk } from './api';
import type { RiskAnswer } from '../../lib/types';

/**
 * "How much risk feels right?" — the screen, extracted from its route.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY IT IS A COMPONENT AND NOT JUST A SCREEN
 * ─────────────────────────────────────────────────────────────────────────────
 * Audit F01 moved this question out of signup and in front of the first paper
 * order, where its dollar figures describe an account that exists. The screen
 * itself is good and does not change; where it is MOUNTED does.
 *
 * Today it is mounted by `(onboarding)/risk.tsx`. The `(onboarding)` group is
 * closed to a member who has finished signup — `src/app/_layout.tsx` bounces it
 * to Home — so the order flow cannot link to `/risk` afterwards. Mounting this
 * component at a route the gate allows is the one wiring step this lane could
 * not take: `app/order/**`, `app/account/**` and `_layout.tsx` belong to other
 * lanes this wave.
 *
 * Everything else is done. `needsRiskSetup(profile)` in `risk-gate.ts` answers
 * whether to ask, `POST /api/v1/onboarding/risk` records the answer and the
 * journal row, and this component takes both paths:
 *
 *     onDone omitted  → it posts the answer itself and reports the result
 *     onDone given    → the caller decides what happens next (during signup,
 *                       the answer rides in the draft to /onboarding/complete)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DOLLARS ARE THE POINT
 * ─────────────────────────────────────────────────────────────────────────────
 * Every cap is `capFor` against the member's own practice balance, not a
 * teaching example. The artboard's "$2,000 account" numbers survive as the
 * ratios inside `RISK_EXAMPLES`; what is printed is what a bad day costs THEM.
 * That is the whole reason the question belongs next to an account rather than
 * next to a signup form.
 */
const RISKS: { key: RiskAnswer; title: string; tag?: string }[] = [
  { key: 'careful', title: 'Careful' },
  { key: 'balanced', title: 'Balanced' },
  { key: 'aggressive', title: 'Aggressive', tag: 'Higher swings' },
];

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

export type RiskSetupProps = {
  /** The practice balance the caps are a percentage of. */
  balance: number;
  /** Pre-selection. Null shows `balanced`, which is the neutral default. */
  value: RiskAnswer | null;
  onChange: (answer: RiskAnswer) => void;
  /**
   * What the primary button does. Omit it and the component posts the answer to
   * `POST /onboarding/risk` itself — which is what a caller in front of a paper
   * order wants, because there is no completion request left to carry it.
   */
  onDone?: (answer: RiskAnswer) => void;
  ctaLabel?: string;
};

export function RiskSetup({ balance, value, onChange, onDone, ctaLabel = 'Continue' }: RiskSetupProps) {
  const risk = value ?? 'balanced';
  const account = usd(balance);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const press = async () => {
    if (onDone) { onDone(risk); return; }
    setError(null);
    setBusy(true);
    try {
      await confirmRisk(risk);
    } catch (e) {
      // This one DOES surface. Unlike a prefill, somebody pressed a button to
      // set a limit, and silently failing would leave them believing a cap is
      // in force that is not.
      const plain = (e as { plain?: string })?.plain;
      setError(plain ?? 'We could not save that. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <View style={{ gap: 10 }}>
        {RISKS.map(({ key, title, tag }) => {
          const on = risk === key;
          const cap = capFor(key, balance);
          return (
            <Pressable
              key={key}
              testID={`risk-${key}`}
              accessibilityRole="button"
              accessibilityLabel={`${title}. On ${account}, a bad day costs about ${usd(cap)}.`}
              accessibilityState={{ selected: on }}
              onPress={() => onChange(key)}
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
          <Num size={13} weight="semibold" c={color.gold} testID="risk-cap">{usd(capFor(risk, balance))}</Num>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <T size={13} c={color.muted}>Practice mode</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color.cyan }} />
            <T size={13} c={color.cyan}>Paper trading on</T>
          </View>
        </View>
      </View>

      {error ? <T size={12} c={color.red} align="center" style={{ marginTop: 12 }}>{error}</T> : null}

      <View style={{ flex: 1 }} />

      <Button testID="cta-continue" label={ctaLabel} height={52} arrow loading={busy} onPress={() => { void press(); }} />
    </>
  );
}
