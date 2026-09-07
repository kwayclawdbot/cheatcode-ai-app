/**
 * The chart, whole — candles, drawing tools, full screen, and Kai's room to work.
 *
 * WHY IT IS ONE COMPONENT NOW. Everything the Trade portal's chart can do was
 * assembled inline inside `TradePortalV2`: the pencil, the expand glyph, the
 * tray, the stage, the reveal set that keeps the resting state clean, and the
 * wiring from a finished drawing back to the annotations API. None of that is
 * about the portal. It is what a chart of a symbol IS in this product, and the
 * ticker page — the other place people look at a symbol — had a bare
 * `ChartView` with `annotations={[]}`: no tools, no full screen, and no
 * knowledge that the chart had ever been drawn on.
 *
 * The alternative was to copy it. Two copies of a surface with this many
 * interacting states is two surfaces that diverge on the first bug fix, and the
 * owner's ask was explicitly that they be the same chart rather than two charts
 * that resemble each other.
 *
 * WHAT IT DELIBERATELY DOES NOT OWN. Data. It is handed candles, the full
 * annotation set and three callbacks, and it never fetches anything — so the
 * portal can feed it from the portal payload and the ticker page from the
 * shared per-symbol store, and neither has to know how the other got there.
 * It also does not own Kai: `kaiSheet` is a slot, so the conversation on the
 * full-screen stage is whatever the host already has rather than a second one.
 *
 * THE HOST STILL DRIVES KAI'S COMMANDS. `onChartHandle` hands the imperative
 * surface up, because `applyChartCommand` belongs where the conversation is.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { ChartView, type DraftAnnotation } from './ChartView';
import { ChartStage } from './ChartStage';
import { DrawTray, type DrawToolName } from './DrawTray';
import type { ChartHandle } from './apply';
import { Expand, Pencil } from '../../ui/Icons';
import { alpha, color, radius } from '../../ui/tokens';
import type { Annotation, PortalTimeframe, TradePortal } from '../portal/types';
import { visibleAnnotations } from '../portal/visible-annotations';
import type { Candle } from '../../lib/types';

export type SymbolChartProps = {
  symbol: string;
  name?: string | null;
  timeframe: PortalTimeframe;
  timeframes?: PortalTimeframe[];
  candles: Candle[];
  /** The WHOLE set for this symbol. What reaches the canvas is narrowed here. */
  annotations: Annotation[];
  /**
   * The trade on screen, when there is one. It decides which stored levels are
   * on the chart at rest — this trade's entry and stop belong there, last
   * week's do not. Null on a page that is not about a trade, and the chart then
   * opens with only what the user drew.
   */
  portal?: TradePortal | null;
  lastPrice?: number | null;
  focusTs?: string | null;
  hideAnnotations?: boolean;
  height?: number;
  /** Kai is narrating. The tools and the glyphs step back, as they do on the stage. */
  busy?: boolean;
  /** What the full-screen stage shows when "Ask Kai" is pressed. */
  kaiSheet?: React.ReactNode;
  caption?: string | null;
  notice?: string | null;
  noticeTone?: 'working' | 'failed' | null;
  live?: boolean;

  onTimeframeChange?: (tf: PortalTimeframe) => void;
  onSelectAnnotation?: (a: Annotation) => void;
  /** The inline chart's handle, so the host can perform Kai's commands on it. */
  onChartHandle?: (h: ChartHandle | null) => void;
  /** The stage's handle, which supersedes the inline one while it is open. */
  onStageHandle?: (h: ChartHandle | null) => void;
  onStageOpenChange?: (open: boolean) => void;

  /** Ids the host has summoned onto the chart (a Kai mark, a tapped rail chip). */
  revealed?: ReadonlySet<string>;
  onReveal?: (ids: string[]) => void;

  onDrawCreate?: (a: Annotation) => void;
  onDrawUpdate?: (a: Annotation) => void;
  onDrawDelete?: (id: string) => void;

  testID?: string;
};

/** A bar time as the annotations API stores it. One conversion, at the boundary. */
function isoOf(t: number | string | null | undefined): string | null {
  if (t == null) return null;
  if (typeof t === 'string') return t;
  return Number.isFinite(t) ? new Date(t * 1000).toISOString() : null;
}

const EMPTY: ReadonlySet<string> = new Set();

