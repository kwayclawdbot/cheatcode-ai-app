import React from 'react';
import { View, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from 'expo-router/build/layouts/Tabs';
import { alpha, chrome, color } from './tokens';
import { T } from './Text';
import { HomeGlyph, Bell, Users, TradeGlyph, AccountGlyph } from './Icons';

/** L6 nav, owner-confirmed: Home · Alerts · Community · Trade · Account. */
const ITEMS: { name: string; label: string; Icon: React.ComponentType<{ size?: number; color?: string }> }[] = [
  { name: 'home', label: 'Home', Icon: HomeGlyph },
  { name: 'alerts', label: 'Alerts', Icon: Bell },
  { name: 'community', label: 'Community', Icon: Users },
  { name: 'trade', label: 'Trade', Icon: TradeGlyph },
  { name: 'account', label: 'Account', Icon: AccountGlyph },
];

export function TabBar({ state, navigation, badges }: BottomTabBarProps & { badges?: Record<string, boolean> }) {
  const insets = useSafeAreaInsets();
  const activeName = state.routes[state.index]?.name;

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
