import React from 'react';
import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useSession } from '../lib/session';
import { color } from '../ui/tokens';
import { env } from '../lib/env';

/** S00 — splash / session restore. Decides the first real screen. */
export default function Index() {
  const { loading, session, onboardingDone } = useSession();

  if (env.FIXTURES) return <Redirect href="/welcome" />;
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: color.bg }}>
        <ActivityIndicator color={color.violet} />
      </View>
    );
  }
  if (!session) return <Redirect href="/welcome" />;
  if (!onboardingDone) return <Redirect href="/kai" />;
  return <Redirect href="/home" />;
}
