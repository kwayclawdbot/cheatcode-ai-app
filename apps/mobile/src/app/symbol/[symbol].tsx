import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { Screen } from '../../ui/Screen';
import { T, Num } from '../../ui/Text';
import { ScreenLoading } from '../../ui/Loading';
import { FreshnessMark } from '../../ui/FreshnessMark';
import { TickerMark } from '../../ui/Ticker';
import { alpha, color, radius, type } from '../../ui/tokens';
import {
  CallsOnSymbol, KaiView, LockedNow, NowBlock, SessionStrip, TickerSections, YourLines, useTickerPage,
} from '../../features/ticker';
import {
  sessionFromCandles, useGradedCard, userLines,
} from '../../features/ticker/useTickerNow';
import { SymbolChart } from '../../features/chart/SymbolChart';
import { usePortal, usePortalCandles, useSymbolAnnotations } from '../../features/portal/usePortal';
import { readPortal } from '../../features/portal2/read';
import { useCommunityCalls } from '../../features/social';
import type { PortalTimeframe } from '../../features/portal/types';
import { openKaiSheet } from '../../features/kai-sheet';
import { useSession } from '../../lib/session';
import type { GoalMode } from '../../lib/types';

/**
 * Ticker page — the snapshot, and what to do about it.
 *
 * WHAT CHANGED AND WHY. This page used to answer "what is this company": a
 * summary, a market cap, a P/E, three collapsible sections. All of that is
 * still here, at the bottom, where reference material belongs. What it could
 * not answer was the question somebody actually opens a ticker to ask, which is
 * "what is this doing right now, and is there anything to act on" — and the
 * answer to that lived one tap away in Trade, behind a button.
 *
 * So the page now reads top to bottom as one argument:
 *
 *   who        the mark, the name, the price, and how fresh the price is
 *   the day    open, the range with price sitting in it, volume
 *   the chart  the SAME chart Trade draws, with the lines you drew on it
 *   now        the graded setup and its levels — or, honestly, that there
 *              isn't one and what Kai can do instead
 *   yours      the levels you drew, and how far price is from each
 *   members    calls other people have made on this symbol
 *   Kai        one entry to ask him anything, and only one
 *   reference  Overview · Technicals · Community, collapsed
 *
 * ONE KAI. `KaiView` is the Kai surface on this page and it stays that way —
 * the "now" block above it is the DESK's read, rendered from the same payload
 * the Trade portal reads. A second violet panel that also answered questions
 * would make the page feel like two products.
 */

const Back = ({ onPress }: { onPress: () => void }) => (
  <Pressable
    testID="back"
    accessibilityRole="button"
    accessibilityLabel="Back"
    onPress={onPress}
    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
  >
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M15 5l-7 7 7 7" stroke={color.text} strokeWidth={2.2} />
    </Svg>
  </Pressable>
);

const Star = ({ on }: { on: boolean }) => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill={on ? color.volt : 'none'} stroke={color.volt} strokeWidth={1.6}>
    <Path d="M12 3l2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.8 1-6.1-4.4-4.3 6.1-.9z" />
  </Svg>
);

