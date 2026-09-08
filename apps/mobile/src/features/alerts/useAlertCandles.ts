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
/**
 * WHY THIS IS A SUBSCRIPTION AND NOT A FLAG IN THE EFFECT.
 *
 * The obvious shape — `let alive = true` in the effect, cleanup sets it false,
 * the promise bumps state only `if (alive)` — is silently broken here, and it
 * cost a round of screenshots to find. React runs an effect twice in
 * development: mount, cleanup, mount. The first pass fires the request and
 * records it in `inflight`; the cleanup flips that pass's `alive` to false; the
 * second pass sees the request already in flight and correctly does not fire it
 * again — and so never attaches a callback of its own. When the bars finally
 * arrive they resolve against the FIRST closure, find `alive === false`, and
 * re-render nothing. The cache fills and the chart stays empty.
 *
 * A module-level listener set has no such seam: the fetch notifies whoever is
 * mounted NOW, rather than whoever was mounted when it was started. It is also
 * the honest shape for a cache several cards share — two cards on the same
 * symbol want one request and both want telling.
 */
const listeners = new Set<() => void>();
const notify = () => { listeners.forEach((l) => l()); };

const key = (symbol: string, tf: '1d' | '5m') => `${symbol.toUpperCase()}:${tf}`;

function ensure(symbol: string, tf: '1d' | '5m') {
  const k = key(symbol, tf);
  if (cache.has(k) || inflight.has(k) || !api.available()) return;
  inflight.set(
    k,
    api
      .candles(symbol, tf)
      .then((bars) => { cache.set(k, bars); })
      .catch(() => {
        /* Absent, not broken. See the header. Cached as empty so a symbol whose
           bars genuinely do not exist is not re-requested on every tick. */
        cache.set(k, []);
      })
      .finally(() => { inflight.delete(k); notify(); }),
  );
}

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
    const listener = () => bump((n) => n + 1);
    listeners.add(listener);
    for (const w of wanted) ensure(w.symbol, w.tf);
    return () => { listeners.delete(listener); };
  }, [signature]); // eslint-disable-line react-hooks/exhaustive-deps

  const out: Record<string, Candle[]> = {};
  for (const w of wanted) {
    const bars = cache.get(key(w.symbol, w.tf));
    if (bars?.length) out[w.symbol.toUpperCase()] = bars;
  }
  return out;
}
