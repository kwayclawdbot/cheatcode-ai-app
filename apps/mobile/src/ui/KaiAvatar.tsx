import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { alpha, color } from './tokens';
import { Spark } from './Icons';

/**
 * KAI'S AVATAR — a violet disc holding his four-point spark.
 *
 * Redesign V2, panel 1: every Kai message in the thread opens with this mark
 * beside his name and the time. It replaces the glowing orb on Home. Violet is
 * Kai's colour and nothing else's, so the disc is the only violet at rest on
 * the screen; `dim` greys it when he cannot answer, so the mark itself tells
 * the truth about him.
 */
export function KaiAvatar({ size = 30, dim = false, style, testID = 'kai-avatar' }: {
  size?: number; dim?: boolean; style?: StyleProp<ViewStyle>; testID?: string;
}) {
  return (
    <View
      testID={testID}
      aria-hidden
      style={[
        {
          width: size, height: size, borderRadius: size / 2,
          alignItems: 'center', justifyContent: 'center',
          backgroundColor: dim ? color.raised : color.kai,
          borderWidth: dim ? 1 : 0, borderColor: alpha.border,
          boxShadow: dim ? undefined : `0 0 14px ${alpha.kai40}`,
        },
        style,
      ]}
    >
      <Spark size={Math.round(size * 0.55)} color={dim ? color.textSecondary : color.textPrimary} />
    </View>
  );
}
