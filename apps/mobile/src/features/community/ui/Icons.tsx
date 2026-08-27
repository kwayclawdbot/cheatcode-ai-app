import React from 'react';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { color } from '../../../ui/tokens';

/**
 * Glyphs this lane needs that `src/ui/Icons.tsx` (lane MOBILE-A) does not ship.
 * Path data lifted from the artboard <svg> markup (V3-C1, S81, S85, V3-T2).
 */
export type IconProps = { size?: number; color?: string; strokeWidth?: number };

const S = ({ size = 20, children }: { size?: number; children: React.ReactNode }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">{children}</Svg>
);

export const ChevronLeft = ({ size = 20, color: c = color.text, strokeWidth = 2.2 }: IconProps) => (
  <S size={size}><Path d="M15 5l-7 7 7 7" stroke={c} strokeWidth={strokeWidth} /></S>
);

export const Send = ({ size = 15, color: c = color.bg, strokeWidth = 2.2 }: IconProps) => (
  <S size={size}><Path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" stroke={c} strokeWidth={strokeWidth} /></S>
);

export const Eye = ({ size = 11, color: c = color.muted, strokeWidth = 2 }: IconProps) => (
  <S size={size}>
    <Circle cx={12} cy={12} r={3} stroke={c} strokeWidth={strokeWidth} />
    <Path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" stroke={c} strokeWidth={strokeWidth} />
  </S>
);

export const MoreDots = ({ size = 20, color: c = color.text }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={c}>
    <Circle cx={5} cy={12} r={1.8} />
    <Circle cx={12} cy={12} r={1.8} />
    <Circle cx={19} cy={12} r={1.8} />
  </Svg>
);

export const Pin = ({ size = 12, color: c = color.violetLight, strokeWidth = 2 }: IconProps) => (
  <S size={size}><Path d="M12 17v5M9 3h6l1 7 3 2H5l3-2 1-7z" stroke={c} strokeWidth={strokeWidth} /></S>
);

export const MuteGlyph = ({ size = 16, color: c = color.muted, strokeWidth = 2 }: IconProps) => (
  <S size={size}><Path d="M11 5 6 9H2v6h4l5 4V5zM22 9l-6 6M16 9l6 6" stroke={c} strokeWidth={strokeWidth} /></S>
);

export const Flag = ({ size = 16, color: c = color.red, strokeWidth = 2 }: IconProps) => (
  <S size={size}><Path d="M5 22V3M5 4h13l-2.5 4.5L18 13H5" stroke={c} strokeWidth={strokeWidth} /></S>
);

export const Warn = ({ size = 16, color: c = color.gold, strokeWidth = 2.2 }: IconProps) => (
  <S size={size}>
    <Circle cx={12} cy={12} r={9} stroke={c} strokeWidth={strokeWidth} />
    <Path d="M12 8v5M12 16.5v.5" stroke={c} strokeWidth={strokeWidth} />
  </S>
);

export const CircleX = ({ size = 16, color: c = color.red, strokeWidth = 2.2 }: IconProps) => (
  <S size={size}>
    <Circle cx={12} cy={12} r={9} stroke={c} strokeWidth={strokeWidth} />
    <Path d="M9 9l6 6M15 9l-6 6" stroke={c} strokeWidth={strokeWidth} />
  </S>
);

export const Sparkline = ({ size = 15, color: c = color.cyan, strokeWidth = 2 }: IconProps) => (
  <S size={size}><Path d="M3 17l5-6 4 3 6-8" stroke={c} strokeWidth={strokeWidth} /></S>
);

export const Doc = ({ size = 14, color: c = color.muted, strokeWidth = 2 }: IconProps) => (
  <S size={size}>
    <Path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z" stroke={c} strokeWidth={strokeWidth} />
    <Path d="M14 3v5h5" stroke={c} strokeWidth={strokeWidth} />
  </S>
);

export const Speech = ({ size = 14, color: c = color.muted, strokeWidth = 2 }: IconProps) => (
  <S size={size}><Path d="M21 12a8 8 0 0 1-8 8H7l-4 3V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z" stroke={c} strokeWidth={strokeWidth} /></S>
);

export const Replay = ({ size = 15, color: c = color.bg, strokeWidth = 2.2 }: IconProps) => (
  <S size={size}>
    <Path d="M3 12a9 9 0 1 0 3-6.7" stroke={c} strokeWidth={strokeWidth} />
    <Path d="M3 4v5h5" stroke={c} strokeWidth={strokeWidth} />
  </S>
);

export const Bookmark = ({ size = 15, color: c = color.text, strokeWidth = 2.2 }: IconProps) => (
  <S size={size}><Path d="M6 3h12v18l-6-4.5L6 21V3z" stroke={c} strokeWidth={strokeWidth} /></S>
);

export const Slow = ({ size = 11, color: c = color.gold, strokeWidth = 2 }: IconProps) => (
  <S size={size}>
    <Circle cx={12} cy={12} r={9} stroke={c} strokeWidth={strokeWidth} />
    <Path d="M12 7v5l3 3" stroke={c} strokeWidth={strokeWidth} />
  </S>
);

export const Grid = ({ size = 14, color: c = color.muted, strokeWidth = 2 }: IconProps) => (
  <S size={size}>
    <Rect x={3} y={3} width={7} height={7} rx={1.5} stroke={c} strokeWidth={strokeWidth} />
    <Rect x={14} y={3} width={7} height={7} rx={1.5} stroke={c} strokeWidth={strokeWidth} />
    <Rect x={3} y={14} width={7} height={7} rx={1.5} stroke={c} strokeWidth={strokeWidth} />
    <Rect x={14} y={14} width={7} height={7} rx={1.5} stroke={c} strokeWidth={strokeWidth} />
  </S>
);
