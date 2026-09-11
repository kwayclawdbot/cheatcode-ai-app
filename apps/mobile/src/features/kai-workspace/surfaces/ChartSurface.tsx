/**
 * THE CHART, AS A WORKSPACE SURFACE.
 *
 * This is the whole point of the extraction: the chart that used to exist only
 * at `/trade/[symbol]` is now a component you mount with a symbol. `SymbolChart`
 * is the same chart — the same canvas, the same drawing tray, the same
 * full-screen stage — and `useChartRuntime` is the same data and the same
 * command runtime the Trade section runs. Neither is a copy.
 *
 * WHAT THIS FILE ADDS: nothing but composition. It hands the runtime's data to
 * the chart, hands the chart's imperative handle back to the runtime so Kai's
 * commands can be performed on it, and hands `applyCommand` up to whoever owns
 * the conversation. A surface is a wiring harness, not a feature.
 *
 * NAVIGATION IS A PROP, NOT A DECISION. A chart command that wants to open a
 * plan is a `router.push` in the Trade section and would be a member being
 * thrown out of their conversation on Home. So `onRoute` comes from the host.
 */
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { SymbolChart } from '../../chart/SymbolChart';
import { useChartRuntime } from '../chart-runtime';
import type { ChartRuntime } from '../chart-runtime';
import type { Annotation, ChartCommand, PortalTimeframe } from '../../portal/types';
import type { GoalMode } from '../../../lib/types';
import type { PortalCommandResult } from '../../portal/useKaiPortal';

export type ChartSurfaceProps = {
  symbol: string;
  mode: GoalMode;
  setupId?: string | null;
  alertId?: string | null;
  timeframe?: string | null;
  height?: number;
  /** Kai is narrating: the chart's own controls step back out of the way. */
  busy?: boolean;
  caption?: string | null;
  notice?: string | null;
  noticeTone?: 'working' | 'failed' | null;
  /** What the full-screen stage shows when "Ask Kai" is pressed. */
  kaiSheet?: React.ReactNode;
  onRoute?: (route: string) => void;
  onSelectAnnotation?: (a: Annotation) => void;
  /**
   * The command runtime, handed up the moment it exists.
   *
   * The host owns the conversation and therefore owns the frames; this surface
   * owns the chart they act on. Passing the applier up rather than passing the
   * frames down keeps the chart ignorant of Kai, which is what let the same
   * component serve a screen that has no conversation at all.
   */
  onRuntime?: (apply: (c: ChartCommand) => PortalCommandResult | null, runtime: ChartRuntime) => void;
};

export function ChartSurface({
  symbol, mode, setupId = null, alertId = null, timeframe = null,
  height = 360, busy, caption, notice, noticeTone, kaiSheet,
  onRoute, onSelectAnnotation, onRuntime,
}: ChartSurfaceProps) {
  const rt = useChartRuntime({ symbol, mode, setupId, alertId, onRoute });

  /**
   * A timeframe the caller asked for wins ONCE, on arrival.
   *
   * Kai saying "pull up the 4-hour" has to land, and after that the member's own
   * taps on the rail have to stick — so this runs on the requested value
   * changing, not on every render. Without the guard the rail would spring back
   * to Kai's choice every time anything re-rendered.
   */
  useEffect(() => {
    if (timeframe) rt.setTimeframe(timeframe as PortalTimeframe);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeframe, symbol]);

  const { applyCommand } = rt;
  useEffect(() => {
    onRuntime?.(applyCommand, rt);
    // Re-announced whenever the applier is rebuilt, because a host holding a
    // stale one would perform commands against last render's annotations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyCommand]);

  return (
    <View style={{ flex: 1 }}>
      <SymbolChart
        symbol={symbol}
        timeframe={(rt.timeframe ?? 'D') as PortalTimeframe}
        candles={rt.candles}
        annotations={rt.annotations}
        portal={rt.data}
        focusTs={rt.focusTs}
        hideAnnotations={rt.hideAnnotations}
        height={height}
        busy={busy}
        caption={caption}
        notice={notice}
        noticeTone={noticeTone}
        kaiSheet={kaiSheet}
        revealed={rt.revealed}
        onReveal={rt.reveal}
        onTimeframeChange={rt.setTimeframe}
        onSelectAnnotation={onSelectAnnotation}
        onChartHandle={rt.bindChart}
        onStageHandle={rt.bindStage}
        onStageOpenChange={rt.setStageOpen}
        onDrawCreate={rt.createUserAnnotation}
        onDrawUpdate={rt.updateUserAnnotation}
      />
    </View>
  );
}
