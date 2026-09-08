/**
 * Plan — what this account is on, and what that covers.
 *
 * ===========================================================================
 * THIS SCREEN USED TO BE A STOREFRONT. IT IS NOT ONE ANY MORE.
 * ===========================================================================
 * It carried a ladder of the paid plans with `$59/mo` and `$99/mo` on the
 * rungs, an "Upgrade" button that opened Stripe Checkout in a browser sheet,
 * and a line about prices being shown before anything is charged.
 *
 * All of that is gone, and none of it may come back. People buy on the website
 * and sign in here. App Store rule 3.1.3(b) is what allows an app to work that
 * way without shipping In-App Purchase, and its condition is absolute: the app
 * contains NO price and NO route to buy anything. Not a figure, not a button,
 * not a link, not a "see what Pro adds". Apple rejects on exactly this.
 *
 * THE SERVER DOES NOT TRUST THIS FILE. `GET /credits` sends this client one
 * plan — the person's own — with `price_usd: null` and no top-up pack, and the
 * two Stripe routes answer NOT_FOUND to it. So a future edit that puts a price
 * back on this screen has nothing to put there. The rule and how the website
 * opens the other branch are written out in `apps/api/src/lib/storefront.ts`.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS LEFT IS THE PART THAT WAS ACTUALLY USEFUL, AND IT IS STILL HONEST.
 * ---------------------------------------------------------------------------
 * Which plan this is. How much of Kai it gives a day, and how much is left.
 * What it opens and what it does not. A person who taps "Plan" wanting to know
 * where they stand gets a complete answer. A person who wanted to be sold to
 * gets nothing, which is the correct outcome.
 *
 * ===========================================================================
 * TWO THINGS THIS SCREEN USED TO GET WRONG, AND WHY THEY WERE THE SAME BUG
 * ===========================================================================
 * · IT DECIDED WHAT A LOCKED FEATURE MEANT FROM THE TIER, NOT FROM THE FLAG.
 *   The list of capabilities with `included === false` was headed "Not on your
 *   plan" on free and "Also open to you" — with a green tick on every row — on
 *   anything paid. Those rows are the API saying this account does NOT have
 *   the thing. A paying member was told a feature was theirs immediately
 *   before being blocked from it, and migration 0031 makes that a real state
 *   today, not a hypothetical one (`circles_create` is false on every tier).
 *
 * · A FAILED READ RENDERED AS THE FREE PLAN. `currentKey` fell back to `free`
 *   when `/me` answered with nothing, so a timeout drew "Your plan / Free" over
 *   a VIP account. A service fault must never be shown as a downgrade.
 *
 * Both are the same mistake — guessing an entitlement instead of reading one —
 * so both are fixed in one place. Every claim below comes from
 * `features/account/entitlements.ts`, which the tab lock and the Trade refusal
 * read too, and whose header explains the rules. This file renders; it decides
 * nothing.
 *
 * Design: ruled strips and hairlines. Nothing here is a card.
 */
