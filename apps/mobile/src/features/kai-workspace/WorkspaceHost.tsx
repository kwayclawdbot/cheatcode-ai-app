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
import React, { useCallback } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
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
  if (surfaces.length < 2) return null;
  return (
    <ScrollView
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
      <SurfaceStrip surfaces={surfaces} activeId={activeId} onFocus={focus} onClose={close} />
      <View style={{ flex: 1 }}>
        <Render {...props} key={`${active.id}:${active.nonce}`} surface={active} />
      </View>
    </View>
  );
}
