/**
 * Credits — what you have left with Kai today, and how to get more.
 *
 * WHAT THIS SCREEN IS FOR. A person needs to know three things and no others:
 * how many questions they can still ask, when that comes back, and what to do
 * if it is not enough. Everything else on this screen exists to answer one of
 * those three.
 *
 * WHAT IS DELIBERATELY NOT ON IT. Tokens. Dollars of model cost. Model names.
 * A breakdown of what any individual question consumed. All of that is real and
 * all of it is the owner's business — it lives on the staff-only admin board.
 * Showing a person that their question cost 4,812 units would be honest and
 * completely useless: they cannot act on it, and it invites them to try.
 *
 * AND NO PRICE, NO OTHER PLANS, NO WAY TO BUY MORE. This screen used to end in
 * a top-up offer with a Buy button and a ladder of the other plans with their
 * monthly prices. Both are gone. The app honours a subscription bought on the
 * website, and App Store rule 3.1.3(b) allows that only if the app itself
 * carries no price and no purchase path. The server enforces it rather than
 * trusting this file: `GET /credits` sends this client one plan, no price and
 * no top-up pack at all (`apps/api/src/lib/storefront.ts`).
 *
 * THE THIRD QUESTION — "what do I do if it is not enough" — IS STILL ANSWERED,
 * honestly: the credits come back tomorrow, and that is said plainly with the
 * time. What is not answered is "how do I pay for more", because that is not a
 * question this app is allowed to answer.
 *
 * THE COUNT IS "ABOUT". Credits are proportional to the work a question causes,
 * so a plan sized for twenty-five questions a day buys more than that on a day
 * of simple ones and fewer on a day of heavy chart lookups. Every line here
 * says "about" for that reason. A hard number would be a promise the system
 * would break, and this app does not make those.
 *
 * DESIGN. Hairlines and ruled strips, the register the research desk uses. No
 * rounded-rectangle cards anywhere on the screen. Volt is the person's own
 * allowance; violet is Kai when he speaks. Nothing here is market data, so
 * nothing here is cyan.
 *
 * Fixtures preview: `?fixture=warn|out|ceiling|topup`.
 */
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { StackHeader } from '../../ui/StackHeader';
import { NotConnected, ScreenLoading } from '../../ui/Loading';
import { T, Num, Eyebrow } from '../../ui/Text';
import { alpha, color, space } from '../../ui/tokens';
import { env } from '../../lib/env';
import { useCredits, type CreditFixture } from '../../features/account/useCredits';
import {
  Bay, CreditMeter, StopNote, Strip, resetsLine,
} from '../../features/account/credit-instruments';

