import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { alpha, chrome, color, layout } from './tokens';
import { T } from './Text';
import { HomeGlyph, Bell, Users, TradeBars, AccountGlyph, DeskGlyph, Lock } from './Icons';
import { DEFAULT_MODE, secondTab } from '../features/nav/second-tab';
import type { GoalMode } from '../lib/types';

type Item = { name: string; label: string; Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }> };

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
    { name: 'trade', label: 'Trade', Icon: TradeBars },
    { name: 'account', label: 'Account', Icon: AccountGlyph },
  ];
}

export function TabBar({ state, navigation, badges, locked, mode = DEFAULT_MODE }: BottomTabBarProps & {
  badges?: Record<string, boolean>;
  locked?: Record<string, boolean>;
  mode?: GoalMode;
}) {
  return (
    <Dock
      active={state.routes[state.index]?.name}
      onNavigate={(name) => navigation.navigate(name)}
      badges={badges}
      locked={locked}
      mode={mode}
    />
  );
}

/**
 * THE DOCK ITSELF — the same five items, drawn the same way, wherever it is.
 *
 * `TabBar` is the tab navigator's adapter onto it. A stacked route that is still
 * a primary screen — the Trade section at `/trade/[symbol]`, which is where the
 * Trade tab resolves to — mounts this directly with `active="trade"`, so the
 * spec's "the bottom dock stays identical across all primary screens" holds
 * there too. `onNavigate` is the only difference between the two callers.
 */
export function Dock({ active: activeName, onNavigate, badges, locked, mode = DEFAULT_MODE }: {
  /** The route name of the item to draw as active. */
  active: string | undefined;
  onNavigate: (name: string) => void;
  badges?: Record<string, boolean>;
  /**
   * Tabs this plan does not include. FIVE STAYS FIVE — a locked tab is drawn,
   * not removed, and that is a deliberate product call rather than laziness: a
   * free account should be able to see that the Trade section exists and what
   * it costs, and dropping to four items would both break the owner's nav and
   * hide the thing they might pay for.
   *
   * IT GRANTS AND BLOCKS NOTHING. Tapping it goes to the same route it always
   * did; the route asks the server, the server refuses, and the refusal screen
   * explains. This is a mark on a glyph.
   */
  locked?: Record<string, boolean>;
  /** The person's `primary_mode`. Decides what the second tab is called. */
  mode?: GoalMode;
}) {
  const insets = useSafeAreaInsets();
  const ITEMS = items(mode);

  /**
   * THE DOCK (redesign 2026-09-21). Identical on every primary screen: five
   * items, 22px glyphs at a 1.75 stroke on one optical grid, active in action
   * orange, inactive in the secondary ink. Translucent blur lives here and on
   * the composers and NOWHERE else — it is how persistent navigation is told
   * from content. The blur sits under a dock-coloured veil, so a platform
   * that cannot blur (older Android, a reduced-transparency setting) still
   * paints a legible, near-opaque bar instead of see-through text.
   */
  return (
    <View
      testID="tab-bar"
      style={{
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingTop: 6,
        paddingHorizontal: 8,
        paddingBottom: Math.max(insets.bottom, chrome.tabBarBottom),
        borderTopWidth: layout.border,
        borderTopColor: alpha.border,
        overflow: 'hidden',
      }}
    >
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: alpha.dock }]} />
      {ITEMS.map(({ name, label, Icon }) => {
        const active = activeName === name;
        const shut = Boolean(locked?.[name]) && !active;
        const c = active ? color.action : color.textSecondary;
        return (
          <Pressable
            key={name}
            testID={`tab-${name}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={shut ? `${label}. Not on your plan.` : label}
            onPress={() => {
              if (!active) onNavigate(name);
            }}
            style={{ flex: 1, alignItems: 'center', gap: 4, minWidth: 44, minHeight: 50, justifyContent: 'center' }}
          >
            <View>
              <Icon size={layout.navIcon} color={c} strokeWidth={layout.navStroke} />
              {badges?.[name] ? (
                <View style={{ position: 'absolute', top: -1, right: -4, width: 8, height: 8, borderRadius: 4, backgroundColor: color.action, borderWidth: 1.5, borderColor: color.canvas }} />
              ) : null}
              {shut ? (
                <View style={{ position: 'absolute', top: -3, right: -8 }} testID={`tab-${name}-locked`}>
                  <Lock size={11} color={color.textSecondary} strokeWidth={2.2} />
                </View>
              ) : null}
            </View>
            <T variant="meta" weight={active ? 'semibold' : 'medium'} c={c}>{label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}
