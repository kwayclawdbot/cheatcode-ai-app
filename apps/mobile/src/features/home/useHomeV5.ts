import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useResource } from '../../lib/useResource';
import { fixtureHomeV5 } from '../../lib/fixtures';
import type { Candle, GoalMode, HomeV5 } from '../../lib/types';

/** `GET /home?mode=` in the V5 shape — one opening line, one priority. */
export function useHomeV5(mode: GoalMode) {
  return useResource<HomeV5>(() => api.homeV5(mode), { ...fixtureHomeV5, mode }, [mode]);
}

/**
 * The priority object's own price line.
 *
 * `GET /home` sends the object and its quote but not its bars, so Home asks
 * `/market/candles` for the one symbol it is about to draw. Fixtures already
 * carry bars; on a live stack an empty answer stays empty rather than drawing
 * invented price action under a real entry level.
 */
export function usePriorityCandles(symbol: string | null | undefined, seed: Candle[] = []) {
  const [candles, setCandles] = useState<Candle[]>(seed);

  useEffect(() => {
    let alive = true;
    if (seed.length) { setCandles(seed); return; }
    if (!symbol || !api.available()) { setCandles(seed); return; }
    const now = new Date();
    const to = now.toISOString().slice(0, 10);
    const from = new Date(now.getTime() - 5 * 24 * 3600_000).toISOString().slice(0, 10);
    api.candles(symbol, '5m', from, to)
      .then((c) => { if (alive) setCandles(c); })
      .catch(() => { if (alive) setCandles([]); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, seed.length]);

  return candles;
}
