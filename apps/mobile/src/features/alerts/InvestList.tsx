/**
 * INVEST, ON THE ALERTS BOARD — the research watchlist in the V2 card language.
 *
 * The standing ruling (owner): investing picks are NOT alerts. So these cards
 * wear the same surface, identity row, grade badge and edge as an alert card —
 * one visual language across the three segments — and carry none of an
 * alert's machinery: no status verb, no trigger, no stop or target, no R, no
 * "View setup". What they carry is the desk's judgement of a business: its
 * IDEA grade (said in those words, because an idea grade is not a trade grade
 * — see desk/plain.ts), what the company does in the desk's own line, the
 * theme and horizon, and the share price with its day's move and a daily
 * chart. The whole card opens the write-up.
 *
 * WHAT IS LISTED: the desk's research list (graded companies, best first),
 * then any pick on the desk's watchlist the research list does not already
 * carry. Passes are not here — the desk read them and declined. A member's own
 * hand-added names live on the full desk (/desk), linked at the foot.
 *
 * Nothing is fetched here that the desk screen does not already fetch:
 * `/desk/watchlist` returns both lists with prices attached, and the daily
 * bars come from the same candles cache the alert cards use.
 */
import React, { useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Card, GradeBadge, Button, T, Num, color, alpha, layout } from '../../ui/kit';
import { TickerMark } from '../../ui/Ticker';
import { CapabilityNotice } from '../../ui/CapabilityState';
import { api } from '../../lib/api';
import { env } from '../../lib/env';
import { fixtureDeskWatchlist, fixtureDeskWatchlistEmpty } from '../../lib/fixtures';
import { useResource } from '../../lib/useResource';
import { gradeBand } from '../grade/bands';
import { horizonPlain } from '../desk/plain';
import { MicroChart } from './instruments';
import { useAlertCandles } from './useAlertCandles';
import { AlertsEmpty } from './AlertCard';
import type { DeskCompany, DeskWatchRow, DeskWatchlistResponse } from '@shared/desk';
import type { Candle } from '../../lib/types';

type InvestItem = {
  ticker: string;
  company: string | null;
  businessLine: string | null;
  grade: string | null;
  theme: string | null;
  horizon: string | null;
  price: number | null;
  changePct: number | null;
  /** The close on the day the desk filed — dated, never shown as a live price. */
  filedAt: { price: number; on: string } | null;
};

/** Research list first (the desk's order), then watchlist picks it does not carry. */
export function investItems(res: DeskWatchlistResponse | null): InvestItem[] {
  if (!res) return [];
  const rows = new Map<string, DeskWatchRow>(res.rows.map((r) => [r.ticker.toUpperCase(), r]));
  const out: InvestItem[] = [];
  const seen = new Set<string>();
  const companies = [...(res.companies ?? [])]
    .filter((c: DeskCompany) => c.direction !== 'pass' && c.status !== 'rejected')
    .sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));
  for (const c of companies) {
    const t = c.ticker.toUpperCase();
    const row = rows.get(t);
    seen.add(t);
    out.push({
      ticker: t,
      company: c.company,
      businessLine: c.businessLine,
      grade: c.ideaGrade,
      theme: c.theme,
      horizon: c.horizon,
      price: row?.price ?? null,
      changePct: row?.quote?.change_pct ?? null,
      filedAt: c.entryPrice != null && c.entryStampedOn ? { price: c.entryPrice, on: c.entryStampedOn } : null,
    });
  }
  for (const r of res.rows) {
    const t = r.ticker.toUpperCase();
    if (seen.has(t) || r.source !== 'pick' || r.direction === 'pass') continue;
    out.push({
      ticker: t, company: r.company, businessLine: null, grade: r.grade, theme: r.theme, horizon: r.horizon,
      price: r.price, changePct: r.quote?.change_pct ?? null, filedAt: null,
    });
  }
  return out;
}

const shortDate = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

