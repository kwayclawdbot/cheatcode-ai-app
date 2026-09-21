import React from 'react';
import { Tabs } from 'expo-router';
import { TabBar } from '../../ui/TabBar';
import { color } from '../../ui/tokens';
import { useDockState } from '../../features/nav/dock-state';

/**
 * L6 nav: Home · Alerts · Community · Trade · Account (owner-confirmed).
 *
 * The second tab is the one that reads `primary_mode`: alerts for a day trader
 * and a swing trader, the research desk for an investor. Same route, same slot,
 * different job — the tab bar stays at five because five is the ceiling on a
 * phone, and Invest finally means something.
 *
 * WHAT THE DOCK CARRIES — the mode, the attention dot on Alerts (audit F18) and
 * the courtesy padlock on Trade (migration 0030, audit F17) — is worked out in
 * `features/nav/dock-state.ts`. It moved there so the Trade section, a stacked
 * route that draws the same dock itself, reads it from the same place; the
 * reasoning for each piece is written down there.
 */
export default function TabsLayout() {
  const { mode, second, badges, locked } = useDockState();

  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: color.bg } }}
      tabBar={(props) => (
        <TabBar
          {...props}
          mode={mode}
          badges={badges}
          locked={locked}
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
