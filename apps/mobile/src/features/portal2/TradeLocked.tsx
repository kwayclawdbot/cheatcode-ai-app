/**
 * THE TRADE SECTION, CLOSED, SAID HONESTLY.
 *
 * The owner's ruling: a free account keeps Kai and the community and does not
 * get the Trade section. THE GATE IS THE SERVER — every route under
 * `/api/v1/trade` and the two order-placing routes answer 402
 * `ENTITLEMENT_REQUIRED` — and hiding the tab in the app is only a courtesy on
 * top of that.
 *
 * WHICH MAKES THIS SCREEN THE IMPORTANT HALF. A person on a free account can
 * still arrive at a Trade route several ways that have nothing to do with the
 * tab bar: an alert that deep-links to its chart, a name on the research desk,
 * a link somebody sent them, a route the app restored from last time. Every one
 * of those used to end at a spinner or "I could not open that chart just now",
 * which is not what happened and reads as the app being broken.
 *
 * So the refusal says: what is closed, why, and what they still have. The
 * sentence is the SERVER'S OWN, from `CREDIT_COPY.tradeLocked()`.
 *
 * ===========================================================================
 * IT NAMES NO PRICE AND OFFERS NO WAY TO BUY. IT USED TO DO BOTH.
 * ===========================================================================
 * The server's sentence used to carry "$59 a month" and this screen ended in a
 * "See the plans" button leading to a price ladder with an Upgrade action on
 * it. Inside the iOS app that is a purchase path, and App Store rule 3.1.3(b)
 * — the rule that lets this app honour a subscription bought on the website
 * without In-App Purchase — forbids it outright.
 *
 * THE HONESTY SURVIVED THE CUT, WHICH WAS THE POINT. The person still learns
 * exactly what is closed, that it is their plan rather than a fault at our end,
 * and precisely what is untouched. What they lost is a sales pitch. The one
 * action left is the genuinely useful one: ask Kai about this ticker instead,
 * which is something they CAN do right now.
 *
 * Design: hairlines, no card. Volt for the person's own action.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { StackHeader } from '../../ui/StackHeader';
import { T, Eyebrow } from '../../ui/Text';
import { Button } from '../../ui/Button';
import { alpha, color, space } from '../../ui/tokens';

/** The API's code for "your plan does not include this". */
export const ENTITLEMENT_CODE = 'ENTITLEMENT_REQUIRED';

/**
 * Does this failure mean "your plan does not cover it", rather than "something
 * went wrong"? The two must never be shown as each other: one is a fact about
 * the account and one is a fault on our side.
 */
export function isEntitlementError(e: unknown): boolean {
  return Boolean(e && typeof e === 'object' && 'code' in e && (e as { code?: string }).code === ENTITLEMENT_CODE);
}

export function TradeLocked({
  symbol,
  plain,
  testID = 'trade-locked',
}: {
  symbol?: string | null;
  /** The server's sentence, which carries the reason and the price. */
  plain?: string | null;
  testID?: string;
}) {
  const router = useRouter();

  return (
    <Screen variant="corner" layout="tab" testID={testID}>
      <StackHeader title={symbol ? symbol.toUpperCase() : 'Trade'} />
      <View style={{ paddingHorizontal: 16, paddingTop: space.x8 }}>
        <Eyebrow c={color.gold}>Not on your plan</Eyebrow>

        <T size={22} weight="bold" c={color.text} style={{ marginTop: space.x10, lineHeight: 28 }}>
          The Trade section is not on your plan
        </T>

        {/*
          THE SERVER'S OWN WORDS, so this screen cannot drift from what the gate
          actually said. The fallback is only for the case where we got here
          without a server answer at all — a hidden tab, a restored route.
        */}
        <T size={14} lh={21} c={color.muted} style={{ marginTop: space.x12 }}>
          {plain
            ?? 'Your plan does not include the Trade section — the chart Kai marks up, the grade, and the order tickets. That is the plan, not a fault at our end.'}
        </T>

        <View style={{
          marginTop: space.x20, paddingTop: space.x14,
          borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: alpha.ivory12,
        }}>
          <Eyebrow c={color.dim}>What you still have</Eyebrow>
          <T size={14} lh={21} c={color.muted} style={{ marginTop: space.x8 }}>
            Kai, every day, on any question you want to ask him. The community.
            The research desk. Your alerts. None of that changes.
          </T>
        </View>

        {/* NO "SEE THE PLANS" BUTTON HERE, AND NOTHING MAY REPLACE IT. A
            button from a refusal to a price list is the textbook shape of the
            thing 3.1.3(b) rejects. What is offered instead is the thing the
            person can actually do. */}
        <Button
          testID="trade-locked-ask"
          label="Ask Kai about it instead"
          kind="volt"
          height={52}
          onPress={() =>
            router.push(
              symbol
                ? `/home?ask=${encodeURIComponent(`What do you make of ${symbol.toUpperCase()} right now?`)}&symbol=${encodeURIComponent(symbol.toUpperCase())}`
                : '/home',
            )
          }
          style={{ marginTop: space.x22 }}
        />
      </View>
    </Screen>
  );
}
