import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { color } from '../../ui/tokens';
import { T, Num } from '../../ui/Text';
import { Card } from '../../ui/Card';
import { TickerMark } from '../../ui/Ticker';
import { GradeBadge } from '../../ui/GradeBadge';
import { PriceTriplet } from '../../ui/PriceTriplet';
import { Button } from '../../ui/Button';
import { FreshnessMark } from '../../ui/FreshnessMark';
import { env } from '../../lib/env';
import { fixtureCandles } from '../../lib/fixtures';
import { usePriorityCandles } from './useHomeV5';
import { rMultiple } from './agent';
import type { Candle, GoalMode, GradedSetup } from '../../lib/types';

/**
 * THE SETUP TOOL CARD — a setup Kai put in the conversation (V2, panel 1).
 *
 * Order, from the spec: ticker and mode → the grade → current price and the
 * day's change → entry, stop, target and R → one orange action. The whole
 * card is compact because it lives in a thread; the full instrument is one tap
 * away on the setup's own page.
 *
 * Nothing on it is invented. The price and change are the setup's own quote
 * (with its freshness mark — no price without one); the line is the symbol's
 * real 5-minute bars, and there is no line when there are no bars; R is worked
 * out only when all three levels are numbers, and is left off otherwise.
 */

const MODE_WORD: Record<GoalMode, string> = { day_trade: 'Day Trade', swing: 'Swing', invest: 'Invest' };

const num = (v: string | null | undefined): number | null => {
  const m = String(v ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
};

function Sparkline({ candles, up, width = 80, height = 32 }: { candles: readonly Candle[]; up: boolean; width?: number; height?: number }) {
  const d = useMemo(() => {
    const closes = candles.map((c) => c.c).filter((v) => Number.isFinite(v));
    if (closes.length < 2) return null;
    const lo = Math.min(...closes);
    const hi = Math.max(...closes);
    const span = hi - lo || 1;
    return closes
      .map((v, i) => `${i === 0 ? 'M' : 'L'}${((i / (closes.length - 1)) * width).toFixed(1)} ${(height - 2 - ((v - lo) / span) * (height - 4)).toFixed(1)}`)
      .join(' ');
  }, [candles, width, height]);
  if (!d) return null;
  return (
    <View aria-hidden>
      <Svg width={width} height={height}>
        <Path d={d} stroke={up ? color.marketUp : color.marketDown} strokeWidth={1.75} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      </Svg>
    </View>
  );
}

export function SetupToolCard({ setup, mode, testID }: { setup: GradedSetup; mode: GoalMode; testID?: string }) {
  const router = useRouter();
  const candles = usePriorityCandles(setup.symbol, env.FIXTURES ? fixtureCandles : []);
  const q = setup.quote ?? null;
  const price = q?.price ?? null;
  const pct = q?.change_pct ?? null;
  const up = (pct ?? q?.change ?? 0) >= 0;
  const entry = num(setup.entry);
  const stop = num(setup.invalid);
  const target = num(setup.target);
  const r = rMultiple(entry, stop, target);
  const direction = setup.direction === 'short' ? 'Short' : setup.direction === 'long' ? 'Long' : null;
  const ws = `/symbol/${encodeURIComponent(setup.symbol)}?setup=${encodeURIComponent(setup.id)}&tab=overview`;

  return (
    <Card testID={testID ?? `setup-card-${setup.symbol}`} style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <TickerMark symbol={setup.symbol} size={34} />
        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <T variant="cardTitle" weight="bold">{setup.symbol}</T>
          <T variant="meta" c={color.textSecondary} numberOfLines={1} style={{ flexShrink: 1 }}>
            {[MODE_WORD[mode], direction].filter(Boolean).join(' · ')}
          </T>
        </View>
        <GradeBadge grade={setup.grade_display} size="sm" />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', columnGap: 8, flexWrap: 'wrap' }}>
            <Num variant="keyPrice" testID="setup-card-price">{price != null ? `$${price.toFixed(2)}` : '—'}</Num>
            {pct != null ? (
              <Num variant="body" c={up ? color.marketUp : color.marketDown}>{`${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`}</Num>
            ) : null}
          </View>
          <FreshnessMark freshness={q?.freshness ?? 'unknown'} delayReason={q?.delay_reason} at={q?.source_ts} />
        </View>
        <Sparkline candles={candles} up={up} />
      </View>

      <PriceTriplet entry={entry} stop={stop} target={target} r={r} testID="setup-card-levels" />

      <Button
        testID="setup-card-open"
        label="Open setup"
        arrow
        height={44}
        onPress={() => router.push(ws as never)}
      />
    </Card>
  );
}
