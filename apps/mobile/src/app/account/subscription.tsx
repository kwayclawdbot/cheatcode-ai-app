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
 * The locked list is kept and is deliberately not softened: knowing that the
 * Trade section is not on your plan is a fact you need in order to understand
 * the app. It is stated, with no invitation attached.
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
import { Check, Lock } from '../../ui/Icons';
import { alpha, color, space } from '../../ui/tokens';
import { useMe } from '../../features/account/useAccount';
import { useCredits } from '../../features/account/useCredits';
import { Bay, Strip } from '../../features/account/credit-instruments';
import { LegalLinks } from '../../features/legal/LegalLinks';
import { NOT_ADVICE_LONG } from '../../features/legal/disclaimers';

export default function Subscription() {
  const router = useRouter();
  const { data, loading, error, isFixture, notAvailable } = useMe();
  const credits = useCredits();

  const balance = credits.data?.credits ?? data?.credits ?? null;
  const plans = credits.data?.plans ?? [];
  const currentKey = balance?.plan ?? (data?.subscription.tier === 'premium' ? 'vip' : 'free');
  const current = plans.find((p) => p.key === currentKey) ?? null;
  const onFree = currentKey === 'free';

  const premiumOnly = (data?.entitlements ?? []).filter((f) => !f.included);
  const included = (data?.entitlements ?? []).filter((f) => f.included);

  if (!data && loading) {
    return (
      <Screen variant="corner" layout="tab" testID="screen-subscription">
        <ScreenLoading />
      </Screen>
    );
  }

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
          <T size={26} weight="bold" c={color.text} style={{ marginTop: space.x8 }}>
            {balance?.plan_name ?? current?.name ?? (onFree ? 'Free' : 'Premium')}
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
              {data?.subscription.plain ?? 'Everything Kai explains is yours.'}
            </T>
          )}
          {current?.blurb ? (
            <T size={13} lh={20} c={color.muted} style={{ marginTop: space.x10 }} testID="plan-blurb">
              {current.blurb}
            </T>
          ) : null}
        </View>

        {/* ── what it covers ─────────────────────────────────────── */}
        {included.length ? (
          <View style={{ marginTop: space.x24 }}>
            <Eyebrow c={color.green}>What your plan allows</Eyebrow>
            <Strip style={{ marginTop: space.x10 }} testID="plan-included">
              {included.map((f, i) => (
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
          WHAT IS NOT ON IT. Stated, never sold. The eyebrow used to read "What
          a paid plan adds", which is a sales line — it points at a purchase.
          "Not on your plan" is the same fact with the pitch removed, and it is
          what the person actually needs to know when a screen refuses them.
        */}
        {premiumOnly.length ? (
          <View style={{ marginTop: space.x20 }}>
            <Eyebrow c={color.gold}>{onFree ? 'Not on your plan' : 'Also open to you'}</Eyebrow>
            <Strip style={{ marginTop: space.x10 }} testID="plan-premium-only">
              {premiumOnly.map((f, i) => (
                <Bay key={f.key} first={i === 0} style={{ paddingVertical: space.x11 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x10 }}>
                    <Lock size={13} color={onFree ? color.gold : color.green} />
                    <T size={13} style={{ flex: 1 }} c={onFree ? color.muted : color.text}>{f.label}</T>
                    {onFree ? null : <Check size={13} color={color.green} strokeWidth={2.6} />}
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

        {notAvailable ? <NotConnected what="Your plan" /> : error ? (
          <T size={11} c={color.muted} align="center" style={{ marginTop: space.x10 }}>{error}</T>
        ) : null}
        {isFixture ? (
          <T size={10} c={color.dim} align="center" style={{ marginTop: space.x10 }}>
            Sample plan — the account service is not connected here.
          </T>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
