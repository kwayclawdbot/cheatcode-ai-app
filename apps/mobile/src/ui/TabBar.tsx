import React from 'react';
import { View, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { alpha, chrome, color } from './tokens';
import { T } from './Text';
import { HomeGlyph, Bell, Users, TradeGlyph, AccountGlyph, DeskGlyph } from './Icons';
import { secondTab } from '../features/nav/second-tab';
import type { GoalMode } from '../lib/types';

type Item = { name: string; label: string; Icon: React.ComponentType<{ size?: number; color?: string }> };

/**
 * L6 nav, owner-confirmed: Home · [Alerts | Research] · Community · Trade · Account.
 *
 * Five items, and it stays five. The second one is the only one that moves: it
 * is the alerts bell in Day Trade and Swing, and the research desk in Invest.
 * The word under the glyph changes with it, because "Alerts" over a screen of
 * themes and a watchlist is a lie the tab bar would be telling all day.
 */
function items(mode: GoalMode): Item[] {
  const second = secondTab(mode);
  return [
    { name: 'home', label: 'Home', Icon: HomeGlyph },
    { name: 'alerts', label: second.label, Icon: second.icon === 'desk' ? DeskGlyph : Bell },
    { name: 'community', label: 'Community', Icon: Users },
    { name: 'trade', label: 'Trade', Icon: TradeGlyph },
    { name: 'account', label: 'Account', Icon: AccountGlyph },
  ];
}

export function TabBar({ state, navigation, badges, mode = 'day_trade' }: BottomTabBarProps & {
  badges?: Record<string, boolean>;
  /** The person's `primary_mode`. Decides what the second tab is called. */
  mode?: GoalMode;
}) {
  const insets = useSafeAreaInsets();
  const activeName = state.routes[state.index]?.name;
  const ITEMS = items(mode);

  return (
    <View
      testID="tab-bar"
      style={{
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingTop: 8,
        paddingHorizontal: 8,
        paddingBottom: Math.max(insets.bottom, chrome.tabBarBottom),
        borderTopWidth: 1,
        borderTopColor: alpha.ivory07,
        backgroundColor: color.bg,
      }}
    >
      {ITEMS.map(({ name, label, Icon }) => {
        const active = activeName === name;
        const c = active ? color.volt : color.muted;
        return (
          <Pressable
            key={name}
            testID={`tab-${name}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={label}
            onPress={() => {
              if (!active) navigation.navigate(name);
            }}
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            style={{ alignItems: 'center', gap: 3, minWidth: 44, minHeight: 44, justifyContent: 'center' }}
          >
            <View>
              <Icon size={20} color={c} />
              {badges?.[name] ? (
                <View style={{ position: 'absolute', top: -2, right: -6, width: 7, height: 7, borderRadius: 3.5, backgroundColor: color.gold }} />
              ) : null}
            </View>
            <T size={10} weight={active ? 'semibold' : 'regular'} c={c}>{label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}
