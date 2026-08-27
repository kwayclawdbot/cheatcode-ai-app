import React, { useEffect } from 'react';
import { View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAppFonts } from '../ui/fonts';
import { color } from '../ui/tokens';
import { SessionProvider, useSession } from '../lib/session';
import { env } from '../lib/env';

/**
 * Session gate.
 *   no session                      -> (auth)
 *   session, onboarding incomplete  -> (onboarding)
 *   otherwise                       -> (tabs)
 * In fixtures mode every route is directly reachable (owner preview + Playwright).
 */
function Gate({ children }: { children: React.ReactNode }) {
  const { loading, session, onboardingDone } = useSession();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading || env.FIXTURES) return;
    const group = segments[0];
    const inAuth = group === '(auth)';
    const inOnboarding = group === '(onboarding)';
    const inTabs = group === '(tabs)';

    if (!session) {
      if (!inAuth) router.replace('/welcome');
    } else if (!onboardingDone) {
      if (!inOnboarding) router.replace('/kai');
    } else if (inAuth || inOnboarding || !inTabs) {
      router.replace('/home');
    }
  }, [loading, session, onboardingDone, segments, router]);

  return <>{children}</>;
}

export default function RootLayout() {
  // Font gate: NEVER `return null` on web (kills clicks after hydration).
  const { blocking } = useAppFonts();

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: color.bg }}>
        <StatusBar style="light" />
        {blocking ? null : (
          <SessionProvider>
            <Gate>
              <Stack
                screenOptions={{
                  headerShown: false,
                  animation: 'fade',
                  contentStyle: { backgroundColor: color.bg },
                }}
              />
            </Gate>
          </SessionProvider>
        )}
      </View>
    </SafeAreaProvider>
  );
}
