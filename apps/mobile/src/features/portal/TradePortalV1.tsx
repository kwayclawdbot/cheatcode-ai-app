/**
 * THE ROUND-4 TRADE PORTAL, UNCHANGED — v1.
 *
 * This file used to BE `/trade/[symbol]`. It was lifted here whole, with only
 * its import paths adjusted, when the Trade section was rebuilt as a three-beat
 * spine (`features/portal2/`). Both are live: the route picks between them, the
 * new one is behind a flag, and this one is still what a person gets by default
 * until the owner has seen the new one and chosen. Nothing about its behaviour
 * changed in the move.
 *
 * ORIGINAL HEADER FOLLOWS.
 *
 * `/trade/[symbol]` — the chart-first Trade Portal (spec 10 §6/§7).
 *
 * Trade is no longer a portfolio dashboard. It opens as a working chart with
 * Kai underneath it, and the account, watchlist, positions and orders live in a
 * drawer. Opening an alert lands HERE with its context restored — there is no
 * generic alert-detail screen between the card and this chart.
 *
 * Query: ?alert=<id>&setup=<id>&ctx=kai|alert|plan|community
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { T } from '../../ui/Text';
import { Composer } from '../../ui/Composer';
import { ObjectCard } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { ScreenLoading } from '../../ui/Loading';
import { color, radius } from '../../ui/tokens';
import { useSession } from '../../lib/session';
import type { GoalMode } from '../../lib/types';
import { ChartView } from '../chart/ChartView';
import { AnnotationRail } from '../chart/AnnotationRail';
import { applyChartCommand } from '../chart/apply';
import { ChartStage } from '../chart/ChartStage';
import type { ChartHandle } from '../chart/apply';
import {
  AnnotationSheet, ContextSwitcher, PortalTopBar, TickerSwitcherSheet, TimeframeRail,
} from '../portal/chrome';
import { PortalDrawersSheet } from '../portal/Drawers';
import {
  AlertPanel, CommunityPanel, ExecutionObject, KaiPanel, PlanPanel, PortalNotice,
} from '../portal/panels';
import { usePortal, usePortalCandles } from '../portal/usePortal';
import { planCommand, useKaiPortal } from '../portal/useKaiPortal';
import type { PortalCommandResult } from '../portal/useKaiPortal';
import { rememberSymbol } from '../portal/last-symbol';
import type { Annotation, ChartCommand, PortalContext, PortalTimeframe } from '../portal/types';

const readCtx = (v: unknown): PortalContext | null => {
  const s = String(v ?? '');
  return s === 'kai' || s === 'alert' || s === 'plan' || s === 'community' ? s : null;
};

/**
 * The question the Kai Live button asks.
 *
 * Phrased as a person would phrase it, because it goes through the SAME path a
 * typed question does — the model reads it, writes the answer, and the director
 * places the gestures. A terse instruction ("analyze chart") produces a terse
 * answer and a chart that barely moves; asking him to walk through it is what
 * earns the camera moves.
 */
export const KAI_LIVE_QUESTION = (symbol: string) =>
  `Walk me through this ${symbol} chart — what matters on it right now, and why?`;

