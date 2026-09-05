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
 * So the refusal says: what is closed, why, what they still have, and what it
 * costs to open it. The sentence is the SERVER'S OWN — it carries the price, so
 * a price change lands here without this file being touched.
 *
 * Design: hairlines, no card. Volt for the way forward, because upgrading is
 * the person's own action.
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
          The Trade section is on the paid plans
        </T>

        {/*
          THE SERVER'S OWN WORDS. It names the price, so this screen cannot go
          out of date when the price changes. The fallback is only for the case
          where we got here without a server answer at all — a hidden tab, a
          restored route — and it deliberately does not quote a figure it has
          not been told.
        */}
        <T size={14} lh={21} c={color.muted} style={{ marginTop: space.x12 }}>
          {plain
            ?? 'Your free account keeps Kai and the community. The Trade section — the chart Kai marks up, the grade, and the order tickets — opens on a paid plan.'}
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

        <Button
          testID="trade-locked-upgrade"
          label="See the plans"
          kind="volt"
          height={52}
          onPress={() => router.push('/account/subscription')}
          style={{ marginTop: space.x22 }}
        />
        <Button
          testID="trade-locked-ask"
          label="Ask Kai about it instead"
          kind="outline"
          height={48}
          onPress={() =>
            router.push(
              symbol
                ? `/home?ask=${encodeURIComponent(`What do you make of ${symbol.toUpperCase()} right now?`)}&symbol=${encodeURIComponent(symbol.toUpperCase())}`
                : '/home',
            )
          }
          style={{ marginTop: space.x10 }}
        />
      </View>
    </Screen>
  );
}
