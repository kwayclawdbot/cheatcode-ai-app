/**
 * THE V2 CARD'S INSTRUMENTS — the pieces that make an alert card read as a
 * market instrument rather than a notification (redesign 2026-09-21, "Alert
 * cards are market instruments"):
 *
 *   MicroChart     real bars, merged into at most ~40 candles, no axes
 *   WindowToggle   24h | 72h over the chart
 *   RangeRail      stop – entry – target with the current price on it
 *   AnalyticsRow   the secondary facts, each with a small glyph
 *   BookmarkButton the one trailing control a card has besides itself
 *
 * Colour law: green and red are market meaning only (candles, stop, target);
 * orange is the member's action (the selected window, a saved bookmark); the
 * entry is off-white. Nothing here is violet — nothing here is Kai speaking.
 */
import React, { useState } from 'react';
import { Pressable, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { T, Num } from '../../ui/Text';
import { alpha, color, radius } from '../../ui/tokens';
import { hitSlopFor } from '../../ui/touch';
import { bucketBars, type AnalyticsCell, type Range } from './card-model';
import type { Candle } from '../../lib/types';

/* ------------------------------------------------------------------ */
/* glyphs                                                              */
/* ------------------------------------------------------------------ */

type G = { size?: number; c?: string };
const Glyph = ({ size = 16, children }: { size?: number; children: React.ReactNode }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">{children}</Svg>
);

export const SearchGlyph = ({ size = 22, c = color.textPrimary }: G) => (
  <Glyph size={size}><Circle cx={11} cy={11} r={6.5} stroke={c} strokeWidth={1.75} /><Path d="m20 20-4.2-4.2" stroke={c} strokeWidth={1.75} /></Glyph>
);
export const FilterGlyph = ({ size = 22, c = color.textPrimary }: G) => (
  <Glyph size={size}><Path d="M4 7h16M7 12h10M10 17h4" stroke={c} strokeWidth={1.75} /></Glyph>
);
export const BellGlyph = ({ size = 22, c = color.textPrimary }: G) => (
  <Glyph size={size}>
    <Path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16z" stroke={c} strokeWidth={1.75} />
    <Path d="M10 20.5a2.2 2.2 0 0 0 4 0" stroke={c} strokeWidth={1.75} />
  </Glyph>
);
export const BookmarkGlyph = ({ size = 20, c = color.textPrimary, filled = false }: G & { filled?: boolean }) => (
  <Glyph size={size}><Path d="M7 4h10v16l-5-3.6L7 20V4z" stroke={c} strokeWidth={1.75} fill={filled ? c : 'none'} /></Glyph>
);
const RrGlyph = ({ c = color.textSecondary }: G) => (
  <Glyph size={16}><Path d="M4 20 20 4M14 4h6v6M4 10V4h6" stroke={c} strokeWidth={1.75} /></Glyph>
);
const PatternGlyph = ({ c = color.textSecondary }: G) => (
  <Glyph size={16}><Path d="M3 17l5-6 4 3 6-8 3 3" stroke={c} strokeWidth={1.75} /></Glyph>
);
const VolumeGlyph = ({ c = color.textSecondary }: G) => (
  <Glyph size={16}><Path d="M5 20v-6M10 20V9M15 20v-9M20 20V5" stroke={c} strokeWidth={1.75} /></Glyph>
);
const PremiumGlyph = ({ c = color.textSecondary }: G) => (
  <Glyph size={16}><Circle cx={12} cy={12} r={8} stroke={c} strokeWidth={1.75} /><Path d="M14.5 9.5c-.5-.8-1.4-1.2-2.5-1.2-1.4 0-2.5.7-2.5 1.8 0 2.6 5 1.4 5 4 0 1.1-1.1 1.9-2.5 1.9-1.2 0-2.1-.5-2.6-1.3M12 6.5v1.8M12 15.8v1.7" stroke={c} strokeWidth={1.5} /></Glyph>
);
const AskGlyph = ({ c = color.textSecondary }: G) => (
  <Glyph size={16}><Path d="M12 19V5M6 11l6-6 6 6" stroke={c} strokeWidth={1.75} /></Glyph>
);

const CELL_GLYPH: Record<AnalyticsCell['icon'], (p: G) => React.ReactElement> = {
  rr: RrGlyph, pattern: PatternGlyph, volume: VolumeGlyph, premium: PremiumGlyph, ask: AskGlyph,
};

/* ------------------------------------------------------------------ */
/* the microchart                                                      */
/* ------------------------------------------------------------------ */

/**
 * Candles, and nothing else — no axes, no grid, no labels. It sits beside the
 * price as the shape of the last day or three; the Trade Detail chart is where
 * levels and scales live. With no bars it draws nothing at all, rather than an
 * empty frame that would read as a flat price.
 */
export function MicroChart({ bars, height = 52, max = 40, testID }: {
  bars: readonly Candle[]; height?: number; max?: number; testID?: string;
}) {
  const [w, setW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width));
  const shown = bucketBars(bars, max);
  if (shown.length < 2) return null;
  const hi = Math.max(...shown.map((b) => b.h));
  const lo = Math.min(...shown.map((b) => b.l));
  const span = hi - lo || 1;
  const pad = 2;
  const y = (v: number) => pad + ((hi - v) / span) * (height - pad * 2);
  const step = w / shown.length;
  const body = Math.max(1, Math.min(4, step * 0.6));
  return (
    <View
      onLayout={onLayout}
      style={{ height, width: '100%' }}
      testID={testID}
      accessibilityRole="image"
      accessibilityLabel={`Price over this window: from ${shown[0].o.toFixed(2)} to ${shown[shown.length - 1].c.toFixed(2)}`}
    >
      {w > 0 ? (
        <Svg width={w} height={height}>
          {shown.map((b, i) => {
            const up = b.c >= b.o;
            const ink = up ? color.marketUp : color.marketDown;
            const cx = i * step + step / 2;
            const top = y(Math.max(b.o, b.c));
            const bot = y(Math.min(b.o, b.c));
            return (
              <React.Fragment key={`${b.t}-${i}`}>
                <Line x1={cx} x2={cx} y1={y(b.h)} y2={y(b.l)} stroke={ink} strokeWidth={1} />
                <Rect x={cx - body / 2} y={top} width={body} height={Math.max(1, bot - top)} fill={ink} />
              </React.Fragment>
            );
          })}
        </Svg>
      ) : null}
    </View>
  );
}

