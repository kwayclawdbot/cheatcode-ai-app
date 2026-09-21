/**
 * THE THINGS A POST CAN CARRY — the structured call, the result card and the
 * chart. Each is an OBJECT inside a post, never the post itself (spec: "Trade
 * calls are embedded structured objects inside posts, not the entire post
 * format"; "Chart previews and result cards are first-class media").
 *
 * Colour law: entry is off-white, stop is market red, target is market green,
 * and nothing else on these objects is green or red except a result that is a
 * real gain or a real loss.
 */
import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import type { ChartLevel as PostChartLevel, ChartTimeframe, PostResult } from '@shared/community';
import type { CommunityCall } from '@cheatcode/shared';
import { Num, T } from '../../../ui/Text';
import { TickerMark } from '../../../ui/Ticker';
import { CandleChart, type ChartLevel } from '../../../ui/MiniChart';
import { alpha, color, radius } from '../../../ui/tokens';
import { useTextScale } from '../../a11y/context';
import { api } from '../../../lib/api';
import { fixtureCandlesDaily } from '../../../lib/fixtures';
import type { Candle } from '../../../lib/types';
import { ChartBarsIcon, ExpandIcon } from './icons';

const px = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? '—' : n >= 1000 ? n.toFixed(0) : n.toFixed(2);

/* ------------------------------------------------------------------ */
/* The structured call                                                  */
/* ------------------------------------------------------------------ */

/**
 * One row on a wide phone — logo, ticker, direction, then entry / stop /
 * target — and two rows when the row would not fit (a 360 phone, or text at
 * 130%). Measured, not guessed: the layout follows the width it was given.
 */
