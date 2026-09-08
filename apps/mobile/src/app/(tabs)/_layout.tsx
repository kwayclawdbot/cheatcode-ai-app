import React from 'react';
import { Tabs } from 'expo-router';
import { TabBar } from '../../ui/TabBar';
import { color } from '../../ui/tokens';
import { useAlertAttention } from '../../features/alerts/attention';
import { useMe } from '../../features/account/useAccount';
import { buildEntitlementView } from '../../features/account/entitlements';
import { useSession } from '../../lib/session';
import { DEFAULT_MODE, secondTab } from '../../features/nav/second-tab';
import type { GoalMode } from '../../lib/types';

/**
 * L6 nav: Home · Alerts · Community · Trade · Account (owner-confirmed).
 *
 * The second tab is the one that reads `primary_mode`: alerts for a day trader
 * and a swing trader, the research desk for an investor. Same route, same slot,
 * different job — the tab bar stays at five because five is the ceiling on a
 * phone, and Invest finally means something.
 */
export default function TabsLayout() {
  const { profile } = useSession();
  const mode: GoalMode = (profile?.primary_mode as GoalMode) ?? DEFAULT_MODE;
  const second = secondTab(mode);

  /**
   * WHETHER THE TRADE TAB IS ON THIS PLAN (migration 0030).
   *
   * A COURTESY, NOT A CONTROL. The mark on the glyph tells a free account that
   * the Trade section is a paid one before they tap it; the tab still navigates
   * exactly where it always did, and the server refuses the routes behind it
   * whatever this says. Defaulting to unlocked matters: an API that cannot
   * answer must not put a padlock on a section a paying customer has.
   */
  const me = useMe();
  /**
   * READ FROM THE SAME CONTRACT THE PLAN SCREEN AND THE REFUSAL READ.
   *
   * This used to ask the credits block on its own — `!me.data.credits
   * .trade_panel` — which is the one source of the three that is NOT on the
   * enforcement path. `apps/api/src/lib/kai/plans.ts` settles the tie-break in
   * its own words ("THE FLAG WINS: it is the one on the enforcement path"), and
   * `features/account/entitlements.ts` is where that rule now lives, so the
   * mark on the glyph, the row on the plan screen and the server's refusal
   * cannot disagree. That was the third surface the audit's F17 asks to unify.
   *
   * `buildEntitlementView` is called here rather than `useEntitlements()`
   * because the hook also reads `/credits`, and a tab bar rendered on every
   * screen must not add a second request to fetch a padlock. Passing `null`
   * for credits only removes a FALLBACK for `trade_panel`; it can never turn an
   * excluded capability into an included one.
   *
   * The courtesy above still stands: only an explicit `excluded` locks. An
   * unknown answer — `/me` in flight, or unable to reply — leaves the tab
   * unmarked, which is what the paragraph above requires.
   */
  const tradeLocked = buildEntitlementView(me.data, null).tradePanel === 'excluded';

  /**
   * THE ATTENTION DOT — audit F18.
   *
   * This used to be a one-shot read of the alerts-simple endpoint, in a
   * `useEffect` with an empty dependency list. The tabs never unmount, so that
   * single answer was the answer
   * for the whole session: acknowledging the alert the dot pointed at left the
   * dot exactly where it was, and a badge that survives the thing it describes
   * is worse than no badge, because it is also what a member trusts when it is
   * ABSENT.
   *
   * `features/alerts/attention.ts` holds the reading now, the board invalidates
   * it whenever an alert changes, and returning to the foreground re-asks. Only
   * a CHECKED answer draws a dot: an unreachable service reports `unknown`,
   * which is neither a dot nor a verified all-clear — the same posture
   * `entitlements.ts` takes with the padlock below.
   *
   * In Invest mode the tab is not showing alerts, so it does not carry their
   * badge and does not pay for the request: a dot pointing at a screen you are
   * not on is noise.
   */
  const alertsTabShowsAlerts = !second.desk && !second.comingSoon;
  const attention = useAlertAttention(alertsTabShowsAlerts);

  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: color.bg } }}
      tabBar={(props) => (
        <TabBar
          {...props}
          mode={mode}
          badges={{ alerts: attention.status === 'ready' && attention.needsAttention }}
          locked={{ trade: tradeLocked }}
        />
      )}
    >
      <Tabs.Screen name="home" options={{ title: 'Home' }} />
      <Tabs.Screen name="alerts" options={{ title: second.label }} />
      <Tabs.Screen name="community" options={{ title: 'Community' }} />
      <Tabs.Screen name="trade" options={{ title: 'Trade' }} />
      <Tabs.Screen name="account" options={{ title: 'Account' }} />
    </Tabs>
  );
}
