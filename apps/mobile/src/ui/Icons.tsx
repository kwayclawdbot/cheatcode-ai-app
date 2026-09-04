import React from 'react';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { color } from './tokens';

/** Every glyph below is the exact path data from the artboard <svg> markup. */
export type IconProps = { size?: number; color?: string; strokeWidth?: number };

const S = ({ size = 20, children }: { size?: number; children: React.ReactNode }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">{children}</Svg>
);

export const Bolt = ({ size = 20, color: c = color.volt, strokeWidth = 2 }: IconProps) => (
  <S size={size}><Path d="M13 3 4 14h6l-1 7 9-11h-6l1-7z" stroke={c} strokeWidth={strokeWidth} /></S>
);

export const Calendar = ({ size = 20, color: c = color.muted, strokeWidth = 2 }: IconProps) => (
  <S size={size}>
    <Rect x={3} y={4} width={18} height={17} rx={2} stroke={c} strokeWidth={strokeWidth} />
    <Path d="M8 2v4M16 2v4M3 10h18" stroke={c} strokeWidth={strokeWidth} />
  </S>
);

export const Bars = ({ size = 20, color: c = color.muted, strokeWidth = 2 }: IconProps) => (
  <S size={size}><Path d="M3 21h18M6 21V11M12 21V5M18 21v-8" stroke={c} strokeWidth={strokeWidth} /></S>
);

export const Check = ({ size = 18, color: c = color.volt, strokeWidth = 2.6 }: IconProps) => (
  <S size={size}><Path d="M20 6 9 17l-5-5" stroke={c} strokeWidth={strokeWidth} /></S>
);

export const ArrowRight = ({ size = 15, color: c = color.bg, strokeWidth = 2.4 }: IconProps) => (
  <S size={size}><Path d="M5 12h14M13 6l6 6-6 6" stroke={c} strokeWidth={strokeWidth} /></S>
);

export const ArrowUp = ({ size = 16, color: c = color.bg, strokeWidth = 2.4 }: IconProps) => (
  <S size={size}><Path d="M12 19V5M6 11l6-6 6 6" stroke={c} strokeWidth={strokeWidth} /></S>
);

export const Clock = ({ size = 12, color: c = color.gold, strokeWidth = 2 }: IconProps) => (
  <S size={size}>
    <Circle cx={12} cy={12} r={9} stroke={c} strokeWidth={strokeWidth} />
    <Path d="M12 7v5l3 3" stroke={c} strokeWidth={strokeWidth} />
  </S>
);

export const Info = ({ size = 11, color: c = color.muted, strokeWidth = 2 }: IconProps) => (
  <S size={size}>
    <Circle cx={12} cy={12} r={9} stroke={c} strokeWidth={strokeWidth} />
    <Path d="M12 8v5M12 16.5v.5" stroke={c} strokeWidth={strokeWidth} />
  </S>
);

export const Mic = ({ size = 16, color: c = color.bg, strokeWidth = 2.2 }: IconProps) => (
  <S size={size}>
    <Rect x={9} y={2} width={6} height={12} rx={3} stroke={c} strokeWidth={strokeWidth} />
    <Path d="M5 10a7 7 0 0 0 14 0M12 19v3" stroke={c} strokeWidth={strokeWidth} />
  </S>
);

export const HomeGlyph = ({ size = 20, color: c = color.muted, strokeWidth = 2 }: IconProps) => (
  <S size={size}><Path d="M3 10 12 3l9 7v10h-6v-6h-6v6H3V10z" stroke={c} strokeWidth={strokeWidth} /></S>
);

export const Bell = ({ size = 20, color: c = color.muted, strokeWidth = 2 }: IconProps) => (
  <S size={size}>
    <Path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" stroke={c} strokeWidth={strokeWidth} />
    <Path d="M13.7 21a2 2 0 0 1-3.4 0" stroke={c} strokeWidth={strokeWidth} />
  </S>
);

