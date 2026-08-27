import React from 'react';
import { View, ScrollView } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Screen } from '../../ui/Screen';
import { NotConnected, ScreenLoading } from '../../ui/Loading';
import { StackHeader } from '../../ui/StackHeader';
import { T, Eyebrow } from '../../ui/Text';
import { ObjectCard, RowList, Row } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { Sheet } from '../../ui/Sheet';
import { Check, Lock } from '../../ui/Icons';
import { alpha, color, radius } from '../../ui/tokens';
import { useCheckout, useMe } from '../../features/account/useAccount';

const when = (iso: string | null | undefined) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

/**
 * Plan.
 * What you have, what premium adds (read from entitlement_flags — never a
 * hardcoded marketing list), and an Upgrade that is honest when billing is not
 * configured yet rather than opening a dead checkout.
 */
export default function Subscription() {
  const { data, loading, error, isFixture, notAvailable } = useMe();
  const checkout = useCheckout();

  const tier = data?.subscription.tier ?? 'free';
  const premiumOnly = (data?.entitlements ?? []).filter((f) => !f.included);
  const included = (data?.entitlements ?? []).filter((f) => f.included);
  const renews = when(data?.subscription.renews_at);

  const upgrade = async () => {
    await checkout.start();
  };

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
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28, gap: 11 }}
        showsVerticalScrollIndicator={false}
      >
        <ObjectCard tone={tier === 'premium' ? 'gold' : 'default'} r={radius.xxl} style={{ padding: 18, gap: 6 }} testID="plan-card">
          <Eyebrow c={tier === 'premium' ? color.gold : color.muted}>YOUR PLAN</Eyebrow>
          <T size={24} weight="bold">{tier === 'premium' ? 'Premium' : 'Free'}</T>
          <T size={12} c={color.muted} lh={18}>
            {data?.subscription.plain
              ?? (tier === 'premium'
                ? renews ? `Renews ${renews}.` : 'Active.'
                : 'Everything Kai explains is yours. Watching the market for you is what premium adds.')}
          </T>
        </ObjectCard>

        {included.length ? (
          <>
            <Eyebrow c={color.green}>WHAT YOUR PLAN ALLOWS</Eyebrow>
            <RowList>
              {included.map((f, i) => (
                <Row key={f.key} last={i === included.length - 1}>
                  <Check size={13} color={color.green} strokeWidth={2.6} />
                  <T size={13} style={{ flex: 1 }}>{f.label}</T>
                  <T size={12.5} weight="medium" c={color.muted}>{f.value_plain}</T>
                </Row>
              ))}
            </RowList>
          </>
        ) : null}

        {premiumOnly.length ? (
          <>
            <Eyebrow c={color.gold}>WHAT PREMIUM ADDS</Eyebrow>
            <RowList>
              {premiumOnly.map((f, i) => (
                <Row key={f.key} last={i === premiumOnly.length - 1}>
                  <Lock size={13} color={tier === 'premium' ? color.green : color.gold} />
                  <T size={13} style={{ flex: 1 }} c={tier === 'premium' ? color.text : color.muted}>{f.label}</T>
                  {tier === 'premium' ? <Check size={13} color={color.green} strokeWidth={2.6} /> : null}
                </Row>
              ))}
            </RowList>
          </>
        ) : null}

        {tier !== 'premium' ? (
          <>
            <Button
              testID="cta-upgrade"
              label="Upgrade"
              kind="volt"
              height={52}
              loading={checkout.busy}
              onPress={upgrade}
            />
            <T size={11} c={color.dim} align="center" lh={17}>
              Prices are shown before anything is charged. You can cancel from here at any time.
            </T>
          </>
        ) : null}

        <View style={{ height: 1, backgroundColor: alpha.ivory06, marginTop: 6 }} />
        <T size={11} c={color.dim} lh={17}>
          Cheat Code AI is education and preparation. Kai never places a trade and never promises an outcome.
        </T>

        {notAvailable ? <NotConnected what="Plans and billing" /> : error ? <T size={11} c={color.muted} align="center">{error}</T> : null}
        {isFixture ? <T size={10} c={color.dim} align="center">Sample plan — the account service is not connected here.</T> : null}
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
