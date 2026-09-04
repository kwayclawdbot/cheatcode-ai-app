import React, { useEffect } from 'react';
import { View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAppFonts } from '../ui/fonts';
import { lockPortrait } from '../features/chart/orientation';
import { color } from '../ui/tokens';
import { SessionProvider, useSession } from '../lib/session';
import { env } from '../lib/env';
import { KaiSheetHost } from '../features/kai-sheet';
import { NotificationBridge } from '../features/notifications';

/**
 * Routes an authenticated, onboarded user may sit on outside the tab group.
 * Round 2 added stack destinations that the tabs push into — a setup, an alert,
 * a symbol, an account sub-screen — plus the community/debrief routes the other
 * mobile lane owns. Bouncing those back to Home would make every push a no-op,
 * so the gate allows them by name instead of allowing only `(tabs)`.
 */
const STACK_GROUPS = new Set([
  'setup', 'alert', 'symbol', 'account',       // this lane
  'room', 'debrief', 'contributor',            // MOBILE-B round 2
  'order', 'plan', 'position',                 // MOBILE-B round 3 (paper execution)
  'trade', 'circle',                           // MOBILE-B round 4 (portal + circles)
  // Round 6. `(admin)` is a GROUP, so it is what `useSegments()[0]` reports for
  // every operator board. Allowing it here only lets the route mount — the
  // group's own layout then asks `/me` whether to draw anything, and the six
  // screens behind it hold no data that did not come from a `staffed()` route.
  // `join` is the other end of an invite link and is deliberately not staff-only.
  '(admin)', 'join',
]);

/**
 * Session gate.
 *   no session                      -> (auth)
 *   session, onboarding incomplete  -> (onboarding)
 *   otherwise                       -> (tabs) or a known stack destination
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
    const inStack = typeof group === 'string' && STACK_GROUPS.has(group);

    if (!session) {
      if (!inAuth) router.replace('/welcome');
    } else if (!onboardingDone) {
      if (!inOnboarding) router.replace('/goal');
    } else if (inAuth || inOnboarding || (!inTabs && !inStack)) {
      router.replace('/home');
    }
  }, [loading, session, onboardingDone, segments, router]);

  return <>{children}</>;
}

export default function RootLayout() {
  // Font gate: NEVER `return null` on web (kills clicks after hydration).
  const { blocking } = useAppFonts();

  /**
   * PORTRAIT IS THE APP'S DEFAULT AND THE APP ENFORCES IT.
   *
   * `app.json` declares `default` so the binary is ALLOWED to rotate — on iOS
   * the plist is a ceiling nothing at runtime can raise. Every screen is still
   * portrait; the chart stage is the one that unlocks, and it locks back when
   * it closes. Doing it here rather than per screen means a screen that forgets
   * cannot leave the whole app sideways.
   */
  useEffect(() => { void lockPortrait(); }, []);

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
              >
                {/* Stack destinations pushed from a tab slide in; the tabbed
                    root keeps its cross-fade so switching tabs stays quiet. */}
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="setup/[id]" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="alert/[id]" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="alert/new" options={{ animation: 'slide_from_bottom' }} />
                <Stack.Screen name="symbol/[symbol]" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="symbol/search" options={{ animation: 'slide_from_bottom' }} />
                <Stack.Screen name="trade/[symbol]" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="circle/[id]" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="order/confirmed" options={{ animation: 'slide_from_bottom' }} />
                <Stack.Screen name="desk/index" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="desk/themes" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="desk/pick/[ticker]" options={{ animation: 'slide_from_right' }} />
                <Stack.Screen name="desk/theme/[theme]" options={{ animation: 'slide_from_right' }} />
              </Stack>
              {/* Kai's contextual sheet lives above every route: it opens OVER
                  the current screen and never navigates the user away (audit §5). */}
              <KaiSheetHost />
              {/* A tapped notification has to land on the thing it is about —
                  warm, cold, native or from the service worker (round 5 §8). */}
              <NotificationBridge />
            </Gate>
          </SessionProvider>
        )}
      </View>
    </SafeAreaProvider>
  );
}
