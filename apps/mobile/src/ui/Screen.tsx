import React from 'react';
import { View, ViewStyle, StyleProp } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Wash } from './Wash';
import { chrome } from './tokens';

/**
 * Screen = background wash + safe-area padding.
 * The mockups' 9:41 bar, notch and home indicator are presentation chrome, not
 * product UI (build brief). We use real insets, floored at the artboard's own
 * content offsets so the web render matches the artboard rhythm.
 */
export function Screen({
  children,
  variant = 'corner',
  layout = 'tab',
  style,
  testID,
}: {
  children: React.ReactNode;
  variant?: 'corner' | 'dome';
  /** 'tab' = padding-top:62 only (tab bar owns the bottom); 'stack' = 74/20/40 */
  layout?: 'tab' | 'stack';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const insets = useSafeAreaInsets();
  const pad: ViewStyle =
    layout === 'tab'
      ? { paddingTop: Math.max(insets.top, chrome.tabScreenTop) }
      : {
          paddingTop: Math.max(insets.top, chrome.stackScreenTop),
          paddingHorizontal: 20,
          paddingBottom: Math.max(insets.bottom, chrome.stackScreenBottom),
        };

  return (
    <View testID={testID} style={[{ flex: 1 }, pad, style]}>
      <Wash variant={variant} />
      {children}
    </View>
  );
}
