import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { Screen } from '../../ui/Screen';
import { T, Num } from '../../ui/Text';
import { ObjectCard } from '../../ui/Panel';
import { ChipRail } from '../../ui/Segmented';
import { CandleChart, ChartLevel } from '../../ui/MiniChart';
import { FreshnessMark } from '../../ui/FreshnessMark';
import { KaiOrb } from '../../ui/KaiOrb';
import { color, radius } from '../../ui/tokens';
import {
  BuySellBar, CommunityLine, CommunityTab, HistoryRail, KaiTab, PlanTab, PositionModuleCard,
  SeeWhyPanel, SetupModuleCard, useSetupDepth, useWatchThis, useWorkspace, useWorkspaceCandles,
  WorkspaceTabs, WORKSPACE_TABS, WORKSPACE_TIMEFRAMES,
} from '../../features/workspace';
import { openKaiSheet } from '../../features/kai-sheet';
import { useWatchlistToggle } from '../../features/trade/useTrade';
import { useSession } from '../../lib/session';
import type { GoalMode, Timeframe, WorkspaceTab } from '../../lib/types';

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
  <Svg width={18} height={18} viewBox="0 0 24 24" fill={on ? color.volt : 'none'} stroke={on ? color.volt : color.muted} strokeWidth={1.5}>
    <Path d="M12 3l2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.8 1-6.1-4.4-4.3 6.1-.9z" />
  </Svg>
);

const isTab = (v: unknown): v is WorkspaceTab =>
  v === 'overview' || v === 'kai' || v === 'plan' || v === 'community';

/**
 * The asset workspace — V5-W1-Asset-workspace.html.
 *
 * ONE place per symbol (consolidation rule 1). The identity, price and chart
 * are persistent; Overview · Kai · Plan · Community are views onto the same
 * object; the setup is a MODULE inside Overview, not a destination; and the
 * Sell / Buy pair is always at the bottom (audit §7).
 *
 * `/setup/[id]` redirects here with `?setup=`; `?tab=` deep-links a view.
 */
