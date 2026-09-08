import React, { useState } from 'react';
import { View, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { T } from '../../ui/Text';
import { Button, Tag } from '../../ui/Button';
import { ProgressBars } from '../../ui/Progress';
import { KaiOrb } from '../../ui/KaiOrb';
import { Check } from '../../ui/Icons';
import { alpha, color, radius } from '../../ui/tokens';
import { api } from '../../lib/api';
import { capFor, clampBalance, useOnboardingDraft, useSession } from '../../lib/session';
import { EXPERIENCE_TO_LEVEL, EXPERIENCE_VOICE, MODE_LABEL, focusList } from '../../features/account/profile';
import { STEP_TOTAL, stepNumber } from '../../features/onboarding/steps';
import { RISK_DEFAULT, RISK_DEFAULT_NOTE } from '../../features/onboarding/risk-gate';
import { CAPABILITIES, PLANNED_LABEL, type CapabilityId } from '@shared/capabilities';

/**
 * Step 3 of 3 — Kai states how he will work, then the honest rows, then Start.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ONE LINE THIS SCREEN USED TO END ON
 * ─────────────────────────────────────────────────────────────────────────────
 * "Connect a brokerage anytime in Account." It was the last sentence a new
 * member read before Home, and it was not true. The Account board says, in its
 * own words, "Paper is the only mode in this release — real money needs a
 * broker, which comes later." Audit F02 (P1) is exactly that pair: the offer
 * and the destination disagreeing, with a beginner in between who cannot tell a
 * product promise from a simulation from a future capability.
 *
 * Both sentences were written by people being careful. They drifted because
 * they were two copies of one claim. So the claim is not copy any more: the
 * rows below read `@shared/capabilities`, which carries the state AND the
 * destination together, and flipping `broker_execution` to `available` would
 * change this screen and the button it draws in the same edit. That is F02's
 * acceptance — "availability changes update both the offer and the
 * destination" — expressed as data rather than as diligence.
 *
 * The same list is why the action says "Practise with paper money" in the
 * action itself, which the audit asks for by name.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS OPTIONAL, AND WHAT THAT COST
 * ─────────────────────────────────────────────────────────────────────────────
 * Focus and username used to be steps 4 and 5, in front of Home. Neither needs
 * to be: `POST /rooms/:id/messages` refuses a post from an account with no
 * username on the SERVER, and Account edits focus through `PUT /settings`. They
 * are offered here as two links somebody may ignore, which is F01's "move focus
 * and username to the moment they are useful".
 *
 * Risk left too, and it left for a stronger reason — see `risk-gate.ts`. This
 * screen therefore completes with the neutral default and SAYS SO, rather than
 * presenting a cap nobody chose as the member's own decision.
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

/**
 * What onboarding is allowed to say is waiting for them.
 *
 * The order is the order somebody will meet these things, not an importance
 * ranking. Training's three steps are all listed — including the two that are
 * not written — because "offer only available lessons and label the broader
 * curriculum as planned" means the planned ones are SHOWN as planned, not
 * hidden. Hiding them would leave the same surprise, one screen later.
 */
const PLAN_CAPABILITIES: CapabilityId[] = [
  'paper_trading',
  'training_basics',
  'training_read_chart',
  'training_build_plan',
  'chats',
];

export default function KaiPlan() {
  const router = useRouter();
  const { draft, reset } = useOnboardingDraft();
  const { patchProfile, refreshProfile } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mode = draft.goal_mode ?? 'swing';
  const guidance = draft.guidance ?? 'new';
  const riskAnswer = draft.risk_answer ?? RISK_DEFAULT;
  const cap = capFor(riskAnswer, draft.starting_balance);
  const focusShort = focusList(draft.focus);
  const broker = CAPABILITIES.broker_execution;
  const paper = CAPABILITIES.paper_trading;

  const start = async () => {
    setError(null);
    setBusy(true);
    try {
      if (api.available()) {
        /*
         * Typed as the client's body PLUS `risk_confirmed`, which the route
         * accepts and `packages/shared/api.ts` does not declare — that file is
         * append-only for this lane, and the flag describes this route's
         * bookkeeping rather than the contract's vocabulary. Built as a named
         * const so the extra key is a widening rather than an excess-property
         * error on a literal.
         */
        const body: Parameters<typeof api.completeOnboardingRound4>[0] & { risk_confirmed: boolean } = {
          goal_mode: mode,
          starting_balance: clampBalance(draft.starting_balance),
          risk_answer: riskAnswer,
          // The plan states the rule plainly — "Nothing reaches a broker
          // without your confirmation" — which IS `hands_on`. There is no
          // second mode to choose between while there is no broker.
          involvement: 'hands_on',
          // The wire still calls it `experience`; the app asks it as guidance.
          experience: guidance,
          focus: draft.focus,
          practice_choice: 'paper',
          // False unless a human actually picked a risk level. Signup no longer
          // asks, so this is normally false and the app asks before the first
          // paper order instead — see `features/onboarding/risk-gate.ts`.
          risk_confirmed: draft.risk_answer !== null,
          // "Where are you right now?" (step 1). The server turns this into the
          // starting readiness stage; it is optional on the wire, and omitting
          // it places the member at `beginner`, the honest default for an
          // answer nobody gave.
          ...(draft.start_answer ? { start_answer: draft.start_answer } : {}),
        };
        await api.completeOnboardingRound4(body);
        await patchProfile({
          primary_mode: mode,
          involvement: 'hands_on',
          experience: EXPERIENCE_TO_LEVEL[guidance],
        });
        // `onboarding.completed` is written by the server, and the route gate
        // reads it — without this refresh the gate bounces straight back here.
        await refreshProfile();
      }
      // The server has the answers now. A draft that outlives its completion is
      // a stale copy waiting to overwrite something changed in Account.
      reset();
      router.replace('/home');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We could not save your setup. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen variant="dome" layout="stack" testID="screen-kai-plan">
      <ProgressBars total={STEP_TOTAL} done={stepNumber('plan')} />

      <View style={{ alignItems: 'center', gap: 14 }}>
        <KaiOrb size={62} />
        <T size={22} weight="bold" align="center" lh={29}>{'Here\'s how I\'ll\nwork for you'}</T>
      </View>

      <ScrollView style={{ flex: 1, marginTop: 22 }} contentContainerStyle={{ gap: 13, paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
        <Line>
          I grade <T size={14} lh={21} weight="bold">{MODE_LABEL[mode]}</T> setups across {focusShort} before you look.
        </Line>
        <Line>
          Every idea leads with what it risks — <T size={14} lh={21} weight="bold">{usd(cap)}</T> is your daily ceiling.
        </Line>
        <Line>{EXPERIENCE_VOICE[guidance]}</Line>
        <Line>
          Nothing reaches a broker <T size={14} lh={21} weight="bold">without your confirmation</T>.
        </Line>

        <View
          testID="plan-rows"
          style={{ marginTop: 8, borderRadius: radius.xl, paddingVertical: 5, paddingHorizontal: 16, backgroundColor: alpha.ivory04, borderWidth: 0.5, borderColor: alpha.ivory14 }}
        >
          <Row label="Brokerage">
            {/* The state comes from the shared list, so this row and the Account
                board cannot say different things about the same fact. */}
            <T size={13} weight="semibold" c={color.muted} testID="plan-broker">
              {broker.state === 'available' ? broker.action : 'Not in this release'}
            </T>
          </Row>
          <Row label="Practice mode">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color.cyan }} />
              <T size={12.5} c={color.cyan} testID="plan-paper">{paper.action}</T>
            </View>
          </Row>
          <Row label="Daily loss cap">
            <T size={13} weight="semibold" c={color.gold}>{usd(cap)}</T>
          </Row>
          <Row label="Morning briefing">
            <T size={13} weight="semibold">9:15 AM ET</T>
          </Row>
        </View>

        {draft.risk_answer === null ? (
          <T size={11.5} lh={17} c={color.dim} testID="plan-risk-note">{RISK_DEFAULT_NOTE}</T>
        ) : null}

        {/* WHAT IS ACTUALLY THERE. Planned entries are shown wearing the word
            Planned rather than left out — hiding them moves the surprise one
            screen later instead of removing it. */}
        <View style={{ marginTop: 10, gap: 9 }} testID="plan-capabilities">
          <T size={12} weight="bold" ls={0.84} c={color.muted}>WAITING FOR YOU</T>
          {PLAN_CAPABILITIES.map((id) => {
            const c = CAPABILITIES[id];
            const planned = c.state === 'planned';
            return (
              <View key={id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 9 }} testID={`plan-cap-${id}`}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <T size={14} weight="semibold" c={planned ? color.muted : color.text}>{c.title}</T>
                    {planned ? <Tag label={PLANNED_LABEL} c={color.muted} border={alpha.ivory20} /> : null}
                  </View>
                  <T size={12} lh={17} c={color.dim} style={{ marginTop: 1 }}>{c.plain}</T>
                </View>
              </View>
            );
          })}
        </View>

        {error ? <T size={12} c={color.red} align="center">{error}</T> : null}
      </ScrollView>

      <Button testID="cta-start" label="Start with Kai" height={52} arrow loading={busy} onPress={() => { void start(); }} />

      {/* The two questions that used to be gates. Optional, and honest about
          what skipping them costs — which is nothing you cannot undo. */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 18, marginTop: 12 }}>
        <T
          size={12.5}
          weight="semibold"
          c={color.muted}
          testID="plan-choose-focus"
          accessibilityRole="button"
          onPress={() => router.push('/personalize')}
        >
          Choose what Kai watches
        </T>
        <T
          size={12.5}
          weight="semibold"
          c={color.muted}
          testID="plan-choose-username"
          accessibilityRole="button"
          onPress={() => router.push('/username')}
        >
          Pick a username
        </T>
      </View>
    </Screen>
  );
}
