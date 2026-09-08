/**
 * BARS FOR THE PRICE MAP ON AN ALERT CARD — cached, because this is a LIST.
 *
 * `features/orders/useCandles.ts` fetches for one screen holding one idea, so
 * it needs no cache. The alerts board holds seven or eight cards at once, it
 * re-renders on every quote tick, and switching tabs remounts the lot. The same
 * hook there would be a request per card per remount for bars that change once
 * a day.
 *
 * So: daily bars, one request per SYMBOL for the life of the session, shared by
 * every card that asks. Concurrent askers join the request already in flight
 * rather than starting a second one. Nothing here retries and nothing here
 * shows an error — a failure caches an empty array and `TradeMap` degrades to
 * levels-only in its own words, which is the same posture the order screen
 * takes and for the same reason: the levels are what matter and they came off
 * the alert, not off this call.
 *
 * DAILY, on purpose — see the header of `features/orders/useCandles.ts`. A
 * finer resolution an account is not entitled to comes back as a 200 with no
 * bars, and an empty frame is worse than a coarser but real chart.
 */
import { useEffect, useState } from 'react';
import { portalApi } from '../../lib/trade-api';
import type { Candle } from '../../lib/types';

const NONE: Candle[] = [];

const cache = new Map<string, Candle[]>();
const inFlight = new Map<string, Promise<Candle[]>>();

function load(symbol: string): Promise<Candle[]> {
  const held = inFlight.get(symbol);
  if (held) return held;
  const p = portalApi
    .candles(symbol, 'D')
    .then((r) => r.candles)
    .catch(() => NONE)
    .then((bars) => {
      cache.set(symbol, bars);
      inFlight.delete(symbol);
      return bars;
    });
  inFlight.set(symbol, p);
  return p;
}

/**
 * `enabled` is the caller saying the map has something to draw. A card with no
 * numeric level draws no map, so it must not pay for bars either — the
 * options-flow family is every card on a day-trade board and it has no levels
 * at all.
 */
export function useAlertCandles(symbol: string | null | undefined, enabled = true): Candle[] {
  const key = symbol && enabled ? symbol.toUpperCase() : null;
  const [bars, setBars] = useState<Candle[]>(() => (key && cache.get(key)) || NONE);

  useEffect(() => {
    if (!key) { setBars(NONE); return; }
    const held = cache.get(key);
    if (held) { setBars(held); return; }
    let alive = true;
    load(key).then((got) => { if (alive) setBars(got); });
    return () => { alive = false; };
  }, [key]);

  return bars;
}
