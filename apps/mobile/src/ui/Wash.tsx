import React from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { color } from './tokens';

type Blob = { cxPct: number; cyPct: number; rx: number; ry: number; rgb: string; opacity: number; stop: number };

/**
 * The artboards paint the page with CSS radial-gradients. RN has no radial
 * gradient, so each blob is an SVG ellipse with a RadialGradient whose colour
 * stop mirrors the CSS `transparent <pct>` position exactly.
 *
 *   corner: radial-gradient(420px 320px at 20% -5%, rgba(139,77,255,0.14), transparent 60%)
 *         + radial-gradient(380px 300px at 95% 30%, rgba(50,214,255,0.07), transparent 65%)
 *   dome:   radial-gradient(460px 360px at 50% -8%, rgba(139,77,255,0.20), transparent 62%)
 */
const BLOBS: Record<'corner' | 'dome', Blob[]> = {
  corner: [
    { cxPct: 0.2, cyPct: -0.05, rx: 420, ry: 320, rgb: '#8B4DFF', opacity: 0.14, stop: 0.6 },
    { cxPct: 0.95, cyPct: 0.3, rx: 380, ry: 300, rgb: '#32D6FF', opacity: 0.07, stop: 0.65 },
  ],
  dome: [{ cxPct: 0.5, cyPct: -0.08, rx: 460, ry: 360, rgb: '#8B4DFF', opacity: 0.2, stop: 0.62 }],
};

export function Wash({ variant = 'corner' }: { variant?: 'corner' | 'dome' }) {
  const { width, height } = useWindowDimensions();
  const blobs = BLOBS[variant];
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: color.bg }]}>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          {blobs.map((b, i) => (
            <RadialGradient key={i} id={`w${variant}${i}`} cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0" stopColor={b.rgb} stopOpacity={b.opacity} />
              <Stop offset={String(b.stop)} stopColor={b.rgb} stopOpacity={0} />
              <Stop offset="1" stopColor={b.rgb} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        {blobs.map((b, i) => (
          <Ellipse
            key={i}
            cx={width * b.cxPct}
            cy={height * b.cyPct}
            rx={b.rx}
            ry={b.ry}
            fill={`url(#w${variant}${i})`}
          />
        ))}
      </Svg>
    </View>
  );
}
