import React from 'react';
import { View, Pressable } from 'react-native';
import Svg, { Circle, Line, Polyline, Rect } from 'react-native-svg';
import { alpha, color, radius } from './tokens';
import { T, Num } from './Text';
import type { Candle } from '../lib/types';

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

/* ==================================================================== */
/* CandleChart — real OHLC bars from GET /market/candles.                */
/* Setup-detail.html + V4-TR2 geometry: candle body 7–8px wide with a     */
/* 1.5px wick, level lines dashed across the full width, volume strip     */
/* along the bottom. Semantic colours only: cyan = market/entry,          */
/* green = target, red = invalidation, gold = the delayed price tag.      */
/* ==================================================================== */

export type ChartLevel = {
  price: number;
  label: string;
  c: string;
  weight?: number;
  /** Which margin the tag hangs in. The artboard alternates so a tag never
   *  sits on top of the most recent candles (which are always on the right). */
  side?: 'left' | 'right';
};

export function CandleChart({
  candles,
  levels = [],
  height = 200,
  showVolume = true,
  footerLeft,
  footerRight,
  testID,
}: {
  candles: Candle[];
  levels?: ChartLevel[];
  height?: number;
  showVolume?: boolean;
  footerLeft?: string;
  footerRight?: string;
  testID?: string;
}) {
  const W = 330;
  const volH = showVolume ? Math.round(height * 0.16) : 0;
  const priceH = height - volH - (showVolume ? 6 : 0);

  // No bars is a real answer, not a blank. The plan's levels still draw, so the
  // user sees where the idea lives — we just never invent price action to sit
  // underneath them.
  if (!candles.length) {
    const sorted = [...levels].sort((a, b) => b.price - a.price);
    return (
      <View
        testID={testID}
        style={{
          height,
          borderRadius: radius.xl,
          borderWidth: 0.5,
          borderColor: alpha.ivory12,
          backgroundColor: color.surface3,
          paddingHorizontal: 12,
          paddingVertical: 14,
          justifyContent: 'space-between',
        }}
      >
        {sorted.length ? (
          <View style={{ gap: 10 }}>
            {sorted.map((l) => (
              <View key={l.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1, height: 1, backgroundColor: `${l.c}66` }} />
                <Num size={10} weight="medium" c={l.c}>{l.label}</Num>
              </View>
            ))}
          </View>
        ) : null}
        <View style={{ gap: 3 }}>
          <T size={12.5} c={color.muted}>No price bars for this range yet</T>
          <T size={11} c={color.dim} lh={16}>
            Kai draws the chart as soon as the market-data service has them. The levels above are real.
          </T>
        </View>
      </View>
    );
  }

  const lows = candles.map((c) => c.l);
  const highs = candles.map((c) => c.h);
  const barLow = Math.min(...lows);
  const barHigh = Math.max(...highs);

  /**
   * The price scale belongs to the BARS, not to the levels.
   * A stop 10% below the range would otherwise squash a day's candles into a
   * dotted line. Levels inside a generous window widen the scale; a level
   * outside it is pinned to the edge of the chart and keeps its tag, so the
   * user still sees where the idea lives without losing the price action.
   */
  const barRange = Math.max(barHigh - barLow, barHigh * 0.002, 0.02);
  const window = barRange * 0.75;
  const inScale = levels.map((l) => l.price).filter((p) => p >= barLow - window && p <= barHigh + window);
  let min = Math.min(barLow, ...inScale);
  let max = Math.max(barHigh, ...inScale);
  if (max === min) { max += 1; min -= 1; }
  const pad = (max - min) * 0.08;
  min -= pad;
  max += pad;

  const y = (p: number) => {
    const raw = ((max - p) / (max - min)) * priceH;
    // clamp so an out-of-scale level draws at the very edge, never off-canvas
    return Math.max(2, Math.min(priceH - 2, raw));
  };
  const slot = W / candles.length;
  const bodyW = Math.max(1.5, Math.min(8, slot * 0.62));

  const maxVol = Math.max(1, ...candles.map((c) => c.v ?? 0));
  const last = candles[candles.length - 1];

  return (
    <View
      testID={testID}
      style={{
        borderRadius: radius.xl,
        borderWidth: 0.5,
        borderColor: alpha.ivory12,
        backgroundColor: color.surface3,
        paddingHorizontal: 10,
        paddingTop: 10,
        paddingBottom: 6,
      }}
    >
      <View>
        <Svg
          viewBox={`0 0 ${W} ${height}`}
          width="100%"
          height={height}
          accessibilityLabel={`${candles.length} price bars, last ${last.c.toFixed(2)}`}
        >
          {levels.map((l) => (
            <Line
              key={l.label}
              x1={0}
              y1={y(l.price)}
              x2={W}
              y2={y(l.price)}
              stroke={l.c}
              strokeWidth={l.weight ?? 1}
              strokeDasharray="5 4"
              opacity={0.7}
            />
          ))}

          {candles.map((c, i) => {
            const up = c.c >= c.o;
            const col = up ? color.green : color.red;
            const cx = i * slot + slot / 2;
            const bodyTop = y(Math.max(c.o, c.c));
            const bodyH = Math.max(1, Math.abs(y(c.o) - y(c.c)));
            return (
              <React.Fragment key={c.t || i}>
                <Line x1={cx} y1={y(c.h)} x2={cx} y2={y(c.l)} stroke={col} strokeWidth={1.2} />
                <Rect x={cx - bodyW / 2} y={bodyTop} width={bodyW} height={bodyH} rx={1.2} fill={col} />
              </React.Fragment>
            );
          })}

          {showVolume
            ? candles.map((c, i) => {
                const h = ((c.v ?? 0) / maxVol) * volH;
                const cx = i * slot + slot / 2;
                return (
                  <Rect
                    key={`v${c.t || i}`}
                    x={cx - bodyW / 2}
                    y={height - h}
                    width={bodyW}
                    height={h}
                    fill={alpha.cyan14}
                  />
                );
              })
            : null}
        </Svg>

        {/* Level tags sit outside the SVG so they use the app's type ramp. */}
        {levels.map((l) => (
          <View
            key={`t${l.label}`}
            pointerEvents="none"
            style={{
              position: 'absolute',
              ...(l.side === 'left' ? { left: 0 } : { right: 0 }),
              top: (y(l.price) / height) * height - 8,
              paddingHorizontal: 5,
              paddingVertical: 1,
              borderRadius: radius.sm,
              backgroundColor: color.surface3,
              borderWidth: 0.5,
              borderColor: `${l.c}66`,
            }}
          >
            <Num size={9} weight="medium" c={l.c}>{l.label}</Num>
          </View>
        ))}
      </View>

      {footerLeft || footerRight ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
          <Num size={10} weight="regular" c={color.dim}>{footerLeft ?? ''}</Num>
          <Num size={10} weight="regular" c={color.dim}>{footerRight ?? ''}</Num>
        </View>
      ) : null}
    </View>
  );
}

