import React, { useEffect, useState } from 'react';
import { Tabs } from 'expo-router';
import { TabBar } from '../../ui/TabBar';
import { color } from '../../ui/tokens';
import { api } from '../../lib/api';
import { fixtureAlertsSimple } from '../../lib/fixtures';
import { useSession } from '../../lib/session';
import { secondTab } from '../../features/nav/second-tab';
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
  const mode: GoalMode = (profile?.primary_mode as GoalMode) ?? 'day_trade';
  const second = secondTab(mode);

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
        <TabBar {...props} mode={mode} badges={{ alerts: !second.desk && needsAttention }} />
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
