/**
 * Trade — the brokerage hierarchy (audit §7, round-3 brief).
 *
 * Order on the page is the audit's order, not ours:
 *   1  account value · day change · buying power · PAPER
 *   2  positions, open orders, anything needing a decision
 *   3  watchlist and recent symbols
 *   4  search, then market discovery
 *   5  Kai's opportunities — a labelled section at the end, never the page
 *
 * Card saturation is deliberately low (audit §9): positions, orders, watchlist
 * and movers are ROWS with rules between them; a strong card is reserved for
 * the things that are actually waiting on you.
 */
import React, { useState } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../../ui/Screen';
import { T, Num, Eyebrow } from '../../ui/Text';
import { ObjectCard, RowList, Row } from '../../ui/Panel';
import { KaiOrb } from '../../ui/KaiOrb';
import { Price } from '../../ui/Price';
import { Button } from '../../ui/Button';
import { Search, ArrowRight } from '../../ui/Icons';
import { ScreenLoading } from '../../ui/Loading';
import { alpha, color, gradient, gradientAngle, radius } from '../../ui/tokens';
import { useTradeLandingV2 } from '../../features/trade/useLanding';
import { ModeChip, ModeSheet } from '../../features/trade/ModeSheet';
import {
  KaiLine, PaperChip, StopNowTargetBar, money, pnlColor, shareLabel, signedMoney, signedPct,
} from '../../features/trade/components';
import { useSession } from '../../lib/session';
import type { GoalMode, Instrument, Mover } from '../../lib/types';
import type { PositionRow } from '../../features/positions/types';
import type { OrderRow } from '../../features/orders/types';
import type { NeedsActionItem } from '../../features/trade/types';

function TickerTile({ symbol }: { symbol: string }) {
  return (
    <LinearGradient
      colors={gradient.tile as unknown as readonly [string, string]}
      start={gradientAngle.start}
      end={gradientAngle.end}
      style={{ width: 32, height: 32, borderRadius: 9, borderWidth: 0.5, borderColor: alpha.ivory14, alignItems: 'center', justifyContent: 'center' }}
    >
      <Num size={12}>{symbol.slice(0, 1)}</Num>
    </LinearGradient>
  );
}

function SymbolRow({ item, last, onPress }: { item: Instrument | Mover; last: boolean; onPress: () => void }) {
  return (
    <Row last={last} style={{ paddingVertical: 10, gap: 11 }}>
      <Pressable
        testID={`symbol-${item.symbol}`}
        accessibilityRole="button"
        accessibilityLabel={`${item.symbol} ${item.name ?? ''}`}
        onPress={onPress}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 44 }}
      >
        <TickerTile symbol={item.symbol} />
        <View style={{ flex: 1 }}>
          <T size={14} weight="bold">{item.symbol}</T>
          {item.name ? <T size={10} c={color.muted} numberOfLines={1}>{item.name}</T> : null}
        </View>
      </Pressable>
      <Price quote={item.quote} size={12} markSize={9} showChange />
    </Row>
  );
}

