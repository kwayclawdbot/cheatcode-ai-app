import React from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../../ui/Screen';
import { T, Num, Eyebrow } from '../../ui/Text';
import { ObjectCard, RowList, Row } from '../../ui/Panel';
import { KaiOrb } from '../../ui/KaiOrb';
import { Price } from '../../ui/Price';
import { Button } from '../../ui/Button';
import { Bolt, Search, ArrowRight } from '../../ui/Icons';
import { ScreenLoading } from '../../ui/Loading';
import { alpha, color, gradient, gradientAngle, radius } from '../../ui/tokens';
import { useTradeLanding } from '../../features/trade/useTrade';
import { useSession } from '../../lib/session';
import type { GoalMode, Instrument, Mover } from '../../lib/types';

const MODE_LABEL: Record<GoalMode, string> = { day_trade: 'Day Trade', swing: 'Swing', invest: 'Invest' };

function TickerTile({ symbol }: { symbol: string }) {
  return (
    <LinearGradient
      colors={gradient.tile as unknown as readonly [string, string, ...string[]]}
      start={gradientAngle.start}
      end={gradientAngle.end}
      style={{ width: 32, height: 32, borderRadius: 9, borderWidth: 0.5, borderColor: alpha.ivory14, alignItems: 'center', justifyContent: 'center' }}
    >
      <Num size={12}>{symbol.slice(0, 1)}</Num>
    </LinearGradient>
  );
}

