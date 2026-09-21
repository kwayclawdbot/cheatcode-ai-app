/**
 * THE TRADE SECTION — the redesign's Trade Detail (2026-09-21, V1 board panel 4).
 *
 * The owner's brief for the section, in his words: "trade section should be
 * where users and kai conduct their analysis to determine if trade is good to
 * take, then take the trade from the app by either using the papertrading
 * features of the app or connecting brokerage (later)."
 *
 * The approved layout (docs/design/redesign-2026-09-21, "Trade Detail"):
 *
 *   back · "PURR · Swing Long" · overflow
 *   logo  PURR  [A setup]                               3.0R
 *         Purr Technologies
 *   Chart | Details | Discussion
 *   the chart, with entry / stop / target in their meaning colours
 *   the setup summary — Entry / Stop / Target, Risk / Reward, Setup type
 *   Kai's thesis — the only violet card
 *   Trend · Catalyst · Volume · Risk
 *   [ Add to watchlist ]                   <- the one orange action
 *   the dock, identical to every other primary screen
 *
 * WHERE THE OLD THREE BEATS WENT. The section used to be one job in three beats
 * — look, decide, take — with a step bar across the top. Nothing was dropped:
 *
 *   LOOK   -> the Chart tab. Same chart, same tools, same full screen.
 *   DECIDE -> the Details tab: the grade, the levels that justify it (tap one to
 *             mark it), what would prove it wrong, Kai's read, the scorecard.
 *   TAKE   -> the paper order, opened from the overflow ("Review paper
 *             order", its first row — the F08 vocabulary) or from the outline button on Details. It
 *             replaces the tabs while it is open, exactly as step 3 replaced the
 *             chart, and it still prices itself however it was reached.
 *
 * `?beat=look|decide|take` links still land in the right place (Chart, Details,
 * the order), and `?tab=chart|details|discussion` names a tab directly.
 *
 * ONE PRIMARY ACTION. The spec says one dominant CTA per screen and names it:
 * Add to watchlist. The paper order is therefore never orange here; it is one
 * tap away in the overflow and a quiet outline on Details.
 *
 * THE DOCK. `/trade/[symbol]` is a stacked route, so the tab navigator's bar is
 * not under it. The screen draws the same `Dock` itself, with Trade active and
 * the same dot and padlock (`features/nav/dock-state.ts`), because the spec
 * says the dock is identical across primary screens and this is where the
 * Trade tab resolves to.
 *
 * THE MACHINERY IS THE OLD MACHINERY. The chart, the candles, the annotations
 * and Kai's command applier are `features/kai-workspace/chart-runtime.ts`,
 * shared with Home; the paper order is `useTake` over the same
 * `tradeApi.preview` -> `tradeApi.submit` path `/order/*` uses. PAPER ONLY —
 * see `venues.ts` for the seam a brokerage would slot into.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { Composer } from '../../ui/Composer';
import { KeyboardDock } from '../../ui/KeyboardDock';
import { Dock } from '../../ui/TabBar';
import { ScreenLoading } from '../../ui/Loading';
import { Card, SectionTabs, T, Button, color, layout, tap } from '../../ui/kit';
import { useSession } from '../../lib/session';
import { env } from '../../lib/env';
import type { GoalMode } from '../../lib/types';
import { AnnotationRail } from '../chart/AnnotationRail';
import { SymbolChart } from '../chart/SymbolChart';
import { AnnotationSheet, TickerSwitcherSheet } from '../portal/chrome';
import { PortalDrawersSheet } from '../portal/Drawers';
import { KaiPanel, PortalNotice } from '../portal/panels';
import { useChartRuntime } from '../kai-workspace';
import { useKaiPortal } from '../portal/useKaiPortal';
import { rememberSymbol } from '../portal/last-symbol';
import { isTradeLevel } from '../portal/visible-annotations';
import { SymbolOfferCard } from '../portal/SymbolOfferCard';
import type { SymbolOffer } from '../portal/plan-command';
import type { Annotation } from '../portal/types';
import { useDockState } from '../nav/dock-state';
import { useWatchlistToggle } from '../trade/useTrade';
import { TradeLocked } from './TradeLocked';
import { DecideBeat, type KaiReadState } from './Decide';
import { ConfirmCard, Receipt } from './Take';
import { readPortal, type ReadLevel } from './read';
import { useTake } from './useTake';
import { useMe } from '../account/useAccount';
import { ACTION_LABEL } from '../orders/vocabulary';
import { DiscussionTab } from './Discussion';
import { MoreSheet } from './MoreSheet';
import {
  IdentityRow, KaiThesisCard, SetupChecklist, SetupSummary, TradeHeader, WatchlistCta,
} from './DetailParts';
import { checklistOf, currentR, levelOf, plannedR, setupType, thesisOf } from './detail-model';

/**
 * The chart's height on the Chart tab. The board gives it roughly the top
 * third of the screen under the tabs, which leaves the setup summary in view on
 * a 390x844 phone without scrolling.
 */
