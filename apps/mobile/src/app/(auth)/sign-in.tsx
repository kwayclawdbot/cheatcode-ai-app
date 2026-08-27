import React, { useState } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { T } from '../../ui/Text';
import { Field } from '../../ui/Field';
import { Button } from '../../ui/Button';
import { ObjectCard } from '../../ui/Panel';
import { Check } from '../../ui/Icons';
import { color } from '../../ui/tokens';
import { useSession } from '../../lib/session';
import { env } from '../../lib/env';

/** Sign in — email + password primary, magic link secondary. */
export default function SignIn() {
  const router = useRouter();
  const { signIn, signInWithMagicLink } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [linkSent, setLinkSent] = useState(false);

  const submit = async () => {
    setError(null);
    if (!email.includes('@')) { setError("That doesn't look like an email address."); return; }
    setBusy(true);
    if (env.FIXTURES) { setBusy(false); router.replace('/home'); return; }
    const r = await signIn(email, password);
    setBusy(false);
    if (!r.ok) { setError(r.error ?? 'Something went wrong. Please try again.'); return; }
  };

  const magic = async () => {
    setError(null);
    if (!email.includes('@')) { setError('Enter your email first and we\'ll send you a link.'); return; }
    setBusy(true);
    const r = await signInWithMagicLink(email);
    setBusy(false);
    if (!r.ok) { setError(r.error ?? 'Something went wrong. Please try again.'); return; }
    setLinkSent(true);
  };

  return (
    <Screen variant="dome" layout="stack" testID="screen-sign-in">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        <T size={27} weight="bold" ls={-0.4} lh={32}>Welcome back</T>
        <T size={14} c={color.muted} style={{ marginTop: 8 }}>Kai has been watching while you were gone.</T>

        {linkSent ? (
          <ObjectCard style={{ marginTop: 26, padding: 16, gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Check size={18} color={color.green} />
              <T size={17} weight="bold">Check your email</T>
            </View>
            <T size={14} lh={20} c={color.muted}>We sent a sign-in link to {email}. It works once and expires in an hour.</T>
          </ObjectCard>
        ) : (
          <>
            <View style={{ gap: 14, marginTop: 26 }}>
              <Field
                testID="field-email" label="Email" value={email} onChangeText={setEmail}
                autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="you@example.com"
              />
              <Field
                testID="field-password" label="Password" value={password} onChangeText={setPassword}
                secureTextEntry autoComplete="current-password" placeholder="Your password" error={error}
              />
            </View>

            <View style={{ flex: 1 }} />

            <View style={{ gap: 12, marginTop: 26 }}>
              <Button testID="cta-sign-in" label="Sign in" height={52} arrow loading={busy} onPress={submit} />
              <Button testID="cta-magic-link" label="Email me a link instead" kind="outline" height={44} onPress={magic} />
              <Pressable onPress={() => router.replace('/sign-up')} hitSlop={12} style={{ alignItems: 'center', minHeight: 44, justifyContent: 'center' }}>
                <T size={13} c={color.muted}>New here? <T size={13} weight="semibold" c={color.text}>Create an account</T></T>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
