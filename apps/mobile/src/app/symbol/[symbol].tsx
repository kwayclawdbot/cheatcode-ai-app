import React, { useMemo, useState } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { StackHeader } from '../../ui/StackHeader';
import { T, Num, Eyebrow } from '../../ui/Text';
import { ObjectCard, RowList, Row } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { ChipRail } from '../../ui/Segmented';
import { CandleChart, ChartLevel } from '../../ui/MiniChart';
import { PriceRow } from '../../ui/Price';
import { KaiOrb } from '../../ui/KaiOrb';
import { ArrowRight, Bell, Plus, Check } from '../../ui/Icons';
import { alpha, color, radius } from '../../ui/tokens';
import { TIMEFRAMES, useCandles, useSymbolDetail, useWatchlistToggle } from '../../features/trade/useTrade';
import { useSession } from '../../lib/session';
import type { GoalMode, Timeframe } from '../../lib/types';

const ago = (iso: string | null | undefined) => {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
};

/**
 * Symbol detail — V4-TR2-Symbol-detail.html.
 *
 * Deviations from the artboard, and why:
 *  · No bid/ask line — there is no level-1 feed this round, and inventing one
 *    would be a fabricated price.
 *  · Buy / Sell render as a disabled pair with the reason on the label. The
 *    artboard's geometry holds without pretending an order can be placed.
 */