const CHART_HEIGHT = 250;

/**
 * The question the "read this chart" path asks.
 *
 * Phrased the way a person phrases it, because it goes through the same path a
 * typed question does — the model reads it, writes the answer, and the director
 * places the gestures.
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

type Tab = 'chart' | 'details' | 'discussion';
const TABS: { key: Tab; label: string }[] = [
  { key: 'chart', label: 'Chart' },
  { key: 'details', label: 'Details' },
  { key: 'discussion', label: 'Discussion' },
];

export default function TradePortalV2() {
  const router = useRouter();
  const { profile } = useSession();
  const mode: GoalMode = (profile?.primary_mode as GoalMode) ?? 'day_trade';
  const params = useLocalSearchParams<{
    symbol?: string; alert?: string; setup?: string; beat?: string; tab?: string; sim?: string; locked?: string;
  }>();

  const symbol = String(params.symbol ?? '').toUpperCase();
  const alertId = params.alert ? String(params.alert) : null;
  const setupId = params.setup ? String(params.setup) : null;

  /**
   * THE CHART AND KAI'S HANDS ON IT COME FROM ONE PLACE — `useChartRuntime`,
   * which Home's workspace mounts too. One chart implementation, so Kai's chart
   * vocabulary works identically in both and any fix lands on both.
   *
   * `onRoute` is a `router.push` here because in the Trade section that is
   * right: you are already on the chart's own stack.
   */
  const [offer, setOffer] = useState<SymbolOffer | null>(null);
  const rt = useChartRuntime({
    symbol,
    mode,
    alertId,
    setupId,
    onRoute: (r) => router.push(r as never),
    onOffer: setOffer,
  });
  const {
    data, annotations, onChart, candles, exact, revealed, reveal,
    createUserAnnotation, updateUserAnnotation, setAnnotationStatus,
    loading, error, locked, reload, hideAnnotations, focusTs,
    applyCommand,
  } = rt;
  const tf = rt.timeframe;
  const setTf = rt.setTimeframe;

  const initialTab: Tab = params.tab === 'details' || params.tab === 'discussion' || params.tab === 'chart'
    ? (params.tab as Tab)
    : params.beat === 'decide' ? 'details' : 'chart';
  const [tab, setTab] = useState<Tab>(initialTab);
  /** The paper order is open in place of the tabs — the old step 3. */
  const [taking, setTaking] = useState(params.beat === 'take');
  /** The Kai composer is out. Opened from the thesis card's "Ask Kai". */
  const [asking, setAsking] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [inspecting, setInspecting] = useState<Annotation | null>(null);
  const [drawersOpen, setDrawersOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [levelsOpen, setLevelsOpen] = useState(false);

  useEffect(() => { if (symbol) rememberSymbol(symbol); }, [symbol]);

  /**
   * The symbol Kai has offered to put up, if any. One at a time, and it retires
   * when the symbol changes.
   */
  useEffect(() => { setOffer(null); }, [symbol]);

  /**
   * `?sim=offer` puts Kai's symbol card up without a model call, so the state
   * can be looked at while the model is unreachable.
   */
  const simOffer = String(params.sim ?? '') === 'offer';
  useEffect(() => {
    if (simOffer) setOffer({ symbol: 'AMKR', hook: 'the one you asked about' });
  }, [simOffer, symbol]);

  const { turns, send, streaming, narrate, answer, status } = useKaiPortal({
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
   * THE ORDER PRICES ITSELF, HOWEVER IT WAS OPENED — from the overflow, from
   * the Details button or from a `?beat=take` link. Opening it is what asks,
   * once per opening; closing and re-opening asks again, because the price may
   * have moved.
   */
  const { phase: takePhase, prepare: takePrepare, reset: takeReset } = take;
  useEffect(() => {
    if (taking && takePhase === 'idle' && read) void takePrepare();
  }, [taking, takePhase, takePrepare, read]);
  useEffect(() => {
    if (!taking && (takePhase === 'unsized' || takePhase === 'failed')) takeReset();
  }, [taking, takePhase, takeReset]);
  /** The account-level sharing default for the confirmation card. */
  const me = useMe();
  const dock = useDockState();
  const watch = useWatchlistToggle(symbol, Boolean(data?.starred));

  /**
   * `?sim=readfail` forces the Kai-read block into its failure state so the
   * proof can shoot it — fixtures never fail on their own.
   */
  const simFail = String(params.sim ?? '') === 'readfail';
  const [readFailed, setReadFailed] = useState(simFail);
  useEffect(() => { setReadFailed(simFail); }, [simFail]);
  const kaiState: KaiReadState = readFailed
    ? 'failed'
    : read?.interpretation ? 'ready' : loading ? 'loading' : 'failed';

  /** Anything asked of Kai is answered on the Chart tab, where his marks land. */
  const askKai = useCallback(
    (q: string, opts?: { expectMarks?: boolean; working?: string }) => {
      setTab('chart');
      setAsking(true);
      void send(q, opts);
    },
    [send],
  );

  const markLevel = useCallback((l: ReadLevel) => {
    setTab('chart');
    applyCommand({
      command: 'mark_level',
      payload: { kind: l.key, price: l.price },
      narration: `${l.label} — ${l.plain}`,
    });
  }, [applyCommand]);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/home'));
  const openTake = () => { setMoreOpen(false); setTaking(true); };
  const closeTake = () => { take.reset(); setTaking(false); };

  /* ---------------- honest failure states ---------------- */

  const bare = (children: React.ReactNode) => (
    <Screen variant="corner" layout="tab" testID="screen-trade-portal-v2">
      <View style={{ flex: 1 }}>{children}</View>
      <Dock active="trade" onNavigate={(n) => router.navigate(`/${n}` as never)} {...dock} />
    </Screen>
  );

  if (!symbol) {
    return bare(
      <View style={{ padding: layout.gutter }}>
        <T variant="meta" c={color.textSecondary}>No symbol was passed to the Trade section.</T>
      </View>,
    );
  }

  /**
   * THE PLAN SAID NO, AND THAT IS NOT AN ERROR. Checked BEFORE the loading and
   * failure branches: a free account reaching this route is an expected
   * journey, not a fault. `?locked=1` is a FIXTURES-ONLY preview of it.
   */
  if (locked || (env.FIXTURES && params.locked === '1')) {
    return <TradeLocked symbol={symbol} plain={locked ? error : null} />;
  }

  if (!data && loading) {
    return bare(<ScreenLoading label={`Opening ${symbol}…`} />);
  }

  if (!data || !read) {
    return bare(
      <View style={{ paddingHorizontal: layout.gutter, gap: 12 }} testID="portal2-error">
        <Card style={{ gap: 8 }}>
          <T variant="cardTitle">Nothing loaded</T>
          <T variant="body" c={color.textSecondary}>{error ?? `I could not open ${symbol} just now.`}</T>
        </Card>
        <Button label="Try again" kind="outline" onPress={reload} testID="portal2-retry" />
      </View>,
    );
  }

  const markedCount = annotations.filter((a) => a.status === 'valid').length;
  // The marks line is for YOUR drawings. Kai's and the plan's marks are already
  // on the chart and in the overflow, so at rest the line stays out of the way.
  const userDrawn = annotations.filter((a) => a.status === 'valid' && a.provenance === 'user').length;
  const tradeLevels = onChart.filter(isTradeLevel).length;
  const onChartCount = onChart.filter((a) => !isTradeLevel(a)).length;
  const kind = setupType(data.alert);
  const title = kind ? `${data.symbol} · ${kind}` : data.symbol;
  const rNow = currentR(read, data.quote?.price ?? null);
  const checklist = checklistOf(data.alert?.score_components, read.gradeable);
  const thesis = thesisOf(read, data);
  // Kai's conversation shows once there is one: the composer is out, or
  // something beyond his opening line has been said. His opening line on its
  // own is a greeting; the thesis card is where he argues the trade.
  const conversation = asking || turns.some((t) => t.kind !== 'kai');
  const chartShown = tab === 'chart' && !taking;

  return (
    <Screen variant="corner" layout="tab" testID="screen-trade-portal-v2">
      <TradeHeader
        title={title}
        symbol={data.symbol}
        onBack={taking ? closeTake : goBack}
        onSearch={() => setSwitcherOpen(true)}
        onMore={() => setMoreOpen(true)}
      />
      <IdentityRow
        symbol={data.symbol}
        name={data.name}
        grade={read.grade_display}
        score={read.score}
        rNow={rNow}
        quote={data.quote}
      />
      {taking ? null : (
        <SectionTabs
          tabs={TABS}
          value={tab}
          onChange={setTab}
          testID="trade-tabs"
          style={{ marginHorizontal: layout.gutter, marginTop: 4 }}
        />
      )}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: layout.gutter, paddingTop: 12, paddingBottom: 16, gap: layout.cardGap }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/*
          ONE CHART, SHARED WITH THE TICKER PAGE AND HOME, and it stays MOUNTED
          on every tab — hidden, not unmounted — so switching to Details and back
          does not reload the WebView or lose a drawing in progress.
        */}
        <View style={{ display: chartShown ? 'flex' : 'none' }}>
          <SymbolChart
            testID="portal-chart"
            symbol={data.symbol}
            name={data.name}
            timeframe={tf ?? data.chart.timeframe}
            timeframes={data.chart.timeframes}
            candles={candles}
            annotations={annotations}
            portal={data}
            lastPrice={data.quote?.price ?? null}
            focusTs={focusTs}
            hideAnnotations={hideAnnotations}
            height={CHART_HEIGHT}
            busy={streaming}
            live={Boolean(answer?.live)}
            caption={answer?.text ?? null}
            notice={status?.text ?? null}
            noticeTone={status?.tone ?? null}
            revealed={revealed}
            onReveal={reveal}
            onTimeframeChange={setTf}
            onSelectAnnotation={(a) => { reveal([a.id]); setInspecting(a); }}
            onChartHandle={rt.bindChart}
            onStageHandle={rt.bindStage}
            onStageOpenChange={rt.setStageOpen}
            onDrawCreate={(a) => { void createUserAnnotation(a); }}
            onDrawUpdate={updateUserAnnotation}
            onDrawDelete={(id) => setAnnotationStatus(id, 'deleted')}
            kaiSheet={(
              <>
                <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
                  <KaiPanel turns={turns} symbol={data.symbol} />
                </ScrollView>
                <Composer
                  testID="stage-composer"
                  placeholder={`Ask Kai about ${data.symbol}…`}
                  disabled={streaming}
                  onSend={(text) => { void send(text); }}
                />
              </>
            )}
          />
        </View>

        {chartShown ? (
          <View style={{ gap: layout.cardGap }} testID="beat-look">
            <MarksLine
              show={userDrawn > 0 || levelsOpen}
              symbol={data.symbol}
              markedCount={markedCount}
              onChartCount={onChartCount}
              tradeLevels={tradeLevels}
              levelsOpen={levelsOpen}
              exact={exact}
              onToggle={() => setLevelsOpen((v) => !v)}
            />
            {levelsOpen ? (
              <AnnotationRail annotations={annotations} onSelect={(a) => { reveal([a.id]); setInspecting(a); }} />
            ) : null}

            <SetupSummary
              entry={levelOf(read, 'entry')}
              stop={levelOf(read, 'stop')}
              target={levelOf(read, 'target')}
              rPlanned={plannedR(read)}
              setupType={kind}
              emptyPlain={read.blocked_plain}
            />
            <KaiThesisCard
              thesis={thesis}
              symbol={data.symbol}
              asking={asking}
              onAsk={() => setAsking((v) => !v)}
            />
            <SetupChecklist items={checklist} />

            {conversation ? <KaiPanel turns={turns} symbol={data.symbol} /> : null}
            {offer ? (
              <SymbolOfferCard
                symbol={offer.symbol}
                hook={offer.hook}
                onDismiss={() => setOffer(null)}
                onOpen={(s) => {
                  setOffer(null);
                  rememberSymbol(s);
                  // Replace, so Back still means "out of Trade" rather than "the last ticker".
                  router.replace(`/trade/${encodeURIComponent(s)}` as never);
                }}
              />
            ) : null}
          </View>
        ) : null}

        {tab === 'details' && !taking ? (
          <View style={{ gap: 16 }} testID="trade-details">
            <DecideBeat
              read={read}
              portal={data}
              kaiState={kaiState}
              onMark={markLevel}
              onMarkChart={() => askKai(MARK_CHART_QUESTION(data.symbol), {
                expectMarks: true,
                working: `Kai is marking the ${data.symbol} chart…`,
              })}
              onAsk={askKai}
              onRetryRead={() => { setReadFailed(false); reload(); }}
              showKaiRead={false}
            />
            {data.alert?.fit_plain ? (
              <T variant="meta" c={color.textSecondary} testID="details-fit">{data.alert.fit_plain}</T>
            ) : null}
            {/*
              THE PAPER ORDER, SECONDARY ON PURPOSE. An outline, never orange —
              the screen's one orange action is the watchlist. Blocked with the
              reason in words when there is nothing to take.
            */}
            <Button
              kind="outline"
              height={48}
              label={ACTION_LABEL.review_paper_order}
              disabled={!read.takeable}
              onPress={openTake}
              testID="details-paper-trade"
              accessibilityHint={read.takeable ? 'Prices a paper order from these levels. Nothing is sent until you confirm.' : read.blocked_plain ?? undefined}
            />
            {!read.takeable && read.blocked_plain ? (
              <T variant="meta" c={color.textSecondary} testID="details-paper-blocked">{read.blocked_plain}</T>
            ) : null}
          </View>
        ) : null}

        {tab === 'discussion' && !taking ? (
          <DiscussionTab
            symbol={data.symbol}
            community={data.community}
            onNavigate={(r) => router.push(r as never)}
          />
        ) : null}

        {taking ? (
          <View style={{ gap: 12 }} testID="trade-take">
            <Pressable
              testID="take-back"
              accessibilityRole="button"
              accessibilityLabel="Back to the setup"
              onPress={closeTake}
              style={{ minHeight: tap.min, justifyContent: 'center', alignSelf: 'flex-start' }}
            >
              <T variant="meta" weight="semibold" c={color.textSecondary}>← Back to the setup</T>
            </Pressable>
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
                onDone={() => { closeTake(); setTab('chart'); }}
              />
            ) : take.phase === 'confirm' || take.phase === 'sending' ? (
              take.preview ? (
                <ConfirmCard
                  read={read}
                  preview={take.preview}
                  size={take.size ?? { shares: null, plain: '', risk_usd: null }}
                  sending={take.phase === 'sending'}
                  error={take.error}
                  shareDefault={me.data?.settings.share_trades ?? false}
                  onSend={(shareTrade) => { void take.send(shareTrade); }}
                  onCancel={closeTake}
                />
              ) : null
            ) : take.phase === 'unsized' ? (
              /* NOTHING WAS PRICED BECAUSE NO ORDER COULD BE BUILT — said as
                 that, with the reason, rather than as a pricing failure. */
              <Card style={{ gap: 10 }} testID="take-unsized">
                <T variant="cardTitle">No order to price</T>
                <T variant="body">{take.error}</T>
                <Button
                  label="Open the full ticket"
                  kind="outline"
                  height={44}
                  onPress={() => router.push(`/order/new?symbol=${encodeURIComponent(data.symbol)}` as never)}
                  testID="take-full-ticket"
                />
              </Card>
            ) : take.phase === 'failed' ? (
              <Card style={{ gap: 10 }} testID="take-failed">
                <T variant="cardTitle">Not priced</T>
                <T variant="body">{take.error}</T>
                {take.size?.plain ? <T variant="meta" c={color.textSecondary}>{take.size.plain}</T> : null}
                <Button label="Try again" kind="outline" height={44} onPress={() => { take.reset(); }} testID="take-retry" />
                <Button
                  label="Open the full ticket"
                  kind="outline"
                  height={44}
                  onPress={() => router.push(`/order/new?symbol=${encodeURIComponent(data.symbol)}` as never)}
                  testID="take-full-ticket"
                />
              </Card>
            ) : (
              <Card style={{ gap: 8 }} testID="take-preparing">
                <T variant="cardTitle">Pricing it</T>
                <T variant="body" c={color.textSecondary}>Working out the size and what it costs…</T>
              </Card>
            )}
          </View>
        ) : null}

        {data.notice ? <PortalNotice text={data.notice} /> : null}
        {data.is_fixture ? <PortalNotice text="Example data — no account is connected on this build." /> : null}
      </ScrollView>

      {/*
        THE FOOT OF THE SCREEN: the one action, or Kai's composer while he is
        being asked something, then the dock. The composer is docked so the
        keyboard never covers it; the watchlist button steps aside while it is
        out, because two bottom bars would be two focal points.
      */}
      {asking ? (
        <KeyboardDock floor={8} style={{ paddingHorizontal: layout.gutter, paddingTop: 4 }}>
          <Composer
            testID="portal-composer"
            placeholder={`Ask Kai about ${data.symbol}…`}
            disabled={streaming}
            onSend={(text) => { void send(text); }}
          />
        </KeyboardDock>
      ) : !taking ? (
        <View style={{ paddingHorizontal: layout.gutter, paddingTop: 4, paddingBottom: 10 }}>
          <WatchlistCta symbol={data.symbol} on={watch.on} busy={watch.busy} onToggle={() => { void watch.toggle(); }} />
        </View>
      ) : null}

      <Dock active="trade" onNavigate={(n) => router.navigate(`/${n}` as never)} {...dock} />

      <AnnotationSheet
        annotation={inspecting}
        onClose={() => setInspecting(null)}
        // A level drawn from the trade itself is not a stored mark — there is
        // nothing to hide or delete on the server, so these only close.
        onHide={(a) => { if (!isTradeLevel(a)) setAnnotationStatus(a.id, 'hidden'); setInspecting(null); }}
        onDelete={(a) => { if (!isTradeLevel(a)) setAnnotationStatus(a.id, 'deleted'); setInspecting(null); }}
        onExplain={(a) => {
          setInspecting(null);
          narrate(a.reason ?? `${a.kind} at ${a.price ?? '—'}.`);
        }}
      />

      <MoreSheet
        visible={moreOpen}
        onClose={() => setMoreOpen(false)}
        symbol={data.symbol}
        paper={data.paper}
        rows={[
          {
            key: 'paper',
            label: ACTION_LABEL.review_paper_order,
            blocked: read.takeable ? null : read.blocked_plain,
            hint: 'Prices a practice order from these levels. Nothing is sent until you confirm.',
            onPress: openTake,
          },
          {
            key: 'ticket',
            label: 'Open the full order ticket',
            hint: 'Choose the size and order type yourself.',
            onPress: () => { setMoreOpen(false); router.push(`/order/new?symbol=${encodeURIComponent(data.symbol)}` as never); },
          },
          ...(markedCount > 0 ? [{
            key: 'marks',
            label: `Marks on the chart (${markedCount})`,
            hint: 'Lists every mark under the chart. Tap one to put it back on the chart.',
            onPress: () => { setMoreOpen(false); setTab('chart'); setLevelsOpen(true); },
          }] : []),
          {
            key: 'drawers',
            label: 'Positions, orders and watchlist',
            onPress: () => { setMoreOpen(false); setDrawersOpen(true); },
          },
          {
            key: 'search',
            label: 'Search another symbol',
            onPress: () => { setMoreOpen(false); setSwitcherOpen(true); },
          },
        ]}
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
        holding={data.drawers.positions.map((p) => ({ symbol: p.symbol, name: null }))}
        watching={data.drawers.open_orders.map((o) => ({ symbol: o.symbol, name: null }))}
        onPick={(s) => {
          setSwitcherOpen(false);
          rememberSymbol(s);
          /**
           * A REPLACE, NOT A PUSH. `/trade/[symbol]` is this same screen with a
           * different parameter, so replacing swaps the chart, the levels, the
           * plan and the Kai thread together and leaves Back where it was. A
           * push would make Back mean "the previous ticker".
           */
          router.replace(`/trade/${encodeURIComponent(s)}` as never);
        }}
      />
    </Screen>
  );
}

