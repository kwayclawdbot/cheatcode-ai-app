/**
 * `/order/confirmed` — the SUBMISSION RECEIPT.
 *
 * The original board said "Sent to Robinhood". There is no broker on this stack
 * and spec 10 §10 requires that paper and live stay unmistakable, so the
 * headline is **Paper order submitted.** — the word "Paper" is in the headline
 * itself, not only in a chip beside it, which is what F08's acceptance ("Paper
 * is visible at final confirmation AND on the receipt") is asking for.
 *
 * ROUND 5 — "Practice with confidence", Submission Receipt. The board's beat is
 * a two-step tracker: Submitted ● "Waiting to fill" ─── ○ Filled "—". That
 * em-dash is the whole point of the screen. `accepted` is not `filled`, so the
 * second step stays open and says nothing until the engine says something, and
 * the screen keeps re-reading `GET /orders/:id` rather than assuming.
 *
 * The tracker is `OrderProgress` in `features/orders/ExecutionUI`, built on
 * `orderSteps` — see `vocabulary.ts` for why the kit's own `TradeStatusStrip`
 * is not the right component for an ORDER's life.
 *
 * F08 vocabulary: the primary is `View order` while it is working and
 * `Review position` once there is a position, from the one list.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, ScrollView } from 'react-native';
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
import { OrderProgress, ObjectStateStrip } from '../../features/orders/ExecutionUI';
import { ACTION_LABEL, orderSteps, stateForOrderStatus } from '../../features/orders/vocabulary';
import type { OrderRow } from '../../features/orders/types';

const TERMINAL = new Set(['filled', 'cancelled', 'rejected']);

const TYPE_LABEL = { market: 'Market', limit: 'Limit', stop: 'Stop' } as const;

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
    ? `${order.symbol} · ${order.side_label} ${shareLabel(order.qty)}`
    : '';

  return (
    <Screen variant="dome" layout="tab" testID="screen-order-confirmed">
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 44, paddingBottom: 28, alignItems: 'center' }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            width: 72, height: 72, borderRadius: 36,
            backgroundColor: `${accent}1F`, borderWidth: 1, borderColor: `${accent}88`,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Check size={32} color={accent} strokeWidth={2.4} />
        </View>

        {/* "Paper" is in the sentence itself. A chip alone can be skimmed past. */}
        <T size={24} weight="bold" align="center" style={{ marginTop: 20 }} testID="confirmed-headline">
          {rejected
            ? (order?.status_label ?? 'Paper order not placed')
            : filled
              ? 'Paper order filled.'
              : 'Paper order submitted.'}
        </T>

        <T size={14} c={color.muted} align="center" lh={21} style={{ marginTop: 8 }} testID="confirmed-recap">
          {recap}
        </T>
        <View style={{ marginTop: 10 }}><PaperChip testID="confirmed-paper-chip" /></View>

        {/* The two steps. Nothing here claims a fill the engine has not reported. */}
        {order ? (
          <View style={{ alignSelf: 'stretch', marginTop: 20 }}>
            <OrderProgress steps={orderSteps(order)} testID="confirmed-progress" />
          </View>
        ) : null}

        {order ? (
          <ObjectCard r={radius.xl} style={{ marginTop: 10, paddingHorizontal: 15, paddingVertical: 4, alignSelf: 'stretch' }}>
            {[
              { label: 'Order type', value: TYPE_LABEL[order.order_type] },
              ...(order.limit_price != null ? [{ label: 'Limit price', value: money(order.limit_price) }] : []),
              { label: 'Quantity', value: shareLabel(order.qty) },
              {
                label: 'Filled',
                value: `${order.filled_qty ?? 0} of ${order.qty ?? '—'}`,
              },
              { label: 'Average fill', value: order.avg_fill_price != null ? money(order.avg_fill_price) : 'Not yet' },
              { label: 'Account', value: 'Paper practice' },
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

        <ObjectCard tone="kai" r={radius.xl} style={{ marginTop: 10, padding: 14, flexDirection: 'row', gap: 10, alignSelf: 'stretch' }}>
          <KaiOrb size={24} />
          <T size={13} lh={20} style={{ flex: 1 }} testID="confirmed-kai-line">
            {rejected
              ? (order?.status_detail ?? 'Nothing was placed. Nothing was charged — this is a practice account.')
              : filled
                ? 'It filled. The stop and the target are attached as paper legs, and I am watching both.'
                : 'The order is in. A position appears after it fills.'}
          </T>
        </ObjectCard>

        {/* Where this object is now, and the one action that follows from it. */}
        {order ? (
          <View style={{ alignSelf: 'stretch', marginTop: 10 }}>
            <ObjectStateStrip
              state={stateForOrderStatus(order.status)}
              meta={shareLabel(order.qty)}
              plain={order.status_detail}
              /* `confirmed-status` is the name the existing browser proofs read
                 the order's state by. The row it used to sit on is gone — the
                 tracker above says the same thing better — so the name moves
                 here rather than disappearing. */
              testID="confirmed-status"
            />
          </View>
        ) : null}

        {error ? <T size={12} c={color.red} align="center" style={{ marginTop: 10 }}>{error}</T> : null}

        <View style={{ alignSelf: 'stretch', marginTop: 18 }}>
          {filled && order?.position_id ? (
            <Button
              label={ACTION_LABEL.review_position}
              height={52}
              size={16}
              arrow
              testID="confirmed-primary"
              onPress={() => router.replace(`/position/${encodeURIComponent(order.position_id as string)}` as never)}
            />
          ) : (
            <Button
              label={rejected ? 'Back to the chart' : ACTION_LABEL.view_order}
              height={52}
              size={16}
              arrow={!rejected}
              testID="confirmed-primary"
              onPress={() => router.replace(
                (rejected
                  ? `/trade/${encodeURIComponent(order?.symbol ?? String(params.symbol ?? ''))}`
                  : `/order/${encodeURIComponent(id)}`) as never,
              )}
            />
          )}
          <View style={{ height: 8 }} />
          <Button
            label="Back to chart"
            kind="ghost"
            height={46}
            testID="confirmed-done"
            onPress={() => router.replace(
              (order?.symbol
                ? `/trade/${encodeURIComponent(order.symbol)}`
                : '/home') as never,
            )}
          />
        </View>

        <T size={11} c={color.dim} align="center" lh={16} style={{ marginTop: 10 }}>
          Paper fills use delayed prices, so a real fill would not be identical.
        </T>
      </ScrollView>
    </Screen>
  );
}
