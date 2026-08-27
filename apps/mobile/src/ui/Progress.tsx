import React from 'react';
import { View } from 'react-native';
import { alpha, color } from './tokens';
import { T } from './Text';

/** S01/S02/S03 top bar: `flex:1; height:4; radius:2; gap:6` filled volt. */
export function ProgressBars({ total, done, testID }: { total: number; done: number; testID?: string }) {
  return (
    <View testID={testID} accessibilityLabel={`Step ${done} of ${total}`} style={{ flexDirection: 'row', gap: 6, marginBottom: 26 }}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i < done ? color.volt : alpha.ivory12 }} />
      ))}
    </View>
  );
}

/** V2-O1 / V3-O1 footer dots: `width:22; height:4; radius:2` + caption. */
export function ProgressDots({ total, done, caption, testID }: { total: number; done: number; caption: string; testID?: string }) {
  return (
    <View testID={testID} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={{ width: 22, height: 4, borderRadius: 2, backgroundColor: i < done ? color.volt : alpha.ivory14 }} />
      ))}
      <T size={11} c={color.muted}>{` ${caption}`}</T>
    </View>
  );
}