export default function TradePortalV1() {
  const router = useRouter();
  const { profile } = useSession();
  const mode: GoalMode = (profile?.primary_mode as GoalMode) ?? 'day_trade';
  const params = useLocalSearchParams<{ symbol?: string; alert?: string; setup?: string; ctx?: string }>();

  const symbol = String(params.symbol ?? '').toUpperCase();
  const alertId = params.alert ? String(params.alert) : null;
  const setupId = params.setup ? String(params.setup) : null;
  const routeCtx = readCtx(params.ctx);

  const { data, annotations, upsertAnnotation, setAnnotationStatus, loading, error, reload } =
    usePortal(symbol, { alert: alertId, setup: setupId, ctx: routeCtx, mode });

  // Null until the payload names the timeframe the setup lives on: asking
  // for bars before that would fetch a resolution we are about to replace.
  const [tf, setTf] = useState<PortalTimeframe | null>(null);
  const [ctx, setCtx] = useState<PortalContext>(routeCtx ?? 'kai');
  const [focusTs, setFocusTs] = useState<string | null>(null);
  const [hideAnnotations, setHideAnnotations] = useState(false);
  const [inspecting, setInspecting] = useState<Annotation | null>(null);
  const [drawersOpen, setDrawersOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  useEffect(() => { if (symbol) rememberSymbol(symbol); }, [symbol]);

  // Restore the chart context the alert was opened with (§6).
  useEffect(() => {
    if (!data) return;
    setTf(data.chart.timeframe);
    setFocusTs(data.chart.focus_ts);
    if (routeCtx) setCtx(routeCtx);
  }, [data, routeCtx]);

  const { candles, exact } = usePortalCandles(symbol, tf);
  const chart = useRef<ChartHandle | null>(null);
  const [stageOpen, setStageOpen] = useState(false);
  /**
   * THE CHART KAI IS DRIVING, which is not always the same object.
   *
   * The stage mounts its own `ChartView`. While it is open that is the chart the
   * user is looking at, so it is the one every command has to perform on —
   * otherwise Kai narrates beautifully over a full-screen chart while marking
   * levels on the small one hidden behind it.
   */
  const stageChart = useRef<ChartHandle | null>(null);
  const activeChart = () => (stageOpen ? stageChart.current ?? chart.current : chart.current);

  /**
   * One chart command → the chart PERFORMS it, and Kai says what he did.
   *
   * `planCommand` resolves WHAT (which level, from which real object — no number
   * is created here). `applyChartCommand` decides HOW it appears: the pointer
   * travels to the price, the line draws itself, the label catches up. React
   * state is committed AFTERWARDS, so the annotation set stays the source of
   * truth without the levels snapping into existence before Kai gets there.
   */
  const applyCommand = useCallback((c: ChartCommand): PortalCommandResult | null => {
    const p = planCommand(c, data, annotations);
    if (!p) return null;

    if (p.timeframe) setTf(p.timeframe);
    if (p.focusTs) setFocusTs(p.focusTs);
    if (p.upsert.length) setHideAnnotations(false);

    const handle = activeChart();
    const commit = () => {
      p.upsert.forEach(upsertAnnotation);
      p.remove.forEach((id) => setAnnotationStatus(id, 'deleted'));
    };

    // The choreography, so a caller that is running a SEQUENCE of commands — a
    // directed answer (LIVE-8) — can wait for one gesture before starting the
    // next. `applyChartCommand` keeps a queue of one and supersedes, so an
    // un-awaited second command silently drops the first one's level.
    let done: Promise<unknown> = Promise.resolve();
    if (handle) {
      done = applyChartCommand(handle, {
        command: c.command,
        payload: c.payload,
        annotations: p.upsert.map((a) => ({
          id: a.id, kind: a.kind, price: a.price, price2: a.price2,
          ts_from: a.ts_from, ts_to: a.ts_to, text: a.text,
          provenance: a.provenance, status: a.status,
        })),
        removeIds: p.remove,
        timeframe: p.timeframe,
        focusTs: p.focusTs,
        // An interrupted sequence still commits: the user stopped the ANIMATION,
        // not the marking. The levels are real either way.
      }).then(commit, commit);
    } else {
      commit();
    }

    if (p.route) router.push(p.route as never);
    return { narration: p.narration, done };
  }, [data, annotations, upsertAnnotation, setAnnotationStatus, router]);

  const { turns, send, streaming, narrate, answer } = useKaiPortal({
    mode,
    portal: data,
    symbol,
    alertId,
    opening: data?.kai.opening_message ?? null,
    onCommand: applyCommand,
  });

  const visibleAnnotations = useMemo(
    () => (hideAnnotations ? [] : annotations),
    [hideAnnotations, annotations],
  );

  const go = useCallback((route: string) => router.push(route as never), [router]);

  const askKai = useCallback((q: string) => {
    setCtx('kai');
    void send(q);
  }, [send]);

  if (!symbol) {
    return (
      <Screen variant="corner" layout="tab" testID="screen-trade-portal">
        <View style={{ padding: 16 }}>
          <T size={13} c={color.muted}>No symbol was passed to the portal.</T>
        </View>
      </Screen>
    );
  }

  if (!data && loading) {
    return (
      <Screen variant="corner" layout="tab" testID="screen-trade-portal">
        <ScreenLoading label={`Opening ${symbol}…`} />
      </Screen>
    );
  }

  if (!data) {
    return (
      <Screen variant="corner" layout="tab" testID="screen-trade-portal">
        <View style={{ paddingHorizontal: 16, gap: 12 }}>
          <ObjectCard r={radius.xl} style={{ padding: 18 }}>
            <T size={13} c={color.muted} lh={19}>{error ?? `I could not open ${symbol} just now.`}</T>
          </ObjectCard>
          <Button label="Try again" kind="outline" onPress={reload} testID="portal-retry" />
        </View>
      </Screen>
    );
  }

  return (
    <Screen variant="corner" layout="tab" testID="screen-trade-portal">
      <PortalTopBar
        symbol={data.symbol}
        name={data.name}
        quote={data.quote}
        marketState={data.market_state}
        paper={data.paper}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
        onSwitchTicker={() => setSwitcherOpen(true)}
        onOpenDrawers={() => setDrawersOpen(true)}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 14, gap: 11 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <ChartView
          testID="portal-chart"
          ref={chart}
          symbol={data.symbol}
          timeframe={tf ?? data.chart.timeframe}
          timeframes={data.chart.timeframes}
          candles={candles}
          annotations={annotations}
          hideAnnotations={hideAnnotations}
          focusTs={focusTs}
          lastPrice={data.quote?.price ?? null}
          onSelectAnnotation={setInspecting}
          onTimeframeChange={setTf}
          height={248}
        />

        {/* The rail is the chart's index: every level, including the ones
            currently off screen, reachable and readable by a screen reader. */}
        <AnnotationRail annotations={visibleAnnotations} onSelect={setInspecting} />

        <TimeframeRail
          value={tf ?? data.chart.timeframe}
          options={data.chart.timeframes}
          onChange={setTf}
          exact={exact}
          annotationsHidden={hideAnnotations}
          onToggleAnnotations={() => setHideAnnotations((h) => !h)}
        />

        {/*
          KAI LIVE (LIVE-8). Not a second feature — the same tool the composer
          reaches, with the question already written. Kai takes the chart over
          and works through it: camera, marks, the candle ringed, narrated as it
          goes. It is a button because "read this chart to me" is the question
          people ask most and should not have to type.

          IT OPENS THE STAGE FIRST. Watching Kai work a 248-pixel chart wedged
          between a rail and a context switcher is watching a preview of the
          thing rather than the thing. He gets the screen.
        */}
        <View style={{ flexDirection: 'row', gap: 9 }}>
          <Button
            label="Kai Live"
            kind="kai"
            height={38}
            full={false}
            disabled={streaming}
            testID="portal-kai-live"
            accessibilityHint={`Kai walks you through the ${data.symbol} chart, marking what he talks about.`}
            onPress={() => {
              setStageOpen(true);
              askKai(KAI_LIVE_QUESTION(data.symbol));
            }}
          />
          <Button
            label="Expand"
            kind="outline"
            height={38}
            full={false}
            testID="portal-expand-chart"
            accessibilityHint="Opens the chart full screen. Turn the phone sideways for a wider view."
            onPress={() => setStageOpen(true)}
          />
        </View>

        <ContextSwitcher
          value={ctx}
          onChange={setCtx}
          disabled={{ alert: !data.alert, community: !data.community }}
        />

        {ctx === 'kai' ? <KaiPanel turns={turns} symbol={data.symbol} /> : null}

        {ctx === 'alert' ? (
          data.alert ? (
            <AlertPanel
              alert={data.alert}
              onAskWhy={() => askKai(`Why did the ${data.symbol} alert trigger?`)}
              onPrimary={() => go(
                data.alert?.primary_action?.route
                ?? data.execution.action?.route
                ?? `/plan/new?symbol=${encodeURIComponent(data.symbol)}`,
              )}
            />
          ) : (
            <T size={12.5} c={color.muted} testID="panel-alert-empty">
              {`No alert is attached to ${data.symbol} right now.`}
            </T>
          )
        ) : null}

        {ctx === 'plan' ? (
          <PlanPanel
            plan={data.plan}
            symbol={data.symbol}
            onAction={go}
            onAskKai={() => askKai(`Does this plan on ${data.symbol} fit my risk?`)}
          />
        ) : null}

        {ctx === 'community' ? (
          <CommunityPanel
            community={data.community}
            symbol={data.symbol}
            onOpenCircle={() => {
              const c = data.community;
              if (c?.circle_id) go(`/circle/${encodeURIComponent(c.circle_id)}`);
              else if (c?.room_id) go(`/room/${encodeURIComponent(c.room_id)}`);
            }}
          />
        ) : null}

        <ExecutionObject
          execution={data.execution}
          portal={data}
          onAction={go}
          onAskKai={() => askKai(`What should I be watching on ${data.symbol} right now?`)}
        />

        {data.notice ? <PortalNotice text={data.notice} /> : null}
        {data.is_fixture ? <PortalNotice text="Example data — no account is connected on this build." /> : null}
      </ScrollView>

      {/*
        THE STAGE. Mounted at the end so it covers the screen, and given the SAME
        annotation set and timeframe state as the embedded chart — it is the same
        chart with more room, not a second one with its own opinions.

        `live` is what puts it into broadcast: Kai answering is the trigger, not
        a mode the user has to find and switch on.
      */}
      <ChartStage
        open={stageOpen}
        onClose={() => setStageOpen(false)}
        symbol={data.symbol}
        name={data.name}
        timeframe={tf ?? data.chart.timeframe}
        timeframes={data.chart.timeframes}
        candles={candles}
        annotations={visibleAnnotations}
        hideAnnotations={hideAnnotations}
        focusTs={focusTs}
        lastPrice={data.quote?.price ?? null}
        onTimeframeChange={setTf}
        onSelectAnnotation={setInspecting}
        onChart={(h) => { stageChart.current = h; }}
        live={Boolean(answer?.live)}
        caption={answer?.text ?? null}
      />

      {/* The composer is persistent: the chart stays visible while you talk. */}
      <View style={{ paddingHorizontal: 16, paddingBottom: 12, paddingTop: 4 }}>
        <Composer
          testID="portal-composer"
          placeholder="Ask Kai about this chart…"
          disabled={streaming}
          onSend={(text) => { setCtx('kai'); void send(text); }}
        />
      </View>

      <AnnotationSheet
        annotation={inspecting}
        onClose={() => setInspecting(null)}
        onHide={(a) => { setAnnotationStatus(a.id, 'hidden'); setInspecting(null); }}
        onDelete={(a) => { setAnnotationStatus(a.id, 'deleted'); setInspecting(null); }}
        onExplain={(a) => {
          setInspecting(null);
          setCtx('kai');
          narrate(a.reason ?? `${a.kind} at ${a.price ?? '—'}.`);
        }}
      />

      <PortalDrawersSheet
        visible={drawersOpen}
        onClose={() => setDrawersOpen(false)}
        drawers={data.drawers}
        onOpenSymbol={(s) => { setDrawersOpen(false); rememberSymbol(s); router.replace(`/trade/${encodeURIComponent(s)}` as never); }}
        onNavigate={(r) => { setDrawersOpen(false); go(r); }}
      />

      <TickerSwitcherSheet
        visible={switcherOpen}
        onClose={() => setSwitcherOpen(false)}
        watchlist={data.drawers.watchlist}
        recent={data.drawers.recent}
        onPick={(s) => {
          setSwitcherOpen(false);
          rememberSymbol(s);
          router.replace(`/trade/${encodeURIComponent(s)}` as never);
        }}
      />
    </Screen>
  );
}
