import React, { useId } from 'react';
import { View } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Circle } from 'react-native-svg';
import { color } from '../../../ui/tokens';

/**
 * Kai's orb, with a per-instance gradient id.
 *
 * `src/ui/KaiOrb.tsx` (lane MOBILE-A) derives its SVG gradient id from the
 * size — `orb22` — so two orbs of the same size in one document collide, and on
 * web the second one paints nothing. expo-router keeps the previous stack
 * screen mounted while a new one is pushed, which makes that collision the
 * normal case here: a room with a Kai object underneath a composer with a Kai
 * panel. Same artboard gradient, unique id.
 */
export function KaiDot({ size = 22, glow = true, testID }: { size?: number; glow?: boolean; testID?: string }) {
  const id = `kai-orb-${useId().replace(/[^a-zA-Z0-9]/g, '')}-${size}`;
  return (
    <View
      testID={testID}
      accessibilityLabel="Kai"
      style={[
        { width: size, height: size, borderRadius: size / 2 },
        glow
          ? { shadowColor: color.violet, shadowOpacity: 0.55, shadowRadius: size * 0.47, shadowOffset: { width: 0, height: 0 }, elevation: 6 }
          : null,
      ]}
    >
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id={id} cx="35%" cy="35%" r="70%">
            <Stop offset="0" stopColor={color.violetLight} />
            <Stop offset="0.55" stopColor={color.violet} />
            <Stop offset="1" stopColor={color.violetDeep} />
          </RadialGradient>
        </Defs>
        <Circle cx="50" cy="50" r="50" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}
