/**
 * BEAT THREE — take it.
 *
 * War Room UX §5: an Order Confirmation Card materialises showing entry, stop,
 * target, size, risk and R-multiple, with SEND and CANCEL. And the rule that
 * governs the whole beat:
 *
 *     "No tap-to-send is ever silent. Every order has a voice confirmation +
 *      visual receipt."
 *
 * So there is no state here where something was sent and the screen looks the
 * same as before. Send replaces the card with a receipt, the receipt says in
 * words what the engine says in enums, and it keeps saying it as the order
 * settles.
 *
 * RISK BEFORE CONFIRMATION (spec 10 §10). The dollars at risk and the sentence
 * about what happens at the stop are ABOVE the send button, not beside it and
 * not under it. A person should not be able to reach that button without having
 * passed the number.
 *
 * ACCEPTED IS NOT FILLED, anywhere, ever.
 */
import React from 'react';
import { View } from 'react-native';
import { T, Eyebrow, Num } from '../../ui/Text';
import { ObjectCard } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { Rule } from '../../ui/DataRow';
import { alpha, color, radius } from '../../ui/tokens';
import { Check } from '../../ui/Icons';
import type { OrderPreview, OrderRow } from '../orders/types';
import { rPlain, riskOf, type TradeRead } from './read';
import type { TakeSize } from './useTake';
import { PAPER_VENUE } from './venues';

