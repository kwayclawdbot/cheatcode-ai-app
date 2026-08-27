/**
 * Order ticket — `/order/new?symbol=&side=&plan=&setup=`.
 *
 * The familiar brokerage ticket (audit §7): side, size, order type, price,
 * duration, estimated total, buying power. Nothing is priced by the server here
 * and nothing is sent — this screen only assembles the ticket and hands it to
 * `/order/review`, which is the ONE place an order is previewed and confirmed.
 *
 * Size can be shares or dollars; dollars is the default for a beginner because
 * "$650 of META" is a decision a person can actually make, and it is what makes
 * a fractional quantity like 1.29 shares appear on the review screen.
 */
import React, { useMemo, useState } from 'react';
import { View, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { StackHeader } from '../../ui/StackHeader';
import { T, Num, Eyebrow } from '../../ui/Text';
import { ObjectCard } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { Field } from '../../ui/Field';
import { Segmented } from '../../ui/Segmented';
import { color, radius } from '../../ui/tokens';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';
import { useTradeResource } from '../../features/trade/resource';
import { DetailRow, PaperChip, QuoteLine, money } from '../../features/trade/components';
import { SIDE_LABEL, isBuySide } from '../../features/orders/types';
import type { OrderDuration, OrderSide, OrderType } from '../../features/orders/types';
import type { GoalMode, Me, Quote } from '../../lib/types';

type SizeMode = 'dollars' | 'shares';

const readSide = (v: string | undefined): OrderSide => {
  const s = String(v ?? '');
  return s === 'sell_to_close' || s === 'sell_short' || s === 'buy_to_cover' ? (s as OrderSide) : 'buy_to_open';
};

export default function OrderTicket() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    symbol?: string; side?: string; plan?: string; setup?: string; qty?: string; amount?: string; limit?: string;
  }>();
  const { profile } = useSession();
  const mode = (profile?.primary_mode as GoalMode) ?? 'day_trade';

  const symbol = String(params.symbol ?? '').toUpperCase();
  // A prefill of 0 is not a prefill — it comes from a plan the server could not
  // size, and showing "0" in the box reads as a number the user chose.
  const positive = (v: string | undefined) => (Number(v) > 0 ? String(Number(v)) : '');
  const [side, setSide] = useState<OrderSide>(readSide(params.side));
  const [sizeMode, setSizeMode] = useState<SizeMode>(positive(params.qty) ? 'shares' : 'dollars');
  const [amount, setAmount] = useState(positive(params.amount));
  const [qty, setQty] = useState(positive(params.qty));
  const [type, setType] = useState<OrderType>(params.limit ? 'limit' : 'market');
  const [limit, setLimit] = useState(String(params.limit ?? ''));
  const [stop, setStop] = useState('');
  const [duration, setDuration] = useState<OrderDuration>('day');
  const [touched, setTouched] = useState(false);

  /** The account (buying power) and the symbol's quote, both real when live. */
  const me = useTradeResource<Me | null>(() => (api.available() ? api.me() : Promise.resolve(null)), []);
  const detail = useTradeResource<{ quote: Quote | null; name: string | null }>(
    async () => {
      if (!symbol || !api.available()) return { quote: null, name: null };
      const d = await api.symbolDetail(symbol, mode);
      return { quote: d.quote, name: d.name ?? null };
    },
    [symbol, mode],
  );

  const quote = detail.data?.quote ?? null;
  const buyingPower = me.data?.paper?.buying_power ?? me.data?.paper?.equity ?? null;
  const price = type === 'limit' && Number(limit) > 0 ? Number(limit) : quote?.price ?? null;

  /**
   * Dollars are a convenience, not a promise: the paper engine buys WHOLE
   * shares, so $200 of a $576 stock is zero shares, not a third of one. The
   * ticket converts here and says the real number, rather than letting the
   * server reject the order after the user has already confirmed it.
   */
  const impliedShares = useMemo(() => {
    if (sizeMode === 'shares') return Number(qty) > 0 ? Math.floor(Number(qty)) : null;
    return Number(amount) > 0 && price ? Math.floor(Number(amount) / price) : null;
  }, [sizeMode, amount, qty, price]);

  const estTotal = useMemo(
    () => (impliedShares != null && impliedShares > 0 && price ? impliedShares * price : null),
    [impliedShares, price],
  );

  const sizeError = !touched
    ? null
    : impliedShares != null && impliedShares < 1 && price
      ? `That is less than one share. One share of ${symbol} is about ${money(price)}.`
      : !estTotal ? 'Tell me how much of it you want.' : null;
  const priceError =
    touched && type !== 'market' && !(Number(type === 'limit' ? limit : stop) > 0)
      ? `A ${type} order needs a price.`
      : null;
  const powerError =
    isBuySide(side) && estTotal != null && buyingPower != null && estTotal > buyingPower
      ? `That is more than your ${money(buyingPower, 0)} of buying power.`
      : null;

  const review = () => {
    setTouched(true);
    if (!estTotal || (impliedShares ?? 0) < 1
      || (type !== 'market' && !(Number(type === 'limit' ? limit : stop) > 0)) || powerError) return;
    const q = new URLSearchParams({
      symbol,
      side,
      order_type: type,
      duration,
      // Whole shares, resolved here, so the review prices exactly what was shown.
      qty: String(impliedShares),
      ...(sizeMode === 'dollars' ? { amount: String(Number(amount)) } : null),
      ...(type === 'limit' ? { limit: String(Number(limit)) } : null),
      ...(type === 'stop' ? { stop: String(Number(stop)) } : null),
      ...(params.plan ? { plan: String(params.plan) } : null),
      ...(params.setup ? { setup: String(params.setup) } : null),
    });
    router.push(`/order/review?${q.toString()}`);
  };

  const sideOptions: { key: OrderSide; label: string }[] =
    side === 'sell_to_close' || side === 'buy_to_cover'
      ? [{ key: side, label: `${SIDE_LABEL[side]} ${symbol}` }]
      : [
        { key: 'buy_to_open', label: 'Buy' },
        { key: 'sell_short', label: 'Short' },
      ];

  return (
    <Screen variant="corner" layout="tab" testID="screen-order-ticket">
      <StackHeader
        title={`${SIDE_LABEL[side]} ${symbol || 'order'}`}
        subtitle={detail.data?.name ?? null}
        right={<PaperChip />}
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28, gap: 12 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {sideOptions.length > 1 ? (
          <Segmented options={sideOptions} value={side} onChange={setSide} testID="side" />
        ) : null}

        <Eyebrow>HOW MUCH</Eyebrow>
        <Segmented
          options={[{ key: 'dollars', label: 'Dollars' }, { key: 'shares', label: 'Shares' }] as { key: SizeMode; label: string }[]}
          value={sizeMode}
          onChange={setSizeMode}
          testID="size-mode"
        />
        {sizeMode === 'dollars' ? (
          <Field
            label="Amount"
            testID="field-amount"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="650"
            error={sizeError}
          />
        ) : (
          <Field
            label="Shares"
            testID="field-qty"
            value={qty}
            onChangeText={setQty}
            keyboardType="decimal-pad"
            placeholder="1.29"
            error={sizeError}
          />
        )}
        {impliedShares != null ? (
          <T size={11} c={color.muted} lh={16} style={{ paddingHorizontal: 4 }}>
            {sizeMode === 'dollars'
              ? `That buys ${impliedShares} share${impliedShares === 1 ? '' : 's'} at about ${price != null ? money(price) : "today's price"}${estTotal != null ? ` — ${money(estTotal)}` : ''}. Paper orders are whole shares.`
              : `About ${money(estTotal)} at ${price != null ? money(price) : "today's price"}.`}
          </T>
        ) : null}

        <Eyebrow>HOW IT GOES IN</Eyebrow>
        <Segmented
          options={[
            { key: 'market', label: 'Market' },
            { key: 'limit', label: 'Limit' },
            { key: 'stop', label: 'Stop' },
          ] as { key: OrderType; label: string }[]}
          value={type}
          onChange={setType}
          testID="order-type"
        />
        <T size={11} c={color.muted} lh={16} style={{ paddingHorizontal: 4 }}>
          {type === 'market'
            ? 'Fills at whatever the next price is. Paper fills use delayed prices, so it can differ from a real one.'
            : type === 'limit'
              ? 'Only fills at your price or better. It can sit unfilled all day.'
              : 'Turns into a market order once price trades through your level.'}
        </T>
        {type === 'limit' ? (
          <Field
            label="Limit price"
            testID="field-limit"
            value={limit}
            onChangeText={setLimit}
            keyboardType="decimal-pad"
            placeholder={quote?.price != null ? quote.price.toFixed(2) : '0.00'}
            error={priceError}
          />
        ) : null}
        {type === 'stop' ? (
          <Field
            label="Stop price"
            testID="field-stop"
            value={stop}
            onChangeText={setStop}
            keyboardType="decimal-pad"
            placeholder={quote?.price != null ? quote.price.toFixed(2) : '0.00'}
            error={priceError}
          />
        ) : null}

        <Eyebrow>HOW LONG IT LIVES</Eyebrow>
        <Segmented
          options={[
            { key: 'day', label: 'Today only' },
            { key: 'gtc', label: 'Until I cancel' },
          ] as { key: OrderDuration; label: string }[]}
          value={duration}
          onChange={setDuration}
          testID="duration"
        />

        <ObjectCard r={radius.xxl} style={{ paddingHorizontal: 15, paddingVertical: 4 }} testID="ticket-summary">
          <DetailRow label="Estimated total" value={estTotal != null ? money(estTotal) : '—'} testID="est-total" />
          <DetailRow label="Estimated fees" value={money(0)} />
          <DetailRow label="Buying power" value={buyingPower != null ? money(buyingPower, 0) : '—'} last />
        </ObjectCard>

        {powerError ? (
          <T size={12} c={color.red} lh={17} testID="power-error">{powerError}</T>
        ) : null}

        <QuoteLine quote={quote} note={quote ? null : 'No quote yet'} />

        <Button
          label="Review order"
          onPress={review}
          testID="cta-review"
          accessibilityHint="Shows you the full order and Kai's risk check before anything is sent"
        />
        <T size={11} c={color.dim} align="center" lh={16}>
          Nothing is sent until you confirm on the next screen.
        </T>
        <Num size={11} c={color.dim} style={{ alignSelf: 'center' }}>
          {`Practice account · ${money(buyingPower, 0)} available`}
        </Num>
      </ScrollView>
    </Screen>
  );
}
