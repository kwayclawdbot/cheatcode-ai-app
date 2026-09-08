/**
 * "SAVED PLAN (NOT LIVE)" — the levels, still readable with no network.
 *
 * The recovery board's argument in one object: the reason to keep anything at
 * all when the connection drops is not the chart, it is the three numbers a
 * member was about to trade against. Entry, stop, target — written down before
 * the signal went, and still true, because a plan is a decision the member made
 * rather than a price the market is making.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EVERY CLAIM ON THIS CARD IS DOWNGRADED ON PURPOSE
 * ─────────────────────────────────────────────────────────────────────────────
 *  - The header says "Saved plan (not live)". Not "your plan" — the parenthesis
 *    is the whole point and it is not shortenable.
 *  - The chart is drawn at reduced opacity and captioned with the instant it
 *    was fetched. Bars that stop at 8:42 drawn at full strength read as bars
 *    that stop because the market did.
 *  - `TradeMap` is the kit's renderer, unmodified. It already refuses to draw
 *    candles it does not have and says "Price history unavailable. Levels
 *    only." in its own accessibility label, which is exactly the honest failure
 *    this screen wants — so there is no fallback drawing here, only the levels.
 *  - No quote, no P/L, no "now". Nothing on this card is a live number, so
 *    nothing on it is presented as one.
 */
import React from 'react';
import { View } from 'react-native';
import { T, Num, Eyebrow } from '../../ui/Text';
import { ObjectCard } from '../../ui/Panel';
import { TradeMap } from '../../ui/trade';
import { updatedAtLabel } from '../../ui/CapabilityState';
import { alpha, color, radius } from '../../ui/tokens';
import type { Candle } from '../../lib/types';

/**
 * The kit's candle carries epoch-seconds `time`; the app's carries an ISO `t`.
 * A bar whose timestamp will not parse is dropped rather than placed at zero —
 * `validCandles` inside the kit would keep it and draw it at the far left.
 */
export function toKitCandles(candles: Candle[]): { time: number; open: number; high: number; low: number; close: number }[] {
  return candles
    .map((c) => ({ time: Date.parse(c.t) / 1000, open: c.o, high: c.h, low: c.l, close: c.c }))
    .filter((c) => Number.isFinite(c.time));
}

export function SavedPlanCard({
  symbol, direction = 'long', entry, stop, target, candles = [], fetchedAt, testID = 'saved-plan',
}: {
  symbol: string;
  direction?: 'long' | 'short';
  entry: number | null;
  stop: number | null;
  target: number | null;
  candles?: Candle[];
  /** Epoch ms the plan and bars were read from the server. */
  fetchedAt: number | null;
  testID?: string;
}) {
  const stamp = updatedAtLabel(fetchedAt, 'Saved');
  const level = (label: string, value: number | null, c: string, id: string) => (
    <View style={{ flex: 1, gap: 3 }}>
      <T size={11} c={color.dim}>{label}</T>
      {value === null ? (
        <T size={13} c={color.muted} testID={`${id}-absent`}>Not set</T>
      ) : (
        <Num size={18} weight="bold" c={c} testID={id}>{value.toFixed(2)}</Num>
      )}
    </View>
  );

  return (
    <ObjectCard testID={testID} r={radius.xxxl} style={{ padding: 15, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <T size={17} weight="bold">{symbol}</T>
        <View
          style={{
            marginLeft: 'auto',
            paddingHorizontal: 9,
            paddingVertical: 2,
            borderRadius: radius.sm,
            borderWidth: 0.5,
            borderColor: alpha.gold40,
          }}
        >
          <T size={10} weight="bold" ls={0.6} c={color.gold}>SAVED PLAN</T>
        </View>
      </View>

      {/* Greyed, because these bars stopped when the connection did. */}
      <View style={{ opacity: 0.55 }} testID="saved-plan-chart">
        <TradeMap
          idea={{
            id: `saved-${symbol}`,
            symbol,
            company: symbol,
            title: 'Saved plan',
            summary: 'Levels saved before the connection dropped.',
            direction,
            entry,
            stop,
            target,
            status: 'watching',
            candles: toKitCandles(candles),
            dataLabel: stamp ?? 'Saved · time unknown',
          }}
          compact
        />
      </View>

      <View style={{ gap: 8 }}>
        <Eyebrow>SAVED PLAN (NOT LIVE)</Eyebrow>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {level('Entry', entry, color.cyan, 'saved-entry')}
          {level('Stop', stop, color.red, 'saved-stop')}
          {level('Target', target, color.green, 'saved-target')}
        </View>
      </View>

      <T size={11} c={color.dim} testID="saved-plan-stamp">
        {stamp ? `${stamp}. Prices are not moving here.` : 'Saved before the connection dropped. Prices are not moving here.'}
      </T>
    </ObjectCard>
  );
}
