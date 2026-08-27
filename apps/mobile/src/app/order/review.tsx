/**
 * Review order — V4-TR3-Review-order.html.
 *
 * This is the ONE place an order is priced and confirmed, whether it came from
 * the ticket, from a plan, or from "Exit now" on a position (`?close=<id>`).
 *
 * The three corrections the round-3 brief asks for are all here:
 *   · the primary action says **Place paper order**, never "Submit to broker" —
 *     there is no broker;
 *   · Kai's risk check is rendered by its worst finding, so a 58% sector
 *     exposure is gold "Worth knowing", not green "Passes";
 *   · after submitting, **accepted** and **filled** are separate states with
 *     separate copy, and the screen polls `GET /orders/:id` rather than
 *     assuming the fill.
 * The preview expires; past that the numbers on screen are not the numbers that
 * would be sent, so the primary is replaced by "Get fresh numbers".
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../ui/Screen';
import { T, Num } from '../../ui/Text';
import { ObjectCard } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { ScreenLoading } from '../../ui/Loading';
import { Lock, Check } from '../../ui/Icons';
import { FreshnessMark } from '../../ui/FreshnessMark';
import { alpha, color, radius } from '../../ui/tokens';
import { openKaiSheet } from '../../features/kai-sheet';
import { tradeApi } from '../../lib/trade-api';
import { usePreview, useExpiry, useSubmit } from '../../features/orders/useOrders';
import {
  BackButton, DetailRow, KaiRiskCheck, PaperChip, Panel, RiskLine, StatusDot, money, shareLabel,
  signedPct,
} from '../../features/trade/components';
import type { OrderDuration, OrderPreview, OrderSide, OrderTicket, OrderType } from '../../features/orders/types';
import { SIDE_LABEL, isBuySide } from '../../features/orders/types';

const readSide = (v: string | undefined): OrderSide => {
  const s = String(v ?? '');
  return s === 'sell_to_close' || s === 'sell_short' || s === 'buy_to_cover' ? (s as OrderSide) : 'buy_to_open';
};
const readType = (v: string | undefined): OrderType => {
  const s = String(v ?? '');
  return s === 'limit' || s === 'stop' ? s : 'market';
};
const nOrNull = (v: string | undefined): number | null => {
  const n = Number(v);
  return v != null && v !== '' && Number.isFinite(n) ? n : null;
};

const TYPE_LABEL: Record<OrderType, string> = { market: 'Market', limit: 'Limit', stop: 'Stop' };
const DURATION_LABEL: Record<OrderDuration, string> = { day: 'Today only', gtc: 'Until I cancel' };

function BackRow({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10 }}>
      <BackButton onPress={onBack} />
      <T size={17} weight="bold">{title}</T>
    </View>
  );
}

/** The account strip at the top of TR3 — paper, and honest about it. */
function AccountStrip({ preview }: { preview: OrderPreview }) {
  return (
    <ObjectCard r={14} style={{ flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 10, paddingHorizontal: 15 }} testID="account-strip">
      <View
        style={{
          width: 30, height: 30, borderRadius: 8, backgroundColor: alpha.cyan10,
          borderWidth: 0.5, borderColor: alpha.cyan40, alignItems: 'center', justifyContent: 'center',
        }}
      >
        <T size={12} weight="bold" c={color.cyan}>P</T>
      </View>
      <View style={{ flex: 1 }}>
        <T size={10} c={color.muted}>Account</T>
        <T size={13} weight="semibold" numberOfLines={1}>{preview.account_label}</T>
      </View>
      <PaperChip />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <StatusDot c={preview.connected ? color.green : color.muted} size={5} />
        <T size={10} c={preview.connected ? color.green : color.muted}>{preview.connected ? 'Connected' : 'Offline'}</T>
      </View>
    </ObjectCard>
  );
}

