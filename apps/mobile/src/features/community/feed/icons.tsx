/**
 * Community glyphs on the spec's one optical grid: drawn in a 24 box at 22,
 * 1.75 strokes, round caps. Colour is passed by meaning at the call site.
 */
import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { color } from '../../../ui/tokens';

type P = { size?: number; c?: string; fill?: boolean };
const S = ({ size = 22, children }: { size?: number; children: React.ReactNode }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">{children}</Svg>
);
const stroke = (c: string) => ({ stroke: c, strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const });

export const SearchIcon = ({ size, c = color.textPrimary }: P) => (
  <S size={size}><Circle cx={11} cy={11} r={6.5} {...stroke(c)} /><Path d="M20 20l-4.2-4.2" {...stroke(c)} /></S>
);
export const AddPersonIcon = ({ size, c = color.textPrimary }: P) => (
  <S size={size}>
    <Circle cx={10} cy={8} r={3.6} {...stroke(c)} />
    <Path d="M3.5 20c.6-3.6 3.2-5.6 6.5-5.6 1.6 0 3 .4 4.1 1.2" {...stroke(c)} />
    <Path d="M18.5 13.5v6M15.5 16.5h6" {...stroke(c)} />
  </S>
);
export const ReplyIcon = ({ size = 20, c = color.textSecondary }: P) => (
  <S size={size}><Path d="M4.5 18.5l1.2-3.3A7.5 7.5 0 1 1 8.8 18l-4.3.5z" {...stroke(c)} /></S>
);
export const RepostIcon = ({ size = 20, c = color.textSecondary }: P) => (
  <S size={size}>
    <Path d="M7 20l-3-3 3-3" {...stroke(c)} /><Path d="M4 17h11a4 4 0 0 0 4-4v-1" {...stroke(c)} />
    <Path d="M17 4l3 3-3 3" {...stroke(c)} /><Path d="M20 7H9a4 4 0 0 0-4 4v1" {...stroke(c)} />
  </S>
);
export const HeartIcon = ({ size = 20, c = color.textSecondary, fill = false }: P) => (
  <S size={size}>
    <Path
      d="M12 19.5s-7.5-4.4-7.5-10A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.5c0 5.6-7.5 10-7.5 10z"
      {...stroke(c)} fill={fill ? c : 'none'}
    />
  </S>
);
export const BookmarkIcon = ({ size = 20, c = color.textSecondary, fill = false }: P) => (
  <S size={size}><Path d="M7 4h10v16l-5-3.6L7 20z" {...stroke(c)} fill={fill ? c : 'none'} /></S>
);
export const MoreIcon = ({ size = 20, c = color.textSecondary }: P) => (
  <S size={size}>
    <Circle cx={5.5} cy={12} r={1.3} fill={c} /><Circle cx={12} cy={12} r={1.3} fill={c} /><Circle cx={18.5} cy={12} r={1.3} fill={c} />
  </S>
);
export const ImageIcon = ({ size, c = color.textPrimary }: P) => (
  <S size={size}>
    <Rect x={3.5} y={4.5} width={17} height={15} rx={3} {...stroke(c)} />
    <Circle cx={9} cy={10} r={1.6} {...stroke(c)} /><Path d="M20 16l-4.5-4.5L7 19.5" {...stroke(c)} />
  </S>
);
export const ChartBarsIcon = ({ size, c = color.textPrimary }: P) => (
  <S size={size}><Path d="M5 19V13M10 19V6M15 19v-8M20 19V9" {...stroke(c)} /></S>
);
export const BackIcon = ({ size, c = color.textPrimary }: P) => (
  <S size={size}><Path d="M15 5l-7 7 7 7" {...stroke(c)} /></S>
);
export const CloseIcon = ({ size, c = color.textPrimary }: P) => (
  <S size={size}><Path d="M6 6l12 12M18 6L6 18" {...stroke(c)} /></S>
);
export const ExpandIcon = ({ size = 16, c = color.textSecondary }: P) => (
  <S size={size}><Path d="M14 4h6v6M10 20H4v-6M20 4l-6.5 6.5M4 20l6.5-6.5" {...stroke(c)} /></S>
);
export const SendIcon = ({ size = 18, c = color.onAction }: P) => (
  <S size={size}><Path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" {...stroke(c)} strokeWidth={2.2} /></S>
);

/* ── room glyphs, drawn for the rail ─────────────────────────────── */
export const WarRoomGlyph = ({ size = 26, c = color.action }: P) => (
  <S size={size}>
    <Path d="M6 7v10M12 4v16M18 8v8" {...stroke(c)} />
    <Rect x={4.5} y={9} width={3} height={5} rx={0.8} fill={c} />
    <Rect x={10.5} y={7} width={3} height={8} rx={0.8} fill={c} />
    <Rect x={16.5} y={10} width={3} height={4} rx={0.8} fill={c} />
  </S>
);
export const InvestorsGlyph = ({ size = 26, c = color.action }: P) => (
  <S size={size}>
    <Path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14" {...stroke(c)} fill={c} fillOpacity={0.18} />
    <Path d="M5 19c3-4 6-7 10-9" {...stroke(c)} />
  </S>
);
export const WinsGlyph = ({ size = 26, c = color.action }: P) => (
  <S size={size}>
    <Path d="M8 4h8v5a4 4 0 0 1-8 0z" {...stroke(c)} fill={c} fillOpacity={0.18} />
    <Path d="M8 6H5v1.5A2.5 2.5 0 0 0 7.5 10M16 6h3v1.5A2.5 2.5 0 0 1 16.5 10M12 13v3.5M8.5 20h7M9.5 20l.5-3.5h4l.5 3.5" {...stroke(c)} />
  </S>
);
export const AskKaiGlyph = ({ size = 26, c = color.kai }: P) => (
  <S size={size}>
    <Path d="M12 3.5c.7 4.6 3.9 7.8 8.5 8.5-4.6.7-7.8 3.9-8.5 8.5-.7-4.6-3.9-7.8-8.5-8.5 4.6-.7 7.8-3.9 8.5-8.5z" fill={c} />
  </S>
);
export const BeginnersGlyph = ({ size = 26, c = color.action }: P) => (
  <S size={size}>
    <Path d="M12 20v-8" {...stroke(c)} />
    <Path d="M12 12c0-4-2.5-6.5-7-6.5 0 4 2.5 6.5 7 6.5zM12 14c0-3.5 2.2-5.8 6.5-5.8 0 3.5-2.2 5.8-6.5 5.8z" {...stroke(c)} fill={c} fillOpacity={0.18} />
  </S>
);
export const RoomGlyph = ({ size = 26, c = color.action }: P) => (
  <S size={size}><Path d="M5 18.5l1-3A7 7 0 1 1 8.6 18z" {...stroke(c)} /></S>
);
