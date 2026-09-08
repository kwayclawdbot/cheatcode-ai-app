import React, { useEffect, useRef } from 'react';
import { View, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { T } from '../../ui/Text';
import { ObjectCard } from '../../ui/Panel';
import { Button, Tag } from '../../ui/Button';
import { ProgressBars } from '../../ui/Progress';
import { Check } from '../../ui/Icons';
import { alpha, color, radius } from '../../ui/tokens';
import { useOnboardingDraft } from '../../lib/session';
import { START_OPTIONS } from '../../features/stage/labels';
import { INTENT_CREDIT, intentFromPath, isFunnelPath } from '../../features/onboarding/intent';
import { STEP_ROUTE, STEP_TOTAL, answersForPlacement, furthestStep, resumeRoute, stepNumber } from '../../features/onboarding/steps';

/**
 * "Where are you right now?" — step 1 of 3, and the first thing the app asks.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY IT IS FIRST, AHEAD OF "WHAT DO YOU WANT TO DO?"
 * ─────────────────────────────────────────────────────────────────────────────
 * Because it is the question that changes the meaning of the others. Step 2
 * offers Trade Today / Trade Over Time / Build My Portfolio, and which of those
 * somebody should pick depends entirely on whether they have ever placed a
 * trade. Asked second, this would be checking up on an answer already given;
 * asked first, it lets step 2 arrive pre-selected at something sensible and lets
 * the member simply agree.
 *
 * It is also the gentler order. A brand-new person meeting "what do you want to
 * do?" as the first screen of a trading app has to bluff; meeting "where are
 * you right now?" with "I'm brand new" as the first option is told immediately
 * that the answer is expected and provided for.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THE ANSWER DOES
 * ─────────────────────────────────────────────────────────────────────────────
 * It sets the starting readiness STAGE (0042) — the tag beside their name and
 * the thing Training Mode then moves. The mapping is `START_PLACEMENT` in
 * `apps/api/src/lib/stage/rules.ts`, on the server, because placement and
 * evolution have to agree about what a rung means:
 *
 *   I'm brand new                    -> beginner    · invest    · Beginners Chat
 *   I invest but don't really trade  -> beginner    · invest    · Beginners Chat
 *   I swing trade                    -> developing  · swing     · Traders Chat
 *   I actively trade                 -> trade_ready · day_trade · Traders Chat
 *
 * The last two land in the same room on purpose: since 0045 there are three
 * chats, not four, and day_trade and swing share Traders Chat. The mode still
 * differs, because the mode is the member's desk and no longer picks a room.
 *
 * It also supplies TWO defaults that step 2 asks about out loud — the goal mode
 * and the guidance level. Both are pre-selections and neither is a decision;
 * `answersForPlacement` in `features/onboarding/steps.ts` is where they come
 * from, and the argument for each is written there. The server deliberately does
 * not overwrite `primary_mode` from this answer for exactly this reason.
 *
 * THE STAGE IS A FLOOR AND NOT A CEILING. Automatic evolution only ever
 * promotes, so an answer that places somebody low costs them nothing they
 * cannot earn back in Training, and an honest "I'm brand new" is never punished.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE WEBSITE'S ANSWER IS SHOWN HERE, AND IT IS NOT APPLIED
 * ─────────────────────────────────────────────────────────────────────────────
 * Audit F21 gave the funnel somewhere to land: a visitor who walked the site's
 * three doors arrives with an intent, either on a deep link
 * (`cheatcodeai://start?path=swing&intent=…`) or recovered from their own email
 * after sign-in. F01's acceptance then adds the constraint that matters —
 * "do not silently promote readiness from a marketing persona".
 *
 * Those two together produce the behaviour below. The door they picked SUGGESTS
 * a placement, and the suggestion is marked on the card in words, with the
 * source named. It is not ticked, Continue stays disabled, and the readiness
 * stage still comes from a tap on this screen. Prefilling it would mean a button
 * on a marketing page decided which Home somebody gets and what tag sits beside
 * their name — which is the difference between remembering an answer and
 * inventing one.
 *
 * The goal and guidance the same door implies ARE prefilled, because both are
 * preferences, both are visible on the very next screen, and both are one tap
 * from being overruled.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IT RESUMES
 * ─────────────────────────────────────────────────────────────────────────────
 * The route gate sends every un-onboarded session to `/start`, so this screen is
 * the door back into a half-finished signup. Once the draft has been read off
 * the device it forwards to whichever step is actually next. The draft is on
 * disk now (`features/onboarding/`), which is F01's other half: the answers used
 * to live in React state and a backgrounded app threw them away.
 *
 * NOTHING IS WRITTEN TO THE SERVER HERE. Like every step before the last one,
 * the answer sits in the draft until `POST /onboarding/complete` accepts the lot.
 */
export default function Start() {
  const router = useRouter();
  const { draft, ready, set, intent, adoptIntent } = useOnboardingDraft();
  const params = useLocalSearchParams<{ path?: string; intent?: string }>();

  // No pre-selection. Every other onboarding screen defaults to something
  // reasonable, and this one must not: the whole value of the answer is that
  // the member gave it, and a pre-ticked "I swing trade" would place a beginner
  // two rungs up if they simply pressed Continue.
  const selected = draft.start_answer;
  const suggested = draft.start_answer ? null : (intent?.suggested_placement ?? null);

  /**
   * A deep link from the site's confirmation. Read once, on the first render
   * that carries it — `adoptIntent` refuses to overwrite answers already given,
   * so a link opened halfway through signup changes nothing.
   */
  const linkRead = useRef(false);
  useEffect(() => {
    if (linkRead.current) return;
    if (!isFunnelPath(params.path)) return;
    linkRead.current = true;
    adoptIntent(intentFromPath(params.path, { token: params.intent ?? null }));
  }, [params.path, params.intent, adoptIntent]);

  /** Resume. Once per mount, forward only, and never before the disk answers. */
  const resumed = useRef(false);
  useEffect(() => {
    if (!ready || resumed.current) return;
    resumed.current = true;
    if (furthestStep(draft) !== 'start') router.replace(resumeRoute(draft));
  }, [ready, draft, router]);

  return (
    <Screen variant="corner" layout="stack" testID="screen-start">
      <ProgressBars total={STEP_TOTAL} done={stepNumber('start')} />
      <T size={27} weight="bold" ls={-0.4} lh={32}>Where are you right now?</T>
      <T size={14} c={color.muted} style={{ marginTop: 8 }}>
        So the app meets you where you are. This changes as you learn — it is not a label you are stuck with.
      </T>
      {suggested ? (
        <T size={12.5} c={color.violetLight} style={{ marginTop: 10 }} testID="start-intent-credit">
          {INTENT_CREDIT}
        </T>
      ) : null}

      <View style={{ gap: 12, marginTop: 26, flex: 1 }}>
        {START_OPTIONS.map(({ key, title, sub }) => {
          const on = selected === key;
          const hinted = suggested === key;
          return (
            <Pressable
              key={key}
              testID={`start-${key}`}
              accessibilityRole="button"
              accessibilityLabel={hinted ? `${title}. ${sub}. Suggested by your answers on the website.` : `${title}. ${sub}`}
              accessibilityState={{ selected: on }}
              onPress={() => set(answersForPlacement(key))}
            >
              <ObjectCard
                tone={on ? 'volt' : 'default'}
                r={radius.xxxl}
                style={{ padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14 }}
              >
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <T size={17} weight="bold">{title}</T>
                    {hinted ? (
                      <Tag label="From the website" c={color.violetLight} border={alpha.ivory20} />
                    ) : null}
                  </View>
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
        // without choosing would silently mean something, so it refuses to —
        // and that stays true when the website suggested one, because a
        // suggestion nobody confirmed is not an answer.
        disabled={!selected}
        onPress={() => {
          if (!selected) return;
          set(answersForPlacement(selected));
          router.push(STEP_ROUTE.goal);
        }}
      />
    </Screen>
  );
}
