/**
 * Plan.
 *
 * WHAT CHANGED AND WHY. This screen used to describe ONE paid tier by listing
 * `entitlement_flags` — which was right when there was one. There are three
 * rungs now (Free · Pro · VIP) and what actually separates them is how much of
 * Kai you get a day, which is not an entitlement flag and never will be. So the
 * ladder is read from `GET /credits`, the one place the server keeps prices,
 * allowances and the Trade gate together.
 *
 * The capability list is KEPT, below the ladder, still read from the server's
 * flags rather than from a marketing list typed in here. It answers the second
 * question — "what else do I get" — after the ladder has answered the first.
 *
 * THE QUESTION COUNTS SAY "ABOUT" AND ALWAYS WILL. A credit is proportional to
 * the work a question causes, so a plan sized for twenty-five a day buys more
 * on a day of simple questions and fewer on a day of heavy chart lookups. A
 * hard number here would be a promise the system does not keep.
 *
 * Design: ruled strips and hairlines. The plan rungs are not cards.
 */
import React from 'react';
import { StyleSheet, View, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Screen } from '../../ui/Screen';
import { NotConnected, ScreenLoading } from '../../ui/Loading';
import { StackHeader } from '../../ui/StackHeader';
import { T, Num, Eyebrow } from '../../ui/Text';
import { Button } from '../../ui/Button';
import { Sheet } from '../../ui/Sheet';
import { Check, Lock } from '../../ui/Icons';
import { alpha, color, space } from '../../ui/tokens';
import { useCheckout, useMe } from '../../features/account/useAccount';
import { useCredits } from '../../features/account/useCredits';
import { Bay, Strip } from '../../features/account/credit-instruments';
import type { CreditPlan } from '../../lib/types';

export default function Subscription() {
  const router = useRouter();
  const { data, loading, error, isFixture, notAvailable } = useMe();
  const credits = useCredits();
  const checkout = useCheckout();

  const balance = credits.data?.credits ?? data?.credits ?? null;
  const plans = credits.data?.plans ?? [];
  const currentKey = balance?.plan ?? (data?.subscription.tier === 'premium' ? 'vip' : 'free');
  const paid = plans.filter((p) => p.price_usd > 0);
  const onFree = currentKey === 'free';

  const premiumOnly = (data?.entitlements ?? []).filter((f) => !f.included);
  const included = (data?.entitlements ?? []).filter((f) => f.included);

  React.useEffect(() => {
    if (checkout.url) {
      void WebBrowser.openBrowserAsync(checkout.url);
      checkout.dismiss();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkout.url]);

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
            {balance?.plan_name ?? (onFree ? 'Free' : 'Premium')}
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
        </View>

        {/* ── the ladder ─────────────────────────────────────────── */}
        {paid.length ? (
          <View style={{ marginTop: space.x24 }}>
            <Eyebrow c={color.dim}>{onFree ? 'What you can move up to' : 'The plans'}</Eyebrow>
            <Strip style={{ marginTop: space.x10 }} testID="plan-ladder">
              {paid.map((p, i) => (
                <PlanRung key={p.key} plan={p} first={i === 0} current={p.key === currentKey} />
              ))}
            </Strip>
          </View>
        ) : null}

        {/* ── the capability list, unchanged in spirit ───────────── */}
        {/*
          THE CAPABILITY LISTS ARE RULED, NOT BOXED. They used to be two
          rounded panels, which put three different container shapes on one
          screen — a ruled ladder, a boxed list, a boxed list. One register.
        */}
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

        {premiumOnly.length ? (
          <View style={{ marginTop: space.x20 }}>
            <Eyebrow c={color.gold}>What a paid plan adds</Eyebrow>
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

        {onFree ? (
          <>
            <Button
              testID="cta-upgrade"
              label="Upgrade"
              kind="volt"
              height={52}
              loading={checkout.busy}
              onPress={() => { void checkout.start(); }}
              style={{ marginTop: space.x22 }}
            />
            <T size={11} c={color.dim} align="center" lh={17} style={{ marginTop: space.x8 }}>
              Prices are shown before anything is charged. You can cancel from
              here at any time.
            </T>
          </>
        ) : null}

        <View style={{
          marginTop: space.x22, paddingTop: space.x12,
          borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: alpha.ivory10,
        }}>
          <T size={11} lh={17} c={color.dim}>
            Cheat Code AI is education and preparation. Kai never places a trade
            and never promises an outcome.
          </T>
        </View>

        {notAvailable ? <NotConnected what="Plans and billing" /> : error ? (
          <T size={11} c={color.muted} align="center" style={{ marginTop: space.x10 }}>{error}</T>
        ) : null}
        {isFixture ? (
          <T size={10} c={color.dim} align="center" style={{ marginTop: space.x10 }}>
            Sample plan — the account service is not connected here.
          </T>
        ) : null}
      </ScrollView>

      <Sheet
        visible={!!checkout.message}
        onClose={checkout.dismiss}
        title="Upgrades open soon"
        testID="sheet-billing"
      >
        {/* The server's message is often the same sentence as the title —
            saying it twice reads like a stutter, so only add what is new. */}
        {checkout.message && checkout.message.replace(/\.$/, '') !== 'Upgrades open soon' ? (
          <T size={13} lh={20} c={color.muted}>{checkout.message}</T>
        ) : null}
        <T size={13} lh={20} c={color.muted}>
          Everything you can do today keeps working. Nothing has been charged.
        </T>
        <Button label="Got it" kind="volt" height={48} onPress={checkout.dismiss} />
      </Sheet>
    </Screen>
  );
}

/**
 * One rung. Credits a day is the number that is actually enforced; the question
 * count beside it is what that is sized for, and it says "about" because it is.
 */
function PlanRung({ plan, first, current }: { plan: CreditPlan; first: boolean; current: boolean }) {
  return (
    <Bay first={first} testID={`plan-rung-${plan.key}`}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.x10 }}>
        <T size={16} weight="bold" c={current ? color.gold : color.text}>{plan.name}</T>
        {current ? <T size={11} weight="semibold" c={color.gold}>· yours</T> : null}
        <View style={{ flex: 1 }} />
        <Num size={17} weight="bold" c={color.text}>${plan.price_usd}</Num>
        <T size={11} c={color.dim}>/mo</T>
      </View>
      {/* The credits a day is the number that is actually enforced, so it is
          the one given weight. The blurb below already hedges the question
          count — saying "about 25 questions" twice reads like a stutter. */}
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.x8, marginTop: space.x8 }}>
        <Num size={15} weight="bold" c={color.volt}>{plan.daily_credits}</Num>
        <T size={13} c={color.muted}>credits a day</T>
      </View>
      <T size={13} lh={19} c={color.muted} style={{ marginTop: space.x6 }}>{plan.blurb}</T>
    </Bay>
  );
}