export default function TickerPageScreen() {
  const { symbol: raw } = useLocalSearchParams<{ symbol: string }>();
  const symbol = (Array.isArray(raw) ? raw[0] : raw ?? '').toUpperCase();
  const router = useRouter();
  const { profile } = useSession();
  const mode: GoalMode = (profile?.primary_mode as GoalMode) ?? 'day_trade';
  const { data, loading, error, isFixture } = useTickerPage(symbol, mode);
  /**
   * The marks on this symbol's chart — the SAME store the Trade portal uses.
   * Loaded here rather than inside the chart so the page can also talk about
   * them (how far price is from a line you drew) without a second fetch.
   */
  const marks = useSymbolAnnotations(symbol);
  /**
   * The research page and the Trade Portal now show the SAME chart on the SAME
   * resolutions. The old 1D/1W/1M/1Y chips were a different vocabulary for the
   * same question, and a level you studied here did not sit where it sat there.
   */
  const [tf, setTf] = React.useState<PortalTimeframe>('D');
  const { candles } = usePortalCandles(symbol, tf);
  /**
   * DAILY BARS FOR THE SESSION STRIP, SEPARATELY FROM THE CHART'S BARS.
   *
   * The strip is about a day — its open, its range, its volume — and the chart
   * is on whatever resolution the reader last chose. Deriving the strip from
   * `candles` would mean that switching the chart to 5m silently redefined
   * "the session" as the last five minutes, printed as real numbers with no
   * indication anything had changed. So the strip asks for daily bars itself,
   * and the second request is skipped entirely (`null`) on the timeframe where
   * the chart's own bars are already the right ones.
   */
  const dailyOnly = usePortalCandles(symbol, tf === 'D' ? null : 'D');
  const dailyCandles = tf === 'D' ? candles : dailyOnly.candles;

  /**
   * The trade read, from the same payload and the same pure function the Trade
   * portal uses. Two screens, one answer to "is there a plan here".
   */
  const portal = usePortal(symbol, { mode, ctx: null });
  const read = portal.data ? readPortal(portal.data) : null;

  /**
   * The graded board, and ONLY when this symbol is known to have an alert on
   * it — the contract and the recorded peak live there and nowhere else. On a
   * symbol with nothing on it this makes no request at all.
   */
  const gradedCard = useGradedCard(symbol, Boolean(data?.active_alert));

  /** Members' calls, filtered to this ticker. */
  const calls = useCommunityCalls();
  const callsHere = React.useMemo(
    () => (calls.data ?? []).filter((c) => c.symbol?.toUpperCase() === symbol),
    [calls.data, symbol],
  );

  if (!data) {
    return (
      <Screen variant="corner" layout="tab" testID="screen-ticker">
        {loading ? <ScreenLoading label={`Pulling ${symbol}…`} /> : (
          <View style={{ padding: 20, gap: 8 }}>
            <Back onPress={() => router.back()} />
            <T size={15} weight="bold">{symbol}</T>
            <T size={13} c={color.muted} lh={19}>{error ?? "I couldn't load this symbol just now."}</T>
          </View>
        )}
      </Screen>
    );
  }

  const q = data.quote;
  const up = (q?.change_pct ?? 0) >= 0;
  const openTrade = () => router.push(`/trade/${encodeURIComponent(data.symbol)}`);
  const session = sessionFromCandles(dailyCandles, q?.price ?? null);
  const lines = userLines(marks.annotations, q?.price ?? null);

  return (
    <Screen variant="corner" layout="tab" testID="screen-ticker">
      {/*
        IDENTITY, AND THE PRICE AS THE BIGGEST THING ON THE PAGE.
        The old header ran the symbol at 17 and the price at 14, which made the
        company name and the live price compete and let neither win. A ticker
        page has one headline and it is the price.
      */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11, paddingTop: 6, paddingHorizontal: 16, paddingBottom: 10 }}>
        <Back onPress={() => router.back()} />
        {/* House rule: a ticker never appears without its mark. */}
        <TickerMark symbol={data.symbol} size={34} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 7 }}>
            <T {...type.tickerSm} testID="ticker-symbol">{data.symbol}</T>
            <T size={11} c={color.muted} numberOfLines={1} style={{ flex: 1 }}>{data.company}</T>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 1 }}>
            <Num size={26} weight="bold" testID="ticker-price">
              {q?.price != null ? q.price.toFixed(2) : '—'}
            </Num>
            {q?.change_pct != null ? (
              <Num size={13} weight="semibold" c={up ? color.green : color.red}>
                {`${up ? '+' : '−'}${Math.abs(q.change_pct).toFixed(2)}%`}
              </Num>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 3 }}>
            <T size={10} c={color.cyan}>{data.market_label}</T>
            {q ? <FreshnessMark freshness={q.freshness ?? 'unknown'} delayReason={q.delay_reason} at={q.source_ts} size={10} /> : null}
          </View>
        </View>
        <Star on={data.starred} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8, gap: 13 }}
        showsVerticalScrollIndicator={false}
      >
        {/*
          THE SAME CHART AS TRADE, not a lighter one. It had a bare `ChartView`
          with `annotations={[]}` — no tools, no full screen, and no knowledge
          that the chart had ever been drawn on, so a line you drew in Trade did
          not exist here and one drawn here could not exist at all. `SymbolChart`
          is the whole assembly and `useSymbolAnnotations` is the same per-symbol
          store the portal writes to, which is what makes it one chart rather
          than two that share candles.

          NO `portal` PROP, and that is correct rather than missing: this page is
          not about a trade, so there is no entry or stop that belongs on it at
          rest, and the chart opens with only what the user drew themselves.
        */}
        <SymbolChart
          testID="ticker-chart"
          symbol={data.symbol}
          name={data.company ?? null}
          timeframe={tf}
          candles={candles}
          annotations={marks.annotations}
          lastPrice={data.quote?.price ?? null}
          height={210}
          onTimeframeChange={setTf}
          onDrawCreate={(a) => { void marks.createUserAnnotation(a); }}
          onDrawUpdate={marks.updateUserAnnotation}
          onDrawDelete={(id) => marks.setAnnotationStatus(id, 'deleted')}
          kaiSheet={(
            <KaiView
              take={data.kai_view.take}
              actions={data.kai_view.actions}
              onAsk={(q2) => openKaiSheet({ context: { kind: 'symbol', symbol: data.symbol }, question: q2 })}
            />
          )}
        />

        {/* The day's own numbers. Absent bars draw nothing at all. */}
        {session ? <SessionStrip session={session} testID="ticker-session" /> : null}

        {/*
          THE ANSWER TO "IS THERE ANYTHING TO ACT ON".
          It renders in BOTH directions — a graded setup with its levels, or the
          sentence saying there is nothing and what Kai can do instead. The
          quiet version is not an empty state; it is the page having considered
          the question.
        */}
        {read ? (
          <NowBlock
            read={read}
            card={gradedCard}
            showContract={mode === 'day_trade'}
            onOpen={openTrade}
            testID="ticker-now"
          />
        ) : portal.locked ? (
          /*
            A 402 IS AN ANSWER, NOT A FAILURE. Rendering nothing here left a gap
            in the column on every free account — see `LockedNow`.
          */
          <LockedNow
            plain={portal.error}
            onSeePlans={() => router.push('/account/plan')}
            testID="ticker-now-locked"
          />
        ) : null}

        <YourLines lines={lines} testID="ticker-your-lines" />

        <CallsOnSymbol calls={callsHere} symbol={data.symbol} testID="ticker-calls" />

        <KaiView
          take={data.kai_view.take}
          actions={data.kai_view.actions}
          onAsk={(q2) => openKaiSheet({ context: { kind: 'symbol', symbol: data.symbol }, question: q2 })}
        />

        <TickerSections
          page={data}
          onOpenCircle={() =>
            data.community.circle
              ? router.push(`/circle/${encodeURIComponent(data.community.circle.id)}`)
              : router.push('/community')
          }
        />

        {error ? <T size={11} c={color.muted} align="center">{error}</T> : null}
        {isFixture ? <T size={10} c={color.dim} align="center">Sample data — the service is not connected here.</T> : null}
      </ScrollView>

      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6 }}>
        <Pressable
          onPress={openTrade}
          accessibilityRole="button"
          accessibilityHint={`Opens the ${data.symbol} chart workspace`}
          testID="ticker-open-trade"
          style={{ flex: 1, height: 46, borderRadius: radius.pill, backgroundColor: color.volt, alignItems: 'center', justifyContent: 'center' }}
        >
          <T size={14} weight="bold" c={color.bg}>Open in Trade</T>
        </Pressable>
        <Pressable
          onPress={() => router.push(`/alert/new?symbol=${encodeURIComponent(data.symbol)}`)}
          accessibilityRole="button"
          testID="ticker-create-alert"
          style={{ height: 46, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 0.5, borderColor: alpha.ivory24, alignItems: 'center', justifyContent: 'center' }}
        >
          <T size={13} weight="semibold">Create alert</T>
        </Pressable>
      </View>
    </Screen>
  );
}