function SymbolRow({
  item, last, onPress,
}: { item: Instrument | Mover; last: boolean; onPress: () => void }) {
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

/**
 * Trade — V4-TR1-Trade-landing.html.
 * Brokerage regions lead (balance, search, watchlist, movers); Continue and
 * Kai opportunities are labelled sections rather than the page. There is no
 * Buy/Sell this round because paper orders do not exist yet, and the strip is
 * labelled PAPER because that is the only account there is.
 */
export default function Trade() {
  const router = useRouter();
  const { profile } = useSession();
  const mode: GoalMode = (profile?.primary_mode as GoalMode) ?? 'day_trade';
  const { data, loading, error, isFixture } = useTradeLanding(mode);

  const openSymbol = (s: string) => router.push(`/symbol/${encodeURIComponent(s)}`);

  // Never claim "your watchlist is empty" before the answer arrives.
  if (!data && loading) {
    return (
      <Screen variant="corner" layout="tab" testID="screen-trade">
        <ScreenLoading label="Loading your market workspace…" />
      </Screen>
    );
  }

  return (
    <Screen variant="corner" layout="tab" testID="screen-trade">
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 8, paddingHorizontal: 16, gap: 11, paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <T size={28} weight="bold">Trade</T>
          <LinearGradient
            colors={gradient.modeChip as unknown as readonly [string, string, ...string[]]}
            start={gradientAngle.start}
            end={gradientAngle.end}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 13, borderRadius: radius.pill, borderWidth: 0.5, borderColor: alpha.volt55 }}
          >
            <Bolt size={11} color={color.volt} />
            <T size={12} weight="semibold" c={color.volt}>{MODE_LABEL[mode]}</T>
          </LinearGradient>
        </View>

        {/* PAPER strip — never called a portfolio, because it is not one. */}
        {data?.account_strip ? (
          <ObjectCard r={radius.xl} style={{ paddingVertical: 13, paddingHorizontal: 15, flexDirection: 'row' }} testID="paper-strip">
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <T size={10} c={color.muted}>Practice balance</T>
                <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, borderWidth: 0.5, borderColor: alpha.cyan40 }}>
                  <T size={9} weight="bold" c={color.cyan}>{data.account_strip.label}</T>
                </View>
              </View>
              <Num size={19} weight="semibold" style={{ marginTop: 3 }}>
                {`$${data.account_strip.equity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </Num>
              <T size={10} c={color.muted} style={{ marginTop: 3 }}>Not real money</T>
            </View>
            {data.account_strip.buying_power != null ? (
              <View style={{ alignItems: 'flex-end', justifyContent: 'flex-start' }}>
                <T size={10} c={color.muted}>Buying power</T>
                <Num size={13} style={{ marginTop: 3 }}>
                  {`$${data.account_strip.buying_power.toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
                </Num>
              </View>
            ) : null}
          </ObjectCard>
        ) : null}

        {/* search — the field is a door to the search screen, not an inline filter */}
        <Pressable
          testID="trade-search"
          accessibilityRole="button"
          accessibilityLabel="Search symbols or ask Kai"
          onPress={() => router.push('/symbol/search')}
        >
          <LinearGradient
            colors={gradient.composer as unknown as readonly [string, string, ...string[]]}
            start={gradientAngle.start}
            end={gradientAngle.end}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 46, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 0.5, borderColor: alpha.ivory20 }}
          >
            <Search size={15} color={color.muted} />
            <T size={13} c={color.muted} style={{ flex: 1 }}>Symbol, company, or a question for Kai</T>
          </LinearGradient>
        </Pressable>

        {/* CONTINUE */}
        {data?.continue_items.length ? (
          <>
            <Eyebrow c={color.volt}>CONTINUE</Eyebrow>
            {data.continue_items.map((c) => (
              <Pressable
                key={c.id}
                testID={`continue-${c.id}`}
                accessibilityRole="button"
                accessibilityLabel={c.title}
                onPress={() => c.route && router.push(c.route as never)}
              >
                <ObjectCard tone="voltCard" r={radius.xl} style={{ paddingVertical: 12, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 11 }}>
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: alpha.volt14, borderWidth: 0.5, borderColor: alpha.volt50, alignItems: 'center', justifyContent: 'center' }}>
                    <Bolt size={14} color={color.volt} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <T size={14} weight="semibold">{c.title}</T>
                    {c.detail ? <T size={11} c={color.muted} style={{ marginTop: 2 }}>{c.detail}</T> : null}
                  </View>
                  <ArrowRight size={13} color={color.volt} />
                </ObjectCard>
              </Pressable>
            ))}
          </>
        ) : null}

        {/* WATCHLIST */}
        <Eyebrow>WATCHLIST</Eyebrow>
        {data?.watchlist.length ? (
          <RowList style={{ paddingVertical: 2 }}>
            {data.watchlist.map((it, i) => (
              <SymbolRow key={it.symbol} item={it} last={i === data.watchlist.length - 1} onPress={() => openSymbol(it.symbol)} />
            ))}
          </RowList>
        ) : (
          <ObjectCard r={radius.xl} style={{ padding: 18, gap: 10 }}>
            <T size={13} c={color.muted} lh={19}>Your watchlist is empty. Open a symbol and add it — Kai keeps an eye on what you keep here.</T>
            <Button label="Find a symbol" kind="outline" height={44} onPress={() => router.push('/symbol/search')} />
          </ObjectCard>
        )}

        {/* KAI OPPORTUNITIES */}
        <Eyebrow c={color.violetLight}>KAI OPPORTUNITIES</Eyebrow>
        {data?.kai_opportunities.length ? (
          data.kai_opportunities.slice(0, 3).map((s) => (
            <Pressable
              key={s.id}
              testID={`opportunity-${s.symbol}`}
              accessibilityRole="button"
              accessibilityLabel={`${s.symbol} ${s.grade_display} setup`}
              onPress={() => router.push(`/setup/${encodeURIComponent(s.id)}`)}
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
                  <T size={11} c={color.muted} style={{ marginTop: 2 }} numberOfLines={2}>{s.risk_line}</T>
                </View>
                <Price quote={s.quote} size={12} markSize={9} />
              </ObjectCard>
            </Pressable>
          ))
        ) : (
          <ObjectCard r={radius.xl} style={{ padding: 18 }}>
            <T size={13} c={color.muted} lh={19}>Kai hasn&apos;t graded anything worth your attention in this mode yet.</T>
          </ObjectCard>
        )}

        {/* MOVERS */}
        {data?.movers.length ? (
          <>
            <Eyebrow c={color.cyan}>MOVERS</Eyebrow>
            <RowList style={{ paddingVertical: 2 }}>
              {data.movers.map((m, i) => (
                <SymbolRow key={m.symbol} item={m} last={i === data.movers.length - 1} onPress={() => openSymbol(m.symbol)} />
              ))}
            </RowList>
          </>
        ) : null}

        {/* CATALYSTS — omitted entirely when empty, never shown as a blank row */}
        {data?.catalysts.length ? (
          <>
            <Eyebrow c={color.gold}>TODAY</Eyebrow>
            <RowList>
              {data.catalysts.map((c, i) => (
                <Row key={c.label} last={i === data.catalysts.length - 1}>
                  <T size={13} style={{ flex: 1 }}>{c.label}</T>
                  <Num size={12} c={color.gold}>{c.when}</Num>
                </Row>
              ))}
            </RowList>
          </>
        ) : null}

        {error ? <T size={11} c={color.muted} align="center">{error}</T> : null}
        {isFixture ? <T size={10} c={color.dim} align="center">Sample market data — the trade service is not connected here.</T> : null}
      </ScrollView>
    </Screen>
  );
}
