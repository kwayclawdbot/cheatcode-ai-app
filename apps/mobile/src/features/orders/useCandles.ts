/**
 * BARS FOR AN EXECUTION CHART. The one piece of I/O the order screens' map
 * needs, kept out of `trade-idea.ts` so that file stays node-importable and its
 * mapping can be asserted without React Native.
 *
 * DAILY, on purpose. `/market/candles` serves `1d` on every stack; a finer
 * resolution this account is not entitled to comes back as a 200 with no bars,
 * and an empty frame on the screen where somebody is about to place an order is
 * worse than a coarser but real chart (`portalApi.candles` already handles that
 * fallback and says when it made one). The board's own chart spans six weeks of
 * daily bars, so this is also what it drew.
 *
 * A FAILURE IS NOT AN ERROR STATE HERE. There is no retry, no banner and no
 * spinner: the map degrades to levels-only and says "Price history unavailable"
 * in its own words. The levels are the part that matters on these screens, and
 * they came off the order, not off this call.
 */
import { useEffect, useState } from 'react';
import { portalApi } from '../../lib/trade-api';
import type { Candle } from '../../lib/types';

export function useIdeaCandles(symbol: string | null | undefined): Candle[] {
  const [bars, setBars] = useState<Candle[]>([]);
  useEffect(() => {
    if (!symbol) { setBars([]); return; }
    let alive = true;
    portalApi.candles(symbol, 'D')
      .then((r) => { if (alive) setBars(r.candles); })
      .catch(() => { if (alive) setBars([]); });
    return () => { alive = false; };
  }, [symbol]);
  return bars;
}
