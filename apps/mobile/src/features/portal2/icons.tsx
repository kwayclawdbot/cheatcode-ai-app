/**
 * The Trade Detail's own glyphs, on the dock's grid: a 24 viewBox, round caps
 * and joins, drawn at 22 with a 1.75 stroke unless told otherwise.
 *
 * They live beside the screen rather than in `ui/Icons.tsx` so this lane does
 * not edit a file every other screen lane is also adding glyphs to. Promote any
 * of them when a second screen needs it.
 */
import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
import { color } from '../../ui/tokens';

type P = { size?: number; color?: string; strokeWidth?: number };

const S = ({ size = 22, children }: { size?: number; children: React.ReactNode }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">{children}</Svg>
);

export const BackGlyph = ({ size = 22, color: c = color.textPrimary, strokeWidth = 1.75 }: P) => (
  <S size={size}><Path d="M19 12H5M11 5l-7 7 7 7" stroke={c} strokeWidth={strokeWidth} /></S>
);

export const MoreGlyph = ({ size = 22, color: c = color.textPrimary }: P) => (
  <S size={size}>
    <Circle cx={5} cy={12} r={1.6} fill={c} />
    <Circle cx={12} cy={12} r={1.6} fill={c} />
    <Circle cx={19} cy={12} r={1.6} fill={c} />
  </S>
);

export const BookmarkGlyph = ({ size = 18, color: c = color.onAction, strokeWidth = 2 }: P) => (
  <S size={size}><Path d="M6 4h12v16l-6-4-6 4V4z" stroke={c} strokeWidth={strokeWidth} /></S>
);

/** Kai's mark: a four-point spark. Violet, because it only ever marks Kai. */
export const SparkGlyph = ({ size = 18, color: c = color.kai }: P) => (
  <S size={size}>
    <Path d="M12 2c.6 4.6 2.4 6.9 7.5 8.4.5.2.5.9 0 1.1C14.4 13 12.6 15.4 12 20c-.6-4.6-2.4-7-7.5-8.5-.5-.2-.5-.9 0-1.1C9.6 8.9 11.4 6.6 12 2z" fill={c} />
  </S>
);

export const ChevronDownGlyph = ({ size = 16, color: c = color.textSecondary, strokeWidth = 2 }: P) => (
  <S size={size}><Path d="M6 9l6 6 6-6" stroke={c} strokeWidth={strokeWidth} /></S>
);

/** A met checklist line: filled market-green disc, dark tick. */
export const CheckDisc = ({ size = 20 }: P) => (
  <S size={size}>
    <Circle cx={12} cy={12} r={10} fill={color.marketUp} />
    <Path d="M7.5 12.3l3 3 6-6.3" stroke={color.canvas} strokeWidth={2.4} />
  </S>
);

/** A line the grade scored below its top word: an empty ring. */
export const OpenRing = ({ size = 20 }: P) => (
  <S size={size}><Circle cx={12} cy={12} r={9.2} stroke={color.textSecondary} strokeWidth={1.6} /></S>
);

/** A line nothing measured: a dashed ring with a question mark. Never a tick. */
export const UnknownRing = ({ size = 20 }: P) => (
  <S size={size}>
    <Circle cx={12} cy={12} r={9.2} stroke={color.textSecondary} strokeWidth={1.4} strokeDasharray="2.6 2.6" />
    <Path d="M9.8 9.6a2.3 2.3 0 114.1 1.4c-.7.7-1.9 1.1-1.9 2.4" stroke={color.textSecondary} strokeWidth={1.6} />
    <Circle cx={12} cy={16.4} r={0.9} fill={color.textSecondary} />
  </S>
);