/* ------------------------------------------------------------------ */
/* The chart's index line                                               */
/* ------------------------------------------------------------------ */

/**
 * One quiet line under the chart that says what is on it — and BOTH numbers
 * when they differ, because most saved marks are deliberately not drawn at
 * rest. Tapping it lists them; tapping any in the list puts it back.
 */
function MarksLine({
  show, symbol, markedCount, onChartCount, tradeLevels, levelsOpen, exact, onToggle,
}: {
  /** false at rest: only the coarser-bars note (when true) is drawn */
  show: boolean;
  symbol: string;
  markedCount: number;
  onChartCount: number;
  tradeLevels: number;
  levelsOpen: boolean;
  exact: boolean;
  onToggle: () => void;
}) {
  if (!show) {
    return exact ? null : (
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: -4 }}>
        <T variant="meta" c={color.textSecondary} testID="look-coarser">Coarser bars</T>
      </View>
    );
  }
  const text = markedCount === 0
    ? tradeLevels
      ? `The trade's ${tradeLevels === 3 ? 'entry, stop and target are' : 'levels are'} on the chart.`
      : `Nothing marked on ${symbol} yet.`
    : onChartCount === markedCount
      ? `${markedCount} mark${markedCount === 1 ? '' : 's'} on the chart · ${levelsOpen ? 'hide' : 'show'}`
      : `${onChartCount} on the chart · ${markedCount} saved · ${levelsOpen ? 'hide' : 'show'}`;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: -4 }}>
      <Pressable
        testID="look-levels-toggle"
        accessibilityRole="button"
        accessibilityLabel={markedCount === 0 ? text : `${text}. Tap any of them to put it back on the chart.`}
        onPress={onToggle}
        disabled={markedCount === 0}
        hitSlop={{ top: 6, bottom: 6 }}
        style={{ flex: 1, minHeight: 32, justifyContent: 'center' }}
      >
        <T variant="meta" c={color.textSecondary}>{text}</T>
      </Pressable>
      {!exact ? <T variant="meta" c={color.textSecondary} testID="look-coarser">Coarser bars</T> : null}
    </View>
  );
}