export function CallObject({ call, onOpen, testID }: {
  call: Pick<CommunityCall, 'symbol' | 'direction' | 'entry' | 'stop' | 'target' | 'status' | 'outcome_label'>;
  onOpen?: () => void;
  testID?: string;
}) {
  const scale = useTextScale();
  const [w, setW] = useState(0);
  const wide = w > 0 && w >= 318 * scale;
  const dirInk = call.direction === 'long' ? color.marketUp : color.marketDown;
  const cols: Array<[string, string, string]> = [
    ['Entry', px(call.entry), color.priceEntry],
    ['Stop', px(call.stop), color.priceStop],
    ['Target', px(call.target), color.priceTarget],
  ];
  const settled = call.status !== 'open';

  const head = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 }}>
      <TickerMark symbol={call.symbol} size={26} />
      <T variant="body" weight="bold" c={color.textPrimary}>{call.symbol}</T>
      <T variant="meta" weight="semibold" c={dirInk}>{call.direction === 'long' ? 'Long' : 'Short'}</T>
      {settled && call.outcome_label ? (
        <T variant="meta" c={color.textSecondary} numberOfLines={1}>· {call.outcome_label}</T>
      ) : null}
    </View>
  );
  const triplet = (
    <View style={{ flexDirection: 'row', flex: wide ? 1 : undefined, justifyContent: 'space-between', gap: 8 }}>
      {cols.map(([label, value, ink]) => (
        <View key={label} style={{ gap: 1, minWidth: 54 }}>
          <T size={11} c={color.textSecondary}>{label}</T>
          <Num variant="body" weight="semibold" c={ink}>{value}</Num>
        </View>
      ))}
    </View>
  );

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${call.symbol} ${call.direction}, entry ${px(call.entry)}, stop ${px(call.stop)}, target ${px(call.target)}`}
      disabled={!onOpen}
      onPress={onOpen}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={({ pressed }) => ({
        backgroundColor: pressed ? color.raised : color.surface,
        borderRadius: radius.control, borderWidth: 1, borderColor: alpha.border,
        paddingHorizontal: 12, paddingVertical: 10,
        flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'center' : 'stretch',
        gap: wide ? 14 : 10,
      })}
    >
      {head}
      {triplet}
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* The result card                                                      */
/* ------------------------------------------------------------------ */

/**
 * "UMC +1.0R BOOKED". The number is the resolver's, never typed: an R multiple
 * when the post also carries the call's entry and stop (so R can be computed
 * from the same numbers everybody can see), otherwise the percent move the
 * resolver recorded. Green only for a gain, red only for a loss.
 */
export function resultFigure(result: PostResult, call?: Pick<CommunityCall, 'id' | 'entry' | 'stop'> | null): string {
  const pct = result.result_pct;
  if (pct == null) return result.outcome_label ?? 'Settled';
  if (call && call.id === result.call_id && call.entry && call.stop && call.entry !== call.stop) {
    const r = ((pct / 100) * call.entry) / Math.abs(call.entry - call.stop);
    return `${r >= 0 ? '+' : ''}${r.toFixed(1)}R`;
  }
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

const OUTCOME_WORD: Record<PostResult['status'], string> = { target: 'BOOKED', stop: 'STOPPED', expired: 'EXPIRED' };

export function ResultCard({ result, call, onOpen, testID }: {
  result: PostResult;
  call?: Pick<CommunityCall, 'id' | 'entry' | 'stop'> | null;
  onOpen?: () => void;
  testID?: string;
}) {
  const pct = result.result_pct ?? 0;
  const tone = result.status === 'expired' || pct === 0 ? 'flat' : pct > 0 ? 'up' : 'down';
  const ink = tone === 'up' ? color.marketUp : tone === 'down' ? color.marketDown : color.textSecondary;
  const border = tone === 'up' ? alpha.marketUp40 : tone === 'down' ? alpha.marketDown40 : alpha.border;
  const fill = tone === 'up' ? alpha.marketUp12 : tone === 'down' ? alpha.marketDown12 : 'transparent';
  const figure = resultFigure(result, call);
  return (
    <Pressable
      testID={testID}
      accessibilityRole={onOpen ? 'button' : 'text'}
      accessibilityLabel={`${result.symbol} ${figure}, ${result.outcome_label ?? OUTCOME_WORD[result.status].toLowerCase()}`}
      disabled={!onOpen}
      onPress={onOpen}
      hitSlop={{ top: 5, bottom: 5 }}
      style={{
        alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8,
        minHeight: 34, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: border, backgroundColor: fill,
      }}
    >
      <ChartBarsIcon size={16} c={ink} />
      <Num variant="meta" weight="semibold" c={color.textPrimary}>{result.symbol}</Num>
      <Num variant="meta" weight="semibold" c={ink}>{figure}</Num>
      <Num variant="meta" weight="semibold" c={ink}>{OUTCOME_WORD[result.status]}</Num>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* The chart attachment                                                 */
/* ------------------------------------------------------------------ */

/**
 * The market-data service serves daily and five-minute bars. A chart asks for
 * the nearest of the two and, where the timeframe is coarser, groups those real
 * bars into it — a weekly bar is five daily bars, an hourly bar is twelve
 * five-minute bars. Nothing is interpolated; nothing is invented.
 */
const PLAN: Record<ChartTimeframe, { tf: '1d' | '5m'; days: number; group: number; label: string }> = {
  '1m': { tf: '5m', days: 2, group: 1, label: '5-minute bars' },
  '5m': { tf: '5m', days: 2, group: 1, label: '5-minute bars' },
  '15m': { tf: '5m', days: 4, group: 3, label: '15-minute bars' },
  '1h': { tf: '5m', days: 8, group: 12, label: 'Hourly bars' },
  '4h': { tf: '1d', days: 120, group: 1, label: 'Daily bars' },
  '1D': { tf: '1d', days: 130, group: 1, label: 'Daily bars' },
  '1W': { tf: '1d', days: 730, group: 5, label: 'Weekly bars' },
};

function groupBars(bars: Candle[], n: number): Candle[] {
  if (n <= 1) return bars;
  const out: Candle[] = [];
  for (let i = 0; i < bars.length; i += n) {
    const g = bars.slice(i, i + n);
    out.push({
      t: g[0].t, o: g[0].o, c: g[g.length - 1].c,
      h: Math.max(...g.map((b) => b.h)), l: Math.min(...g.map((b) => b.l)),
      v: g.reduce((s, b) => s + (b.v ?? 0), 0),
    });
  }
  return out;
}

const chartCache = new Map<string, Candle[]>();
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export function useChartCandles(symbol: string, timeframe: ChartTimeframe): { candles: Candle[]; loading: boolean } {
  const plan = PLAN[timeframe] ?? PLAN['1D'];
  const key = `${symbol}|${timeframe}`;
  const offline = !api.available();
  const [candles, setCandles] = useState<Candle[]>(() => chartCache.get(key) ?? []);
  const [loading, setLoading] = useState(!offline && !chartCache.has(key));
  useEffect(() => {
    let alive = true;
    if (offline) { setCandles(groupBars(fixtureCandlesDaily, plan.group).slice(-90)); setLoading(false); return; }
    const hit = chartCache.get(key);
    if (hit) { setCandles(hit); setLoading(false); return; }
    setLoading(true);
    const to = new Date();
    const from = new Date(to.getTime() - plan.days * 24 * 3600_000);
    api.candles(symbol, plan.tf, ymd(from), ymd(to))
      .then((c) => {
        const bars = groupBars(c, plan.group).slice(-90);
        chartCache.set(key, bars);
        if (alive) setCandles(bars);
      })
      .catch(() => { if (alive) setCandles([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [key, offline, symbol, plan.tf, plan.days, plan.group]);
  return { candles, loading };
}

const LEVEL_INK: Record<PostChartLevel['kind'], string> = {
  entry: color.priceEntry, stop: color.priceStop, target: color.priceTarget,
  support: color.textSecondary, resistance: color.textSecondary, level: color.textSecondary,
};
const LEVEL_WORD: Record<PostChartLevel['kind'], string> = {
  entry: 'Entry', stop: 'Stop', target: 'Target', support: 'Support', resistance: 'Resistance', level: 'Level',
};

export function chartLevels(levels: PostChartLevel[]): ChartLevel[] {
  return [...levels]
    .sort((a, b) => b.price - a.price)
    .map((l, i) => ({
      price: l.price,
      label: `${l.label || LEVEL_WORD[l.kind]} ${px(l.price)}`,
      c: LEVEL_INK[l.kind],
      weight: l.kind === 'entry' ? 1.5 : 1,
      side: (i % 2 === 0 ? 'right' : 'left') as 'left' | 'right',
    }));
}

/**
 * A chart attachment, drawn from live bars with the post's levels on it. It is
 * the house's own SVG chart (`CandleChart`) — the same one a call card uses —
 * so a feed of twenty charts is twenty drawings, not twenty browsers.
 */
export function PostChart({ symbol, timeframe, levels, height = 150, onExpand, testID }: {
  symbol: string;
  timeframe: ChartTimeframe;
  levels: PostChartLevel[];
  height?: number;
  onExpand?: () => void;
  testID?: string;
}) {
  const { candles, loading } = useChartCandles(symbol, timeframe);
  const plan = PLAN[timeframe] ?? PLAN['1D'];
  const last = candles.length ? candles[candles.length - 1] : null;
  return (
    <View testID={testID} style={{ gap: 6 }}>
      {/* The name, the timeframe and the last price sit ABOVE the drawing, not
          on it: a level tag at the top of the range would otherwise land on
          top of the label, and at larger text sizes it always does. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <TickerMark symbol={symbol} size={18} />
        <T variant="meta" weight="bold" c={color.textPrimary}>{symbol}</T>
        <Num variant="meta" weight="medium" c={color.textSecondary}>{timeframe}</Num>
        <View style={{ flex: 1 }} />
        {last ? <Num variant="meta" weight="semibold" c={color.textPrimary}>{px(last.c)}</Num> : null}
      </View>
      <View>
        {loading && !candles.length ? (
          <View style={{ height: height + 28, alignItems: 'center', justifyContent: 'center', borderRadius: radius.xl, borderWidth: 0.5, borderColor: alpha.border }}>
            <T variant="meta" c={color.textSecondary}>Drawing {symbol}…</T>
          </View>
        ) : (
          <CandleChart
            candles={candles}
            levels={chartLevels(levels)}
            height={height}
            showVolume={false}
            footerLeft={plan.label}
          />
        )}
        {onExpand ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open the ${symbol} chart`}
            onPress={onExpand}
            hitSlop={4}
            style={{ position: 'absolute', right: 2, bottom: -4, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
          >
            <ExpandIcon />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