export default function SymbolDetail() {
  const params = useLocalSearchParams<{ symbol?: string }>();
  const symbol = String(params.symbol ?? '').toUpperCase();
  const router = useRouter();
  const { profile } = useSession();
  const mode: GoalMode = (profile?.primary_mode as GoalMode) ?? 'day_trade';
  const { data, loading, error, isFixture } = useSymbolDetail(symbol, mode);
  const [tf, setTf] = useState<Timeframe>('1D');
  const [lens, setLens] = useState<GoalMode>(mode);
  const { candles, footer, isFixture: candlesFixture } = useCandles(symbol, tf, data?.candles ?? []);
  const watch = useWatchlistToggle(symbol, data?.your_context.watchlisted ?? false);

  const levels = useMemo<ChartLevel[]>(() => {
    if (!data) return [];
    const out: ChartLevel[] = [];
    const l = data.levels;
    if (l.entry != null) out.push({ price: l.entry, label: `Entry ${l.entry.toFixed(2)}`, c: color.cyan, weight: 1.4, side: 'left' });
    if (l.support != null) out.push({ price: l.support, label: `Support ${l.support.toFixed(2)}`, c: color.cyan, weight: 1, side: 'left' });
    if (l.target != null) out.push({ price: l.target, label: `Target ${l.target.toFixed(2)}`, c: color.green, weight: 1.2, side: 'right' });
    if (l.invalid != null) out.push({ price: l.invalid, label: `Invalid ${l.invalid.toFixed(2)}`, c: color.red, weight: 1.2, side: 'right' });
    return out;
  }, [data]);

  if (loading && !data) {
    return (
      <Screen variant="corner" layout="tab" testID="screen-symbol">
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={color.violet} /></View>
      </Screen>
    );
  }

  if (!data) {
    return (
      <Screen variant="corner" layout="tab" testID="screen-symbol">
        <StackHeader title={symbol || 'Symbol'} />
        <View style={{ paddingHorizontal: 16 }}>
          <ObjectCard r={radius.xl} style={{ padding: 18, gap: 8 }}>
            <T size={15} weight="bold">{`I don't have ${symbol} yet.`}</T>
            <T size={13} c={color.muted} lh={19}>{error ?? 'It is not in the universe Kai covers in this release.'}</T>
          </ObjectCard>
        </View>
      </Screen>
    );
  }

  const activeLens = data.lenses.find((l) => l.mode === lens) ?? data.lenses[0] ?? null;

  return (
    <Screen variant="corner" layout="tab" testID="screen-symbol">
      <StackHeader
        title={data.symbol}
        subtitle={[data.name, data.exchange].filter(Boolean).join(' · ') || null}
        right={
          <Pressable
            testID="toggle-watchlist"
            accessibilityRole="button"
            accessibilityLabel={watch.on ? 'Remove from watchlist' : 'Add to watchlist'}
            accessibilityState={{ selected: watch.on }}
            onPress={watch.toggle}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: watch.on ? alpha.volt55 : alpha.ivory14, backgroundColor: watch.on ? alpha.volt10 : 'transparent' }}
          >
            {watch.on ? <Check size={15} color={color.volt} strokeWidth={2.6} /> : <Plus size={15} color={color.muted} />}
          </Pressable>
        }
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28, gap: 11 }}
        showsVerticalScrollIndicator={false}
      >
        <PriceRow quote={data.quote} testID="symbol-quote" />

        <ChipRail options={TIMEFRAMES} value={tf} onChange={setTf} testID="tf" />

        <CandleChart
          testID="symbol-chart"
          candles={candles}
          levels={levels}
          height={210}
          footerLeft={candlesFixture ? 'Sample bars' : 'Polygon · delayed'}
          footerRight={footer}
        />

        {/* mode lenses — the same symbol read three ways */}
        {data.lenses.length ? (
          <>
            <ChipRail
              options={data.lenses.map((l) => ({ key: l.mode, label: l.label }))}
              value={lens}
              onChange={setLens}
              testID="lens"
            />
            {activeLens ? (
              <ObjectCard r={radius.xl} style={{ padding: 13 }}>
                <T size={13} lh={20} c={color.muted}>{activeLens.text}</T>
              </ObjectCard>
            ) : null}
          </>
        ) : null}

        {/* Kai interpretation */}
        {data.kai_interpretation ? (
          <Pressable
            testID="kai-interpretation"
            accessibilityRole="button"
            accessibilityLabel="Open Kai's read of this symbol"
            disabled={!data.setup}
            onPress={() => data.setup && router.push(`/setup/${encodeURIComponent(data.setup.id)}`)}
          >
            <ObjectCard tone="kai" r={radius.xl} style={{ paddingVertical: 11, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <KaiOrb size={22} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <T size={12} weight="bold" c={color.violetLight}>Kai analysis</T>
                  {data.kai_interpretation.grade ? (
                    <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, backgroundColor: alpha.violet14, borderWidth: 0.5, borderColor: alpha.violet50 }}>
                      <T size={10} weight="bold" c={color.violet}>{data.kai_interpretation.grade}</T>
                    </View>
                  ) : null}
                  {data.kai_interpretation.last_updated ? (
                    <T size={10} c={color.muted} style={{ marginLeft: 'auto' }}>{ago(data.kai_interpretation.last_updated)}</T>
                  ) : null}
                </View>
                <T size={12} style={{ marginTop: 2 }} lh={17}>{data.kai_interpretation.text}</T>
              </View>
              {data.setup ? <ArrowRight size={14} color={color.violetLight} /> : null}
            </ObjectCard>
          </Pressable>
        ) : null}

        {/* your context */}
        <Eyebrow>YOUR CONTEXT</Eyebrow>
        <RowList>
          <Row>
            <T size={13} c={color.muted} style={{ flex: 1 }}>Watchlist</T>
            <T size={12.5} weight="medium" c={watch.on ? color.volt : color.muted}>{watch.on ? 'On your list' : 'Not added'}</T>
          </Row>
          {data.your_context.alerts.length ? (
            data.your_context.alerts.map((a, i) => (
              <Row key={a.id} last={i === data.your_context.alerts.length - 1}>
                <Bell size={13} color={color.cyan} />
                <T size={13} style={{ flex: 1 }}>{a.label}</T>
                <Pressable accessibilityRole="button" accessibilityLabel={`Open alert ${a.label}`} onPress={() => router.push(`/alert/${encodeURIComponent(a.id)}`)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <ArrowRight size={12} color={color.muted} />
                </Pressable>
              </Row>
            ))
          ) : (
            <Row last>
              <T size={13} c={color.muted} style={{ flex: 1 }}>Alerts</T>
              <T size={12.5} c={color.muted}>None on this symbol</T>
            </Row>
          )}
        </RowList>

        {/* evidence */}
        {data.evidence.news.length ? (
          <>
            <Eyebrow c={color.cyan}>EVIDENCE</Eyebrow>
            <RowList>
              {data.evidence.news.map((n, i) => (
                <Row key={n.id} last={i === data.evidence.news.length - 1} style={{ alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <T size={13} lh={18} numberOfLines={2}>{n.title}</T>
                    <T size={10} c={color.muted} style={{ marginTop: 3 }}>
                      {[n.source, ago(n.published_utc)].filter(Boolean).join(' · ')}
                    </T>
                  </View>
                </Row>
              ))}
            </RowList>
          </>
        ) : null}

        {/* community */}
        <Eyebrow c={color.violetLight}>COMMUNITY</Eyebrow>
        {data.community.room_id ? (
          <Pressable
            testID="open-room"
            accessibilityRole="button"
            accessibilityLabel="Open the discussion room"
            onPress={() => router.push(`/room/${encodeURIComponent(data.community.room_id as string)}`)}
          >
            <ObjectCard r={radius.xl} style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <T size={13} style={{ flex: 1 }}>{data.community.thread_summary ?? `Members are discussing ${data.symbol}`}</T>
              <ArrowRight size={13} color={color.muted} />
            </ObjectCard>
          </Pressable>
        ) : (
          <ObjectCard r={radius.xl} style={{ padding: 14 }}>
            <T size={13} c={color.muted} lh={19}>Discussion opens with Community rooms.</T>
          </ObjectCard>
        )}

        {/* actions — one dominant, then honest disabled order controls */}
        <View style={{ gap: 8, marginTop: 4 }}>
          <Button
            testID="cta-ask-kai-symbol"
            label={`Ask Kai about ${data.symbol}`}
            kind="kai"
            height={48}
            icon={<KaiOrb size={16} glow={false} />}
            onPress={() => router.push(`/home?ask=${encodeURIComponent(`What do you see on ${data.symbol}?`)}&symbol=${encodeURIComponent(data.symbol)}`)}
          />
          <Button
            testID="cta-set-alert"
            label="Set an alert"
            kind="volt"
            height={52}
            onPress={() => router.push(`/alert/new?symbol=${encodeURIComponent(data.symbol)}${data.levels.entry != null ? `&level=${data.levels.entry}` : ''}`)}
          />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button label="Sell" kind="outline" height={48} disabled style={{ flex: 1 }} accessibilityHint="Paper trading arrives next." />
            <Button label="Buy" kind="outline" height={48} disabled style={{ flex: 1 }} accessibilityHint="Paper trading arrives next." />
          </View>
          <T size={11} c={color.dim} align="center">Buy · Sell — paper trading arrives next.</T>
        </View>

        {error ? <T size={11} c={color.muted} align="center">{error}</T> : null}
        {isFixture ? <T size={10} c={color.dim} align="center">Sample data — the symbol service is not connected here.</T> : null}
      </ScrollView>
    </Screen>
  );
}
