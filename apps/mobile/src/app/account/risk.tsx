/**
 * RISK, ASKED WHERE IT MEANS SOMETHING.
 *
 * This is the route half of `features/onboarding/risk-gate.ts`, whose header
 * carries the whole argument for why the question moved out of signup: the cap
 * it sets is enforced by the server on every paper order
 * (`RISK_LIMIT_DAILY_LOSS`), so asked in front of an order it is a question with
 * a visible consequence, and asked during signup it was a quiz about an account
 * that did not exist yet.
 *
 * WHY IT LIVES UNDER `account/` AND NOT `(onboarding)/`. The onboarding group is
 * closed to a member who has finished it — `app/_layout.tsx` bounces them to
 * Home — so `(onboarding)/risk.tsx` is unreachable at exactly the moment this
 * question is worth asking. `account` is already a stack group, so this needs no
 * change to the route gate. Both routes mount the SAME component and differ only
 * in who writes the answer: during signup it rides in the draft to
 * `POST /onboarding/complete`, and here `RiskSetup` posts to
 * `POST /onboarding/risk` itself, because there is no completion request left to
 * carry it. Omitting `onDone` is what selects that.
 *
 * WHY NOTHING IS PRE-SELECTED, EVEN FOR SOMEBODY WHO ALREADY CHOSE.
 * `RiskAnswer` is not stored. What survives the choice is `risk_policy` — a
 * daily cap and a position percentage — and reading an answer back out of those
 * numbers means guessing which of three levels produced them. This app does not
 * guess at a fact it can state instead, so the current cap is printed as the
 * fact it is and the three levels are offered unselected. A member comparing the
 * printed cap against the caps on the cards can see where they stand without
 * being told something the server never said.
 */
import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { StackHeader } from '../../ui/StackHeader';
import { ScreenLoading } from '../../ui/Loading';
import { T } from '../../ui/Text';
import { color } from '../../ui/tokens';
import { useMe } from '../../features/account/useAccount';
import { RiskSetup } from '../../features/onboarding/RiskSetup';
import {
  RISK_BEFORE_ORDER_SUB,
  RISK_BEFORE_ORDER_TITLE,
  RISK_DEFAULT_NOTE,
  needsRiskSetup,
} from '../../features/onboarding/risk-gate';

const usd = (n: number | null | undefined) =>
  n == null ? null : `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

export default function AccountRisk() {
  const router = useRouter();
  const me = useMe();

  /**
   * The balance the caps are a percentage of. `RiskSetup` teaches by showing the
   * cap in the member's own money, so a wrong number here is worse than a late
   * one — it would explain a limit that is not the limit. `starting_balance` is
   * the figure the practice account was opened with, which is what the caps were
   * computed against; equity moves with open positions and would make the same
   * level read differently on two days.
   */
  const balance = me.data?.paper?.starting_balance ?? null;
  const cap = usd(me.data?.risk_policy?.daily_loss_cap);

  if (balance == null) {
    return (
      <Screen variant="corner" layout="stack" testID="screen-account-risk">
        <StackHeader title="Risk" onBack={() => router.back()} />
        <ScreenLoading label="Reading your practice account…" />
      </Screen>
    );
  }

  const unchosen = needsRiskSetup(me.data?.profile ?? null);

  return (
    <Screen variant="corner" layout="stack" testID="screen-account-risk">
      <StackHeader title="Risk" onBack={() => router.back()} />

      <View style={{ marginTop: 4 }}>
        <T size={27} weight="bold" ls={-0.4} lh={32}>
          {unchosen ? RISK_BEFORE_ORDER_TITLE : 'Your risk level'}
        </T>
        <T size={15} c={color.muted} style={{ marginTop: 8 }}>
          {unchosen ? RISK_BEFORE_ORDER_SUB : 'Change it whenever you like.'}
        </T>

        {/* The fact, not a guess at which card produced it. */}
        {cap ? (
          <T size={14} c={color.muted} style={{ marginTop: 10 }} testID="risk-current-cap">
            {`Today your daily cap is ${cap}. The server enforces it on every paper order.`}
          </T>
        ) : null}
        {unchosen ? (
          <T size={14} c={color.gold} style={{ marginTop: 6 }} testID="risk-default-note">
            {RISK_DEFAULT_NOTE}
          </T>
        ) : null}
      </View>

      {/*
        No `onDone`: the component posts to `POST /onboarding/risk` itself and
        surfaces a failure rather than swallowing it, because somebody pressed a
        button to set a limit and a silent failure would leave them believing a
        cap is in force that is not.
      */}
      <View style={{ marginTop: 22 }}>
        <RiskSetup
          balance={balance}
          value={null}
          onChange={() => {}}
          ctaLabel={unchosen ? 'Set my risk level' : 'Save this level'}
        />
      </View>
    </Screen>
  );
}
