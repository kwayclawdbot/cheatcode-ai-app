import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';

export type Resource<T> = {
  data: T | null;
  loading: boolean;
  /** Plain-English message. Never a stack trace, never a code. */
  error: string | null;
  /** True when `data` is the local fixture rather than the server's answer. */
  isFixture: boolean;
  /** True when the endpoint isn't deployed on this stack yet. */
  notAvailable: boolean;
  reload: () => void;
};

/**
 * One loading contract for every round-2 screen.
 *
 * Fixtures mode (or an unconfigured env) renders `fallback` immediately with no
 * network. On a REAL stack the fallback is never used: an endpoint the API lane
 * has not shipped yet reports `notAvailable` so the screen can say so, because
 * sample balances and sample "what Kai remembers" entries rendered against a
 * live account would be fabricated records, not placeholders.
 */
export function useResource<T>(
  load: () => Promise<T>,
  fallback: T | null,
  deps: unknown[] = [],
): Resource<T> {
  const offline = !api.available();
  const [data, setData] = useState<T | null>(offline ? fallback : null);
  const [loading, setLoading] = useState(!offline);
  const [error, setError] = useState<string | null>(null);
  const [notAvailable, setNotAvailable] = useState(false);
  const [isFixture, setIsFixture] = useState(offline);
  const [tick, setTick] = useState(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => {
    if (offline) {
      setData(fallback);
      setIsFixture(true);
      setNotAvailable(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    load()
      .then((d) => {
        if (!alive.current) return;
        setData(d);
        setIsFixture(false);
        setNotAvailable(false);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!alive.current) return;
        const code = e instanceof ApiError ? e.code : '';
        const missing = code === 'NOT_FOUND' || code === 'NO_API';
        setData(null);
        setIsFixture(false);
        setNotAvailable(missing);
        setError(
          missing
            ? "That part of the service isn't live yet."
            : e instanceof Error ? e.message : 'Something went wrong. Please try again.',
        );
      })
      .finally(() => { if (alive.current) setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offline, tick, ...deps]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  return { data, loading, error, isFixture, notAvailable, reload };
}
