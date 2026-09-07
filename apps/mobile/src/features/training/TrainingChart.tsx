import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { alpha, color, radius } from '../../ui/tokens';

export function TrainingChart({
  annotated = false,
  practice = false,
}: {
  annotated?: boolean;
  practice?: boolean;
}) {
  const candles = [
    [48, 214, 52, 30, 'g'], [78, 184, 46, 28, 'r'], [108, 199, 49, 29, 'g'],
    [138, 166, 46, 31, 'g'], [168, 143, 43, 28, 'r'], [198, 157, 50, 31, 'g'],
    [228, 124, 44, 29, 'g'], [258, 105, 42, 25, 'r'], [288, 119, 45, 28, 'g'],
    [318, 89, 41, 29, 'g'], [348, 72, 39, 25, 'r'], [378, 84, 44, 27, 'g'],
    [408, 55, 39, 28, 'g'], [438, 42, 36, 24, 'r'], [468, 51, 39, 27, 'g'],
    [498, 27, 32, 24, 'g'],
  ] as const;

  return (
    <View style={{
      borderRadius: radius.xl,
      overflow: 'hidden',
      borderWidth: 0.5,
      borderColor: alpha.ivory12,
      backgroundColor: color.surface3,
    }}>
      <Svg width="100%" height={250} viewBox="0 0 550 270">
        <Rect width="550" height="270" fill={color.surface3} />
        {[45, 95, 145, 195, 245].map((y) => (
          <Line key={y} x1={36} x2={530} y1={y} y2={y} stroke={alpha.ivory07} />
        ))}
        <Path
          d="M40 236 C85 210,103 226,140 188 S203 196,235 156 S291 164,325 121 S382 132,419 88 S470 103,512 48"
          fill="none"
          stroke={color.cyan}
          strokeWidth={2.3}
          opacity={0.48}
        />
        {candles.map(([x, y, wick, body, tone], i) => {
          const c = tone === 'g' ? color.green : color.red;
          return (
            <G key={i}>
              <Line x1={x} x2={x} y1={y - 12} y2={y + wick} stroke={c} strokeWidth={2} />
              <Rect x={x - 6} y={y} width={12} height={body} rx={2} fill={c} />
            </G>
          );
        })}

        {annotated ? (
          <>
            <Line x1={63} y1={229} x2={494} y2={46} stroke={color.volt} strokeWidth={2.4} />
            <Line x1={348} y1={58} x2={478} y2={58} stroke={color.volt} strokeWidth={2} />
            <SvgText x={399} y={48} fill={color.volt} fontSize={12}>Higher High</SvgText>
            <Line x1={315} y1={119} x2={409} y2={119} stroke={color.volt} strokeWidth={2} />
            <SvgText x={350} y={137} fill={color.volt} fontSize={12}>Higher Low</SvgText>
          </>
        ) : null}

        {practice ? (
          <>
            <Rect x={346} y={78} width={120} height={64} fill={alpha.green12} stroke={color.green} strokeDasharray="6 5" />
            <Rect x={346} y={142} width={120} height={56} fill={alpha.red10} stroke={color.red} strokeDasharray="6 5" />
            <Circle cx={346} cy={142} r={10} fill={color.cyan} stroke={color.text} strokeWidth={2} />
            <SvgText x={482} y={104} fill={color.green} fontSize={12}>TARGET</SvgText>
            <SvgText x={482} y={176} fill={color.red} fontSize={12}>STOP</SvgText>
          </>
        ) : null}
      </Svg>
    </View>
  );
}
