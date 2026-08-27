/**
 * Positions — V3-P1-Positions.html, inside Trade.
 *
 * The artboard's shape exactly: today's P/L as the headline number, one card
 * per position carrying Healthy / At risk, the stop · now · target bar, and
 * EITHER Kai's "nothing to do" line OR the two buttons — never both. A healthy
 * position with no decision to make is allowed to be quiet; that is the point.
 * The daily-risk bar closes the screen.
 */
import React, { useState } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { T, Num } from '../../ui/Text';
import { ObjectCard } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { ScreenLoading } from '../../ui/Loading';
import { alpha, color, radius } from '../../ui/tokens';
import { usePositions } from '../../features/positions/usePositions';
import {
  BackButton, FilterPill, KaiLine, PaperChip, RiskBar, StatusDot, StopNowTargetBar, money,
  pnlColor, shareLabel, signedMoney,
} from '../../features/trade/components';
import type { PositionRow } from '../../features/positions/types';

function PositionCard({ p, onOpen, onExit }: { p: PositionRow; onOpen: () => void; onExit: () => void }) {
  const atRisk = p.health === 'at_risk';
  const pnl = p.status === 'closed' ? p.realized_pnl : p.unrealized_pnl;
  return (
    <ObjectCard
      testID={`position-${p.id}`}
      tone={atRisk ? 'gold' : 'default'}
      r={radius.xxl}
      style={{ paddingVertical: 14, paddingHorizontal: 15, gap: 10 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
        <T size={17} weight="bold">{p.symbol}</T>
        <T size={10} c={color.muted} style={{ flex: 1 }}>
          {`${p.side === 'short' ? 'Short' : 'Long'} · ${p.notional != null ? money(p.notional, 0) : shareLabel(p.qty)}`}
        </T>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <StatusDot c={atRisk ? color.gold : p.status === 'closed' ? color.muted : color.green} />
          <T size={11} c={atRisk ? color.gold : p.status === 'closed' ? color.muted : color.green}>{p.health_label}</T>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <Num size={19} weight="semibold" c={pnlColor(pnl)} testID={`position-pnl-${p.id}`}>{signedMoney(pnl)}</Num>
        <Num size={11} weight="regular" c={color.muted}>
          {[p.unrealized_pnl_pct != null ? `${p.unrealized_pnl_pct < 0 ? '−' : '+'}${Math.abs(p.unrealized_pnl_pct).toFixed(1)}%` : null, p.pnl_detail]
            .filter(Boolean).join(' · ')}
        </Num>
      </View>

      {p.status === 'open' ? (
        <StopNowTargetBar stop={p.stop} now={p.mark_price} target={p.target} testID={`levels-${p.id}`} />
      ) : null}

      {p.nothing_to_do && p.kai_line ? (
        <KaiLine text={p.kai_line} testID={`kai-line-${p.id}`} />
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button
              label={p.status === 'closed' ? 'See the debrief' : 'Review'}
              onPress={onOpen}
              height={40}
              size={13}
              style={{ flex: 1 }}
              testID={`review-${p.id}`}
            />
            {p.status === 'open' ? (
              <Button
                label="Exit now"
                kind="outline"
                onPress={onExit}
                height={40}
                size={13}
                style={{ paddingHorizontal: 18 }}
                testID={`exit-${p.id}`}
              />
            ) : null}
          </View>
        </>
      )}
    </ObjectCard>
  );
}

export default function Positions() {
  const router = useRouter();
  const [status, setStatus] = useState<'open' | 'closed'>('open');
  const { data, loading, error, notAvailable } = usePositions(status);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/trade'));

  if (!data && loading) {
    return (
      <Screen variant="corner" layout="tab" testID="screen-positions">
        <ScreenLoading label="Checking your positions…" />
      </Screen>
    );
  }

  const rows = data?.positions ?? [];
  const today = data?.today_pnl ?? null;

  return (
    <Screen variant="corner" layout="tab" testID="screen-positions">
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 8, paddingHorizontal: 16, gap: 11, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
          <BackButton onPress={back} />
          <T size={28} weight="bold" style={{ flex: 1 }}>Positions</T>
          <PaperChip />
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
          <Num size={30} weight="semibold" c={pnlColor(today)} testID="positions-pl">{signedMoney(today)}</Num>
          <T size={12} c={color.muted}>
            {`today · ${data?.open_count ?? rows.filter((r) => r.status === 'open').length} open`}
          </T>
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <FilterPill label="Open" selected={status === 'open'} onPress={() => setStatus('open')} testID="filter-open" />
          <FilterPill label="Closed" selected={status === 'closed'} onPress={() => setStatus('closed')} testID="filter-closed" />
        </View>

        {rows.length ? (
          rows.map((p) => (
            <PositionCard
              key={p.id}
              p={p}
              onOpen={() => router.push(`/position/${encodeURIComponent(p.id)}`)}
              onExit={() => router.push(`/order/review?close=${encodeURIComponent(p.id)}`)}
            />
          ))
        ) : (
          <ObjectCard r={radius.xl} style={{ padding: 18 }}>
            <T size={13} c={color.muted} lh={19}>
              {notAvailable
                ? "Positions aren't live on this build yet."
                : error ?? data?.empty_copy ?? 'No positions yet.'}
            </T>
          </ObjectCard>
        )}

        {data?.daily_risk.cap != null ? (
          <RiskBar label="Daily risk used" used={data.daily_risk.used} cap={data.daily_risk.cap} testID="daily-risk" />
        ) : null}

        <T size={11} c={color.dim} lh={16} style={{ paddingHorizontal: 2 }}>
          Paper positions are marked with delayed prices, so what you see here can lag the market by about 15 minutes.
        </T>
      </ScrollView>
    </Screen>
  );
}
