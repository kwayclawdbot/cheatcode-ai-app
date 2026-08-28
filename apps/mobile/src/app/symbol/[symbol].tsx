import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { Screen } from '../../ui/Screen';
import { T, Num } from '../../ui/Text';
import { ScreenLoading } from '../../ui/Loading';
import { FreshnessMark } from '../../ui/FreshnessMark';
import { alpha, color, radius } from '../../ui/tokens';
import { KaiView, TickerChart, TickerSections, useTickerPage } from '../../features/ticker';
import { openKaiSheet } from '../../features/kai-sheet';
import { useSession } from '../../lib/session';
import type { GoalMode } from '../../lib/types';

/**
 * Ticker page — prototype board "Ticker page".
 *
 * This is the RESEARCH overview for a symbol: identity + live price, a light
 * chart with timeframes, Kai's view, and three collapsible sections
 * (Overview · Technicals · Community). The round-3 workspace tabs
 * (Overview/Kai/Plan/Community) moved into the chart-first Trade Portal, which
 * lane MOBILE-B owns — "Open in Trade" is the only seam.
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
  const [tf, setTf] = React.useState<string | null>(null);

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

  return (
    <Screen variant="corner" layout="tab" testID="screen-ticker">
      {/* Identity — symbol, company, live price, market state, star */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 6, paddingHorizontal: 16, paddingBottom: 8 }}>
        <Back onPress={() => router.back()} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            <T size={17} weight="bold" testID="ticker-symbol">{data.symbol}</T>
            <T size={11} c={color.muted}>{data.company}</T>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            <Num size={14} weight="semibold" testID="ticker-price">
              {q?.price != null ? q.price.toFixed(2) : '—'}
            </Num>
            {q?.change_pct != null ? (
              <Num size={11} c={up ? color.green : color.red}>
                {`${up ? '+' : '−'}${Math.abs(q.change_pct).toFixed(2)}%`}
              </Num>
            ) : null}
            <T size={10} c={color.cyan}>{data.market_label}</T>
            {q ? <FreshnessMark freshness={q.freshness ?? 'unknown'} size={10} /> : null}
          </View>
        </View>
        <Star on={data.starred} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8, gap: 11 }}
        showsVerticalScrollIndicator={false}
      >
        <TickerChart
          points={data.chart.points}
          timeframes={data.chart.timeframes}
          selected={tf ?? data.chart.selected}
          onSelect={setTf}
          onOpenTrade={openTrade}
        />

        <KaiView
          take={data.kai_view.take}
          actions={data.kai_view.actions}
          onAsk={(q2) => openKaiSheet({ context: { kind: 'symbol', symbol: data.symbol }, question: q2 })}
        />

        <TickerSections
          page={data}
          onViewAlert={() =>
            data.active_alert
              ? router.push(`/trade/${encodeURIComponent(data.symbol)}?alert=${encodeURIComponent(data.active_alert.id)}&ctx=alert`)
              : router.push('/alerts')
          }
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
