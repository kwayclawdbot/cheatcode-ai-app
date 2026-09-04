/**
 * THE TRADE SECTION, REBUILT AS A SPINE.
 *
 * The owner's brief, in his words: "trade section should be where users and kai
 * conduct their analysis to determine if trade is good to take, then take the
 * trade from the app by either using the papertrading features of the app or
 * connecting brokerage (later)."
 *
 * That is one job in three beats — LOOK AT IT, DECIDE, TAKE IT — and this screen
 * shows exactly one of them at a time. Everything the old portal had is still
 * reachable; none of it is on screen at once. What moved where:
 *
 *   the chart, Kai's marks, the timeframes ....... beat one, full size
 *   the alert panel (grade, scorecard, thesis) ... beat two, as the verdict
 *   the plan panel (entry/stop/target/size) ...... beat two as evidence,
 *                                                  beat three as the order
 *   the execution object / CTA ................... beat three, as the card
 *   the community panel ......................... beat two, one labelled line
 *   the context switcher ........................ gone; the spine replaced it
 *   the drawers + ticker switcher ............... unchanged, in the top bar
 *   the annotation sheet ........................ unchanged, on tapping a level
 *
 * THE MACHINERY IS THE OLD MACHINERY. `usePortal`, `usePortalCandles`,
 * `useKaiPortal`, `planCommand` and `applyChartCommand` are the same objects the
 * v1 portal drives, so Kai's chart vocabulary — the levels he can now name and
 * the server resolves — works here on day one and any fix to it lands on both.
 *
 * PAPER ONLY. See `venues.ts` for the seam a brokerage would slot into.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { T, Eyebrow } from '../../ui/Text';
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
import { AnnotationSheet, PortalTopBar, TickerSwitcherSheet } from '../portal/chrome';
import { PortalDrawersSheet } from '../portal/Drawers';
import { KaiPanel, PortalNotice } from '../portal/panels';
import { usePortal, usePortalCandles } from '../portal/usePortal';
import { planCommand, useKaiPortal } from '../portal/useKaiPortal';
import type { PortalCommandResult } from '../portal/useKaiPortal';
import { rememberSymbol } from '../portal/last-symbol';
import type { Annotation, ChartCommand, PortalTimeframe } from '../portal/types';
import { Spine, SpineFooter } from './Spine';
import { DecideBeat, type KaiReadState } from './Decide';
import { ConfirmCard, Receipt } from './Take';
import { readPortal, type Beat, type ReadLevel } from './read';
import { useTake } from './useTake';

/**
 * The chart is the subject in beat one and the ground in beat two.
 *
 * IN BEAT THREE IT IS NOT ON SCREEN AT ALL. Confirming an order is the one
 * moment that is not about the chart, and on a phone the band was costing the
 * hundred and thirty pixels that put SEND below the fold — which is the worst
 * possible place for it, because a person then confirms an order they have
 * scrolled past the risk on. It is HIDDEN, not unmounted: the same chart is
 * still mounted behind the card, so cancelling comes straight back to it
 * without a WebView reload.
 */
const CHART_HEIGHT: Record<Beat, number> = { look: 352, decide: 150, take: 150 };

/**
 * The question the "read this chart" button asks.
 *
 * Phrased the way a person phrases it, because it goes through the same path a
 * typed question does — the model reads it, writes the answer, and the director
 * places the gestures. A terse instruction produces a terse answer and a chart
 * that barely moves.
 */
export const READ_QUESTION = (symbol: string) =>
  `Walk me through this ${symbol} chart — what matters on it right now, and why?`;

/**
 * What Kai is asked on a symbol with nothing graded on it.
 *
 * He names the levels; the server resolves the numbers off stored bars. Nothing
 * in this sentence asks him for a plan, because there is no plan to be had.
 */
export const MARK_CHART_QUESTION = (symbol: string) =>
  `Mark what is actually on the ${symbol} chart — the previous session's high and low, the moving averages, the opening range and VWAP — and tell me what they say about where price is.`;