const money = (n: number | null | undefined, dp = 2) =>
  n == null ? '—' : `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;

function Line({ label, value, tint, testID }: {
  label: string; value: string; tint?: string; testID?: string;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 12, paddingVertical: 6 }}>
      <T size={12.5} c={color.muted} style={{ flex: 1 }}>{label}</T>
      <Num size={14} weight="bold" c={tint ?? color.text} testID={testID}>{value}</Num>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* The confirmation card                                                */
/* ------------------------------------------------------------------ */

export function ConfirmCard({
  read, preview, size, sending, error, onSend, onCancel,
}: {
  read: TradeRead;
  preview: OrderPreview;
  size: TakeSize;
  sending: boolean;
  error: string | null;
  onSend: () => void;
  onCancel: () => void;
}) {
  const entry = read.because.find((l) => l.key === 'entry')?.price ?? null;
  const stop = read.because.find((l) => l.key === 'stop')?.price ?? null;
  const target = read.because.find((l) => l.key === 'target')?.price ?? null;
  const shares = preview.qty ?? size.shares;
  const r = riskOf(entry, stop, target, shares);
  const risk = preview.max_loss ?? r.risk_usd ?? size.risk_usd;
  const verdict = preview.risk.verdict;
  const verdictTint = verdict === 'blocker' ? color.red : verdict === 'advisory' ? color.gold : color.green;

  return (
    <View style={{ gap: 14 }} testID="beat-take">
      <ObjectCard tone="volt" r={radius.xxl} testID="order-confirmation-card" style={{ padding: 16, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 6 }}>
          <Eyebrow c={color.volt}>CONFIRM THIS ORDER</Eyebrow>
          <T size={11} weight="bold" ls={0.8} c={color.muted} testID="confirm-venue">
            {PAPER_VENUE.label.toUpperCase()}
          </T>
        </View>

        <T size={17} weight="bold" testID="confirm-recap">
          {preview.side_label} {preview.symbol}
          {shares != null ? ` · ${shares} ${shares === 1 ? 'share' : 'shares'}` : ''}
        </T>

        <View style={{ paddingTop: 8 }}>
          <Line label="Entry" value={entry == null ? '—' : money(entry)} tint={color.cyan} testID="confirm-entry" />
          <Rule />
          <Line label="Stop" value={stop == null ? '—' : money(stop)} tint={color.red} testID="confirm-stop" />
          <Rule />
          <Line label="Target" value={target == null ? '—' : money(target)} tint={color.green} testID="confirm-target" />
          <Rule />
          <Line label="Size" value={shares == null ? '—' : `${shares}`} testID="confirm-size" />
          <Rule />
          <Line
            label="Risk if the stop executes"
            value={risk == null ? 'not known' : money(risk)}
            tint={color.red}
            testID="confirm-risk"
          />
          <Rule />
          <Line
            label="Reward for that risk"
            value={rPlain(r.r_multiple) ?? 'not known'}
            testID="confirm-r"
          />
        </View>

        <View style={{ paddingTop: 10, gap: 6 }}>
          <T size={12.5} lh={18} c={color.muted} testID="confirm-size-plain">
            {size.plain}
            {preview.est_cost != null ? ` It costs about ${money(preview.est_cost, 0)} of buying power.` : ''}
          </T>
          {preview.hard_stop_plain ? (
            <T size={12.5} lh={18} c={color.text} testID="confirm-hard-stop">{preview.hard_stop_plain}</T>
          ) : null}
          <T size={12.5} lh={18} c={verdictTint} testID="confirm-risk-verdict">{preview.risk.headline}</T>
          {preview.risk.blockers.map((b) => (
            <T key={b.code} size={12.5} lh={18} c={color.red}>{b.message}</T>
          ))}
          {preview.risk.advisories.map((a) => (
            <T key={a.code} size={12.5} lh={18} c={color.gold}>{a.message}</T>
          ))}
        </View>
      </ObjectCard>

      {error ? (
        <T size={13} lh={19} c={color.red} testID="confirm-error">{error}</T>
      ) : null}

      <View style={{ gap: 9 }}>
        <Button
          label={sending ? 'Sending…' : 'Send it'}
          kind="volt"
          height={52}
          loading={sending}
          disabled={sending || verdict === 'blocker'}
          onPress={onSend}
          testID="confirm-send"
          accessibilityHint={`Places a paper order to ${preview.side_label.toLowerCase()} ${preview.symbol}. Nothing is sent until you press this.`}
        />
        <Button
          label="Cancel"
          kind="ghost"
          height={44}
          disabled={sending}
          onPress={onCancel}
          testID="confirm-cancel"
        />
      </View>

      <T size={11.5} lh={17} c={color.dim} testID="confirm-footer">
        {preview.footer_plain ?? `Nothing is sent until you confirm.${preview.quote_clock ? ` Quote ${preview.quote_clock}.` : ''}`}
        {' '}{PAPER_VENUE.plain}
      </T>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* The receipt                                                          */
/* ------------------------------------------------------------------ */

export function Receipt({
  order, plain, onOpenOrder, onOpenPosition, onDone,
}: {
  order: OrderRow;
  plain: string;
  onOpenOrder: () => void;
  onOpenPosition: () => void;
  onDone: () => void;
}) {
  const filled = order.status === 'filled' || order.status === 'partially_filled';
  const tint = order.status === 'rejected' || order.status === 'cancelled' ? color.red : filled ? color.green : color.volt;
  return (
    <View style={{ gap: 14 }} testID="order-receipt">
      <View style={{ alignItems: 'center', gap: 12, paddingTop: 6 }}>
        <View
          style={{
            width: 64, height: 64, borderRadius: 999, alignItems: 'center', justifyContent: 'center',
            borderWidth: 1, borderColor: tint === color.green ? alpha.green40 : alpha.volt40,
            backgroundColor: tint === color.green ? alpha.green12 : alpha.volt08,
          }}
        >
          <Check size={26} color={tint} />
        </View>
        <T size={13.5} lh={20} align="center" testID="receipt-plain" style={{ paddingHorizontal: 8 }}>{plain}</T>
      </View>

      <ObjectCard r={radius.xl} style={{ paddingHorizontal: 15, paddingVertical: 4 }} testID="receipt-detail">
        <Line label="Status" value={order.status_label} tint={tint} testID="receipt-status" />
        <Rule />
        <Line
          label="Filled so far"
          value={order.filled_qty == null ? '—' : `${order.filled_qty} of ${order.qty ?? order.filled_qty}`}
          testID="receipt-filled"
        />
        <Rule />
        <Line
          label="Average fill"
          value={order.avg_fill_price == null ? 'not filled yet' : money(order.avg_fill_price)}
          testID="receipt-avg"
        />
        <Rule />
        <Line label="Account" value={PAPER_VENUE.label} testID="receipt-account" />
      </ObjectCard>

      {order.status_detail ? (
        <T size={12.5} lh={18} c={color.muted} testID="receipt-detail-plain">{order.status_detail}</T>
      ) : null}

      <View style={{ gap: 9 }}>
        <Button
          label={order.position_id ? 'Open the position' : 'Open the order'}
          kind="outline"
          height={46}
          onPress={order.position_id ? onOpenPosition : onOpenOrder}
          testID="receipt-primary"
        />
        <Button label="Back to the chart" kind="ghost" height={42} onPress={onDone} testID="receipt-done" />
      </View>

      <T size={11.5} lh={17} c={color.dim}>{PAPER_VENUE.plain}</T>
    </View>
  );
}
