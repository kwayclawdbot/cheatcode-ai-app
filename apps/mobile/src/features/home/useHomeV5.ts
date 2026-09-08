import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { env } from '../../lib/env';
import { useResource } from '../../lib/useResource';
import { useMarketRefresh } from '../../lib/useMarketRefresh';
import { fixtureHomeV5, fixtureHomeV5Quiet } from '../../lib/fixtures';
import type { Candle, GoalMode, HomeV5, MarketStatus } from '../../lib/types';

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

/**
 * `GET /home?mode=` in the V5 shape — one opening line, one priority.
 *
 * HOME IS WHERE THE APP LEARNS WHAT SESSION IT IS. `/home` is the only payload
 * that carries a `market` block and it is the first screen anybody opens, so
 * its answer is held here, handed to this surface's own poller, and remembered
 * for every other surface through `noteMarketStatus`. That is how the watchlist
 * knows to stay silent on a holiday without asking a second endpoint.
 */
export function useHomeV5(mode: GoalMode, fixture: HomeFixture = 'default') {
  const local = env.FIXTURES && fixture === 'quiet' ? fixtureHomeV5Quiet : fixtureHomeV5;

  /**
   * The last session the server named. Held as state rather than read straight
   * off `res.data` because the policy has to be passed IN to `useResource`,
   * one render before its answer comes back out.
   */
  const [session, setSession] = useState<MarketStatus['status'] | null>(null);

  const res = useResource<HomeV5>(
    () => api.homeV5(mode),
    { ...local, mode },
    [mode, fixture],
    { kind: 'quote', market: session ? { status: session } : null },
  );

  const said = res.data?.market?.status ?? null;
  useEffect(() => { if (said && said !== session) setSession(said); }, [said, session]);

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
 *
 * It is 5-minute bars, so it refetches on the 5-minute cadence (60s) — the
 * series, not a partial bar, because the server is cache-first and a bar this
 * side assembled is a bar nobody printed.
 */
export function usePriorityCandles(symbol: string | null | undefined, seed: Candle[] = []) {
  const [candles, setCandles] = useState<Candle[]>(seed);
  const [tick, setTick] = useState(0);
  const seeded = seed.length > 0;

  useEffect(() => {
    let alive = true;
    if (seeded) { setCandles(seed); return; }
    if (!symbol || !api.available()) { setCandles(seed); return; }
    const now = new Date();
    const to = now.toISOString().slice(0, 10);
    const from = new Date(now.getTime() - 5 * 24 * 3600_000).toISOString().slice(0, 10);
    api.candles(symbol, '5m', from, to)
      // An empty answer to a REFRESH is not a reason to blank a chart that is
      // already drawn; the bars on screen were real when they arrived.
      .then((c) => { if (alive && (c.length || !tick)) setCandles(c); })
      .catch(() => { if (alive && !tick) setCandles([]); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, seeded, tick]);

  useMarketRefresh({
    onRefresh: useCallback(() => setTick((t) => t + 1), []),
    kind: 'candles',
    timeframe: '5m',
    enabled: !!symbol && !seeded && api.available(),
  });

  return candles;
}
