import React from 'react';
import { View, Pressable } from 'react-native';
import Svg, { Circle, Line, Polyline, Rect } from 'react-native-svg';
import { alpha, color, radius } from './tokens';
import { T, Num } from './Text';

/**
 * V2-O1's teaching chart — polyline + the shaded band where buyers step in.
 * Coordinates are the artboard's own (viewBox 0 0 300 70).
 */
export function BandChart() {
  return (
    <Svg viewBox="0 0 300 70" width="100%" height={70} accessibilityLabel="META price rising above the band where buyers keep stepping in">
      <Rect x={0} y={26} width={300} height={9} fill={alpha.cyan10} />
      <Polyline
        points="0,55 25,58 50,50 75,53 100,45 125,49 150,41 175,44 200,35 225,38 250,29 275,32 300,24"
        fill="none" stroke={color.cyan} strokeWidth={1.8}
      />
      <Circle cx={300} cy={24} r={3} fill={color.cyan} />
    </Svg>
  );
}

export type LevelKey = '460' | '504' | '540';

/**
 * V3-O1's tap-to-learn chart (viewBox 0 0 330 150).
 * Three tappable price levels; 504 is the confirmation level.
 */
export function LevelChart({
  chosen, onChoose, width,
}: { chosen: LevelKey | null; onChoose: (k: LevelKey) => void; width: number }) {
  const H = (150 / 330) * width;
  const yFor: Record<LevelKey, number> = { '540': 22, '504': 64, '460': 128 };

  return (
    <View>
      <Svg viewBox="0 0 330 150" width="100%" height={H}>
        <Line x1={0} y1={22} x2={330} y2={22} stroke={color.green} strokeWidth={1} strokeDasharray="4 3" opacity={0.5} />
        <Rect x={0} y={56} width={330} height={16} fill={alpha.cyan14} />
        <Line x1={0} y1={64} x2={330} y2={64} stroke={color.cyan} strokeWidth={1.4} strokeDasharray="5 4" />
        <Line x1={0} y1={128} x2={330} y2={128} stroke={color.red} strokeWidth={1} strokeDasharray="4 3" opacity={0.5} />
        <Polyline
          points="0,116 27,120 55,108 82,112 110,100 137,105 165,92 192,97 220,83 247,88 275,72 302,76 330,66"
          fill="none" stroke={color.cyan} strokeWidth={2}
        />
        <Circle cx={330} cy={66} r={3.5} fill={color.cyan} />
      </Svg>

      {/* Tap targets: one per level, >=44px tall, centred on the level line. */}
      {(['540', '504', '460'] as LevelKey[]).map((k) => {
        const top = (yFor[k] / 150) * H - 22;
        const isChosen = chosen === k;
        return (
          <Pressable
            key={k}
            testID={`level-${k}`}
            accessibilityRole="button"
            accessibilityLabel={`Level ${k}`}
            accessibilityState={{ selected: isChosen }}
            onPress={() => onChoose(k)}
            style={{ position: 'absolute', left: 0, right: 0, top, height: 44, justifyContent: 'center' }}
          >
            {isChosen ? (
              <View
                style={{
                  position: 'absolute', left: '50%', marginLeft: -29, top: 0, width: 58, height: 44,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <View
                  style={{
                    width: 58, height: 58, borderRadius: 29, borderWidth: 1.5, borderColor: 'rgba(200,255,0,0.8)',
                    backgroundColor: alpha.volt10, alignItems: 'center', justifyContent: 'center',
                    shadowColor: color.volt, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 0 },
                  }}
                >
                  <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: color.volt }} />
                </View>
              </View>
            ) : null}
            <View
              style={{
                position: 'absolute', right: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.sm,
                backgroundColor: color.cyanTint, borderWidth: 0.5, borderColor: alpha.cyan40,
              }}
            >
              <Num size={10} weight="regular" c={color.cyan}>{k}</Num>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export function LevelLegend() {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Num size={10} weight="regular" c={color.red}>460 invalid</Num>
      <Num size={10} weight="regular" c={color.cyan}>504 confirm</Num>
      <Num size={10} weight="regular" c={color.green}>540 target</Num>
    </View>
  );
}

/** V4-TR1 watchlist sparkline (viewBox 0 0 60 20). */
export function Sparkline({ up, points }: { up: boolean; points: string }) {
  return (
    <Svg viewBox="0 0 60 20" width={60} height={20}>
      <Polyline points={points} fill="none" stroke={up ? color.green : color.red} strokeWidth={1.4} />
    </Svg>
  );
}