/* ==================================================================== */
/* PriceLine — V5-H1's priority chart.                                   */
/* A line, the band the level sits in, the dashed level, and one callout. */
/* Same freshness discipline as CandleChart: no bars means no invented    */
/* line, just the levels and an honest sentence.                          */
/* ==================================================================== */

export function PriceLine({
  candles,
  level,
  band = true,
  height = 88,
  note,
  testID,
}: {
  candles: Candle[];
  /** the level the idea turns on (entry) — drawn dashed, in market cyan */
  level?: number | null;
  band?: boolean;
  height?: number;
  /** "Entry 504 · 0.4% away" */
  note?: string | null;
  testID?: string;
}) {
  const W = 330;

  if (!candles.length) {
    return (
      <View
        testID={testID}
        style={{ height, borderRadius: radius.lg, borderWidth: 0.5, borderColor: alpha.ivory12, backgroundColor: color.surface3, justifyContent: 'center', paddingHorizontal: 12, gap: 3 }}
      >
        <T size={12} c={color.muted}>No price bars yet</T>
        {level != null ? <Num size={11} weight="medium" c={color.cyan}>{note ?? `Level ${level}`}</Num> : null}
      </View>
    );
  }

  const closes = candles.map((c) => c.c);
  let min = Math.min(...closes, ...(level != null ? [level] : []));
  let max = Math.max(...closes, ...(level != null ? [level] : []));
  if (max === min) { max += 1; min -= 1; }
  const pad = (max - min) * 0.12;
  min -= pad; max += pad;

  const y = (p: number) => ((max - p) / (max - min)) * height;
  const step = candles.length > 1 ? W / (candles.length - 1) : W;
  const points = closes.map((c, i) => `${(i * step).toFixed(1)},${y(c).toFixed(1)}`).join(' ');
  const lastY = y(closes[closes.length - 1]);
  const bandH = Math.max(6, height * 0.12);

  return (
    <View testID={testID}>
      <Svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} accessibilityLabel={`Price line, last ${closes[closes.length - 1].toFixed(2)}`}>
        {level != null && band ? (
          <Rect x={0} y={Math.max(0, y(level) - bandH / 2)} width={W} height={bandH} fill={alpha.cyan14} />
        ) : null}
        {level != null ? (
          <Line x1={0} y1={y(level)} x2={W} y2={y(level)} stroke={color.cyan} strokeWidth={1.2} strokeDasharray="5 4" opacity={0.8} />
        ) : null}
        <Polyline points={points} fill="none" stroke={color.cyan} strokeWidth={1.8} />
        <Circle cx={W} cy={lastY} r={3.5} fill={color.cyan} />
      </Svg>
      {note ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute', left: 4, top: Math.max(2, Math.min(height - 18, (level != null ? y(level) : height / 2) - 22)),
            paddingHorizontal: 7, paddingVertical: 1, borderRadius: radius.sm,
            backgroundColor: color.cyanTint, borderWidth: 0.5, borderColor: alpha.cyan40,
          }}
        >
          <Num size={9} weight="medium" c={color.cyan}>{note}</Num>
        </View>
      ) : null}
    </View>
  );
}
