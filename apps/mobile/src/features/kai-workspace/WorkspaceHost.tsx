/**
 * THE WORKSPACE HOST — one place that renders whatever Kai has opened.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ON A PHONE, ONE SURFACE TAKES THE CANVAS
 * ═════════════════════════════════════════════════════════════════════════════
 * The old War Room was a desktop: panels beside the conversation, tabs across
 * the top. Squeezing that onto 390 points gives you four things too small to
 * read and a chart the size of a stamp. So the phone shape is the opposite —
 * the active surface owns the canvas, Kai collapses to an orb, a line and the
 * composer underneath it, and everything else waits in a strip one tap away.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * IT IS NOT A ROUTE, AND THAT IS THE WHOLE FEATURE
 * ═════════════════════════════════════════════════════════════════════════════
 * Nothing here navigates. Opening a chart does not leave Home, so the
 * conversation that asked for it is still underneath, still scrolled where it
 * was, still the thing you come back to by swiping down. A workspace that
 * pushed a route would be the app it replaced: you would ask Kai something, land
 * on another screen, and have to walk back to keep talking.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * THE HOST DOES NOT OWN THE CONVERSATION
 * ═════════════════════════════════════════════════════════════════════════════
 * It renders surfaces and hands the chart's command runtime up through
 * `onChartRuntime`. The screen that owns the Kai thread performs the commands.
 * That is what lets the same host sit on Home, on Trade and on an alert detail
 * without three of them fighting over one conversation.
 */
import React, { useCallback, useRef } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { T } from '../../ui/Text';
import { alpha, color, radius } from '../../ui/tokens';
import type { GoalMode } from '../../lib/types';
import type { ChartCommand, Annotation } from '../portal/types';
import type { PortalCommandResult } from '../portal/useKaiPortal';
import type { ChartRuntime } from './chart-runtime';
import { ChartSurface } from './surfaces/ChartSurface';
import {
  AlertSurface, CommunitySurface, NewsSurface, SetupSurface, WebSurface,
} from './surfaces/objects';
import {
  EarningsSurface, OptionsSurface, PortfolioSurface, QuoteSurface, WatchlistSurface,
} from './surfaces/panels';
import { useWorkspaceSurfaces, workspace, type Surface } from './store';
import type { WorkspaceSurfaceKind } from '@cheatcode/shared';

/** What the strip calls each surface. Short — these are chips, not headings. */
const LABEL: Record<WorkspaceSurfaceKind, string> = {
  chart: 'Chart',
  setup: 'Setup',
  alert: 'Alert',
  community: 'Room',
  news: 'News',
  web: 'Page',
  quote: 'Quote',
  earnings: 'Earnings',
  options: 'Options',
  watchlist: 'Watchlist',
  portfolio: 'Positions',
  training: 'Lesson',
  plan: 'Plan',
};

export type WorkspaceHostProps = {
  mode: GoalMode;
  /** How tall the workspace may be. The host screen owns the split. */
  height: number;
  busy?: boolean;
  caption?: string | null;
  notice?: string | null;
  noticeTone?: 'working' | 'failed' | null;
  kaiSheet?: React.ReactNode;
  onRoute?: (route: string) => void;
  onSelectAnnotation?: (a: Annotation) => void;
  /** The chart's command applier, handed up the moment a chart exists. */
  onChartRuntime?: (apply: (c: ChartCommand) => PortalCommandResult | null, rt: ChartRuntime) => void;
};

/**
 * THE STRIP — the War Room's panel row, translated.
 *
 * It appears only once there is more than one thing open, because a row of one
 * chip is a label pretending to be a control. The active chip reads as volt:
 * the member is standing on it.
 */
