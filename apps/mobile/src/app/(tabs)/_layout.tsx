import React, { useEffect, useState } from 'react';
import { Tabs } from 'expo-router';
import { TabBar } from '../../ui/TabBar';
import { color } from '../../ui/tokens';
import { api } from '../../lib/api';
import { fixtureAlertsSimple } from '../../lib/fixtures';
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

  // The badge is a real count of alerts that need a decision — never decorative.
  // In Invest mode the tab is not showing alerts, so it does not carry their
  // badge: a dot that points at a screen you are not on is noise.
  const [needsAttention, setNeedsAttention] = useState(
    !api.available() && fixtureAlertsSimple.attention.length > 0,
  );

  useEffect(() => {
    let alive = true;
    if (!api.available()) return;
    api.alertsSimple()
      .then((d) => { if (alive) setNeedsAttention(d.attention.length > 0); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: color.bg } }}
      tabBar={(props) => (
        <TabBar
          {...props}
          mode={mode}
          badges={{ alerts: !second.desk && !second.comingSoon && needsAttention }}
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
