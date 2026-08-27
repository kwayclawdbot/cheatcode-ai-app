/**
 * One loading contract for the paper-execution screens (lane MOBILE-B).
 *
 * Same shape and the same honesty rule as `src/lib/useResource.ts` (lane
 * MOBILE-A, not edited here), but it understands `TradeApiError` so an endpoint
 * API-3 has not shipped yet reports `notAvailable` instead of surfacing as a
 * generic failure — and never as a fixture on a live account.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { TradeApiError, tradeApi } from '../../lib/trade-api';

export type TradeResource<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  isFixture: boolean;
  notAvailable: boolean;
  reload: () => void;
};

export function useTradeResource<T>(
  load: () => Promise<T>,
  deps: unknown[] = [],
): TradeResource<T> {
  const offline = !tradeApi.available();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notAvailable, setNotAvailable] = useState(false);
  const [tick, setTick] = useState(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => {
    setLoading(true);
    load()
      .then((d) => {
        if (!alive.current) return;
        setData(d);
        setNotAvailable(false);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!alive.current) return;
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
      .finally(() => { if (alive.current) setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, isFixture: offline, notAvailable, reload };
}