export function SurfaceStrip({
  surfaces, activeId, onFocus, onClose,
}: {
  surfaces: Surface[];
  activeId: WorkspaceSurfaceKind | null;
  onFocus: (id: WorkspaceSurfaceKind) => void;
  onClose: (id: WorkspaceSurfaceKind) => void;
}) {
  // Newest is last, and newest is usually the one on the canvas — so when a
  // chip is added the strip slides to show it rather than leaving the active
  // one scrolled off the edge. Focusing an older chip changes no widths, so
  // this never yanks the strip out from under a thumb.
  const strip = useRef<ScrollView>(null);
  if (surfaces.length < 2) return null;
  return (
    <ScrollView
      ref={strip}
      onContentSizeChange={() => strip.current?.scrollToEnd({ animated: false })}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 6, paddingHorizontal: 12, paddingVertical: 6 }}
      testID="workspace-strip"
    >
      {surfaces.map((s) => {
        const on = s.id === activeId;
        return (
          <Pressable
            key={s.id}
            onPress={() => onFocus(s.id)}
            onLongPress={() => onClose(s.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${LABEL[s.kind]}${s.symbol ? ` ${s.symbol}` : ''}`}
            accessibilityHint="Long press to close"
            testID={`workspace-chip-${s.id}`}
            style={({ pressed }) => ({
              paddingHorizontal: 11,
              paddingVertical: 5,
              borderRadius: radius.lg,
              borderWidth: 0.5,
              borderColor: on ? alpha.volt50 : alpha.ivory12,
              backgroundColor: on ? alpha.volt14 : 'transparent',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <T size={12} weight="semibold" c={on ? color.volt : color.dim}>
              {LABEL[s.kind]}{s.symbol ? ` · ${s.symbol}` : ''}
            </T>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/**
 * One surface, rendered.
 *
 * Keyed on `nonce` by the host, so walking the chart to a different ticker
 * remounts it and merely bringing it back to the front does not — the
 * difference between a symbol change and a WebView reload nobody asked for.
 */
function Render({
  surface, mode, height, busy, caption, notice, noticeTone, kaiSheet,
  onRoute, onSelectAnnotation, onChartRuntime,
}: WorkspaceHostProps & { surface: Surface }) {
  switch (surface.kind) {
    case 'chart':
      return surface.symbol ? (
        <ChartSurface
          symbol={surface.symbol}
          mode={mode}
          setupId={surface.setupId}
          alertId={surface.alertId}
          timeframe={surface.timeframe}
          height={height}
          busy={busy}
          caption={caption}
          notice={notice}
          noticeTone={noticeTone}
          kaiSheet={kaiSheet}
          onRoute={onRoute}
          onSelectAnnotation={onSelectAnnotation}
          onRuntime={onChartRuntime}
        />
      ) : null;
    case 'setup':
      return surface.setupId ? <SetupSurface setupId={surface.setupId} onRoute={onRoute} /> : null;
    case 'alert':
      return surface.alertId ? <AlertSurface alertId={surface.alertId} onRoute={onRoute} /> : null;
    case 'news':
      return surface.symbol ? <NewsSurface symbol={surface.symbol} mode={mode} onRoute={onRoute} /> : null;
    case 'community':
      return <CommunitySurface roomId={surface.roomId} onRoute={onRoute} />;
    case 'web':
      return surface.url ? <WebSurface url={surface.url} title={surface.title} /> : null;
    case 'quote':
      return surface.symbol ? <QuoteSurface symbol={surface.symbol} /> : null;
    case 'earnings':
      return surface.symbol ? <EarningsSurface symbol={surface.symbol} /> : null;
    case 'options':
      return surface.symbol ? <OptionsSurface symbol={surface.symbol} /> : null;
    case 'watchlist':
      return <WatchlistSurface />;
    case 'portfolio':
      return <PortfolioSurface onRoute={onRoute} />;
    /**
     * DEFINED IN THE CONTRACT, NOT BUILT YET.
     *
     * These render nothing rather than a placeholder, and the server never
     * offers Kai an action that opens one — so this branch is unreachable from
     * a conversation and exists only to keep the switch exhaustive. When the
     * surface lands, adding it here and adding the action to the offered list
     * is one commit.
     */
    default:
      return null;
  }
}

export function WorkspaceHost(props: WorkspaceHostProps) {
  const { surfaces, activeId } = useWorkspaceSurfaces();
  const active = surfaces.find((s) => s.id === activeId) ?? null;

  const focus = useCallback((id: WorkspaceSurfaceKind) => workspace.focus(id), []);
  const close = useCallback((id: WorkspaceSurfaceKind) => workspace.close(id), []);

  // The resting state. Home is a conversation with nothing over it until Kai
  // opens something, and this returning null is what keeps that true.
  if (!active) return null;

  return (
    <View style={{ height: props.height }} testID="workspace-host">
      {/*
        THE HEADER: the strip when there is more than one thing open, the
        surface's name when there is one — and always a way to put it away.
        Kai can close a surface with an action; the member needs the same
        power with a thumb, or a panel they opened by tapping would stay on
        their screen until the conversation ended.
      */}
      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 34 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          {surfaces.length > 1 ? (
            <SurfaceStrip surfaces={surfaces} activeId={activeId} onFocus={focus} onClose={close} />
          ) : (
            <T size={12} weight="semibold" c={color.dim} style={{ paddingHorizontal: 16 }} numberOfLines={1}>
              {`${LABEL[active.kind]}${active.symbol ? ` · ${active.symbol}` : ''}`}
            </T>
          )}
        </View>
        <Pressable
          onPress={() => close(active.id)}
          accessibilityRole="button"
          accessibilityLabel={`Close ${LABEL[active.kind]}`}
          testID="workspace-close"
          hitSlop={10}
          style={({ pressed }) => ({ paddingHorizontal: 14, paddingVertical: 6, opacity: pressed ? 0.6 : 1 })}
        >
          <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
            <Path d="M6 6l12 12M18 6L6 18" stroke={color.muted} strokeWidth={2.2} strokeLinecap="round" />
          </Svg>
        </Pressable>
      </View>
      <View style={{ flex: 1 }}>
        <Render {...props} key={`${active.id}:${active.nonce}`} surface={active} />
      </View>
    </View>
  );
}