export function SymbolChart({
  symbol, name = null, timeframe, timeframes, candles, annotations, portal = null,
  lastPrice = null, focusTs = null, hideAnnotations = false, height,
  busy = false, kaiSheet, caption = null, notice = null, noticeTone = null, live = false,
  onTimeframeChange, onSelectAnnotation, onChartHandle, onStageHandle, onStageOpenChange,
  revealed = EMPTY, onReveal,
  onDrawCreate, onDrawUpdate, onDrawDelete,
  testID = 'symbol-chart',
}: SymbolChartProps) {
  const chart = useRef<ChartHandle | null>(null);
  const [stageOpen, setStageOpen] = useState(false);
  const [drawOpen, setDrawOpen] = useState(false);
  const [tool, setTool] = useState<DrawToolName>(null);
  const [selected, setSelected] = useState<{ id: string | null; provenance: string | null }>({ id: null, provenance: null });

  useEffect(() => { setDrawOpen(false); setTool(null); setStageOpen(false); }, [symbol]);
  useEffect(() => { onStageOpenChange?.(stageOpen); }, [stageOpen, onStageOpenChange]);

  const onChart = visibleAnnotations(annotations, portal, revealed);
  const canDraw = Boolean(onDrawCreate);

  /**
   * A finished drawing, from the page's coordinates into the API's.
   *
   * The chart reports bar times in seconds because that is the clock it holds;
   * the store keeps ISO strings. Converting here means neither the page nor the
   * host has to know about the other's units.
   */
  const created = useCallback((d: DraftAnnotation) => {
    onReveal?.([d.id]);
    onDrawCreate?.({
      id: d.id,
      symbol,
      timeframe,
      kind: d.kind as Annotation['kind'],
      price: d.price,
      price2: d.price2,
      ts_from: isoOf(d.ts_from),
      ts_to: isoOf(d.ts_to),
      text: d.text,
      reason: 'You drew this one.',
      provenance: 'user',
      status: 'valid',
      source_alert_id: null,
      source_setup_id: null,
      source_plan_id: null,
      created_at: null,
      updated_at: null,
    });
  }, [onDrawCreate, onReveal, symbol, timeframe]);

  const changed = useCallback((d: DraftAnnotation) => {
    const existing = annotations.find((a) => a.id === d.id);
    if (!existing) return;
    onDrawUpdate?.({
      ...existing,
      price: d.price, price2: d.price2,
      ts_from: isoOf(d.ts_from), ts_to: isoOf(d.ts_to),
    });
  }, [annotations, onDrawUpdate]);

  const drawProps = canDraw
    ? {
        onDrawCreated: created,
        onDrawChanged: changed,
        onDrawDeleted: (id: string) => onDrawDelete?.(id),
        onDrawSelected: (s: { id: string | null; provenance: string | null }) =>
          setSelected({ id: s.id, provenance: s.provenance }),
        // The page retires the tool after one shape; the tray goes with it, so
        // the pencil is a door rather than a mode to remember to leave.
        onDrawTool: (t: DrawToolName) => { setTool(t); if (!t) setDrawOpen(false); },
        onDrawLongPress: () => chart.current?.deleteSelectedDrawing?.(),
      }
    : {};

  /** One corner control. Identical weight for both, which is the whole point. */
  const corner = (on: boolean) => ({
    position: 'absolute' as const,
    left: 8,
    width: 28,
    height: 28,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: radius.sm,
    borderWidth: 0.5,
    borderColor: on ? `${color.volt}66` : alpha.ivory12,
    backgroundColor: on ? `${color.volt}1A` : alpha.surface75,
  });

  return (
    <View testID={testID}>
      <ChartView
        testID={`${testID}-view`}
        ref={(h) => { chart.current = h; onChartHandle?.(h); }}
        symbol={symbol}
        timeframe={timeframe}
        timeframes={timeframes}
        candles={candles}
        annotations={onChart}
        hideAnnotations={hideAnnotations}
        focusTs={focusTs}
        lastPrice={lastPrice}
        onSelectAnnotation={onSelectAnnotation}
        onTimeframeChange={onTimeframeChange}
        height={height}
        {...drawProps}
      />

      {/*
        Two glyphs in the one corner of the plot with nothing in it — the
        timeframe rail is top-left, the Auto chip bottom-right. They are the
        weight of the chart's own controls rather than louder, because the chart
        is meant to rest clean and a palette over it would undo that.
      */}
      {!busy ? (
        <>
          <Pressable
            testID={`${testID}-expand`}
            accessibilityRole="button"
            accessibilityLabel="Open the chart full screen"
            accessibilityHint="Turn the phone sideways for a wider view. Kai is still one tap away."
            hitSlop={10}
            onPress={() => setStageOpen(true)}
            style={({ pressed }) => ({ ...corner(false), bottom: 60, transform: [{ scale: pressed ? 0.94 : 1 }] })}
          >
            <Expand size={13} color={color.muted} />
          </Pressable>

          {canDraw ? (
            <Pressable
              testID={`${testID}-pencil`}
              accessibilityRole="button"
              accessibilityState={{ selected: drawOpen }}
              accessibilityLabel={drawOpen ? 'Close the drawing tools' : 'Draw on the chart'}
              accessibilityHint="Level, trendline or zone. What you draw is yours and stays on the chart."
              hitSlop={10}
              onPress={() => {
                const next = !drawOpen;
                setDrawOpen(next);
                if (!next) { setTool(null); chart.current?.setDrawTool?.(null); }
              }}
              style={({ pressed }) => ({ ...corner(drawOpen), bottom: 26, transform: [{ scale: pressed ? 0.94 : 1 }] })}
            >
              <Pencil size={14} color={drawOpen ? color.volt : color.muted} />
            </Pressable>
          ) : null}
        </>
      ) : null}

      {canDraw && drawOpen && !busy ? (
        <DrawTray
          tool={tool}
          onPick={(t) => { setTool(t); chart.current?.setDrawTool?.(t); }}
          canDelete={selected.id !== null && selected.provenance === 'user'}
          onDelete={() => chart.current?.deleteSelectedDrawing?.()}
          bottom={94}
        />
      ) : null}

      <ChartStage
        open={stageOpen}
        onClose={() => setStageOpen(false)}
        symbol={symbol}
        name={name}
        timeframe={timeframe}
        timeframes={timeframes}
        candles={candles}
        annotations={hideAnnotations ? [] : onChart}
        hideAnnotations={hideAnnotations}
        focusTs={focusTs}
        lastPrice={lastPrice}
        onTimeframeChange={onTimeframeChange}
        onSelectAnnotation={onSelectAnnotation}
        onChart={(h) => onStageHandle?.(h)}
        live={live}
        caption={caption}
        notice={notice}
        noticeTone={noticeTone}
        kaiSheet={kaiSheet}
        onDrawCreate={canDraw ? created : undefined}
        onDrawChange={canDraw ? changed : undefined}
        onDrawDelete={canDraw ? (id) => onDrawDelete?.(id) : undefined}
      />
    </View>
  );
}
