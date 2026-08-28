/**
 * `/order/confirmed` — Order-confirmed.html, with the copy the product can
 * actually keep.
 *
 * The board says "Sent to Robinhood". There is no broker on this stack, and
 * spec 10 §10 requires that "paper and live trading states remain unmistakable
 * throughout the flow", so the headline is **Placed · paper account**. Every
 * other beat of the board is intact: the green check, the one-line order recap,
 * the Kai note that the order is being watched and has NOT filled, and the two
 * actions — View pending order / Done.
 *
 * Then the two states stay distinct (round-3 rule, unchanged): accepted is not
 * filled, and the screen polls `GET /orders/:id` rather than assuming a fill.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { T, Num } from '../../ui/Text';
import { ObjectCard } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { KaiOrb } from '../../ui/KaiOrb';
import { Check } from '../../ui/Icons';
import { ScreenLoading } from '../../ui/Loading';
import { alpha, color, radius } from '../../ui/tokens';
import { tradeApi } from '../../lib/trade-api';
import { money, shareLabel, PaperChip } from '../../features/trade/components';
import type { OrderRow } from '../../features/orders/types';

const TERMINAL = new Set(['filled', 'cancelled', 'rejected']);

export default function OrderConfirmed() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; symbol?: string }>();
  const id = params.id ? String(params.id) : '';

  const [order, setOrder] = useState<OrderRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stopped = useRef(false);

  useEffect(() => () => { stopped.current = true; }, []);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const budget = Date.now() + 25_000;

    const tick = async () => {
      try {
        const o = await tradeApi.order(id);
        if (cancelled) return;
        setOrder(o);
        if (!TERMINAL.has(o.status) && Date.now() < budget) setTimeout(tick, 1600);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'I could not read that order back.');
      }
    };
    void tick();
    return () => { cancelled = true; };
  }, [id]);

  if (!id) {
    return (
      <Screen variant="dome" layout="tab" testID="screen-order-confirmed">
        <View style={{ padding: 16 }}>
          <T size={13} c={color.muted}>No order was passed to this screen.</T>
        </View>
      </Screen>
    );
  }

  if (!order && !error) {
    return (
      <Screen variant="dome" layout="tab" testID="screen-order-confirmed">
        <ScreenLoading label="Confirming your paper order…" />
      </Screen>
    );
  }

  const filled = order?.status === 'filled';
  const rejected = order?.status === 'rejected' || order?.status === 'cancelled';
  const accent = rejected ? color.red : filled ? color.volt : color.green;

  const recap = order
    ? `${order.side_label} ${order.symbol} · ${shareLabel(order.qty)}${order.limit_price != null ? ` · limit ${money(order.limit_price)}` : ''}`
    : '';

  return (
    <Screen variant="dome" layout="tab" testID="screen-order-confirmed">
      <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 24, paddingTop: 56, paddingBottom: 28 }}>
        <View
          style={{
            width: 72, height: 72, borderRadius: 36,
            backgroundColor: `${accent}1F`, borderWidth: 1, borderColor: `${accent}88`,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Check size={32} color={accent} strokeWidth={2.4} />
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 20 }}>
          <T size={24} weight="bold" testID="confirmed-headline">
            {rejected ? (order?.status_label ?? 'Not placed') : filled ? 'Filled · paper account' : 'Placed · paper account'}
          </T>
        </View>
        <View style={{ marginTop: 8 }}><PaperChip testID="confirmed-paper-chip" /></View>

        <T size={14} c={color.muted} align="center" lh={21} style={{ marginTop: 10 }} testID="confirmed-recap">
          {recap}
        </T>
        <T size={13} c={color.muted} align="center" lh={20} style={{ marginTop: 2 }}>
          {filled
            ? 'The stop and target are attached as paper legs.'
            : 'Stop and target attach as paper legs the moment it fills.'}
        </T>

        <ObjectCard tone="kai" r={radius.xl} style={{ marginTop: 22, padding: 14, flexDirection: 'row', gap: 10, alignSelf: 'stretch' }}>
          <KaiOrb size={24} />
          <T size={13} lh={20} style={{ flex: 1 }} testID="confirmed-kai-line">
            {rejected
              ? (order?.status_detail ?? 'Nothing was placed. Nothing was charged — this is a practice account.')
              : filled
                ? 'It filled. I am watching the stop and the target from here.'
                : 'Your paper order exists and has not filled yet — I am watching it and will tell you the moment it does.'}
          </T>
        </ObjectCard>

        {order ? (
          <ObjectCard r={radius.xl} style={{ marginTop: 10, paddingHorizontal: 15, paddingVertical: 4, alignSelf: 'stretch' }}>
            {[
              { label: 'Status', value: order.status_label },
              { label: 'Filled so far', value: shareLabel(order.filled_qty) },
              { label: 'Average fill', value: order.avg_fill_price != null ? money(order.avg_fill_price) : 'Not yet' },
            ].map((row, i, all) => (
              <View
                key={row.label}
                style={{
                  flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9,
                  borderBottomWidth: i === all.length - 1 ? 0 : 0.5, borderBottomColor: alpha.ivory08,
                }}
              >
                <T size={12.5} c={color.muted}>{row.label}</T>
                <Num size={12.5} weight="semibold" testID={`confirmed-${row.label.toLowerCase().replace(/\s+/g, '-')}`}>
                  {row.value}
                </Num>
              </View>
            ))}
          </ObjectCard>
        ) : null}

        {error ? <T size={12} c={color.red} align="center" style={{ marginTop: 10 }}>{error}</T> : null}

        <View style={{ flex: 1 }} />

        {filled && order?.position_id ? (
          <Button
            label="View position"
            height={52}
            size={16}
            testID="confirmed-primary"
            onPress={() => router.replace(`/position/${encodeURIComponent(order.position_id as string)}` as never)}
            style={{ alignSelf: 'stretch' }}
          />
        ) : (
          <Button
            label={rejected ? 'Back to the chart' : 'View pending order'}
            height={52}
            size={16}
            testID="confirmed-primary"
            onPress={() => router.replace(
              (rejected
                ? `/trade/${encodeURIComponent(order?.symbol ?? String(params.symbol ?? ''))}`
                : `/order/${encodeURIComponent(id)}`) as never,
            )}
            style={{ alignSelf: 'stretch' }}
          />
        )}
        <View style={{ height: 8 }} />
        <Button
          label="Done"
          kind="outline"
          height={46}
          testID="confirmed-done"
          onPress={() => router.replace('/home' as never)}
          style={{ alignSelf: 'stretch' }}
        />
        <T size={11} c={color.dim} align="center" lh={16} style={{ marginTop: 10 }}>
          Paper fills use delayed prices, so a real fill would not be identical.
        </T>
      </View>
    </Screen>
  );
}
