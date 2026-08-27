import React from 'react';
import { View, ViewStyle, StyleProp } from 'react-native';
import { color } from './tokens';
import { Num, T } from './Text';
import { FreshnessMark } from './FreshnessMark';
import type { Quote } from '../lib/types';

/**
 * The only sanctioned way to put a number that came from the market on screen.
 * A price is never rendered without the freshness that belongs to it
 * (07 §10, "no price without freshness"), and an entitlement delay reads as
 * "Delayed 15m" rather than stale.
 */
export function Price({
  quote,
  size = 13,
  markSize = 10,
  align = 'flex-end',
  prefix = '',
  showChange = false,
  style,
  testID,
}: {
  quote: Quote | null | undefined;
  size?: number;
  markSize?: number;
  align?: 'flex-end' | 'flex-start';
  prefix?: string;
  showChange?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  if (!quote || quote.price == null) {
    return (
      <View style={[{ alignItems: align }, style]} testID={testID}>
        <T size={Math.max(10, size - 2)} c={color.dim}>No quote yet</T>
      </View>
    );
  }
  const up = (quote.change_pct ?? quote.change ?? 0) >= 0;
  return (
    <View testID={testID} style={[{ alignItems: align, gap: 2 }, style]}>
      <Num size={size} weight="semibold">{`${prefix}${quote.price.toFixed(2)}`}</Num>
      {showChange && quote.change_pct != null ? (
        <Num size={Math.max(10, size - 3)} weight="regular" c={up ? color.green : color.red}>
          {`${up ? '+' : '−'}${Math.abs(quote.change_pct).toFixed(2)}%`}
        </Num>
      ) : null}
      <FreshnessMark
        freshness={quote.freshness ?? 'unknown'}
        delayReason={quote.delay_reason}
        size={markSize}
      />
    </View>
  );
}

/** Inline variant for headers: price and mark on one row. */
export function PriceRow({
  quote, size = 29, style, testID,
}: { quote: Quote | null | undefined; size?: number; style?: StyleProp<ViewStyle>; testID?: string }) {
  const up = (quote?.change_pct ?? quote?.change ?? 0) >= 0;
  return (
    <View testID={testID} style={[{ gap: 3 }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 9 }}>
        <Num size={size} weight="semibold">
          {quote?.price != null ? `$${quote.price.toFixed(2)}` : '—'}
        </Num>
        {quote?.change != null || quote?.change_pct != null ? (
          <Num size={13} weight="regular" c={up ? color.green : color.red}>
            {`${up ? '+' : '−'}${Math.abs(quote.change ?? 0).toFixed(2)} (${up ? '+' : '−'}${Math.abs(quote.change_pct ?? 0).toFixed(2)}%)`}
          </Num>
        ) : null}
      </View>
      <FreshnessMark
        freshness={quote?.freshness ?? 'unknown'}
        delayReason={quote?.delay_reason}
        size={10}
      />
    </View>
  );
}