function InvestCard({ item, bars, onOpen }: { item: InvestItem; bars: readonly Candle[]; onOpen: () => void }) {
  const band = gradeBand(item.grade, null);
  const horizon = horizonPlain(item.horizon);
  const theme = item.theme ? item.theme.replace(/-/g, ' ') : null;
  const chg = item.changePct;
  return (
    <Card edge={item.grade ? band.edge : null} testID={`invest-card-${item.ticker}`} style={{ gap: 12 }}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${item.company ?? item.ticker}, idea grade ${item.grade ?? 'none'}`}
        accessibilityHint="Opens the desk's write-up"
        testID={`invest-open-${item.ticker}`}
        style={({ pressed }) => [StyleSheet.absoluteFill, { backgroundColor: pressed ? color.raised : 'transparent' }]}
      />
      <View pointerEvents="none" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <TickerMark symbol={item.ticker} size={36} />
        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 8 }}>
          <T variant="cardTitle" weight="bold">{item.ticker}</T>
          <T variant="meta" c={color.textSecondary} numberOfLines={1}>Invest · Long</T>
        </View>
        {item.grade ? (
          <View style={{ alignItems: 'flex-end', gap: 2 }}>
            <GradeBadge grade={item.grade} testID={`invest-grade-${item.ticker}`} />
          </View>
        ) : null}
      </View>

      <View pointerEvents="none" style={{ gap: 2 }}>
        {item.company ? <T variant="body" weight="semibold" numberOfLines={1}>{item.company}</T> : null}
        {item.businessLine ? (
          <T variant="meta" c={color.textSecondary} numberOfLines={2} testID={`invest-line-${item.ticker}`}>{item.businessLine}</T>
        ) : null}
      </View>

      <View pointerEvents="none" style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
        <View style={{ flexShrink: 1, gap: 2 }}>
          {item.price != null ? (
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
              <Num variant="keyPrice">{`$${item.price.toFixed(2)}`}</Num>
              {chg != null ? (
                <Num variant="body" weight="semibold" c={chg > 0 ? color.marketUp : chg < 0 ? color.marketDown : color.textSecondary}>
                  {`${chg > 0 ? '+' : ''}${chg.toFixed(1)}%`}
                </Num>
              ) : null}
            </View>
          ) : item.filedAt ? (
            <T variant="meta" c={color.textSecondary}>
              {'Filed at '}<Num variant="meta" c={color.textPrimary}>{`$${item.filedAt.price.toFixed(2)}`}</Num>{` · ${shortDate(item.filedAt.on)}`}
            </T>
          ) : null}
        </View>
        {bars.length >= 2 ? (
          <View style={{ flex: 1, minWidth: 110 }}>
            <MicroChart bars={bars.slice(-60)} height={40} testID={`invest-chart-${item.ticker}`} />
          </View>
        ) : null}
      </View>

      <View pointerEvents="none" style={{ flexDirection: 'row', gap: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: alpha.divider }}>
        {item.grade ? (
          <View style={{ flexShrink: 0 }}>
            <T variant="meta" c={color.textSecondary}>Idea grade</T>
            <T variant="meta" weight="semibold">{item.grade.replace('-', '−')}</T>
          </View>
        ) : null}
        {theme ? (
          <View style={{ flex: 1, minWidth: 0 }}>
            <T variant="meta" c={color.textSecondary}>Theme</T>
            <T variant="meta" weight="semibold" numberOfLines={1} style={{ textTransform: 'capitalize' }}>{theme}</T>
          </View>
        ) : null}
        {horizon.known ? (
          <View style={{ flexShrink: 1 }}>
            <T variant="meta" c={color.textSecondary}>Horizon</T>
            <T variant="meta" weight="semibold" numberOfLines={1}>{horizon.text}</T>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

export function InvestList() {
  const router = useRouter();
  const params = useLocalSearchParams<{ fixture?: string }>();
  const empty = env.FIXTURES && params.fixture === 'empty';
  const load = useCallback(() => api.deskWatchlist(), []);
  const res = useResource<DeskWatchlistResponse>(
    load,
    empty ? fixtureDeskWatchlistEmpty : fixtureDeskWatchlist,
    [empty],
    { kind: 'quote' },
  );
  const items = useMemo(() => investItems(res.data), [res.data]);
  const bars = useAlertCandles(useMemo(() => items.map((i) => ({ symbol: i.ticker, tf: '1d' as const })), [items]));

  if (res.loading && !res.data) {
    return <CapabilityNotice state="loading" plain="Reading the research desk…" testID="invest-loading" />;
  }
  if (res.error && !res.data) {
    return (
      <CapabilityNotice
        state="failed"
        plain={res.error}
        detail="Nothing here was checked and found empty."
        onRetry={res.notAvailable ? undefined : res.reload}
        testID="invest-failed"
      />
    );
  }
  return (
    <View style={{ gap: layout.cardGap }} testID="invest-list">
      <T variant="meta" c={color.textSecondary} testID="invest-note">
        The desk's graded companies. Investing picks are research, not alerts — nothing here triggers.
      </T>
      {items.length === 0 ? (
        <AlertsEmpty
          copy="The desk has not published a research list yet."
          offers={[{ label: 'See what the desk is reading', onPress: () => router.push('/desk/themes' as never), testID: 'invest-empty-themes' }]}
        />
      ) : (
        items.map((item) => (
          <InvestCard
            key={item.ticker}
            item={item}
            bars={bars[item.ticker] ?? []}
            onOpen={() => router.push(`/desk/pick/${item.ticker}` as never)}
          />
        ))
      )}
      <Button
        label="Open the full research desk"
        kind="outline"
        height={44}
        onPress={() => router.push('/desk' as never)}
        testID="invest-open-desk"
      />
      {res.isFixture ? <T variant="meta" c={color.textSecondary} align="center">Sample desk — the research service is not connected here.</T> : null}
    </View>
  );
}
