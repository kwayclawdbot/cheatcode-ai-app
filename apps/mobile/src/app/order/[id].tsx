/**
 * One order. Reached from Trade's OPEN ORDERS rows.
 *
 * Its whole job is to keep `accepted` and `filled` visibly different, and to
 * give an accepted order the one action it has: cancel it.
 */
import React, { useState } from 'react';
import { View, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { StackHeader } from '../../ui/StackHeader';
import { T } from '../../ui/Text';
import { ObjectCard } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { ScreenLoading } from '../../ui/Loading';
import { Check } from '../../ui/Icons';
import { color, radius } from '../../ui/tokens';
import { openKaiSheet } from '../../features/kai-sheet';
import { tradeApi } from '../../lib/trade-api';
import { useTradeResource } from '../../features/trade/resource';
import { DetailRow, PaperChip, StatusDot, money, shareLabel } from '../../features/trade/components';
import type { OrderRow } from '../../features/orders/types';

const TYPE_LABEL = { market: 'Market', limit: 'Limit', stop: 'Stop' } as const;
const DURATION_LABEL = { day: 'Today only', gtc: 'Until I cancel' } as const;

export default function OrderDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const orderId = String(id ?? '');
  const { data, loading, error, notAvailable, reload } = useTradeResource<OrderRow>(
    () => tradeApi.order(orderId), [orderId],
  );
  const [cancelling, setCancelling] = useState(false);

  const cancel = async () => {
    setCancelling(true);
    try {
      await tradeApi.cancelOrder(orderId);
      reload();
    } finally {
      setCancelling(false);
    }
  };

  if (!data && loading) {
    return (
      <Screen variant="corner" layout="tab" testID="screen-order">
        <StackHeader title="Order" />
        <ScreenLoading />
      </Screen>
    );
  }

  if (!data) {
    return (
      <Screen variant="corner" layout="tab" testID="screen-order">
        <StackHeader title="Order" />
        <View style={{ paddingHorizontal: 16 }}>
          <ObjectCard r={radius.xl} style={{ padding: 18 }}>
            <T size={13} c={color.muted} lh={19}>
              {notAvailable ? "Orders aren't live on this build yet." : error ?? 'I could not find that order.'}
            </T>
          </ObjectCard>
        </View>
      </Screen>
    );
  }

  const filled = data.status === 'filled';
  const pending = data.status === 'accepted' || data.status === 'submitted' || data.status === 'partially_filled';

  return (
    <Screen variant="corner" layout="tab" testID="screen-order">
      <StackHeader title={`${data.side_label} ${data.symbol}`} subtitle={shareLabel(data.qty)} right={<PaperChip />} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28, gap: 12 }}
        showsVerticalScrollIndicator={false}
      >
        <ObjectCard
          tone={filled ? 'volt' : pending ? 'gold' : 'default'}
          r={radius.xxl}
          style={{ padding: 15, gap: 8 }}
          testID={`order-state-${data.status}`}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {filled ? <Check size={15} color={color.volt} /> : <StatusDot c={pending ? color.gold : color.muted} />}
            <T size={15} weight="bold" c={filled ? color.volt : pending ? color.gold : color.muted}>{data.status_label}</T>
          </View>
          {data.status_detail ? <T size={12} c={color.muted} lh={17}>{data.status_detail}</T> : null}
        </ObjectCard>

        <ObjectCard r={radius.xxl} style={{ paddingHorizontal: 15, paddingVertical: 4 }}>
          <DetailRow label="Order type" value={TYPE_LABEL[data.order_type]} mono={false} />
          {data.limit_price != null ? <DetailRow label="Limit price" value={money(data.limit_price)} /> : null}
          {data.stop_price != null ? <DetailRow label="Stop price" value={money(data.stop_price)} /> : null}
          <DetailRow label="Duration" value={DURATION_LABEL[data.duration]} mono={false} />
          <DetailRow label="Filled so far" value={shareLabel(data.filled_qty)} mono={false} />
          <DetailRow label="Average fill" value={data.avg_fill_price != null ? money(data.avg_fill_price) : 'Not yet'} last />
        </ObjectCard>

        {filled && data.position_id ? (
          <Button label="View position" testID="view-position" onPress={() => router.push(`/position/${encodeURIComponent(data.position_id!)}`)} />
        ) : null}
        {pending ? (
          <Button label="Cancel this order" kind="outline" loading={cancelling} onPress={cancel} testID="cancel-order" />
        ) : null}
        <Button
          label="Ask Kai about this order"
          kind="kai"
          testID="ask-kai"
          onPress={() => openKaiSheet({ context: { kind: 'order', id: data.id, symbol: data.symbol } })}
        />
        <T size={11} c={color.dim} align="center" lh={16}>
          Paper fills use delayed prices.
        </T>
      </ScrollView>
    </Screen>
  );
}
