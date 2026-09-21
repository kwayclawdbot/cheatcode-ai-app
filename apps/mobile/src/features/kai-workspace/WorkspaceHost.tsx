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
import React, { useCallback, useEffect, useRef } from 'react';
import { Animated, Platform, Pressable, ScrollView, View } from 'react-native';
import { useMotion } from '../a11y/context';
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
 * A small symbol per kind of panel — the War Room's tab glyphs, drawn at 12pt
 * in whatever ink the tab is in. Line drawings only, no fills, so they sit at
 * the weight of the monospace beside them.
 */
function Glyph({ kind, ink }: { kind: WorkspaceSurfaceKind; ink: string }) {
  const p = { stroke: ink, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  const d: Record<string, string> = {
    chart: 'M4 19V5M4 19h16M8 15l3-4 3 2 5-6',
    quote: 'M12 4v16M16 8.5c0-1.9-1.8-3-4-3s-4 1.1-4 3 1.8 2.6 4 3 4 1.1 4 3-1.8 3-4 3-4-1.1-4-3',
    news: 'M5 5h14v14H5zM8 9h8M8 12h8M8 15h5',
    earnings: 'M5 6h14v13H5zM5 10h14M9 4v4M15 4v4',
    options: 'M6 5v14M18 5v14M6 9h12M6 13h12M6 17h12',
    watchlist: 'M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6zM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
    portfolio: 'M4 8h16v11H4zM9 8V5h6v3',
    community: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 19c0-3 2.7-5 6-5s6 2 6 5M17 11a2.5 2.5 0 1 0 0-5M21 19c0-2.4-1.6-4.2-4-4.8',
    setup: 'M12 3v4M12 17v4M3 12h4M17 12h4M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    alert: 'M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20h4',
    web: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18',
  };
  return (
    <Svg width={12} height={12} viewBox="0 0 24 24">
      <Path d={d[kind] ?? d.web} {...p} />
    </Svg>
  );
}

/**
 * THE TABS — the War Room's panel row, on a phone.
 *
 * Every open panel is a tab, even when there is only one: in the War Room the
 * tab row is how you know which panels you have out, and a lone tab still says
 * "this is a panel, and here is its ticker". The labels are monospace capitals
 * with a small symbol, the active one volt (the member is standing on it).
 * "Close all" appears once there is more than one thing to close.
 */
export function SurfaceStrip({
  surfaces, activeId, onFocus, onClose, onCloseAll,
}: {
  surfaces: Surface[];
  activeId: WorkspaceSurfaceKind | null;
  onFocus: (id: WorkspaceSurfaceKind) => void;
  onClose: (id: WorkspaceSurfaceKind) => void;
  onCloseAll?: () => void;
}) {
  // Newest is last, and newest is usually the one on the canvas — so when a
  // tab is added the row slides to show it rather than leaving the active one
  // scrolled off the edge. Focusing an older tab changes no widths, so this
  // never yanks the row out from under a thumb.
  const strip = useRef<ScrollView>(null);
  if (!surfaces.length) return null;
  return (
    <ScrollView
      ref={strip}
      onContentSizeChange={() => strip.current?.scrollToEnd({ animated: false })}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 6, paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center' }}
      testID="workspace-strip"
    >
      {surfaces.map((s) => {
        const on = s.id === activeId;
        const ink = on ? color.volt : color.dim;
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
            hitSlop={{ top: 8, bottom: 8 }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: radius.xs,
              borderWidth: 0.5,
              borderColor: on ? alpha.volt50 : alpha.ivory12,
              backgroundColor: on ? alpha.volt10 : 'transparent',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Glyph kind={s.kind} ink={ink} />
            <T variant="meta" weight="semibold" c={ink}>
              {LABEL[s.kind]}{s.symbol ? ` ${s.symbol}` : ''}
            </T>
          </Pressable>
        );
      })}
      {surfaces.length > 1 && onCloseAll ? (
        <Pressable
          onPress={onCloseAll}
          accessibilityRole="button"
          accessibilityLabel="Close all panels"
          testID="workspace-close-all"
          hitSlop={{ top: 8, bottom: 8 }}
          style={({ pressed }) => ({ paddingHorizontal: 8, paddingVertical: 5, opacity: pressed ? 0.6 : 1 })}
        >
          <T variant="meta" weight="semibold" c={color.muted}>Close all</T>
        </Pressable>
      ) : null}
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

const nativeDriver = Platform.OS !== 'web';

/** The tab row above the stage, so a surface is told the height it really has. */
const STAGE_CHROME = 38;

export function WorkspaceHost(props: WorkspaceHostProps) {
  const { surfaces, activeId } = useWorkspaceSurfaces();
  const active = surfaces.find((s) => s.id === activeId) ?? null;
  const chart = surfaces.find((s) => s.kind === 'chart') ?? null;
  const motion = useMotion();

  const focus = useCallback((id: WorkspaceSurfaceKind) => workspace.focus(id), []);
  const close = useCallback((id: WorkspaceSurfaceKind) => workspace.close(id), []);
  const closeAll = useCallback(() => workspace.closeAll(), []);

  /**
   * THE STAGE SETTLES IN, WITH A SLIGHT OVERSHOOT (the War Room's panel entry).
   * Under reduce motion it simply appears: `distance` is 0, so the spring has
   * nowhere to travel and the stage is where it ends up from the first frame.
   */
  const open = !!active;
  const settle = useRef(new Animated.Value(open ? 1 : 0)).current;
  useEffect(() => {
    if (!open) { settle.setValue(0); return; }
    if (motion.reduced) { settle.setValue(1); return; }
    settle.setValue(0);
    Animated.spring(settle, { toValue: 1, speed: 14, bounciness: 9, useNativeDriver: nativeDriver }).start();
  }, [open, settle, motion.reduced]);

  /**
   * A CHANGE OF TAB WASHES THE STAGE IN KAI'S COLOUR for a moment, so the
   * switch reads as a change of state rather than a flicker. A fade, not a
   * movement, so it stays under reduce motion.
   */
  const wash = useRef(new Animated.Value(0)).current;
  const lastActive = useRef<string | null>(null);
  useEffect(() => {
    const key = active ? `${active.id}:${active.nonce}` : null;
    if (key && lastActive.current && lastActive.current !== key) {
      wash.setValue(1);
      Animated.timing(wash, { toValue: 0, duration: 520, useNativeDriver: nativeDriver }).start();
    }
    lastActive.current = key;
  }, [active, wash]);

  // The resting state. Home is a conversation with nothing over it until Kai
  // opens something, and this returning null is what keeps that true.
  if (!active) return null;

  const translateY = settle.interpolate({ inputRange: [0, 1], outputRange: [motion.distance(14), 0] });
  const scale = settle.interpolate({ inputRange: [0, 1], outputRange: [motion.reduced ? 1 : 0.97, 1] });
  const chartBehind = chart && chart.id !== active.id;

  return (
    <View style={{ height: props.height }} testID="workspace-host">
      {/*
        THE HEADER: one tab per open panel, "close all" once there are two, and
        always a way to put the front one away. Kai can close a surface with an
        action; the member needs the same power with a thumb.
      */}
      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 36 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <SurfaceStrip surfaces={surfaces} activeId={activeId} onFocus={focus} onClose={close} onCloseAll={closeAll} />
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

      {/* THE STAGE — a framed canvas, settling in when it first opens. */}
      <Animated.View
        testID="workspace-stage"
        style={{
          flex: 1,
          marginHorizontal: 10,
          borderRadius: radius.md,
          borderWidth: 0.5,
          borderColor: alpha.violet22,
          overflow: 'hidden',
          opacity: settle.interpolate({ inputRange: [0, 1], outputRange: [motion.reduced ? 1 : 0.4, 1], extrapolate: 'clamp' }),
          transform: [{ translateY }, { scale }],
        }}
      >
        {/*
          THE CHART STAYS LOADED BEHIND THE OTHER TABS. Switching to the news
          and back must not reload a WebView and lose where the member had
          scrolled to, so the chart is kept mounted underneath and simply not
          shown (and not touchable) while another tab is in front. Keyed on its
          own nonce, so a new ticker still remounts it.
        */}
        {chart ? (
          <View
            pointerEvents={chartBehind ? 'none' : 'auto'}
            accessibilityElementsHidden={!!chartBehind}
            importantForAccessibility={chartBehind ? 'no-hide-descendants' : 'auto'}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: chartBehind ? 0 : 1 }}
          >
            <Render {...props} height={props.height - STAGE_CHROME} key={`chart:${chart.nonce}`} surface={chart} />
          </View>
        ) : null}
        {active.kind !== 'chart' ? (
          <View style={{ flex: 1, backgroundColor: color.bg }}>
            <Render {...props} height={props.height - STAGE_CHROME} key={`${active.id}:${active.nonce}`} surface={active} />
          </View>
        ) : null}
        {/*
          KAI'S LINE, OVER THE CHART, WHILE HE DRAWS ON IT. The full-screen
          stage has always had this lower third; the chart on Home did not, so
          the words and the marks arrived in two different places. The caption
          sits clear of the price axis on the right and the time axis below,
          and it is gone the moment he stops writing — by then the sentence is
          in the conversation, and saying it twice is noise.
        */}
        {active.kind === 'chart' && props.caption ? (
          <View
            pointerEvents="none"
            testID="warroom-chart-caption"
            style={{
              position: 'absolute', left: 10, right: 64, bottom: 36,
              paddingVertical: 7, paddingHorizontal: 10,
              borderRadius: radius.sm,
              borderLeftWidth: 2, borderLeftColor: color.violet,
              backgroundColor: alpha.bg82,
            }}
          >
            <T variant="meta" lh={18} c={color.text} numberOfLines={2}>{props.caption}</T>
          </View>
        ) : null}
        <Animated.View
          pointerEvents="none"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: alpha.violet14, opacity: wash }}
        />
      </Animated.View>
    </View>
  );
}
