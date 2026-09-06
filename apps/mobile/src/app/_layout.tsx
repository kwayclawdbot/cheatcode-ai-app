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
  // Reply-with-quote pushes `/thread/<id>?quote=<id>`. It was added with the
  // six-emoji reactions and never listed here, so on a REAL session the gate
  // read `thread` as an unknown group and bounced every Reply tap to Home —
  // the composer never opened. Fixtures mode skips the gate entirely, which
  // is exactly why the proof scripts never saw it.
  'thread',
  'order', 'plan', 'position',                 // MOBILE-B round 3 (paper execution)
  'trade', 'circle',                           // MOBILE-B round 4 (portal + circles)
  // The research desk. It is a tab in Invest mode AND a pushed screen from the
  // Account board in every mode, so the gate has to let it mount — without
  // this, `/desk` on a real stack bounced straight back to Home and the
  // Account row led nowhere.
  'desk',
  // Round 6. `(admin)` is a GROUP, so it is what `useSegments()[0]` reports for
  // every operator board. Allowing it here only lets the route mount — the
  // group's own layout then asks `/me` whether to draw anything, and the six
  // screens behind it hold no data that did not come from a `staffed()` route.
  // `join` is the other end of an invite link and is deliberately not staff-only.
  '(admin)', 'join',
  // The social layer. `community` is the call composer (`/community/call/new`),
  // pushed from the club board; `leaderboard` is the board, pushed from the
  // same header. Both are ordinary member routes — the gate has to list them
  // or a real session bounces straight back to Home, which is the exact bug
  // `thread` hit above and which fixtures mode cannot see, because fixtures
  // skip the gate entirely.
  'community', 'leaderboard',
]);

/**
 * Session gate.
 *   no session                      -> (auth)
 *   session, onboarding incomplete  -> (onboarding)
 *   otherwise                       -> (tabs) or a known stack destination
 * In fixtures mode every route is directly reachable (owner preview + Playwright).
 */
/**
 * THE USERNAME PROMPT IS SHOWN ONCE PER LAUNCH, AND IT IS NOT A WALL.
 *
 * Accounts made before 2026-09-06 have no username, because until then no
 * screen in the app ever asked for one. They need one — @mentions cannot work
 * against a namespace that is five-eighths empty — so the first screen after
 * sign-in is the box that asks.
 *
 * ONCE. This flag is module state, so it survives a re-render and dies with
 * the process: somebody who backs out of that screen gets on with their day
 * and is asked again next time they open the app. The hard requirement lives
 * where it belongs and cannot be dodged — `POST /rooms/:id/messages` refuses a
 * post from an account with no username, on the server, whatever the phone
 * thinks. Making the whole app unreachable instead would mean one failed write
 * locks somebody out of their own positions.
 */
let usernameAsked = false;

function Gate({ children }: { children: React.ReactNode }) {
  const { loading, session, onboardingDone, profile } = useSession();
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
      return;
    }
    if (!onboardingDone) {
      if (!inOnboarding) router.replace('/goal');
      return;
    }
    if (inAuth || inOnboarding || (!inTabs && !inStack)) {
      router.replace('/home');
      return;
    }

    // Onboarded, on a legitimate screen, and still nameless. Ask — once, and
    // only when the profile has actually been read (undefined is "not loaded",
    // null is "we asked and there is none").
    if (!usernameAsked && profile && !profile.handle) {
      usernameAsked = true;
      router.push('/account/username');
    }
  }, [loading, session, onboardingDone, profile, segments, router]);

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
                {/* Publishing a call is a composition, so it comes up from the
                    bottom the way the alert composer does. The board is a
                    place you go, so it slides in from the side. */}
                <Stack.Screen name="community/call/new" options={{ animation: 'slide_from_bottom' }} />
                <Stack.Screen name="leaderboard" options={{ animation: 'slide_from_right' }} />
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