export default function CreditsScreen() {
  const params = useLocalSearchParams<{ fixture?: string }>();
  const fixture: CreditFixture =
    env.FIXTURES && ['warn', 'out', 'ceiling', 'topup'].includes(String(params.fixture))
      ? (params.fixture as CreditFixture)
      : 'default';

  const { data, loading, error, isFixture, notAvailable } = useCredits(fixture);

  if (!data && loading) {
    return (
      <Screen variant="corner" layout="tab" testID="screen-credits">
        <ScreenLoading label="Counting…" />
      </Screen>
    );
  }

  /**
   * NO BALANCE MEANS NO BALANCE SHOWN.
   *
   * An API that predates the credit system answers nothing, and the honest
   * response is to say so. A sample "10 of 10 left" over a live account is a
   * fabricated record — it looks exactly like a real one and a person would
   * plan their day around it.
   */
  if (!data) {
    return (
      <Screen variant="corner" layout="tab" testID="screen-credits">
        <StackHeader title="Credits" />
        <View style={{ paddingHorizontal: 16, gap: space.x12 }}>
          <NotConnected what="Credits" />
          {error ? <T size={12} c={color.muted} lh={18}>{error}</T> : null}
        </View>
      </Screen>
    );
  }

  const c = data.credits;
  const resets = resetsLine(c.resets_at);
  // ONE PLAN — the person's own. The server sends no others to this client, so
  // there is no ladder to draw even if this screen wanted one.
  const current = data.plans.find((p) => p.key === c.plan) ?? null;

  return (
    <Screen variant="corner" layout="tab" testID="screen-credits">
      <StackHeader title="Credits" />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── the balance ────────────────────────────────────────── */}
        <View style={{ marginBottom: space.x18 }}>
          <Eyebrow c={color.volt}>Your credits</Eyebrow>
          <View style={{ marginTop: space.x12 }}>
            <CreditMeter credits={c} testID="credit-meter" />
          </View>
          {/*
            THE BIG NUMBER IS THE DAY'S GRANT, so somebody holding purchased
            credits would read "3 left" and think they were nearly out when
            they have a hundred more. The second pot is acknowledged here, at
            the meter, rather than only further down the page.
          */}
          {c.topup > 0 ? (
            <T size={13} c={color.muted} style={{ marginTop: space.x8 }} testID="credits-plus-bought">
              <T size={13} weight="bold" c={color.volt}>+{c.topup}</T>
              {' you bought, which do not reset'}
            </T>
          ) : null}
          {resets ? (
            <T size={12} c={color.dim} style={{ marginTop: space.x10 }} testID="credits-resets">
              {resets}. They do not carry over.
            </T>
          ) : null}
        </View>

        {/* Kai, if he has had to stop. His words, never rewritten here. */}
        <StopNote credits={c} testID="credits-stop" />

        {/* ── the readings ───────────────────────────────────────── */}
        <Strip style={{ marginTop: space.x20 }} testID="credits-strip">
          <Bay first>
            <Eyebrow c={color.dim}>What a credit is</Eyebrow>
            <T size={14} lh={21} c={color.muted} style={{ marginTop: space.x6 }}>
              {c.what_a_credit_is}
            </T>
          </Bay>

          {/*
            PURCHASED CREDITS ARE THEIR OWN LINE, and only appear when there
            are some. They behave differently from the daily grant — they do
            not expire — and burying that in a single total is how a support
            dispute starts.
          */}
          {c.topup > 0 ? (
            <Bay testID="credits-topup-balance">
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.x10 }}>
                <Num size={22} weight="bold" c={color.volt}>{c.topup}</Num>
                <T size={14} c={color.text} style={{ flex: 1 }}>credits you bought</T>
              </View>
              <T size={12} lh={18} c={color.dim} style={{ marginTop: space.x6 }}>
                These stay with you. They are not part of today&apos;s {c.granted} and
                they do not disappear overnight — today&apos;s credits are spent
                first, so what you paid for is still there tomorrow.
              </T>
            </Bay>
          ) : null}

          {/* THE PLAN, NAMED, WITH WHAT IT COVERS — AND NO PRICE BESIDE IT.
              The person can see which plan they are on and what it opens.
              What it costs is not shown here, and cannot be: see the note at
              the top of this file. */}
          {current ? (
            <Bay testID="credits-current-plan">
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.x10 }}>
                <T size={15} weight="bold" c={color.text}>{current.name}</T>
                <T size={12} c={color.muted}>{current.daily_credits} credits a day</T>
              </View>
              <T size={13} lh={19} c={color.muted} style={{ marginTop: space.x6 }}>
                {current.blurb}
              </T>
            </Bay>
          ) : null}
        </Strip>

        {/* ── what happens next ──────────────────────────────────── */}
        {/*
          WHERE THE TOP-UP OFFER AND THE PLAN LADDER USED TO BE.

          The person's third question is "what do I do if today is not enough",
          and it still gets a real answer — it is just the true one rather than
          a sales one. The credits come back, at a time this screen already
          knows, and nothing they have asked Kai is lost in the meantime.

          Nothing here may become a price, a plan comparison or a button that
          leads to a payment page. That is App Store rule 3.1.3(b), and it is
          the condition on this app honouring a subscription that was bought on
          the website at all.
        */}
        {resets ? (
          <View style={{ marginTop: space.x24 }} testID="credits-next">
            <Eyebrow c={color.dim}>If today is not enough</Eyebrow>
            <T size={14} lh={21} c={color.muted} style={{ marginTop: space.x10 }}>
              {`${resets}. Nothing is lost in the meantime — every conversation stays exactly where it is, and Kai picks up where you left off.`}
            </T>
          </View>
        ) : null}

        <View style={{
          marginTop: space.x24, paddingTop: space.x12,
          borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: alpha.ivory10,
        }}>
          <T size={11} lh={17} c={color.dim}>
            Cheat Code AI is education and preparation. Kai never places a trade
            and never promises an outcome.
          </T>
        </View>

        {notAvailable ? <NotConnected what="Credits" /> : null}
        {isFixture ? (
          <T size={10} c={color.dim} align="center" style={{ marginTop: space.x14 }}>
            Sample balance — the service is not connected here.
          </T>
        ) : null}
      </ScrollView>

    </Screen>
  );
}
