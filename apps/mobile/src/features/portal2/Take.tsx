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
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { T, Eyebrow, Num } from '../../ui/Text';
import { ObjectCard } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { Toggle } from '../../ui/Toggle';
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
  read, preview, size, sending, error, onSend, onCancel, shareDefault = false,
}: {
  read: TradeRead;
  preview: OrderPreview;
  size: TakeSize;
  sending: boolean;
  error: string | null;
  /** The share answer for THIS order travels with the send. */
  onSend: (shareTrade: boolean) => void;
  onCancel: () => void;
  /**
   * The account-level "Share my trades" setting, read from `/me`. It is the
   * STARTING POSITION of the per-order switch and nothing more — the whole
   * point of having a switch here is that this one order can differ.
   */
  shareDefault?: boolean;
}) {
  const entry = read.because.find((l) => l.key === 'entry')?.price ?? null;
  const stop = read.because.find((l) => l.key === 'stop')?.price ?? null;
  const target = read.because.find((l) => l.key === 'target')?.price ?? null;
  const shares = preview.qty ?? size.shares;
  const r = riskOf(entry, stop, target, shares);
  const risk = preview.max_loss ?? r.risk_usd ?? size.risk_usd;
  const verdict = preview.risk.verdict;
  const verdictTint = verdict === 'blocker' ? color.red : verdict === 'advisory' ? color.gold : color.green;
  const [share, setShare] = useState(shareDefault);
  // A card that re-prices keeps the answer the person just gave; only a
  // genuinely new default (the account setting changing) moves it.
  useEffect(() => { setShare(shareDefault); }, [shareDefault]);

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

      {/*
        SHOW THIS ONE TO THE CLUB — asked HERE, per order, not only once in
        settings. Sharing a trade is a decision about a particular trade, and
        an account-level switch alone would mean somebody's worst idea goes out
        because of a choice they made weeks earlier about a different one. The
        account setting is the starting position; this is the answer.

        It sits BELOW the risk block and ABOVE the send button, in the same
        order the rest of this card follows: you pass the number, then you pass
        the audience, then you send.
      */}
      <View
        testID="confirm-share"
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 12,
          paddingVertical: 11, paddingHorizontal: 14, borderRadius: radius.xl,
          borderWidth: 0.5, borderColor: share ? alpha.volt50 : alpha.ivory12,
          backgroundColor: share ? alpha.volt08 : 'transparent',
        }}
      >
        <View style={{ flex: 1 }}>
          <T size={13} weight="semibold" c={share ? color.volt : color.text}>Show this one to the club</T>
          <T size={11.5} lh={16.5} c={color.muted} style={{ marginTop: 3 }}>
            {share
              ? 'Direction and levels only. Your size and your dollars are never shown.'
              : 'Off. Nobody sees this trade.'}
          </T>
        </View>
        <Toggle
          testID="toggle-share-this-trade"
          value={share}
          label="Show this trade to the club"
          disabled={sending}
          onChange={setShare}
        />
      </View>

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
          onPress={() => onSend(share)}
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
