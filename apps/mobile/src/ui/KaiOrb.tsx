import React from 'react';
import { View } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Circle } from 'react-native-svg';
import { color } from './tokens';

/**
 * Kai's orb — the one violet object.
 * Artboard: radial-gradient(circle at 35% 35%, #CBB2FF, #8B4DFF 55%, #3B1685)
 *           + box-shadow 0 0 14px rgba(139,77,255,0.55)
 */
export function KaiOrb({ size = 30, glow = true, testID }: { size?: number; glow?: boolean; testID?: string }) {
  return (
    <View
      testID={testID}
      accessibilityLabel="Kai"
      style={[
        { width: size, height: size, borderRadius: size / 2 },
        glow
          ? {
              shadowColor: color.violet,
              shadowOpacity: 0.55,
              shadowRadius: size * 0.47,
              shadowOffset: { width: 0, height: 0 },
              elevation: 6,
            }
          : null,
      ]}
    >
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id={`orb${size}`} cx="35%" cy="35%" r="70%">
            <Stop offset="0" stopColor={color.violetLight} />
            <Stop offset="0.55" stopColor={color.violet} />
            <Stop offset="1" stopColor={color.violetDeep} />
          </RadialGradient>
        </Defs>
        <Circle cx="50" cy="50" r="50" fill={`url(#orb${size})`} />
      </Svg>
    </View>
  );
}
