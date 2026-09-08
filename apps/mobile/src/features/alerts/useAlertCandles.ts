import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { Candle } from '../../lib/types';

/**
 * THE BARS THE ALERT WIRE DOES NOT CARRY.
 *
 * An alert payload has levels and no price history. The trade object the owner
 * signed off draws the levels ON a chart, because "entry 178.40" is a number
 * and "the entry is where it broke out and came back" is a picture — the whole
 * point of F06 is that a member should be able to see the idea without reading
 * it. So the board fetches bars from `/market/candles`, the same lane the trade
 * portal uses, and hands them to the card.
 *
 * ── WHY ONE REQUEST PER SYMBOL IS THE RIGHT SHAPE HERE ─────────────────────
 * There is no batch candles endpoint, and an alerts board is a handful of
 * cards, not a feed — the Active tab holds what fired today. A cache keyed by
 * symbol and timeframe, living above the hook rather than inside it, means the
 * cost is paid once per symbol per session and not again on a tab switch, a
 * re-render, or the quote-cadence refresh that already re-runs the board. The
 * request is fired once per symbol even if three cards want it.
 *
 * ── AND WHY A FAILURE IS NOT AN ERROR ──────────────────────────────────────
 * Nothing here surfaces a loading state or an error to the card. A symbol with
 * no bars yet simply is not in the map, the card passes `[]`, and the kit draws
 * the levels against an honest empty history with "Price history unavailable"
 * under it. That is a complete, truthful card — every decision value is still
 * on it — so a spinner or a red line would be furniture reporting a state the
 * member does not need to act on. The chart is the nicest way to read the
 * levels, not the thing that makes them true.
 */

const cache = new Map<string, Candle[]>();
const inflight = new Map<string, Promise<void>>();

const key = (symbol: string, tf: '1d' | '5m') => `${symbol.toUpperCase()}:${tf}`;

/**
 * Daily bars for a swing idea, five-minute bars for an intraday one.
 *
 * A day trade drawn on daily candles is a chart of the wrong trade: the levels
 * would sit inside a single bar and the shape a member is being shown would be
 * weeks of history around a plan that expires at four o'clock.
 */
export const timeframeForHold = (hold?: string | null): '1d' | '5m' =>
  hold && /intraday|scalp|minute|hour|open|close/i.test(hold) ? '5m' : '1d';

export function useAlertCandles(
  wanted: readonly { symbol: string; tf: '1d' | '5m' }[],
): Record<string, Candle[]> {
  const [, bump] = useState(0);
  /* The dependency is the request set itself, not the array identity — the
     board rebuilds this list on every refresh and an identity dependency would
     re-run the effect on a tick where nothing was actually asked for. */
  const signature = wanted.map((w) => key(w.symbol, w.tf)).sort().join(',');

  useEffect(() => {
    let alive = true;
    for (const w of wanted) {
      const k = key(w.symbol, w.tf);
      if (cache.has(k) || inflight.has(k)) continue;
      if (!api.available()) continue;
      const p = api
        .candles(w.symbol, w.tf)
        .then((bars) => {
          cache.set(k, bars);
        })
        .catch(() => {
          /* Absent, not broken. See the header. Cached as empty so a symbol
             whose bars genuinely do not exist is not re-requested every tick. */
          cache.set(k, []);
        })
        .finally(() => {
          inflight.delete(k);
          if (alive) bump((n) => n + 1);
        });
      inflight.set(k, p);
    }
    return () => {
      alive = false;
    };
  }, [signature]); // eslint-disable-line react-hooks/exhaustive-deps

  const out: Record<string, Candle[]> = {};
  for (const w of wanted) {
    const bars = cache.get(key(w.symbol, w.tf));
    if (bars?.length) out[w.symbol.toUpperCase()] = bars;
  }
  return out;
}
