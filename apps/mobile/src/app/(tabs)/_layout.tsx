import React, { useEffect, useState } from 'react';
import { Tabs } from 'expo-router';
import { TabBar } from '../../ui/TabBar';
import { color } from '../../ui/tokens';
import { api } from '../../lib/api';
import { fixtureAlertLifecycle } from '../../lib/fixtures';

/** L6 nav: Home · Alerts · Community · Trade · Account (owner-confirmed). */
export default function TabsLayout() {
  // The badge is a real count of alerts that need a decision — never decorative.
  const [needsAttention, setNeedsAttention] = useState(
    !api.available() && fixtureAlertLifecycle.needs_attention.length > 0,
  );

  useEffect(() => {
    let alive = true;
    if (!api.available()) return;
    api.alertsLifecycle()
      .then((d) => { if (alive) setNeedsAttention(d.needs_attention.length > 0); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: color.bg } }}
      tabBar={(props) => <TabBar {...props} badges={{ alerts: needsAttention }} />}
    >
      <Tabs.Screen name="home" options={{ title: 'Home' }} />
      <Tabs.Screen name="alerts" options={{ title: 'Alerts' }} />
      <Tabs.Screen name="community" options={{ title: 'Community' }} />
      <Tabs.Screen name="trade" options={{ title: 'Trade' }} />
      <Tabs.Screen name="account" options={{ title: 'Account' }} />
    </Tabs>
  );
}
