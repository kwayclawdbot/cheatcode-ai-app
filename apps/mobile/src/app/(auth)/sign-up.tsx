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

/**
 * Sign up — no artboard. Composed from the S0x header rhythm (27/700 title +
 * 14 muted subline), the composer-skin field, and one dominant volt action.
 * No Kai orb: this is a user action, not Kai speaking.
 */
export default function SignUp() {
  const router = useRouter();
  const { signUp } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    setError(null);
    if (!email.includes('@')) { setError("That doesn't look like an email address."); return; }
    if (password.length < 6) { setError('Use at least 6 characters for your password.'); return; }
    setBusy(true);
    if (env.FIXTURES) { setBusy(false); router.push('/kai'); return; }
    const r = await signUp(email, password);
    setBusy(false);
    if (!r.ok) { setError(r.error ?? 'Something went wrong. Please try again.'); return; }
    if (r.needsConfirmation) { setSent(true); return; }
    router.replace('/kai');
  };

  return (
    <Screen variant="dome" layout="stack" testID="screen-sign-up">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        <T size={27} weight="bold" ls={-0.4} lh={32}>Create your account</T>
        <T size={14} c={color.muted} style={{ marginTop: 8 }}>
          You'll practise with paper money first. No card, no broker, nothing at risk.
        </T>

        {sent ? (
          <ObjectCard style={{ marginTop: 26, padding: 16, gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Check size={18} color={color.green} />
              <T size={17} weight="bold">Check your email to confirm</T>
            </View>
            <T size={14} lh={20} c={color.muted}>
              We sent a link to {email}. Open it on this device and you'll land right back here.
            </T>
            <Button label="I've confirmed — sign in" kind="outline" height={44} onPress={() => router.replace('/sign-in')} />
          </ObjectCard>
        ) : (
          <>
            <View style={{ gap: 14, marginTop: 26 }}>
              <Field
                testID="field-email"
                label="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                placeholder="you@example.com"
              />
              <Field
                testID="field-password"
                label="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="new-password"
                placeholder="At least 6 characters"
                error={error}
              />
            </View>

            <View style={{ flex: 1 }} />

            <View style={{ gap: 12, marginTop: 26 }}>
              <Button testID="cta-create" label="Create account" height={52} arrow loading={busy} onPress={submit} />
              <Pressable onPress={() => router.replace('/sign-in')} hitSlop={12} style={{ alignItems: 'center', minHeight: 44, justifyContent: 'center' }}>
                <T size={13} c={color.muted}>Already have an account? <T size={13} weight="semibold" c={color.text}>Sign in</T></T>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
