import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { env } from '../../lib/env';
import { useResource } from '../../lib/useResource';
import { fixtureHomeV5, fixtureHomeV5Quiet } from '../../lib/fixtures';
import type { Candle, GoalMode, HomeV5 } from '../../lib/types';

/**
 * Which local payload the fixtures preview renders.
 *
 * Fixtures mode ONLY (`EXPO_PUBLIC_FIXTURES=1`). On a real stack this argument
 * is ignored entirely — the server's answer is the only answer.
 *   `/home`                 → the ordinary day
 *   `/home?fixture=quiet`   → the day with genuinely nothing to report
 *   `/home?fixture=down`    → the morning the payload never arrives
 */
export type HomeFixture = 'default' | 'quiet' | 'down';

/** `GET /home?mode=` in the V5 shape — one opening line, one priority. */
export function useHomeV5(mode: GoalMode, fixture: HomeFixture = 'default') {
  const local = env.FIXTURES && fixture === 'quiet' ? fixtureHomeV5Quiet : fixtureHomeV5;
  const res = useResource<HomeV5>(() => api.homeV5(mode), { ...local, mode }, [mode, fixture]);
  if (env.FIXTURES && fixture === 'down') {
    return {
      ...res,
      data: null,
      loading: false,
      error: "I couldn't reach the market service.",
      isFixture: true,
    };
  }
  return res;
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