/** 24h | 72h — two small segments; the chosen one is raised, not orange-filled (one filled orange per card is the CTA). */
export function WindowToggle({ value, onChange, testID }: {
  value: 24 | 72; onChange: (v: 24 | 72) => void; testID?: string;
}) {
  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      style={{ flexDirection: 'row', padding: 2, borderRadius: 8, backgroundColor: alpha.ivory05, alignSelf: 'flex-end' }}
    >
      {([24, 72] as const).map((h) => {
        const on = h === value;
        return (
          <Pressable
            key={h}
            testID={testID ? `${testID}-${h}` : undefined}
            accessibilityRole="tab"
            accessibilityLabel={`${h} hours`}
            accessibilityState={{ selected: on }}
            onPress={() => { if (!on) onChange(h); }}
            hitSlop={hitSlopFor(34, 22)}
            style={{
              width: 34, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center',
              backgroundColor: on ? color.raised : 'transparent',
              borderWidth: on ? 1 : 0, borderColor: alpha.border,
            }}
          >
            <Num variant="meta" weight={on ? 'semibold' : 'medium'} c={on ? color.textPrimary : color.textSecondary}>{`${h}h`}</Num>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* the range rail                                                      */
/* ------------------------------------------------------------------ */

const fmt = (n: number) => n.toFixed(2);

/**
 * STOP ─── ENTRY ─── TARGET, with where price is now.
 *
 * The rail runs from the risk end (the stop) to the reward end (the target)
 * whichever way round the trade is, so a short reads the same as a long. The
 * risk leg is tinted red and the reward leg green; the entry is an off-white
 * dot, and the current price is a ringed marker — drawn at an end with an open
 * ring when price is already beyond the rail. Labels print the level as the
 * setup wrote it (a zone stays a zone).
 */
export function RangeRail({ range, labels, current, testID }: {
  range: Range;
  labels: { stop: string; entry: string; target: string };
  current: number | null;
  testID?: string;
}) {
  const [w, setW] = useState(0);
  const H = 18;
  const x = (f: number) => 6 + f * Math.max(0, w - 12);
  const entryX = x(range.entryAt);
  const nowX = range.currentAt != null ? x(range.currentAt) : null;
  const a11y = [
    `Stop ${labels.stop}`, `entry ${labels.entry}`, `target ${labels.target}`,
    current != null ? `price now ${fmt(current)}${range.currentOutside ? ', beyond the range' : ''}` : null,
  ].filter(Boolean).join(', ');
  return (
    <View testID={testID} accessibilityRole="image" accessibilityLabel={a11y} style={{ gap: 6 }}>
      <View style={{ height: H }} onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))}>
        {w > 0 ? (
          <Svg width={w} height={H}>
            <Line x1={x(0)} x2={entryX} y1={H / 2} y2={H / 2} stroke={alpha.marketDown40} strokeWidth={3} strokeLinecap="round" />
            <Line x1={entryX} x2={x(1)} y1={H / 2} y2={H / 2} stroke={alpha.marketUp40} strokeWidth={3} strokeLinecap="round" />
            <Circle cx={x(0)} cy={H / 2} r={5} fill={color.marketDown} />
            <Circle cx={x(1)} cy={H / 2} r={5} fill={color.marketUp} />
            <Circle cx={entryX} cy={H / 2} r={5} fill={color.textPrimary} />
            {nowX != null ? (
              <>
                <Circle cx={nowX} cy={H / 2} r={7.5} fill={range.currentOutside ? 'none' : color.canvas} stroke={color.textPrimary} strokeWidth={2} />
                {range.currentOutside ? null : <Circle cx={nowX} cy={H / 2} r={3} fill={color.textPrimary} />}
              </>
            ) : null}
          </Svg>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <View style={{ alignItems: 'flex-start' }}>
          <Num variant="body" weight="semibold" c={color.priceStop} testID={testID ? `${testID}-stop` : undefined}>{labels.stop}</Num>
          <T variant="meta" c={color.textSecondary}>Stop</T>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Num variant="body" weight="semibold" c={color.priceEntry} testID={testID ? `${testID}-entry` : undefined}>{labels.entry}</Num>
          <T variant="meta" c={color.textSecondary}>Entry</T>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Num variant="body" weight="semibold" c={color.priceTarget} testID={testID ? `${testID}-target` : undefined}>{labels.target}</Num>
          <T variant="meta" c={color.textSecondary}>Target</T>
        </View>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* analytics                                                           */
/* ------------------------------------------------------------------ */

/** The secondary facts, as equal columns with a glyph. Absent cells are simply not in the list. */
export function AnalyticsRow({ cells, testID }: { cells: AnalyticsCell[]; testID?: string }) {
  if (!cells.length) return null;
  return (
    <View testID={testID} style={{ flexDirection: 'row', gap: 8 }}>
      {cells.map((c, i) => {
        const Icon = CELL_GLYPH[c.icon];
        return (
          <View
            key={c.key}
            accessible
            accessibilityLabel={`${c.label}, ${c.value}`}
            testID={testID ? `${testID}-${c.key}` : undefined}
            style={{
              flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'flex-start', gap: 6,
              paddingLeft: i === 0 ? 0 : 8, borderLeftWidth: i === 0 ? 0 : 1, borderLeftColor: alpha.divider,
            }}
          >
            <View style={{ paddingTop: 1 }}><Icon /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <T variant="meta" c={color.textSecondary} numberOfLines={1}>{c.label}</T>
              {c.key === 'pattern'
                ? <T variant="meta" weight="semibold" c={color.textPrimary} numberOfLines={1}>{c.value}</T>
                : <Num variant="meta" weight="semibold" c={color.textPrimary} numberOfLines={1}>{c.value}</Num>}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* the bookmark                                                        */
/* ------------------------------------------------------------------ */

/**
 * THE ONE TRAILING CONTROL. A 44×44 bordered square beside the card's action.
 * Saved is the member's own mark, so it is orange and filled; unsaved is a
 * quiet outline. The label says which, so it is never colour alone.
 */
export function BookmarkButton({ saved, onPress, emphasis = false, symbol, testID }: {
  saved: boolean; onPress: () => void; emphasis?: boolean; symbol: string; testID?: string;
}) {
  const ink = saved || emphasis ? color.action : color.textPrimary;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={saved ? `Saved. Remove ${symbol} from saved alerts` : `Save ${symbol} alert`}
      accessibilityState={{ selected: saved }}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 44, height: 44, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: saved || emphasis ? alpha.action40 : alpha.border,
        backgroundColor: saved ? alpha.action10 : pressed ? color.raised : 'transparent',
      })}
    >
      <BookmarkGlyph c={ink} filled={saved} />
    </Pressable>
  );
}