export default function AssetWorkspace() {
  const params = useLocalSearchParams<{ symbol?: string; tab?: string; setup?: string }>();
  const symbol = String(params.symbol ?? '').toUpperCase();
  const router = useRouter();
  const { profile } = useSession();
  const mode: GoalMode = (profile?.primary_mode as GoalMode) ?? 'day_trade';

  const { data: w, loading, error, isFixture } = useWorkspace(symbol, mode);
  const [tab, setTab] = useState<WorkspaceTab>(isTab(params.tab) ? params.tab : 'overview');
  const [tf, setTf] = useState<Timeframe>('1D');
  const [whyOpen, setWhyOpen] = useState(false);

  useEffect(() => { if (isTab(params.tab)) setTab(params.tab); }, [params.tab]);

  const setupId = w?.overview.setup_module?.id ?? (typeof params.setup === 'string' ? params.setup : null);
  const depth = useSetupDepth(setupId);
  const { candles, isFixture: candlesFixture, footer } = useWorkspaceCandles(symbol, tf, w?.candles ?? []);
  const watch = useWatchlistToggle(symbol, w?.watchlisted ?? false);
  const watchThis = useWatchThis(setupId, w?.overview.setup_module?.following ?? false);

  const levels = useMemo<ChartLevel[]>(() => {
    if (!w) return [];
    const l = w.overview.key_levels;
    const out: ChartLevel[] = [];
    if (l.entry != null) out.push({ price: l.entry, label: `${l.entry} entry`, c: color.cyan, weight: 1.4, side: 'left' });
    if (l.target != null) out.push({ price: l.target, label: `${l.target} target`, c: color.green, weight: 1.2, side: 'right' });
    if (l.invalid != null) out.push({ price: l.invalid, label: `${l.invalid} invalid`, c: color.red, weight: 1.2, side: 'right' });
    return out;
  }, [w]);

  if (loading && !w) {
    return (
      <Screen variant="corner" layout="tab" testID="screen-symbol">
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={color.violet} /></View>
      </Screen>
    );
  }

  if (!w) {
    return (
      <Screen variant="corner" layout="tab" testID="screen-symbol">
        <View style={{ paddingHorizontal: 16, paddingTop: 6, gap: 12 }}>
          <Back onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} />
          <ObjectCard r={radius.xl} style={{ padding: 18, gap: 8 }}>
            <T size={15} weight="bold">{`I don't have ${symbol} yet.`}</T>
            <T size={13} c={color.muted} lh={19}>{error ?? 'It is not in the universe Kai covers in this release.'}</T>
          </ObjectCard>
        </View>
      </Screen>
    );
  }

  const up = (w.quote?.change_pct ?? 0) >= 0;

  return (
    <Screen variant="corner" layout="tab" testID="screen-symbol">
      {/* identity — persistent across every tab */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 8 }}>
        <Back onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            <T size={17} weight="bold" testID="workspace-symbol">{w.symbol}</T>
            <Num size={15} weight="semibold">{w.quote?.price != null ? `$${w.quote.price.toFixed(2)}` : '—'}</Num>
            {w.quote?.change_pct != null ? (
              <Num size={11} weight="regular" c={up ? color.green : color.red}>
                {`${up ? '+' : '−'}${Math.abs(w.quote.change_pct).toFixed(2)}%`}
              </Num>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <T size={10} c={color.muted} testID="workspace-context">{w.context_line}</T>
            <T size={10} c={color.dim}>·</T>
            <FreshnessMark
              freshness={w.quote?.freshness ?? 'unknown'}
              delayReason={w.quote?.delay_reason}
              size={10}
              testID="workspace-freshness"
            />
          </View>
        </View>
        {/* Kai works in place from every tab — the sheet opens OVER this
            screen and never sends the user back to Home (audit §5). */}
        <Pressable
          testID="workspace-ask-kai"
          accessibilityRole="button"
          accessibilityLabel={`Ask Kai about ${w.symbol}`}
          onPress={() => openKaiSheet({
            context: { kind: setupId ? 'setup' : 'symbol', id: setupId ?? undefined, symbol: w.symbol },
          })}
          hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, marginRight: 4 })}
        >
          <KaiOrb size={22} />
        </Pressable>
        <Pressable
          testID="toggle-watchlist"
          accessibilityRole="button"
          accessibilityLabel={watch.on ? 'Remove from watchlist' : 'Add to watchlist'}
          accessibilityState={{ selected: watch.on }}
          onPress={watch.toggle}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <Star on={watch.on} />
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
        <WorkspaceTabs
          tabs={WORKSPACE_TABS}
          value={tab}
          onChange={setTab as (k: never) => void}
          badge={{ community: w.community.message_count ?? null }}
        />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16, gap: 11 }}
        showsVerticalScrollIndicator={false}
      >
        {tab === 'overview' ? (
          <View testID="tab-body-overview" style={{ gap: 11 }}>
            <View style={{ gap: 6 }}>
              <CandleChart
                testID="workspace-chart"
                candles={candles}
                levels={levels}
                height={180}
                footerLeft={candlesFixture ? 'Sample bars' : 'Polygon · delayed'}
                footerRight={w.overview.volume_note ?? footer}
              />
              <ChipRail options={WORKSPACE_TIMEFRAMES} value={tf} onChange={setTf} testID="tf" />
            </View>

            {w.overview.setup_module ? (
              <SetupModuleCard
                symbol={w.symbol}
                module={w.overview.setup_module}
                watching={watchThis.on}
                busy={watchThis.busy}
                onWatch={() => { void watchThis.watch(); }}
                onSeeWhy={() => setWhyOpen((v) => !v)}
                onBuildPlan={() => setTab('plan')}
              />
            ) : (
              <ObjectCard r={radius.xxl} style={{ padding: 15, gap: 6 }} testID="setup-module-empty">
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <KaiOrb size={18} />
                  <T size={12} weight="bold" c={color.violetLight}>No setup right now</T>
                </View>
                <T size={12.5} lh={18} c={color.muted}>
                  {`Kai has nothing graded on ${w.symbol} in ${mode === 'day_trade' ? 'Day Trade' : mode === 'swing' ? 'Swing' : 'Invest'}. You can still watch it, plan it or trade it.`}
                </T>
              </ObjectCard>
            )}

            {whyOpen ? <SeeWhyPanel detail={depth} whatChanged={w.overview.what_changed} /> : null}

            {w.overview.position ? <PositionModuleCard symbol={w.symbol} position={w.overview.position} /> : null}

            {watchThis.error ? <T size={11} c={color.red}>{watchThis.error}</T> : null}

            <CommunityLine w={w} />
            <HistoryRail w={w} />
          </View>
        ) : null}

        {tab === 'kai' ? <KaiTab w={w} /> : null}
        {tab === 'plan' ? <PlanTab w={w} /> : null}
        {tab === 'community' ? <CommunityTab w={w} /> : null}

        {error ? <T size={11} c={color.muted} align="center">{error}</T> : null}
        {isFixture ? <T size={10} c={color.dim} align="center">Sample data — the symbol service is not connected here.</T> : null}
      </ScrollView>

      <BuySellBar w={w} />
    </Screen>
  );
}
