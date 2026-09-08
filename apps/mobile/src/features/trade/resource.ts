/**
 * One loading contract for the paper-execution screens (lane MOBILE-B).
 *
 * Same shape and the same honesty rule as `src/lib/useResource.ts` (lane
 * MOBILE-A, not edited here), but it understands `TradeApiError` so an endpoint
 * API-3 has not shipped yet reports `notAvailable` instead of surfacing as a
 * generic failure — and never as a fixture on a live account.
 *
 * It carries the same loud-reload / quiet-refresh split, for the same reason:
 * an open position's P&L has to keep up with the tape, and a spinner over it
 * every fifteen seconds would be worse than the frozen number it replaced.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { TradeApiError, tradeApi } from '../../lib/trade-api';
import { useMarketRefresh } from '../../lib/useMarketRefresh';
import type { RefreshPolicy } from '../../lib/useResource';

export type TradeResource<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  isFixture: boolean;
  notAvailable: boolean;
  reload: () => void;
  /** The poller's refetch: no spinner, and good data survives a failure. */
  refresh: () => void;
};

export function useTradeResource<T>(
  load: () => Promise<T>,
  deps: unknown[] = [],
  refreshPolicy?: RefreshPolicy,
): TradeResource<T> {
  const offline = !tradeApi.available();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notAvailable, setNotAvailable] = useState(false);
  const [tick, setTick] = useState(0);
  const alive = useRef(true);
  const quiet = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => {
    const isQuiet = quiet.current;
    quiet.current = false;
    if (!isQuiet) setLoading(true);
    load()
      .then((d) => {
        if (!alive.current) return;
        setData(d);
        setNotAvailable(false);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!alive.current) return;
        // See useResource: a background poll that fails keeps what it had.
        if (isQuiet) return;
        const code = e instanceof TradeApiError ? e.code : '';
        const missing = code === 'NOT_FOUND' || code === 'NO_API';
        setData(null);
        setNotAvailable(missing);
        setError(
          missing
            ? "That part of the service isn't live yet."
            : e instanceof Error ? e.message : 'Something went wrong. Please try again.',
        );
      })
      .finally(() => { if (alive.current && !isQuiet) setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const refresh = useCallback(() => {
    quiet.current = true;
    setTick((t) => t + 1);
  }, []);

  useMarketRefresh({
    onRefresh: refresh,
    kind: refreshPolicy?.kind,
    timeframe: refreshPolicy?.timeframe,
    market: refreshPolicy?.market,
    enabled: !!refreshPolicy && refreshPolicy.enabled !== false && !offline,
  });

  return { data, loading, error, isFixture: offline, notAvailable, reload, refresh };
}
