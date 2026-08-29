import React, { useState } from 'react';
import { View, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { T, Num, Eyebrow } from '../../ui/Text';
import { Button } from '../../ui/Button';
import { Rule } from '../../ui/DataRow';
import { color, space } from '../../ui/tokens';
import { api } from '../../lib/api';
import type { InviteRedeemResult } from '../../lib/types';

/**
 * `/join/<code>` — the other end of the link the operator copies.
 *
 * IT IS THE FIRST REQUEST A NEW SESSION MAKES, NOT A SIGN-UP ROUTE. This app
 * has no server-side sign-up: the client creates the account against GoTrue
 * directly, so "sign-up accepts a code" happens here, with the new user's own
 * token, which is what makes the account something the server knows rather than
 * something the caller claims (brief §6).
 *
 * A REFUSAL SAYS WHICH ONE IT IS. Expired, switched off, all used up, and not a
 * code we have are four different sentences, written by the API; this screen
 * shows the sentence it was given rather than inventing a fifth.
 *
 * Redeeming twice is not a refusal: the same person redeeming the same code
 * gets "you had already used that" and keeps what it gave them.
 */
export default function Join() {
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code: string }>();
  const clean = (code ?? '').trim().toUpperCase();

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<InviteRedeemResult | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  const redeem = async () => {
    setBusy(true);
    setRefusal(null);
    try {
      setResult(await api.redeemInvite(clean));
    } catch (e) {
      setRefusal(e instanceof Error ? e.message : 'That code did not work.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen variant="dome" layout="stack" testID="screen-join">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        <Eyebrow>YOU WERE SENT A CODE</Eyebrow>
        <Num size={30} weight="bold" testID="join-code" style={{ marginTop: space.x10 }}>{clean || '—'}</Num>

        {result ? (
          <View style={{ gap: space.x12, marginTop: space.x24 }} testID="join-done">
            <Rule />
            <T size={17} weight="bold">{result.already_redeemed ? 'You had already used this one' : 'Code accepted'}</T>
            <T size={14} c={color.muted} lh={21} testID="join-plain">{result.plain}</T>
            <T size={13} c={color.muted} lh={20}>{result.subscription_plain}</T>
          </View>
        ) : (
          <T size={14} c={color.muted} lh={21} style={{ marginTop: space.x14 }}>
            Using it puts whatever it carries on your account straight away. Nothing is charged and no card is asked for.
          </T>
        )}

        {refusal ? (
          <View style={{ gap: 8, marginTop: space.x20 }} testID="join-refused">
            <Rule />
            <T size={14} lh={21}>{refusal}</T>
          </View>
        ) : null}

        <View style={{ flex: 1 }} />

        <View style={{ gap: space.x12, marginTop: space.x26 }}>
          {result ? (
            <Button testID="cta-join-home" label="Go to Kai" kind="volt" height={52} arrow onPress={() => router.replace('/home')} />
          ) : (
            <>
              <Button
                testID="cta-join-redeem"
                label="Use this code"
                kind="volt"
                height={52}
                loading={busy}
                disabled={!clean}
                onPress={redeem}
              />
              <Button testID="cta-join-skip" label="Not now" kind="ghost" height={46} onPress={() => router.replace('/home')} />
            </>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
