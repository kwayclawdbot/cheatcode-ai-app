import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { env } from '../../lib/env';
import { useResource } from '../../lib/useResource';
import { useMarketRefresh } from '../../lib/useMarketRefresh';
import { useSession } from '../../lib/session';
import { readCache, writeCache, type CacheEntry } from '../../lib/offline-cache';
import { useConnectivity } from '../offline';
import { fixtureHomeV5, fixtureHomeV5Quiet } from '../../lib/fixtures';
import type { Candle, GoalMode, HomeV5, MarketStatus } from '../../lib/types';
import type { HomeStanding } from '@cheatcode/shared';

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

/** The payload plus the F18 standing block. See `lib/api.ts`. */
export type HomeV5Plus = HomeV5 & { standing: HomeStanding };

/** The cache key. Versioned by shape, scoped to the account by `readCache`. */
const CACHE = (mode: GoalMode) => `home.v5.${mode}`;

/**
 * A LOCAL PAYLOAD IS NEVER `quiet`.
 *
 * The quiet fixture is a screen, not a finding — nothing checked anything, so
 * the honest standing for it is `unverified`. Shipping it as `quiet` would put
 * the app's most reassuring sentence behind data nobody read, and would make
 * the fixtures preview the one place the F18 rule does not hold.
 */
function fixtureStanding(): HomeStanding {
  return {
    state: 'unverified',
    plain: 'This is sample data. Nothing here was checked against your account.',
    checked_at: new Date().toISOString(),
    checks: [],
  };
}

/**
 * `GET /home?mode=` in the V5 shape — one opening line, one priority.
 *
 * HOME IS WHERE THE APP LEARNS WHAT SESSION IT IS. `/home` is the only payload
 * that carries a `market` block and it is the first screen anybody opens, so
 * its answer is held here, handed to this surface's own poller, and remembered
 * for every other surface through `noteMarketStatus`. That is how the watchlist
 * knows to stay silent on a holiday without asking a second endpoint.
 *
 * ── AND IT IS NOW REMEMBERED (board 07, right screen) ────────────────────────
 * The last good payload is written to the offline store and read back when the
 * live one does not arrive. `remembered` is returned SEPARATELY from `data` and
 * never merged into it, because a screen must be able to tell the difference:
 * `data` is what the server just said, `remembered` is what it said at
 * `remembered.fetchedAt` and carries that instant so the screen can print it.
 * Silently swapping one for the other is how a cached price ends up under a
 * live label, which is the fabrication this codebase is built to refuse.
 */
export function useHomeV5(mode: GoalMode, fixture: HomeFixture = 'default') {
  const local = env.FIXTURES && fixture === 'quiet' ? fixtureHomeV5Quiet : fixtureHomeV5;
  const { session, profile } = useSession();
  const { online } = useConnectivity();
  const scope = session?.user?.id ?? profile?.user_id ?? 'anon';

  /**
   * The last session the server named. Held as state rather than read straight
   * off `res.data` because the policy has to be passed IN to `useResource`,
   * one render before its answer comes back out.
   */
  const [session_, setSession] = useState<MarketStatus['status'] | null>(null);

  const fallback = useMemo<HomeV5Plus>(() => ({ ...local, mode, standing: fixtureStanding() }), [local, mode]);

  const res = useResource<HomeV5Plus>(
    () => api.homeV5(mode),
    fallback,
    [mode, fixture],
    { kind: 'quote', market: session_ ? { status: session_ } : null },
  );

  const said = res.data?.market?.status ?? null;
  useEffect(() => { if (said && said !== session_) setSession(said); }, [said, session_]);

  /* ---------------- what we remember ---------------- */

  const [remembered, setRemembered] = useState<CacheEntry<HomeV5Plus> | null>(null);

  // Only a REAL answer is worth remembering. Fixtures are example content and
  // writing them here would put invented levels behind an "Offline · Last
  // updated" stamp on a later live session.
  useEffect(() => {
    if (!res.data || res.isFixture || !api.available()) return;
    void writeCache(scope, CACHE(mode), res.data);
  }, [res.data, res.isFixture, scope, mode]);

  // Read it back only when the live payload is genuinely absent. A cached copy
  // sitting beside good data would be a second answer to the same question.
  useEffect(() => {
    let ok = true;
    if (res.data || res.loading || !api.available()) { setRemembered(null); return; }
    void readCache<HomeV5Plus>(scope, CACHE(mode)).then((hit) => { if (ok) setRemembered(hit); });
    return () => { ok = false; };
  }, [res.data, res.loading, scope, mode]);

  if (env.FIXTURES && fixture === 'down') {
    return {
      ...res,
      data: null,
      remembered: null,
      online,
      loading: false,
      error: "I couldn't reach the market service.",
      isFixture: true,
    };
  }
  return { ...res, remembered, online };
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
