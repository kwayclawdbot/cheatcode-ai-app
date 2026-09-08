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
import { Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { T, Eyebrow } from '../../ui/Text';
import { Composer } from '../../ui/Composer';
import { KeyboardDock } from '../../ui/KeyboardDock';
import { ObjectCard } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { ScreenLoading } from '../../ui/Loading';
import { alpha, color, radius } from '../../ui/tokens';
import { useSession } from '../../lib/session';
import { env } from '../../lib/env';
import type { GoalMode } from '../../lib/types';
import { AnnotationRail } from '../chart/AnnotationRail';
import { applyChartCommand } from '../chart/apply';
import { SymbolChart } from '../chart/SymbolChart';
import type { ChartHandle } from '../chart/apply';
import { AnnotationSheet, PortalTopBar, TickerSwitcherSheet } from '../portal/chrome';
import { PortalDrawersSheet } from '../portal/Drawers';
import { KaiPanel, PortalNotice } from '../portal/panels';
import { usePortal, usePortalCandles } from '../portal/usePortal';
import { planCommand, useKaiPortal } from '../portal/useKaiPortal';
import type { PortalCommandResult } from '../portal/useKaiPortal';
import { rememberSymbol } from '../portal/last-symbol';
import { visibleAnnotations } from '../portal/visible-annotations';
import { SymbolOfferCard } from '../portal/SymbolOfferCard';
import type { SymbolOffer } from '../portal/plan-command';
import type { Annotation, ChartCommand, PortalTimeframe } from '../portal/types';
import { TradeLocked } from './TradeLocked';
import { Spine, SpineFooter } from './Spine';
import { DecideBeat, type KaiReadState } from './Decide';
import { ConfirmCard, Receipt } from './Take';
import { ACTION_LABEL } from '../orders/vocabulary';
import { readPortal, type Beat, type ReadLevel } from './read';
import { useTake } from './useTake';
import { useMe } from '../account/useAccount';

/**
 * A bar time as the annotations API stores it.
 *
 * The chart page counts in seconds since the epoch, because that is what
 * Lightweight Charts hands it and converting on every pointer move would be
 * arithmetic in the middle of a gesture. One conversion at the boundary instead.
 */
function isoOf(t: number | string | null | undefined): string | null {
  if (t == null) return null;
  if (typeof t === 'string') return t;
  return Number.isFinite(t) ? new Date(t * 1000).toISOString() : null;
}

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
    symbol?: string; alert?: string; setup?: string; beat?: string; sim?: string; locked?: string;
  }>();

  const symbol = String(params.symbol ?? '').toUpperCase();
  const alertId = params.alert ? String(params.alert) : null;
  const setupId = params.setup ? String(params.setup) : null;

  const {
    data, annotations, upsertAnnotation, createUserAnnotation, updateUserAnnotation,
    setAnnotationStatus, loading, error, locked, reload,
  } = usePortal(symbol, { alert: alertId, setup: setupId, ctx: 'kai', mode });

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
   * WHAT HAS BEEN SUMMONED ONTO THE CHART THIS VISIT.
   *
   * The chart opens with what this trade is about and nothing else (see
   * `visible-annotations.ts`). Everything else — the shelves, the averages, the
   * zones, every level Kai marked in some earlier conversation — is still in
   * `annotations`, still in the rail, still tappable; it simply is not on the
   * canvas until something puts it there. This is the set of things that have
   * been put there.
   *
   * IT IS KEYED TO THE SYMBOL. Walking to a different ticker is a different
   * chart and starts clean again, which is also what makes the reveal legible
   * the second time you ask for a read.
   */
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  useEffect(() => { setRevealed(new Set()); }, [symbol]);

  /**
   * WHETHER THE READ HAS ALREADY BEEN ASKED FOR ON THIS CHART.
   *
   * "The 'What's the read' button should be there when first loading screen but
   * not after." It is an OPENING move: the one thing worth offering somebody who
   * has just landed on a chart and has not decided anything yet. Once they have
   * had the read it is a button that says the thing they are already looking at,
   * and the spine above is a permanent, better route back to it.
   *
   * THE RESET BOUNDARY IS THE SYMBOL, AND THE VISIT. Walking to a different
   * ticker is a different question and offers itself again; leaving the screen
   * and coming back unmounts this component, so a fresh visit starts fresh
   * without needing anything remembered. Nothing is persisted across sessions —
   * a button that stayed hidden for a week because you pressed it once would be
   * a worse bug than the one being fixed.
   */
  const [readAsked, setReadAsked] = useState(false);
  useEffect(() => { setReadAsked(false); }, [symbol]);

  /**
   * The symbol Kai has offered to put up, if any. One at a time: a reply that
   * mentioned three tickers should leave one card, not a stack of them, and the
   * newest is the one the conversation is on.
   */
  const [offer, setOffer] = useState<SymbolOffer | null>(null);
  useEffect(() => { setOffer(null); }, [symbol]);

  /**
   * `?sim=offer` puts Kai's symbol card up without a model call.
   *
   * The same device `?sim=readfail` already uses, and for the same reason: a
   * state nobody has looked at is a state nobody has designed. It matters more
   * than usual here because the model that would normally emit this command
   * cannot be reached at all right now — the Anthropic key is out of credit — so
   * without a switch the card would ship having been rendered by no one.
   */
  /**
   * THE PENCIL, AND WHETHER THE TRAY IS OUT.
   *
   * "pencil glyph for sure." The tools were built on the full-screen stage and
   * lost their door when Expand was removed; this is the door, on the chart
   * itself, where the drawing happens.
   *
   * IT IS QUIET BY DEFAULT AND HAS TO BE. The chart was just made to open clean,
   * and a permanent tool palette over it would put the clutter straight back in
   * a different shape. So it is one glyph at the weight of the Auto chip, in the
   * one corner of the plot with nothing in it, and the tray only exists while
   * you are actually drawing.
   */

  const simOffer = String(params.sim ?? '') === 'offer';
  useEffect(() => {
    if (simOffer) setOffer({ symbol: 'AMKR', hook: 'the one you asked about' });
  }, [simOffer, symbol]);
  const reveal = useCallback((ids: string[]) => {
    if (!ids.length) return;
    setRevealed((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
  }, []);

  /**
   * One chart command → the chart performs it, and Kai says what he did.
   * Lifted from the v1 portal unchanged, including the rule that React state is
   * committed AFTER the choreography so levels do not snap into existence before
   * Kai's pointer reaches them — which is what makes a read REVEAL its levels
   * one at a time rather than arriving as a set.
   */
  const applyCommand = useCallback((c: ChartCommand): PortalCommandResult | null => {
    const p = planCommand(c, data, annotations);
    if (!p) return null;
    if (p.timeframe) setTf(p.timeframe);
    if (p.focusTs) setFocusTs(p.focusTs);
    if (p.upsert.length) setHideAnnotations(false);
    if (p.offer) setOffer(p.offer);

    const handle = activeChart();
    const commit = () => {
      p.upsert.forEach(upsertAnnotation);
      p.remove.forEach((id) => setAnnotationStatus(id, 'deleted'));
      // A mark Kai just drew is a mark that has been summoned. Without this the
      // choreography would stage it onto the canvas and the next render — which
      // sends the visible set — would take it straight back off.
      reveal(p.upsert.map((a) => a.id));
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
    // `marks` is how many lines this actually put on the chart. Zero is right
    // for a camera move and wrong-and-silent for a marking command that
    // resolved to nothing; the hook uses the count to tell the two apart.
    return { narration: p.narration, done, marks: p.upsert.length };
  }, [data, annotations, upsertAnnotation, setAnnotationStatus, router]);

  const { turns, send, streaming, narrate, answer, status } = useKaiPortal({
    mode,
    portal: data,
    symbol,
    alertId,
    opening: data?.kai.opening_message ?? null,
    onCommand: applyCommand,
  });

  /**
   * WHAT THE CANVAS ACTUALLY GETS. `annotations` stays the whole set — the rail,
   * the count and the inspector all read it — and only the chart is narrowed.
   */
  const onChart = useMemo(
    () => visibleAnnotations(annotations, data, revealed),
    [annotations, data, revealed],
  );

  const read = useMemo(() => (data ? readPortal(data) : null), [data]);
  const take = useTake(read, data);
  /**
   * Read only for the sharing default on the confirmation card. It is the
   * account-level answer; the card's own switch is what actually travels with
   * the order, so a `/me` that has not landed yet means "not shared", which is
   * the safe direction to be wrong in.
   */
  const me = useMe();

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

  const askKai = useCallback(
    (q: string, opts?: { expectMarks?: boolean; working?: string }) => {
      // However the read was asked for — the footer, the composer, a marked-up
      // answer — it has now been had, and the opening offer retires.
      setReadAsked(true);
      void send(q, opts);
    },
    [send],
  );

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

  /**
   * THE PLAN SAID NO, AND THAT IS NOT AN ERROR.
   *
   * Checked BEFORE the loading and failure branches, because a free account
   * reaching this route — from an alert, from the desk, from a saved link — is
   * an expected journey and not a fault. It used to land on "I could not open
   * that chart just now" with a Try again button that could never work.
   */
  // `?locked=1` is a FIXTURES-ONLY preview of that screen. On a real stack the
  // parameter does nothing: `locked` comes from the server's own 402.
  if (locked || (env.FIXTURES && params.locked === '1')) {
    return <TradeLocked symbol={symbol} plain={locked ? error : null} />;
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
        {/*
          ONE CHART, SHARED WITH THE TICKER PAGE. Everything that used to be
          assembled here — the pencil, the expand glyph, the tray, the stage and
          the wiring from a finished drawing back to the store — moved into
          `SymbolChart`, because none of it was about the portal. The ticker page
          had a bare ChartView with no tools and no annotations at all, and the
          owner asked for the two to be the same chart rather than two charts
          that resemble each other.
        */}
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
          height={chartHeight}
          busy={streaming}
          live={Boolean(answer?.live)}
          caption={answer?.text ?? null}
          notice={status?.text ?? null}
          noticeTone={status?.tone ?? null}
          revealed={revealed}
          onReveal={reveal}
          onTimeframeChange={setTf}
          onSelectAnnotation={(a) => { reveal([a.id]); setInspecting(a); }}
          onChartHandle={(h) => { chart.current = h; }}
          onStageHandle={(h) => { stageChart.current = h; }}
          onStageOpenChange={setStageOpen}
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

        {beat === 'look' ? (
          <LookBeat
            symbol={data.symbol}
            markedCount={markedCount}
            onChartCount={onChart.length}
            levelsOpen={levelsOpen}
            annotations={annotations}
            exact={exact}
            onToggleLevels={() => setLevelsOpen((v) => !v)}
            onInspect={(a) => { reveal([a.id]); setInspecting(a); }}
          />
        ) : null}

        {beat === 'decide' ? (
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
                  shareDefault={me.data?.settings.share_trades ?? false}
                  onSend={(shareTrade) => { void take.send(shareTrade); }}
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

        {/*
          KAI'S REPLY LIVES ON THE SCREEN, NOT INSIDE BEAT ONE.

          THE BUG: it was rendered inside `LookBeat`, and the composer is on
          every beat. So a question asked in DECIDE or TAKE — typed, or by
          pressing "Mark what's on this chart", which only EXISTS in DECIDE —
          had its entire reply rendered into a component that was not mounted.
          The answer arrived, the narration arrived, the failure arrived, and
          the user saw a screen that had not changed at all. Reproduced in
          fixtures, where nothing can go wrong on the network and it still
          showed nothing five seconds after the press.
        */}
        <KaiPanel turns={turns} symbol={data.symbol} />

        {/*
          Kai's offer to change the chart, under his reply where he made it.
          It never moves anything on its own — see `plan-command`'s case.
        */}
        {offer ? (
          <SymbolOfferCard
            symbol={offer.symbol}
            hook={offer.hook}
            onDismiss={() => setOffer(null)}
            onOpen={(s) => {
              setOffer(null);
              rememberSymbol(s);
              // The same swap the search does, for the same reason: replace, so
              // Back still means "out of Trade" rather than "the last ticker".
              router.replace(`/trade/${encodeURIComponent(s)}` as never);
            }}
          />
        ) : null}

        {/*
          NO SECOND COPY OF THE SAME SENTENCE. The panel above is the transcript
          and it already carries the failure in Kai's own words. `status` exists
          for the ONE surface that cannot show a transcript — the full-screen
          stage, which is a modal over all of this — and it is passed there and
          nowhere else.
        */}

        {data.notice ? <PortalNotice text={data.notice} /> : null}
        {data.is_fixture ? <PortalNotice text="Example data — no account is connected on this build." /> : null}
      </ScrollView>

      {beat === 'look' && !readAsked ? (
        <SpineFooter
          label="What’s the read?"
          onPress={() => { setReadAsked(true); setBeat('decide'); }}
          testID="spine-next-decide"
        />
      ) : null}
      {beat === 'decide' ? (
        <SpineFooter
          label={ACTION_LABEL.review_paper_order}
          blocked={read.takeable ? null : read.blocked_plain}
          onPress={() => { setBeat('take'); void take.prepare(); }}
          testID="spine-next-take"
        />
      ) : null}

      {/*
        NOTHING OPENS THIS RIGHT NOW, AND THAT IS A REPORTED CONSEQUENCE RATHER
        THAN AN OVERSIGHT.

        "Expand" was the only way in, and it was removed at the owner's word.
        The stage is where the hand-drawing tools live (the level, trendline and
        zone tray), so those are currently unreachable from the portal. It is
        left mounted and wired because re-opening it is one call — whichever
        surface he decides drawing belongs on — and because deleting it would
        throw away a feature he asked for two rounds ago over a sentence about
        two buttons. Flagged for his call; no replacement chrome invented here.
      */}

      {/* Docked so asking Kai about the chart does not put the composer under
          the keyboard, and so the bar clears the home indicator otherwise. */}
      <KeyboardDock floor={12} style={{ paddingHorizontal: 16, paddingTop: 2 }}>
        <Composer
          testID="portal-composer"
          placeholder={`Ask Kai about ${data.symbol}…`}
          disabled={streaming}
          onSend={(text) => { void send(text); }}
        />
      </KeyboardDock>

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
        holding={data.drawers.positions.map((p) => ({ symbol: p.symbol, name: null }))}
        watching={data.drawers.open_orders.map((o) => ({ symbol: o.symbol, name: null }))}
        onPick={(s) => {
          setSwitcherOpen(false);
          rememberSymbol(s);
          /**
           * A REPLACE, NOT A PUSH, AND THAT IS THE WHOLE "in place" QUESTION.
           *
           * `/trade/[symbol]` is this same screen with a different parameter, so
           * replacing swaps the chart, the levels, the plan and the Kai thread
           * together and leaves the back button where it was. A push would stack
           * a second Trade section on top of the first and make Back mean "the
           * previous ticker", which is how you end up eleven charts deep and
           * cannot get out. Nothing else re-mounts: to the person holding it,
           * the chart changed.
           */
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
  symbol, markedCount, onChartCount, levelsOpen, annotations, exact,
  onToggleLevels, onInspect,
}: {
  symbol: string;
  markedCount: number;
  /** How many of them are actually drawn right now. */
  onChartCount: number;
  levelsOpen: boolean;
  annotations: Annotation[];
  exact: boolean;
  onToggleLevels: () => void;
  onInspect: (a: Annotation) => void;
}) {
  /**
   * THE TWO BUTTONS THAT SAT HERE ARE GONE, at the owner's word: "the kai read
   * this chart button and expand don't need to be there". Kai is asked through
   * the composer at the foot of the screen, which is where every other question
   * to him is asked, so a second dedicated button for one phrasing of one
   * question was chrome the screen was carrying for no one.
   */
  return (
    <View style={{ gap: 12 }} testID="beat-look">
      {/*
        The chart's index — and now genuinely an index rather than a legend,
        because most of what it lists is deliberately not on the canvas. It says
        BOTH numbers when they differ: "12 marks" printed over a chart showing
        two would read as a bug, and the honest line is what makes the quiet
        chart legible instead of suspicious. Tapping any of them puts it back.
      */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <T
          size={12.5}
          c={color.muted}
          onPress={onToggleLevels}
          testID="look-levels-toggle"
          accessibilityRole="button"
          accessibilityLabel={
            markedCount === 0
              ? `Nothing marked on ${symbol} yet.`
              : `${onChartCount} of ${markedCount} marks on the chart. ${levelsOpen ? 'Hide' : 'Show'} the list. Tap any of them to put it back on the chart.`
          }
          style={{ flex: 1 }}
        >
          {markedCount === 0
            ? `Nothing marked on ${symbol} yet.`
            : onChartCount === markedCount
              ? `${markedCount} mark${markedCount === 1 ? '' : 's'} on the chart \u00b7 ${levelsOpen ? 'hide' : 'show'}`
              : `${onChartCount} on the chart \u00b7 ${markedCount} saved \u00b7 ${levelsOpen ? 'hide' : 'show'}`}
        </T>
        {!exact ? <T size={11.5} c={color.gold} testID="look-coarser">Coarser bars</T> : null}
      </View>

      {levelsOpen ? <AnnotationRail annotations={annotations} onSelect={onInspect} /> : null}
    </View>
  );
}