/** A position on the landing page is a row: what it is worth, and how safe. */
function PositionSummaryRow({ p, last, onPress }: { p: PositionRow; last: boolean; onPress: () => void }) {
  const pnl = p.unrealized_pnl ?? p.realized_pnl;
  return (
    <Row last={last} style={{ paddingVertical: 11 }}>
      <Pressable
        testID={`position-row-${p.id}`}
        accessibilityRole="button"
        accessibilityLabel={`${p.symbol} position, ${p.health_label}`}
        onPress={onPress}
        style={{ flex: 1, gap: 6, minHeight: 44 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <T size={14} weight="bold">{p.symbol}</T>
          <T size={10} c={color.muted}>
            {`${p.side === 'short' ? 'Short' : 'Long'} · ${shareLabel(p.qty)}`}
          </T>
          <T size={10} c={p.health === 'at_risk' ? color.gold : color.green} style={{ flex: 1 }}>
            {`· ${p.health_label}`}
          </T>
          <Num size={14} weight="semibold" c={pnlColor(pnl)}>{signedMoney(pnl)}</Num>
        </View>
        <StopNowTargetBar stop={p.stop} now={p.mark_price} target={p.target} />
      </Pressable>
    </Row>
  );
}

/** An order row exists to make `accepted` visibly different from `filled`. */
function OrderSummaryRow({ o, last, onPress }: { o: OrderRow; last: boolean; onPress: () => void }) {
  const pending = o.status === 'accepted' || o.status === 'submitted' || o.status === 'partially_filled';
  return (
    <Row last={last} style={{ paddingVertical: 10 }}>
      <Pressable
        testID={`order-row-${o.id}`}
        accessibilityRole="button"
        accessibilityLabel={`${o.side_label} ${o.symbol}, ${o.status_label}`}
        onPress={onPress}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}
      >
        <View style={{ flex: 1 }}>
          <T size={13.5} weight="semibold">{`${o.side_label} ${o.symbol} · ${shareLabel(o.qty)}`}</T>
          <T size={10} c={pending ? color.gold : color.muted} style={{ marginTop: 2 }}>{o.status_label}</T>
        </View>
        {o.limit_price != null ? <Num size={12} c={color.muted}>{money(o.limit_price)}</Num> : null}
        <ArrowRight size={12} color={color.muted} />
      </Pressable>
    </Row>
  );
}

const TONE_PROP = { gold: 'gold', volt: 'voltCard', live: 'live' } as const;

function NeedsActionCard({ item, onPress }: { item: NeedsActionItem; onPress: () => void }) {
  return (
    <Pressable
      testID={`needs-action-${item.id}`}
      accessibilityRole="button"
      accessibilityLabel={item.title}
      onPress={onPress}
    >
      <ObjectCard tone={TONE_PROP[item.tone]} r={radius.xl} style={{ paddingVertical: 13, paddingHorizontal: 15, gap: 8 }}>
        <T size={14} weight="semibold">{item.title}</T>
        {item.detail ? <T size={12} c={color.muted} lh={17}>{item.detail}</T> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <T size={12} weight="semibold" c={item.tone === 'gold' ? color.gold : color.volt}>{item.action_label}</T>
          <ArrowRight size={12} color={item.tone === 'gold' ? color.gold : color.volt} />
        </View>
      </ObjectCard>
    </Pressable>
  );
}

export default function Trade() {
  const router = useRouter();
  const { profile } = useSession();
  const mode: GoalMode = (profile?.primary_mode as GoalMode) ?? 'day_trade';
  const { data, loading, error, notAvailable } = useTradeLandingV2(mode);
  const [modeOpen, setModeOpen] = useState(false);

  const openSymbol = (s: string) => router.push(`/symbol/${encodeURIComponent(s)}`);

  if (!data && loading) {
    return (
      <Screen variant="corner" layout="tab" testID="screen-trade">
        <ScreenLoading label="Loading your account…" />
      </Screen>
    );
  }

  const acct = data?.account ?? null;
  const positions = data?.positions ?? [];
  const orders = data?.open_orders ?? [];
  const needs = data?.needs_action ?? [];
  const dayUp = (acct?.day_change ?? 0) >= 0;

  return (
    <Screen variant="corner" layout="tab" testID="screen-trade">
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 8, paddingHorizontal: 16, gap: 11, paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <T size={28} weight="bold">Trade</T>
          <ModeChip mode={mode} onPress={() => setModeOpen(true)} />
        </View>

        {/* 1 — the account. Value, what it did today, what is spendable, PAPER. */}
        {acct ? (
          <Pressable
            testID="paper-strip"
            accessibilityRole="button"
            accessibilityLabel="Practice account. Open your positions."
            onPress={() => router.push('/position')}
          >
            <ObjectCard r={radius.xl} style={{ paddingVertical: 14, paddingHorizontal: 15, gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                <T size={10} c={color.muted} style={{ flex: 1 }}>Account value</T>
                <PaperChip label={acct.label === 'PAPER' ? 'Paper' : acct.label} testID="paper-chip" />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
                <Num size={26} weight="semibold" testID="account-value">{money(acct.value)}</Num>
                {acct.day_change != null ? (
                  <Num size={13} weight="regular" c={dayUp ? color.green : color.red} style={{ marginBottom: 3 }}>
                    {`${signedMoney(acct.day_change)}${acct.day_change_pct != null ? ` (${signedPct(acct.day_change_pct)})` : ''} today`}
                  </Num>
                ) : null}
              </View>
              {acct.buying_power != null ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                  <T size={11} c={color.muted}>Buying power</T>
                  <Num size={12} testID="buying-power">{money(acct.buying_power, 0)}</Num>
                </View>
              ) : null}
              <T size={11} c={color.dim} lh={16}>
                {acct.plain ?? 'Practice money. Nothing here can be withdrawn.'}
              </T>
            </ObjectCard>
          </Pressable>
        ) : null}

        {/* 2 — positions, open orders, anything needing a decision. */}
        {positions.length ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Eyebrow style={{ flex: 1 }}>POSITIONS</Eyebrow>
              <Pressable
                testID="see-all-positions"
                accessibilityRole="button"
                accessibilityLabel="See all positions"
                onPress={() => router.push('/position')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <T size={11} weight="semibold" c={color.volt}>See all</T>
              </Pressable>
            </View>
            <RowList style={{ paddingVertical: 2 }}>
              {positions.slice(0, 3).map((p, i) => (
                <PositionSummaryRow
                  key={p.id}
                  p={p}
                  last={i === Math.min(positions.length, 3) - 1}
                  onPress={() => router.push(`/position/${encodeURIComponent(p.id)}`)}
                />
              ))}
            </RowList>
          </>
        ) : null}

        {orders.length ? (
          <>
            <Eyebrow>OPEN ORDERS</Eyebrow>
            <RowList style={{ paddingVertical: 2 }}>
              {orders.map((o, i) => (
                <OrderSummaryRow
                  key={o.id}
                  o={o}
                  last={i === orders.length - 1}
                  onPress={() => router.push(`/order/${encodeURIComponent(o.id)}`)}
                />
              ))}
            </RowList>
          </>
        ) : null}

        {needs.length ? (
          <>
            <Eyebrow c={color.gold}>NEEDS A DECISION</Eyebrow>
            {needs.slice(0, 3).map((n) => (
              <NeedsActionCard key={n.id} item={n} onPress={() => router.push(n.route as never)} />
            ))}
          </>
        ) : null}

        {/* 3 — watchlist and recent symbols. */}
        <Eyebrow>WATCHLIST</Eyebrow>
        {data?.watchlist.length ? (
          <RowList style={{ paddingVertical: 2 }}>
            {data.watchlist.map((it, i) => (
              <SymbolRow key={it.symbol} item={it} last={i === data.watchlist.length - 1} onPress={() => openSymbol(it.symbol)} />
            ))}
          </RowList>
        ) : (
          <ObjectCard r={radius.xl} style={{ padding: 18, gap: 10 }}>
            <T size={13} c={color.muted} lh={19}>
              Your watchlist is empty. Open a symbol and add it — Kai keeps an eye on what you keep here.
            </T>
            <Button label="Find a symbol" kind="outline" height={44} onPress={() => router.push('/symbol/search')} />
          </ObjectCard>
        )}

        {data?.recent.length ? (
          <>
            <Eyebrow>RECENT</Eyebrow>
            <RowList style={{ paddingVertical: 2 }}>
              {data.recent.map((it, i) => (
                <SymbolRow key={`recent-${it.symbol}`} item={it} last={i === data.recent.length - 1} onPress={() => openSymbol(it.symbol)} />
              ))}
            </RowList>
          </>
        ) : null}

        {/* 4 — search, then discovery. */}
        <Pressable
          testID="trade-search"
          accessibilityRole="button"
          accessibilityLabel="Search symbols or ask Kai"
          onPress={() => router.push('/symbol/search')}
        >
          <LinearGradient
            colors={gradient.composer as unknown as readonly [string, string]}
            start={gradientAngle.start}
            end={gradientAngle.end}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 46, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 0.5, borderColor: alpha.ivory20 }}
          >
            <Search size={15} color={color.muted} />
            <T size={13} c={color.muted} style={{ flex: 1 }}>Symbol, company, or a question for Kai</T>
          </LinearGradient>
        </Pressable>

        {data?.discovery.movers.length ? (
          <>
            <Eyebrow c={color.cyan}>MOVERS</Eyebrow>
            <RowList style={{ paddingVertical: 2 }}>
              {data.discovery.movers.map((m, i) => (
                <SymbolRow key={m.symbol} item={m} last={i === data.discovery.movers.length - 1} onPress={() => openSymbol(m.symbol)} />
              ))}
            </RowList>
          </>
        ) : null}

        {data?.discovery.catalysts.length ? (
          <>
            <Eyebrow c={color.gold}>TODAY</Eyebrow>
            <RowList>
              {data.discovery.catalysts.map((c, i) => (
                <Row key={c.label} last={i === data.discovery.catalysts.length - 1}>
                  <T size={13} style={{ flex: 1 }}>{c.label}</T>
                  <Num size={12} c={color.gold}>{c.when}</Num>
                </Row>
              ))}
            </RowList>
          </>
        ) : null}

        {/* 5 — Kai's read, attached to the market, never competing with it. */}
        <Eyebrow c={color.violetLight}>KAI OPPORTUNITIES</Eyebrow>
        {data?.kai_opportunities.length ? (
          data.kai_opportunities.slice(0, 3).map((s) => (
            <Pressable
              key={s.id}
              testID={`opportunity-${s.symbol}`}
              accessibilityRole="button"
              accessibilityLabel={`${s.symbol} ${s.grade_display} setup`}
              onPress={() => router.push(`/symbol/${encodeURIComponent(s.symbol)}?setup=${encodeURIComponent(s.id)}`)}
            >
              <ObjectCard tone="kaiCard" r={radius.xl} style={{ paddingVertical: 12, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 11 }}>
                <KaiOrb size={32} glow={false} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                    <T size={14} weight="bold">{`${s.symbol} ${s.direction === 'short' ? 'short-side' : 'bullish'} setup`}</T>
                    <View style={{ paddingHorizontal: 7, paddingVertical: 1, borderRadius: 5, backgroundColor: alpha.violet14, borderWidth: 0.5, borderColor: alpha.violet50 }}>
                      <T size={11} weight="bold" c={color.violet}>{s.grade_display}</T>
                    </View>
                  </View>
                  {s.risk_line ? <T size={11} c={color.muted} style={{ marginTop: 2 }} numberOfLines={2}>{s.risk_line}</T> : null}
                </View>
                <Price quote={s.quote} size={12} markSize={9} />
              </ObjectCard>
            </Pressable>
          ))
        ) : (
          <ObjectCard r={radius.xl} style={{ padding: 18 }}>
            <T size={13} c={color.muted} lh={19}>
              Kai hasn&apos;t graded anything worth your attention in this mode yet.
            </T>
          </ObjectCard>
        )}

        {/* Honest footer: what this stack cannot answer yet. */}
        {data?.notices.length ? (
          <View style={{ gap: 5, paddingTop: 4 }}>
            {data.notices.map((n) => (
              <KaiLine key={n} text={n} />
            ))}
          </View>
        ) : null}

        {error && !data ? (
          <ObjectCard r={radius.xl} style={{ padding: 18 }}>
            <T size={13} c={color.muted} lh={19}>
              {notAvailable ? "Your account isn't connected on this build yet." : error}
            </T>
          </ObjectCard>
        ) : null}
      </ScrollView>

      <ModeSheet visible={modeOpen} mode={mode} onClose={() => setModeOpen(false)} />
    </Screen>
  );
}
