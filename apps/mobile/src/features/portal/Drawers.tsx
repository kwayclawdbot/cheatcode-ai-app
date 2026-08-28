/**
 * The portal's drawers.
 *
 * Round 4 moves the round-3 Trade landing — account strip, positions, open
 * orders, watchlist, recents — off the screen and behind a drawer, because
 * Trade now opens as a working chart (spec 10 §7). Nothing was deleted; it is
 * one tap away, in the audit's original order.
 */
import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { T, Num, Eyebrow } from '../../ui/Text';
import { Sheet } from '../../ui/Sheet';
import { ObjectCard, RowList, Row } from '../../ui/Panel';
import { Price } from '../../ui/Price';
import { ArrowRight } from '../../ui/Icons';
import { alpha, color, radius } from '../../ui/tokens';
import { PaperChip, StopNowTargetBar, money, pnlColor, shareLabel, signedMoney, signedPct } from '../trade/components';
import type { PortalDrawers } from './types';

export function PortalDrawersSheet({
  visible, onClose, drawers, onOpenSymbol, onNavigate,
}: {
  visible: boolean;
  onClose: () => void;
  drawers: PortalDrawers;
  onOpenSymbol: (symbol: string) => void;
  onNavigate: (route: string) => void;
}) {
  const acct = drawers.account;
  const dayUp = (acct?.day_change ?? 0) >= 0;

  return (
    <Sheet visible={visible} onClose={onClose} testID="portal-drawers">
      <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ gap: 11, paddingBottom: 6 }} showsVerticalScrollIndicator={false}>
        {acct ? (
          <Pressable
            testID="drawer-account"
            accessibilityRole="button"
            accessibilityLabel="Practice account. Open your positions."
            onPress={() => onNavigate('/position')}
          >
            <ObjectCard r={radius.xl} style={{ paddingVertical: 14, paddingHorizontal: 15, gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                <T size={10} c={color.muted} style={{ flex: 1 }}>Account value</T>
                <PaperChip label={acct.label === 'PAPER' ? 'Paper' : acct.label} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
                <Num size={24} weight="semibold" testID="drawer-account-value">{money(acct.value)}</Num>
                {acct.day_change != null ? (
                  <Num size={12} weight="regular" c={dayUp ? color.green : color.red} style={{ marginBottom: 3 }}>
                    {`${signedMoney(acct.day_change)}${acct.day_change_pct != null ? ` (${signedPct(acct.day_change_pct)})` : ''} today`}
                  </Num>
                ) : null}
              </View>
              {acct.buying_power != null ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                  <T size={11} c={color.muted}>Buying power</T>
                  <Num size={12}>{money(acct.buying_power, 0)}</Num>
                </View>
              ) : null}
              <T size={11} c={color.dim} lh={16}>{acct.plain ?? 'Practice money. Nothing here can be withdrawn.'}</T>
            </ObjectCard>
          </Pressable>
        ) : null}

        {drawers.positions.length ? (
          <>
            <Eyebrow>POSITIONS</Eyebrow>
            <RowList style={{ paddingVertical: 2 }}>
              {drawers.positions.map((p, i) => (
                <Row key={p.id} last={i === drawers.positions.length - 1} style={{ paddingVertical: 11 }}>
                  <Pressable
                    testID={`drawer-position-${p.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={`${p.symbol} position, ${p.health_label}`}
                    onPress={() => onNavigate(`/position/${encodeURIComponent(p.id)}`)}
                    style={{ flex: 1, gap: 6, minHeight: 44 }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <T size={14} weight="bold">{p.symbol}</T>
                      <T size={10} c={color.muted} style={{ flex: 1 }}>
                        {`${p.side === 'short' ? 'Short' : 'Long'} · ${shareLabel(p.qty)}`}
                      </T>
                      <Num size={14} weight="semibold" c={pnlColor(p.unrealized_pnl ?? p.realized_pnl)}>
                        {signedMoney(p.unrealized_pnl ?? p.realized_pnl)}
                      </Num>
                    </View>
                    <StopNowTargetBar stop={p.stop} now={p.mark_price} target={p.target} />
                  </Pressable>
                </Row>
              ))}
            </RowList>
          </>
        ) : null}

        {drawers.open_orders.length ? (
          <>
            <Eyebrow>OPEN ORDERS</Eyebrow>
            <RowList style={{ paddingVertical: 2 }}>
              {drawers.open_orders.map((o, i) => (
                <Row key={o.id} last={i === drawers.open_orders.length - 1} style={{ paddingVertical: 10 }}>
                  <Pressable
                    testID={`drawer-order-${o.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={`${o.side_label} ${o.symbol}, ${o.status_label}`}
                    onPress={() => onNavigate(`/order/${encodeURIComponent(o.id)}`)}
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}
                  >
                    <View style={{ flex: 1 }}>
                      <T size={13.5} weight="semibold">{`${o.side_label} ${o.symbol} · ${shareLabel(o.qty)}`}</T>
                      <T size={10} c={color.gold} style={{ marginTop: 2 }}>{o.status_label}</T>
                    </View>
                    {o.limit_price != null ? <Num size={12} c={color.muted}>{money(o.limit_price)}</Num> : null}
                    <ArrowRight size={12} color={color.muted} />
                  </Pressable>
                </Row>
              ))}
            </RowList>
          </>
        ) : null}

        <Eyebrow>WATCHLIST</Eyebrow>
        {drawers.watchlist.length ? (
          <RowList style={{ paddingVertical: 2 }}>
            {drawers.watchlist.map((w, i) => (
              <Row key={w.symbol} last={i === drawers.watchlist.length - 1} style={{ paddingVertical: 10 }}>
                <Pressable
                  testID={`drawer-watch-${w.symbol}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${w.symbol}`}
                  onPress={() => onOpenSymbol(w.symbol)}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 44 }}
                >
                  <View style={{ flex: 1 }}>
                    <T size={14} weight="bold">{w.symbol}</T>
                    {w.name ? <T size={10} c={color.muted} numberOfLines={1}>{w.name}</T> : null}
                  </View>
                  <Price quote={w.quote} size={12} markSize={9} showChange />
                </Pressable>
              </Row>
            ))}
          </RowList>
        ) : (
          <T size={12.5} lh={18} c={color.muted}>
            Your watchlist is empty. Open a symbol and star it — Kai keeps an eye on what you keep here.
          </T>
        )}

        {drawers.recent.length ? (
          <>
            <Eyebrow>RECENT</Eyebrow>
            <RowList style={{ paddingVertical: 2 }}>
              {drawers.recent.map((r, i) => (
                <Row key={`r-${r.symbol}`} last={i === drawers.recent.length - 1} style={{ paddingVertical: 10 }}>
                  <Pressable
                    testID={`drawer-recent-${r.symbol}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${r.symbol}`}
                    onPress={() => onOpenSymbol(r.symbol)}
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 44 }}
                  >
                    <View style={{ flex: 1 }}>
                      <T size={14} weight="bold">{r.symbol}</T>
                      {r.name ? <T size={10} c={color.muted} numberOfLines={1}>{r.name}</T> : null}
                    </View>
                    <Price quote={r.quote} size={12} markSize={9} showChange />
                  </Pressable>
                </Row>
              ))}
            </RowList>
          </>
        ) : null}

        <View style={{ height: 1, backgroundColor: alpha.ivory08, marginTop: 4 }} />
        <T size={10.5} lh={15} c={color.dim}>
          Paper account. Nothing here is a real order, a real position or real money.
        </T>
      </ScrollView>
    </Sheet>
  );
}