export default function ReviewOrder() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    symbol?: string; side?: string; qty?: string; amount?: string; order_type?: string;
    limit?: string; stop?: string; duration?: string; plan?: string; setup?: string; close?: string;
  }>();

  const closeId = params.close ? String(params.close) : null;

  /** A close builds its ticket from the position; everything else from the URL. */
  const [closeTicketPreview, setCloseTicketPreview] = useState<OrderPreview | null>(null);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [closeLoading, setCloseLoading] = useState(!!closeId);
  const [closeNonce, setCloseNonce] = useState(0);

  useEffect(() => {
    if (!closeId) return;
    let alive = true;
    setCloseLoading(true);
    setCloseError(null);
    tradeApi.position(closeId)
      .then((p) => tradeApi.closePreview(p))
      .then((p) => { if (alive) setCloseTicketPreview(p); })
      .catch((e: unknown) => {
        if (!alive) return;
        setCloseTicketPreview(null);
        setCloseError(e instanceof Error ? e.message : 'I could not price that exit just now.');
      })
      .finally(() => { if (alive) setCloseLoading(false); });
    return () => { alive = false; };
  }, [closeId, closeNonce]);

  const ticket: OrderTicket | null = useMemo(() => {
    if (closeId) return null;
    const symbol = String(params.symbol ?? '').toUpperCase();
    if (!symbol) return null;
    return {
      symbol,
      side: readSide(params.side),
      qty: nOrNull(params.qty),
      amount: nOrNull(params.amount),
      order_type: readType(params.order_type),
      limit_price: nOrNull(params.limit),
      stop_price: nOrNull(params.stop),
      duration: String(params.duration ?? 'day') === 'gtc' ? 'gtc' : 'day',
      plan_id: params.plan ? String(params.plan) : null,
      setup_id: params.setup ? String(params.setup) : null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeId, params.symbol, params.side, params.qty, params.amount, params.order_type, params.limit, params.stop, params.duration, params.plan, params.setup]);

  const ticketPreview = usePreview(ticket);
  const preview = closeId ? closeTicketPreview : ticketPreview.preview;
  const loading = closeId ? closeLoading : ticketPreview.loading;
  const error = closeId ? closeError : ticketPreview.error;
  const repreview = closeId ? () => setCloseNonce((n) => n + 1) : ticketPreview.repreview;

  const { secondsLeft, expired } = useExpiry(preview?.expires_at);
  const { phase, order, error: submitError, submit } = useSubmit();

  const back = () => (router.canGoBack() ? router.back() : router.replace('/trade'));

  /* ---------------- after submit: accepted, then filled ---------------- */

  if (order) {
    const filled = order.status === 'filled';
    const rejected = order.status === 'rejected' || order.status === 'cancelled';
    return (
      <Screen variant="corner" layout="tab" testID="screen-order-result">
        <BackRow title="Your order" onBack={() => router.replace('/trade')} />
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28, gap: 12 }}
          showsVerticalScrollIndicator={false}
        >
          <ObjectCard
            tone={filled ? 'volt' : rejected ? 'live' : 'gold'}
            r={radius.xxl}
            style={{ padding: 16, gap: 9 }}
            testID={filled ? 'order-filled' : rejected ? 'order-rejected' : 'order-accepted'}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {filled ? <Check size={16} color={color.volt} /> : <StatusDot c={rejected ? color.red : color.gold} />}
              <T size={16} weight="bold" c={filled ? color.volt : rejected ? color.red : color.gold} testID="order-status-label">
                {order.status_label}
              </T>
            </View>
            <T size={13} lh={19}>
              {`${order.side_label} ${order.symbol} · ${shareLabel(order.qty)}${order.limit_price != null ? ` · limit ${money(order.limit_price)}` : ''}`}
            </T>
            {order.status_detail ? <T size={12} c={color.muted} lh={17}>{order.status_detail}</T> : null}
            {/* The server usually says this itself; only add it when it did not. */}
            {!filled && !rejected && !/not filled/i.test(`${order.status_label} ${order.status_detail ?? ''}`) ? (
              <T size={12} c={color.muted} lh={17}>
                Accepted is not filled. The order exists and is waiting for a price.
              </T>
            ) : null}
          </ObjectCard>

          <ObjectCard r={radius.xxl} style={{ paddingHorizontal: 15, paddingVertical: 4 }}>
            <DetailRow label="Order type" value={TYPE_LABEL[order.order_type]} mono={false} />
            {order.limit_price != null ? <DetailRow label="Limit price" value={money(order.limit_price)} /> : null}
            <DetailRow label="Filled so far" value={shareLabel(order.filled_qty)} mono={false} />
            <DetailRow label="Average fill" value={order.avg_fill_price != null ? money(order.avg_fill_price) : 'Not yet'} last />
          </ObjectCard>

          {filled && (order.position_id || preview) ? (
            <Button
              label="View position"
              testID="view-position"
              onPress={() => router.replace(order.position_id ? `/position/${encodeURIComponent(order.position_id)}` : '/position')}
            />
          ) : null}
          {!filled && !rejected ? (
            <Button label="See your orders" kind="outline" testID="see-orders" onPress={() => router.replace('/trade')} />
          ) : null}
          <Button
            label="Ask Kai about this order"
            kind="kai"
            testID="ask-kai"
            onPress={() => openKaiSheet({ context: { kind: 'order', id: order.id, symbol: order.symbol } })}
          />
          <T size={11} c={color.dim} align="center" lh={16}>
            Paper fills use delayed prices, so a real fill would not be identical.
          </T>
        </ScrollView>
      </Screen>
    );
  }

  /* ---------------- before submit ---------------- */

  if (!preview && loading) {
    return (
      <Screen variant="corner" layout="tab" testID="screen-order-review">
        <BackRow title="Review order" onBack={back} />
        <ScreenLoading label="Pricing your order…" />
      </Screen>
    );
  }

  if (!preview) {
    return (
      <Screen variant="corner" layout="tab" testID="screen-order-review">
        <BackRow title="Review order" onBack={back} />
        <View style={{ paddingHorizontal: 16, gap: 12 }}>
          <ObjectCard r={radius.xl} style={{ padding: 18 }}>
            <T size={13} c={color.muted} lh={19}>{error ?? 'I could not price that order just now.'}</T>
          </ObjectCard>
          <Button label="Try again" kind="outline" onPress={repreview} testID="cta-retry" />
        </View>
      </Screen>
    );
  }

  const blocked = preview.risk.verdict === 'blocker';
  const q = preview.quote;
  const changeUp = (q?.change_pct ?? 0) >= 0;
  const canPlace = !blocked && !expired && phase !== 'sending';

  return (
    <Screen variant="corner" layout="tab" testID="screen-order-review">
      <BackRow title={closeId ? 'Review exit' : 'Review order'} onBack={back} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 18, gap: 8 }}
        showsVerticalScrollIndicator={false}
      >
        <AccountStrip preview={preview} />

        <Panel style={{ paddingHorizontal: 16, paddingVertical: 4 }} testID="order-panel">
          <View style={{ paddingVertical: 9, borderBottomWidth: 0.5, borderBottomColor: alpha.ivory08, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <T size={18} weight="bold" testID="order-headline">{`${preview.side_label} ${preview.symbol}`}</T>
              <View
                style={{
                  paddingHorizontal: 8, paddingVertical: 2, borderRadius: 5,
                  backgroundColor: isBuySide(preview.side) ? alpha.volt10 : alpha.red10,
                  borderWidth: 0.5, borderColor: isBuySide(preview.side) ? alpha.volt40 : alpha.red40,
                }}
              >
                <T size={11} weight="bold" ls={0.88} c={isBuySide(preview.side) ? color.volt : color.red}>
                  {SIDE_LABEL[preview.side].toUpperCase()}
                </T>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {/* The header already says the ticker — repeating it here when the
                  server has no company name is noise, not identity. */}
              {preview.name || preview.exchange ? (
                <T size={11} c={color.muted}>{[preview.name, preview.exchange].filter(Boolean).join(' · ')}</T>
              ) : null}
              {q?.price != null ? (
                <>
                  <Num size={11} weight="regular">{q.price.toFixed(2)}</Num>
                  {q.change_pct != null ? (
                    <Num size={11} weight="regular" c={changeUp ? color.green : color.red}>{signedPct(q.change_pct)}</Num>
                  ) : null}
                  <FreshnessMark freshness={q.freshness ?? 'unknown'} delayReason={q.delay_reason} size={10} />
                </>
              ) : null}
            </View>
          </View>

          <DetailRow label="Quantity" value={shareLabel(preview.qty)} testID="row-qty" />
          <DetailRow label="Order type" value={TYPE_LABEL[preview.order_type]} mono={false} testID="row-type" />
          {preview.limit_price != null ? <DetailRow label="Limit price" value={money(preview.limit_price)} testID="row-limit" /> : null}
          {preview.stop_price != null ? <DetailRow label="Stop price" value={money(preview.stop_price)} /> : null}
          <DetailRow label="Duration" value={DURATION_LABEL[preview.duration]} mono={false} />
          <DetailRow
            label={isBuySide(preview.side) ? 'Estimated cost' : 'Estimated proceeds'}
            value={money(preview.est_cost)}
            testID="row-cost"
          />
          <DetailRow label="Estimated fees" value={money(preview.est_fees ?? 0)} />
          <DetailRow
            label="Buying power after"
            value={preview.buying_power_after != null ? money(preview.buying_power_after) : '—'}
            last
            testID="row-power-after"
          />
        </Panel>

        <KaiRiskCheck risk={preview.risk} testID="kai-risk-check">
          {preview.stop_attached != null ? (
            <RiskLine label="Stop loss · attached" value={money(preview.stop_attached)} c={color.red} />
          ) : null}
          {preview.first_target != null ? (
            <RiskLine label="First target" value={money(preview.first_target)} c={color.green} />
          ) : null}
          {preview.max_loss != null ? (
            <RiskLine
              label="Maximum planned loss"
              value={`${money(preview.max_loss)}${preview.max_loss_pct != null ? ` (${preview.max_loss_pct.toFixed(1)}%)` : ''}`}
              c={color.red}
            />
          ) : null}
        </KaiRiskCheck>

        <Pressable
          testID="ask-kai"
          accessibilityRole="button"
          accessibilityLabel="Ask Kai to check this order"
          onPress={() => openKaiSheet({
            context: { kind: 'order', id: preview.preview_id, symbol: preview.symbol, label: `Kai · about this ${preview.side_label.toLowerCase()}` },
          })}
          style={{ alignSelf: 'center', paddingVertical: 6, minHeight: 44, justifyContent: 'center' }}
        >
          <T size={12} weight="semibold" c={color.violetLight}>Ask Kai to check this</T>
        </Pressable>

        {submitError ? <T size={12} c={color.red} lh={17} testID="submit-error">{submitError}</T> : null}
      </ScrollView>

      {/* Footer — the artboard's own three lines. */}
      <View style={{ paddingHorizontal: 16, paddingBottom: 26, paddingTop: 5, gap: 7 }}>
        {preview.hard_stop_plain || preview.max_loss != null ? (
          <T size={11} c={color.gold} align="center" testID="max-loss-line">
            {preview.hard_stop_plain
              ?? `You can lose up to ${money(preview.max_loss)} on this order if the stop executes.`}
          </T>
        ) : null}

        {expired ? (
          <>
            <T size={11} c={color.gold} align="center">
              These numbers are older than the market. Take a fresh look before anything is sent.
            </T>
            <Button label="Get fresh numbers" onPress={repreview} height={52} size={16} testID="cta-repreview" />
          </>
        ) : (
          <Button
            label={preview.confirm_label ?? (closeId ? 'Place paper exit' : 'Place paper order')}
            onPress={() => submit(preview.preview_id)}
            loading={phase === 'sending'}
            disabled={!canPlace}
            height={52}
            size={16}
            testID="cta-place"
            accessibilityHint={blocked ? 'Blocked by a rule you set' : 'Sends the paper order'}
          />
        )}

        {blocked ? (
          <T size={11} c={color.red} align="center" testID="blocked-line">
            {preview.risk.blockers[0]?.message ?? 'A rule you set blocks this order.'}
          </T>
        ) : null}

        <Button label="Edit order" kind="outline" height={44} onPress={back} testID="cta-edit" />

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Lock size={11} color={color.muted} />
          <T size={11} c={color.muted} numberOfLines={1} testID="confirm-footer">
            {/* The freshness word is dropped here because the mark below says it. */}
            {(preview.footer_plain ?? `Nothing is sent until you confirm · quote ${preview.quote_clock ?? '—'}`)
              .replace(/\s*·\s*(live|delayed|stale|closed)\s*$/i, '')}
          </T>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <FreshnessMark freshness={q?.freshness ?? 'unknown'} delayReason={q?.delay_reason} size={10} />
          {secondsLeft != null && !expired ? (
            <T size={10} c={color.dim} testID="expiry-countdown">{`· these numbers hold for ${secondsLeft}s`}</T>
          ) : null}
        </View>
      </View>
    </Screen>
  );
}