import React from 'react';
import { StyleSheet, View, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { NotConnected, ScreenLoading } from '../../ui/Loading';
import { StackHeader } from '../../ui/StackHeader';
import { T, Eyebrow } from '../../ui/Text';
import { Button } from '../../ui/Button';
import { Check, Lock } from '../../ui/Icons';
import { alpha, color, space } from '../../ui/tokens';
import { useEntitlements } from '../../features/account/useEntitlements';
import { ENTITLEMENT_UNKNOWN_PLAIN } from '../../features/account/entitlements';
import { Bay, Strip } from '../../features/account/credit-instruments';
import { LegalLinks } from '../../features/legal/LegalLinks';
import { NOT_ADVICE_LONG } from '../../features/legal/disclaimers';

export default function Subscription() {
  const router = useRouter();
  /* ONE READ FOR THE WHOLE SCREEN. Everything drawn below — the name, the
     balance, the two strips and the failure state — comes out of the shared
     contract, so there is no second source on this screen to disagree with
     the first. */
  const plan = useEntitlements();
  const { balance, error, isFixture, notAvailable } = plan;

  if (!plan.known && plan.loading) {
    return (
      <Screen variant="corner" layout="tab" testID="screen-subscription">
        <ScreenLoading />
      </Screen>
    );
  }

  /*
    THE SERVICE DID NOT ANSWER, AND THAT IS WHAT THE SCREEN SAYS.

    No headline plan name, no capability list, no tick and no padlock — every
    one of those would be a claim about an account we could not read. The only
    honest content is what went wrong and a way to ask again.
  */
  if (plan.failed) {
    return (
      <Screen variant="corner" layout="tab" testID="screen-subscription">
        <StackHeader title="Plan" />
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
        >
          <View testID="plan-unknown">
            <Eyebrow c={color.muted}>Your plan</Eyebrow>
            <T size={20} weight="bold" c={color.text} style={{ marginTop: space.x8, lineHeight: 27 }}>
              We could not read your plan
            </T>
            <T size={13.5} lh={20} c={color.muted} style={{ marginTop: space.x10 }}>
              {ENTITLEMENT_UNKNOWN_PLAIN}
            </T>
            {notAvailable ? <NotConnected what="Your plan" /> : error ? (
              <T size={11.5} c={color.muted} style={{ marginTop: space.x10 }}>{error}</T>
            ) : null}
            <Button
              testID="plan-retry"
              label="Try again"
              kind="outline"
              height={48}
              onPress={plan.reload}
              style={{ marginTop: space.x18 }}
            />
          </View>
          <View style={{
            marginTop: space.x22, paddingTop: space.x12,
            borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: alpha.ivory10,
          }}>
            <T size={11} lh={17} c={color.dim}>{NOT_ADVICE_LONG}</T>
          </View>
          <LegalLinks style={{ marginTop: space.x18 }} testID="plan-legal" />
        </ScrollView>
      </Screen>
    );
  }

  const onFree = plan.tier === 'free';

  return (
    <Screen variant="corner" layout="tab" testID="screen-subscription">
      <StackHeader title="Plan" />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── where you are ──────────────────────────────────────── */}
        <View testID="plan-current">
          <Eyebrow c={onFree ? color.muted : color.gold}>Your plan</Eyebrow>
          {/* READ, never defaulted. `planName` is null only when neither /me
              nor /credits answered, and that case never reaches this branch. */}
          <T size={26} weight="bold" c={color.text} style={{ marginTop: space.x8 }} testID="plan-name">
            {plan.planName}
          </T>
          {/*
            THE BALANCE IS THE HEADLINE FACT ABOUT A PLAN, so it is said here
            rather than only on the credits screen. It is read, never computed:
            no balance from the server means no sentence at all.
          */}
          {balance ? (
            <Pressable
              onPress={() => router.push('/account/credits')}
              accessibilityRole="button"
              testID="plan-to-credits"
              style={({ pressed }) => ({ marginTop: space.x10, opacity: pressed ? 0.6 : 1 })}
            >
              <T size={14} lh={21} c={color.muted}>
                <T size={14} weight="bold" c={color.volt}>{balance.available}</T>
                {` of ${balance.granted} credits left today — about ${balance.typical_runs_per_day} questions a day on this plan. `}
                <T size={14} weight="semibold" c={color.volt}>See credits ›</T>
              </T>
            </Pressable>
          ) : (
            <T size={13} lh={20} c={color.muted} style={{ marginTop: space.x10 }}>
              {plan.plain ?? 'Everything Kai explains is yours.'}
            </T>
          )}
          {plan.planBlurb ? (
            <T size={13} lh={20} c={color.muted} style={{ marginTop: space.x10 }} testID="plan-blurb">
              {plan.planBlurb}
            </T>
          ) : null}
        </View>

        {/* ── what it covers ─────────────────────────────────────────
            EVERY ROW BELOW IS ITS OWN ANSWER. The two strips are the same
            list split on `state`, and nothing on either of them consults the
            tier — which is the whole fix. A row is in the first strip because
            the API said `included`, and in the second because it said the
            opposite. There is no third possibility on this screen: a
            capability the server never mentioned has no row at all. */}
        {plan.included.length ? (
          <View style={{ marginTop: space.x24 }}>
            <Eyebrow c={color.green}>What your plan allows</Eyebrow>
            <Strip style={{ marginTop: space.x10 }} testID="plan-included">
              {plan.included.map((f, i) => (
                <Bay key={f.key} first={i === 0} style={{ paddingVertical: space.x11 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x10 }}>
                    <Check size={13} color={color.green} strokeWidth={2.6} />
                    <T size={13} style={{ flex: 1 }}>{f.label}</T>
                    <T size={12.5} weight="medium" c={color.muted}>{f.value_plain}</T>
                  </View>
                </Bay>
              ))}
            </Strip>
          </View>
        ) : null}

        {/*
          WHAT IS NOT ON IT. Stated, never sold, and never dressed up as
          something you have.

          The eyebrow used to read "What a paid plan adds" (a sales line, so it
          went) and then "Also open to you" on paid tiers, which was worse: it
          claimed the opposite of the flag underneath it. It is now one
          sentence for every tier, because the rows mean one thing for every
          tier — the API said this account does not have them.
        */}
        {plan.excluded.length ? (
          <View style={{ marginTop: space.x20 }}>
            <Eyebrow c={color.gold}>Not on your plan</Eyebrow>
            <Strip style={{ marginTop: space.x10 }} testID="plan-excluded">
              {plan.excluded.map((f, i) => (
                <Bay key={f.key} first={i === 0} style={{ paddingVertical: space.x11 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x10 }}>
                    <Lock size={13} color={color.gold} />
                    <T size={13} style={{ flex: 1 }} c={color.muted}>{f.label}</T>
                    <T size={12.5} weight="medium" c={color.dim}>{f.value_plain}</T>
                  </View>
                </Bay>
              ))}
            </Strip>
          </View>
        ) : null}

        {/*
          NO UPGRADE BUTTON, AND NO SENTENCE POINTING AT ONE.

          This is the exact spot where the "Upgrade" action used to sit. It is
          left empty on purpose, and the reason is written here so that nobody
          fills it back in by accident: a call to action leading to a purchase
          — a button, a link, or a line of copy telling the person where to buy
          — is what App Store rule 3.1.3(b) forbids. Whether a plan changes is
          settled on the website, and this app does not discuss it.
        */}

        <View style={{
          marginTop: space.x22, paddingTop: space.x12,
          borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: alpha.ivory10,
        }}>
          <T size={11} lh={17} c={color.dim}>{NOT_ADVICE_LONG}</T>
        </View>

        <LegalLinks style={{ marginTop: space.x18 }} testID="plan-legal" />

        {isFixture ? (
          <T size={10} c={color.dim} align="center" style={{ marginTop: space.x10 }}>
            Sample plan — the account service is not connected here.
          </T>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
