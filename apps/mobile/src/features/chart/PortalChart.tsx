/**
 * The Trade Portal's dominant chart (spec 10 §7).
 *
 * Asset-workspace.html is the pixel source: candles inside a hairline card,
 * dashed level lines running the full width, a price tag hanging in the right
 * margin and the kind label in the left margin, a dotted volt line at the last
 * price. On top of that the round-4 spec adds a real ANNOTATION LAYER: every
 * line is an object with a reason and a provenance, and tapping it opens the
 * inspector.
 *
 * `src/ui/MiniChart.tsx` (lane MOBILE-A) draws the read-only chart used on the
 * ticker page. It has no annotation layer and no tap targets, and it belongs to
 * another lane, so the portal draws its own rather than editing A's.
 *
 * Empty is a real answer: no bars means no invented price action. The levels
 * still draw, because those are real.
 */
import React, { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';
import { T, Num } from '../../ui/Text';
import { alpha, color, radius } from '../../ui/tokens';
import type { Candle } from '../../lib/types';
import type { Annotation } from '../portal/types';
import { KIND_LABEL } from '../portal/types';
import { kindColor } from './semantics';

const W = 300;

export type PortalChartProps = {
  candles: Candle[];
  annotations: Annotation[];
  /** trigger candle: the bar at (or nearest before) this timestamp is haloed */
  focusTs?: string | null;
  /** the last traded price — drawn as the volt marker line */
  lastPrice?: number | null;
  height?: number;
  onSelectAnnotation?: (a: Annotation) => void;
  /** a second, dimmed series drawn behind (compare with prior session) */
  compare?: Candle[] | null;
  testID?: string;
};

export function PortalChart({
  candles,
  annotations,
  focusTs = null,
  lastPrice = null,
  height = 200,
  onSelectAnnotation,
  compare = null,
  testID = 'portal-chart',
}: PortalChartProps) {
  const visible = useMemo(
    () => annotations.filter((a) => a.status === 'valid' || a.status === 'invalidated'),
    [annotations],
  );

  const volH = Math.round(height * 0.15);
  const priceH = height - volH - 6;

  const scale = useMemo(() => {
    if (!candles.length) return null;
    const barLow = Math.min(...candles.map((c) => c.l));
    const barHigh = Math.max(...candles.map((c) => c.h));
    const barRange = Math.max(barHigh - barLow, barHigh * 0.002, 0.02);
    const win = barRange * 0.75;
    const prices = visible
      .flatMap((a) => [a.price, a.price2])
      .filter((p): p is number => p != null)
      .filter((p) => p >= barLow - win && p <= barHigh + win);
    let min = Math.min(barLow, ...prices, ...(lastPrice != null ? [lastPrice] : []));
    let max = Math.max(barHigh, ...prices, ...(lastPrice != null ? [lastPrice] : []));
    if (max === min) { max += 1; min -= 1; }
    const pad = (max - min) * 0.08;
    min -= pad; max += pad;
    return { min, max };
  }, [candles, visible, lastPrice]);

  /* ---------- no bars: the levels are still real, the chart is not ---------- */
  if (!scale) {
    const sorted = [...visible].filter((a) => a.price != null).sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
    return (
      <View
        testID={testID}
        style={{
          height,
          borderRadius: radius.lg,
          borderWidth: 0.5,
          borderColor: alpha.ivory08,
          backgroundColor: color.bg,
          padding: 12,
          justifyContent: 'space-between',
        }}
      >
        <View style={{ gap: 9 }}>
          {sorted.map((a) => (
            <Pressable
              key={a.id}
              testID={`annotation-${a.id}`}
              accessibilityRole="button"
              accessibilityLabel={`${KIND_LABEL[a.kind]} ${a.price}`}
              onPress={() => onSelectAnnotation?.(a)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 24 }}
            >
              <Num size={9} weight="medium" c={kindColor(a.kind)}>{KIND_LABEL[a.kind]}</Num>
              <View style={{ flex: 1, height: 1, backgroundColor: `${kindColor(a.kind)}55` }} />
              <Num size={9} weight="medium" c={kindColor(a.kind)}>{a.price?.toFixed(2)}</Num>
            </Pressable>
          ))}
        </View>
        <T size={11} c={color.dim} lh={16}>
          No price bars for this timeframe yet. The levels above are real.
        </T>
      </View>
    );
  }

  const { min, max } = scale;
  const y = (p: number) => Math.max(2, Math.min(priceH - 2, ((max - p) / (max - min)) * priceH));
  const slot = W / candles.length;
  const bodyW = Math.max(1.5, Math.min(8, slot * 0.62));
  const maxVol = Math.max(1, ...candles.map((c) => c.v ?? 0));

  const focusIdx = focusTs
    ? candles.reduce((best, c, i) => (Date.parse(c.t) <= Date.parse(focusTs) ? i : best), -1)
    : -1;

  const lastY = lastPrice != null ? y(lastPrice) : null;

  /**
   * Two levels at the same price (a trigger at 504 and an entry area starting
   * at 504) would draw their chips on top of each other. The lines stay exactly
   * where the price is — only the LABELS are nudged apart, top-down, so every
   * one of them stays readable and tappable.
   */
  const CHIP = 15;
  const chipTops = new Map<string, number>();
  const laidOut = [...visible]
    .filter((a) => a.price != null)
    .sort((a, b) => (a.price as number) > (b.price as number) ? -1 : 1);
  let cursor = -Infinity;
  for (const a of laidOut) {
    const want = y(a.price as number) - 8;
    const top = Math.max(want, cursor + CHIP);
    chipTops.set(a.id, top);
    cursor = top;
  }
  // The live price tag joins the same queue, so "504.62 now" never sits on top
  // of "Entry 504".
  let lastTagTop = lastY != null ? lastY - 8 : null;
  if (lastTagTop != null) {
    for (const top of Array.from(chipTops.values()).sort((a, b) => a - b)) {
      if (Math.abs(top - lastTagTop) < CHIP) lastTagTop = top + CHIP;
    }
  }

  return (
    <View
      testID={testID}
      style={{
        borderRadius: radius.lg,
        borderWidth: 0.5,
        borderColor: alpha.ivory08,
        backgroundColor: color.bg,
        paddingLeft: 8,
        paddingRight: 46,
        paddingTop: 8,
        paddingBottom: 6,
      }}
    >
      <View>
        <Svg
          viewBox={`0 0 ${W} ${height}`}
          width="100%"
          height={height}
          accessibilityLabel={`${candles.length} price bars, ${visible.length} marked levels`}
        >
          {/* the trigger candle keeps a halo behind it so "zoom to trigger" is visible */}
          {focusIdx >= 0 ? (
            <Rect
              x={focusIdx * slot - slot * 0.6}
              y={0}
              width={Math.max(6, slot * 1.6)}
              height={priceH}
              fill={alpha.volt06}
              rx={2}
            />
          ) : null}

          {/* zones first, so a line always sits on top of its own band */}
          {visible.map((a) =>
            a.price != null && a.price2 != null ? (
              <Rect
                key={`z${a.id}`}
                x={0}
                y={y(Math.max(a.price, a.price2))}
                width={W}
                height={Math.max(2, Math.abs(y(a.price) - y(a.price2)))}
                fill={`${kindColor(a.kind)}22`}
              />
            ) : null,
          )}

          {compare?.length
            ? compare.map((c, i) => {
                const cx = i * (W / compare.length) + W / compare.length / 2;
                return (
                  <Line
                    key={`cmp${c.t || i}`}
                    x1={cx}
                    y1={y(c.h)}
                    x2={cx}
                    y2={y(c.l)}
                    stroke={alpha.ivory20}
                    strokeWidth={1}
                  />
                );
              })
            : null}

          {candles.map((c, i) => {
            const up = c.c >= c.o;
            const col = up ? color.green : color.red;
            const cx = i * slot + slot / 2;
            return (
              <React.Fragment key={c.t || i}>
                <Line x1={cx} y1={y(c.h)} x2={cx} y2={y(c.l)} stroke={col} strokeWidth={1.2} />
                <Rect
                  x={cx - bodyW / 2}
                  y={y(Math.max(c.o, c.c))}
                  width={bodyW}
                  height={Math.max(1, Math.abs(y(c.o) - y(c.c)))}
                  rx={1.2}
                  fill={col}
                />
              </React.Fragment>
            );
          })}

          {candles.map((c, i) => {
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
          })}

          {visible.map((a) =>
            a.price != null ? (
              <Line
                key={`l${a.id}`}
                x1={0}
                y1={y(a.price)}
                x2={W}
                y2={y(a.price)}
                stroke={kindColor(a.kind)}
                strokeWidth={1}
                strokeDasharray="4 4"
                opacity={a.status === 'invalidated' ? 0.32 : 0.9}
              />
            ) : null,
          )}

          {lastY != null ? (
            <Line
              x1={0}
              y1={lastY}
              x2={W}
              y2={lastY}
              stroke={color.volt}
              strokeWidth={0.8}
              strokeDasharray="2 3"
              opacity={0.7}
            />
          ) : null}
        </Svg>

        {/* --- the annotation chips. Each one is the tap target for its level. --- */}
        {visible.map((a) => {
          if (a.price == null) return null;
          const top = chipTops.get(a.id) ?? y(a.price) - 8;
          const c = kindColor(a.kind);
          return (
            <React.Fragment key={`chip${a.id}`}>
              <Pressable
                testID={`annotation-${a.id}`}
                accessibilityRole="button"
                accessibilityLabel={`${KIND_LABEL[a.kind]} at ${a.price.toFixed(2)}. ${a.reason ?? ''}`}
                accessibilityHint="Opens why Kai placed this level"
                onPress={() => onSelectAnnotation?.(a)}
                hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
                style={{ position: 'absolute', left: 2, top, flexDirection: 'row', alignItems: 'center', gap: 4 }}
              >
                <View
                  style={{
                    paddingHorizontal: 5,
                    paddingVertical: 1,
                    borderRadius: 4,
                    // Opaque: the level's own dashed line runs behind the chip,
                    // and a translucent chip made the label read struck-through.
                    backgroundColor: color.bg,
                    borderWidth: 0.5,
                    borderColor: `${c}88`,
                  }}
                >
                  <Num size={8.5} weight="medium" c={c}>
                    {a.text ?? KIND_LABEL[a.kind]}
                  </Num>
                </View>
                {a.provenance === 'kai' ? (
                  <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: color.violet }} />
                ) : null}
              </Pressable>
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  right: -44,
                  top,
                  paddingHorizontal: 4,
                  paddingVertical: 1,
                  borderRadius: 3,
                  backgroundColor: c,
                }}
              >
                <Num size={8.5} weight="medium" c={color.bg}>{a.price.toFixed(2)}</Num>
              </View>
            </React.Fragment>
          );
        })}

        {lastY != null ? (
          <View
            pointerEvents="none"
            testID="chart-last-price"
            style={{
              position: 'absolute',
              right: -44,
              top: lastTagTop ?? lastY - 8,
              paddingHorizontal: 4,
              paddingVertical: 1,
              borderRadius: 3,
              backgroundColor: color.volt,
            }}
          >
            <Num size={8.5} weight="medium" c={color.bg}>{lastPrice?.toFixed(2)}</Num>
          </View>
        ) : null}
      </View>
    </View>
  );
}
