import React from 'react';
import { useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { T } from '../../ui/Text';
import { color } from '../../ui/tokens';
import { useOnboardingDraft } from '../../lib/session';
import { RiskSetup } from '../../features/onboarding/RiskSetup';
import { RISK_BEFORE_ORDER_SUB, RISK_BEFORE_ORDER_TITLE } from '../../features/onboarding/risk-gate';

/**
 * "How much risk feels right?" — NO LONGER A SIGNUP STEP.
 *
 * Audit F01: "Ask risk questions before paper execution." This was step 3 of
 * six, and it asked a stranger to pick a daily loss cap in dollars before they
 * had seen a price in the app or owned the account the dollars describe. The
 * screen teaches by example, in the member's own money — which is exactly why
 * asking it during signup wasted it.
 *
 * So signup finishes without it. `(onboarding)/kai-plan.tsx` completes with the
 * neutral `balanced` default and says on its face that nobody has chosen yet,
 * and `features/onboarding/risk-gate.ts` carries `needsRiskSetup(profile)` for
 * the moment that matters — in front of the first paper order.
 *
 * The screen itself lives in `features/onboarding/RiskSetup.tsx` so it can be
 * mounted at a route the session gate lets an onboarded member reach; this file
 * is the onboarding-time entry, kept because the answer is still worth taking
 * from anybody who wants to give it early. Nothing in the three required steps
 * links here.
 *
 * NOTHING IS WRITTEN TO THE SERVER FROM THIS ROUTE. During onboarding the
 * answer rides in the draft to `POST /onboarding/complete`, which is why the
 * `onDone` below only navigates. Reached AFTER signup, `RiskSetup` posts to
 * `POST /onboarding/risk` itself — see its header.
 */
export default function Risk() {
  const router = useRouter();
  const { draft, set } = useOnboardingDraft();

  return (
    <Screen variant="corner" layout="stack" testID="screen-risk">
      <T size={27} weight="bold" ls={-0.4} lh={32}>{RISK_BEFORE_ORDER_TITLE}</T>
      <T size={14} c={color.muted} style={{ marginTop: 8, marginBottom: 22 }}>{RISK_BEFORE_ORDER_SUB}</T>

      <RiskSetup
        balance={draft.starting_balance}
        value={draft.risk_answer}
        onChange={(risk_answer) => set({ risk_answer })}
        onDone={(risk_answer) => {
          set({ risk_answer });
          if (router.canGoBack()) router.back();
          else router.replace('/kai-plan');
        }}
      />
    </Screen>
  );
}