/**
 * The research desk: a written argument, not a notification.
 * Drawn as a bound page with lines, so it can never be mistaken for the bell it
 * replaces in Invest mode — or for the people glyph beside it.
 */
export const DeskGlyph = ({ size = 20, color: c = color.muted, strokeWidth = 2 }: IconProps) => (
  <S size={size}>
    <Rect x={4} y={3} width={16} height={18} rx={2} stroke={c} strokeWidth={strokeWidth} />
    <Path d="M8.5 3v18" stroke={c} strokeWidth={strokeWidth} />
    <Path d="M11.5 8h5M11.5 12h5M11.5 16h3" stroke={c} strokeWidth={strokeWidth} />
  </S>
);

export const Users = ({ size = 20, color: c = color.muted, strokeWidth = 2 }: IconProps) => (
  <S size={size}>
    <Path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" stroke={c} strokeWidth={strokeWidth} />
    <Circle cx={9.5} cy={7} r={4} stroke={c} strokeWidth={strokeWidth} />
    <Path d="M22 21v-2a4 4 0 0 0-3-3.87" stroke={c} strokeWidth={strokeWidth} />
    <Path d="M15.5 3.13a4 4 0 0 1 0 7.75" stroke={c} strokeWidth={strokeWidth} />
  </S>
);

/** V4-TR1 nav glyph for Trade (sliders / levels) */
export const TradeGlyph = ({ size = 20, color: c = color.muted, strokeWidth = 2 }: IconProps) => (
  <S size={size}>
    <Path d="M7 4v3M7 17v3M17 2v3M17 14v3" stroke={c} strokeWidth={strokeWidth} />
    <Rect x={5} y={7} width={4} height={10} rx={1} stroke={c} strokeWidth={strokeWidth} />
    <Rect x={15} y={5} width={4} height={9} rx={1} stroke={c} strokeWidth={strokeWidth} />
  </S>
);

export const AccountGlyph = ({ size = 20, color: c = color.muted, strokeWidth = 2 }: IconProps) => (
  <S size={size}>
    <Circle cx={12} cy={8} r={4} stroke={c} strokeWidth={strokeWidth} />
    <Path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" stroke={c} strokeWidth={strokeWidth} />
  </S>
);

export const Search = ({ size = 15, color: c = color.muted, strokeWidth = 2 }: IconProps) => (
  <S size={size}>
    <Circle cx={11} cy={11} r={7} stroke={c} strokeWidth={strokeWidth} />
    <Path d="M21 21l-4.3-4.3" stroke={c} strokeWidth={strokeWidth} />
  </S>
);

export const Plus = ({ size = 13, color: c = color.muted, strokeWidth = 2 }: IconProps) => (
  <S size={size}><Path d="M12 5v14M5 12h14" stroke={c} strokeWidth={strokeWidth} /></S>
);

export const ChevronDown = ({ size = 9, color: c = color.volt, strokeWidth = 2.5 }: IconProps) => (
  <S size={size}><Path d="M6 9l6 6 6-6" stroke={c} strokeWidth={strokeWidth} /></S>
);

export const ChevronRight = ({ size = 9, color: c = color.volt, strokeWidth = 2.5 }: IconProps) => (
  <S size={size}><Path d="M9 6l6 6-6 6" stroke={c} strokeWidth={strokeWidth} /></S>
);

export const Gear = ({ size = 18, color: c = color.muted, strokeWidth = 2 }: IconProps) => (
  <S size={size}>
    <Circle cx={12} cy={12} r={3} stroke={c} strokeWidth={strokeWidth} />
    <Path
      d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
      stroke={c} strokeWidth={strokeWidth}
    />
  </S>
);

export const Lock = ({ size = 20, color: c = color.muted, strokeWidth = 2 }: IconProps) => (
  <S size={size}>
    <Rect x={3} y={7} width={18} height={13} rx={2} stroke={c} strokeWidth={strokeWidth} />
    <Path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke={c} strokeWidth={strokeWidth} />
  </S>
);