export default function TradePortalV2() {
  const router = useRouter();
  const { profile } = useSession();
  const mode: GoalMode = (profile?.primary_mode as GoalMode) ?? 'day_trade';
  const params = useLocalSearchParams<{
    symbol?: string; alert?: string; setup?: string; beat?: string; sim?: string;
  }>();

  const symbol = String(params.symbol ?? '').toUpperCase();
  const alertId = params.alert ? String(params.alert) : null;
  const setupId = params.setup ? String(params.setup) : null;

  const { data, annotations, upsertAnnotation, setAnnotationStatus, loading, error, reload } =
    usePortal(symbol, { alert: alertId, setup: setupId, ctx: 'kai', mode });

  const [beat, setBeat] = useState<Beat>(
    params.beat === 'decide' || params.beat === 'take' ? (params.beat as Beat) : 'look',
  );
  const [tf, setTf] = useState<PortalTimeframe | null>(null);
  const [focusTs, setFocusTs] = useState<string | null>(null);
  const [hideAnnotations, setHideAnnotations] = useState(false);
  const [inspecting, setInspecting] = useState<Annotation | null>(null);
  const [drawersOpen, setDrawersOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [stageOpen, setStageOpen] = useState(false);
  const [levelsOpen, setLevelsOpen] = useState(false);

  useEffect(() => { if (symbol) rememberSymbol(symbol); }, [symbol]);
  useEffect(() => {
    if (!data) return;
    setTf(data.chart.timeframe);
    setFocusTs(data.chart.focus_ts);
  }, [data]);

  const { candles, exact } = usePortalCandles(symbol, tf);
  const chart = useRef<ChartHandle | null>(null);
  const stageChart = useRef<ChartHandle | null>(null);
  const activeChart = () => (stageOpen ? stageChart.current ?? chart.current : chart.current);

  /**
   * One chart command → the chart performs it, and Kai says what he did.
   * Lifted from the v1 portal unchanged, including the rule that React state is
   * committed AFTER the choreography so levels do not snap into existence before
   * Kai's pointer reaches them.
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

  const read = useMemo(() => (data ? readPortal(data) : null), [data]);
  const take = useTake(read, data);

  /**
   * The failure a person is most likely to hit, made visible.
   *
   * `?sim=readfail` forces the Kai-read block into its failure state so the
   * proof can shoot it — fixtures never fail on their own, and a state nobody
   * has looked at is a state nobody has designed.
   */
  const simFail = String(params.sim ?? '') === 'readfail';
  const [readFailed, setReadFailed] = useState(simFail);
  useEffect(() => { setReadFailed(simFail); }, [simFail]);
  const kaiState: KaiReadState = readFailed
    ? 'failed'
    : read?.interpretation ? 'ready' : loading ? 'loading' : 'failed';

  const askKai = useCallback((q: string) => { void send(q); }, [send]);

  const markLevel = useCallback((l: ReadLevel) => {
    applyCommand({
      command: 'mark_level',
      payload: { kind: l.key, price: l.price },
      narration: `${l.label} — ${l.plain}`,
    });
  }, [applyCommand]);

  /* ---------------- honest failure states ---------------- */

  if (!symbol) {
    return (
      <Screen variant="corner" layout="tab" testID="screen-trade-portal-v2">
        <View style={{ padding: 16 }}>
          <T size={13} c={color.muted}>No symbol was passed to the Trade section.</T>
        </View>
      </Screen>
    );
  }

  if (!data && loading) {
    return (
      <Screen variant="corner" layout="tab" testID="screen-trade-portal-v2">
        <ScreenLoading label={`Opening ${symbol}…`} />
      </Screen>
    );
  }

  if (!data || !read) {
    return (
      <Screen variant="corner" layout="tab" testID="screen-trade-portal-v2">
        <View style={{ paddingHorizontal: 16, gap: 12 }} testID="portal2-error">
          <ObjectCard r={radius.xl} style={{ padding: 18, gap: 8 }}>
            <Eyebrow c={color.muted}>NOTHING LOADED</Eyebrow>
            <T size={13} c={color.muted} lh={19}>{error ?? `I could not open ${symbol} just now.`}</T>
          </ObjectCard>
          <Button label="Try again" kind="outline" onPress={reload} testID="portal2-retry" />
        </View>
      </Screen>
    );
  }

  const chartHeight = CHART_HEIGHT[beat];
  const chartHidden = beat === 'take';
  const markedCount = annotations.filter((a) => a.status === 'valid').length;

  return (
    <Screen variant="corner" layout="tab" testID="screen-trade-portal-v2">
      <PortalTopBar
        symbol={data.symbol}
        name={data.name}
        quote={data.quote}
        marketState={data.market_state}
        paper={data.paper}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
        onSwitchTicker={() => setSwitcherOpen(true)}
        onOpenDrawers={() => setDrawersOpen(true)}
        showSearch={false}
      />

      <Spine
        value={beat}
        onChange={setBeat}
        lockedTake={read.takeable ? null : read.blocked_plain}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 14, gap: 12 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ display: chartHidden ? 'none' : 'flex' }}>
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
          height={chartHeight}
        />
        </View>

        {beat === 'look' ? (
          <LookBeat
            symbol={data.symbol}
            markedCount={markedCount}
            levelsOpen={levelsOpen}
            annotations={annotations}
            exact={exact}
            streaming={streaming}
            turns={turns}
            onToggleLevels={() => setLevelsOpen((v) => !v)}
            onInspect={setInspecting}
            onReadChart={() => { setStageOpen(true); askKai(READ_QUESTION(data.symbol)); }}
            onExpand={() => setStageOpen(true)}
          />
        ) : null}

        {beat === 'decide' ? (
          <DecideBeat
            read={read}
            portal={data}
            kaiState={kaiState}
            onMark={markLevel}
            onMarkChart={() => askKai(MARK_CHART_QUESTION(data.symbol))}
            onAsk={askKai}
            onRetryRead={() => { setReadFailed(false); reload(); }}
          />
        ) : null}

        {beat === 'take' ? (
          <View style={{ gap: 12 }}>
            {take.phase === 'receipt' && take.order ? (
              <Receipt
                order={take.order}
                plain={take.receipt_plain ?? ''}
                onOpenOrder={() => router.push(`/order/${encodeURIComponent(take.order!.id)}` as never)}
                onOpenPosition={() => router.push(
                  take.order?.position_id
                    ? `/position/${encodeURIComponent(take.order.position_id)}` as never
                    : '/position' as never,
                )}
                onDone={() => { take.reset(); setBeat('look'); }}
              />
            ) : take.phase === 'confirm' || take.phase === 'sending' ? (
              take.preview ? (
                <ConfirmCard
                  read={read}
                  preview={take.preview}
                  size={take.size ?? { shares: null, plain: '', risk_usd: null }}
                  sending={take.phase === 'sending'}
                  error={take.error}
                  onSend={() => { void take.send(); }}
                  onCancel={() => { take.reset(); setBeat('decide'); }}
                />
              ) : null
            ) : take.phase === 'failed' ? (
              <ObjectCard r={radius.xl} style={{ padding: 16, gap: 10 }} testID="take-failed">
                <Eyebrow c={color.muted}>NOT PRICED</Eyebrow>
                <T size={13} lh={19}>{take.error}</T>
                <Button
                  label="Open the full ticket"
                  kind="outline"
                  height={42}
                  onPress={() => router.push(`/order/new?symbol=${encodeURIComponent(data.symbol)}` as never)}
                  testID="take-full-ticket"
                />
              </ObjectCard>
            ) : (
              <ObjectCard r={radius.xl} style={{ padding: 16, gap: 8 }} testID="take-preparing">
                <Eyebrow c={color.muted}>PRICING IT</Eyebrow>
                <T size={13} lh={19} c={color.muted}>Working out the size and what it costs…</T>
              </ObjectCard>
            )}
          </View>
        ) : null}

        {data.notice ? <PortalNotice text={data.notice} /> : null}
        {data.is_fixture ? <PortalNotice text="Example data — no account is connected on this build." /> : null}
      </ScrollView>

      {beat === 'look' ? (
        <SpineFooter
          label="What’s the read?"
          onPress={() => setBeat('decide')}
          testID="spine-next-decide"
        />
      ) : null}
      {beat === 'decide' ? (
        <SpineFooter
          label="Take it"
          blocked={read.takeable ? null : read.blocked_plain}
          onPress={() => { setBeat('take'); void take.prepare(); }}
          testID="spine-next-take"
        />
      ) : null}

      <ChartStage
        open={stageOpen}
        onClose={() => setStageOpen(false)}
        symbol={data.symbol}
        name={data.name}
        timeframe={tf ?? data.chart.timeframe}
        timeframes={data.chart.timeframes}
        candles={candles}
        annotations={hideAnnotations ? [] : annotations}
        hideAnnotations={hideAnnotations}
        focusTs={focusTs}
        lastPrice={data.quote?.price ?? null}
        onTimeframeChange={setTf}
        onSelectAnnotation={setInspecting}
        onChart={(h) => { stageChart.current = h; }}
        live={Boolean(answer?.live)}
        caption={answer?.text ?? null}
      />

      <View style={{ paddingHorizontal: 16, paddingBottom: 12, paddingTop: 2 }}>
        <Composer
          testID="portal-composer"
          placeholder={`Ask Kai about ${data.symbol}…`}
          disabled={streaming}
          onSend={(text) => { void send(text); }}
        />
      </View>

      <AnnotationSheet
        annotation={inspecting}
        onClose={() => setInspecting(null)}
        onHide={(a) => { setAnnotationStatus(a.id, 'hidden'); setInspecting(null); }}
        onDelete={(a) => { setAnnotationStatus(a.id, 'deleted'); setInspecting(null); }}
        onExplain={(a) => {
          setInspecting(null);
          narrate(a.reason ?? `${a.kind} at ${a.price ?? '—'}.`);
        }}
      />

      <PortalDrawersSheet
        visible={drawersOpen}
        onClose={() => setDrawersOpen(false)}
        drawers={data.drawers}
        onOpenSymbol={(s) => { setDrawersOpen(false); rememberSymbol(s); router.replace(`/trade/${encodeURIComponent(s)}` as never); }}
        onNavigate={(r) => { setDrawersOpen(false); router.push(r as never); }}
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

/* ------------------------------------------------------------------ */
/* Beat one — look at it                                                */
/* ------------------------------------------------------------------ */

function LookBeat({
  symbol, markedCount, levelsOpen, annotations, exact, streaming, turns,
  onToggleLevels, onInspect, onReadChart, onExpand,
}: {
  symbol: string;
  markedCount: number;
  levelsOpen: boolean;
  annotations: Annotation[];
  exact: boolean;
  streaming: boolean;
  turns: Parameters<typeof KaiPanel>[0]['turns'];
  onToggleLevels: () => void;
  onInspect: (a: Annotation) => void;
  onReadChart: () => void;
  onExpand: () => void;
}) {
  return (
    <View style={{ gap: 12 }} testID="beat-look">
      {/* The chart's index, folded away by default. Beat one is the chart; the
          list of what is on it is one tap, not a permanent second column. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <T
          size={12.5}
          c={color.muted}
          onPress={onToggleLevels}
          testID="look-levels-toggle"
          accessibilityRole="button"
          accessibilityLabel={`${markedCount} levels marked. ${levelsOpen ? 'Hide' : 'Show'} the list.`}
          style={{ flex: 1 }}
        >
          {markedCount === 0
            ? `Nothing marked on ${symbol} yet.`
            : `${markedCount} level${markedCount === 1 ? '' : 's'} marked · ${levelsOpen ? 'hide' : 'show'}`}
        </T>
        {!exact ? <T size={11.5} c={color.gold} testID="look-coarser">Coarser bars</T> : null}
      </View>

      {levelsOpen ? <AnnotationRail annotations={annotations} onSelect={onInspect} /> : null}

      <View style={{ flexDirection: 'row', gap: 9 }}>
        <Button
          label="Kai, read this chart"
          kind="kai"
          height={42}
          full={false}
          disabled={streaming}
          testID="look-read-chart"
          accessibilityHint={`Kai walks you through the ${symbol} chart, marking what he talks about.`}
          onPress={onReadChart}
        />
        <Button
          label="Expand"
          kind="outline"
          height={42}
          full={false}
          testID="look-expand"
          accessibilityHint="Opens the chart full screen. Turn the phone sideways for a wider view."
          onPress={onExpand}
        />
      </View>

      <KaiPanel turns={turns} symbol={symbol} />
    </View>
  );
}
