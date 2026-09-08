/**
 * A READ THAT SURVIVES LOSING THE NETWORK.
 *
 * `useResource` is the app's loading contract and it stays exactly as it is:
 * ask, then either data or an error. This is the narrower thing the recovery
 * screen needs — a read whose answer can come from MEMORY, and which always
 * says which of the two it was and when the remembered copy was fetched.
 *
 * The outcomes are the ones audit F18 asks to be distinguishable:
 *   live     the server just answered. Nothing to caveat.
 *   cache    we are showing what we saved, with the instant we saved it. The
 *            screen is required to print that instant — see `updatedAtLabel`.
 *   none     we have nothing. Not an empty list: NOTHING. The screen says so.
 *   fixture  example content, on a build with no service behind it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT WILL NOT CACHE
 * ─────────────────────────────────────────────────────────────────────────────
 * Fixtures. In `EXPO_PUBLIC_FIXTURES` mode (`api.available() === false`) the
 * loader returns example content, and writing that to the offline store would
 * put invented levels behind an "Offline · Last updated" stamp on a later real
 * session — the precise failure `no-fake-data-test` exists to prevent. So that
 * path never touches the cache at all, and it reports `source: 'fixture'` so a
 * screen can never mistake an example for something it remembered.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';
import { readThrough } from '../../lib/offline-cache';
import { recheck, useConnectivity } from './connectivity';

export type CachedSource = 'pending' | 'live' | 'cache' | 'none' | 'fixture';

export type CachedResource<T> = {
  value: T | null;
  /** Epoch ms the value was read from the server. Null when it never was. */
  fetchedAt: number | null;
  source: CachedSource;
  /** Plain English. Null when nothing went wrong. */
  error: string | null;
  /** True only while the FIRST answer is outstanding. */
  loading: boolean;
  /** Ask the OS about the network, then ask the server. */
  retry: () => void;
  /** True while a retry is in flight over an answer we already hold. */
  retrying: boolean;
};

export function useCachedRead<T>(name: string, load: () => Promise<T>, deps: unknown[] = []): CachedResource<T> {
  const { session, profile } = useSession();
  const { online } = useConnectivity();
  const scope = session?.user?.id ?? profile?.user_id ?? 'anon';

  const [state, setState] = useState<{ value: T | null; fetchedAt: number | null; source: CachedSource; error: string | null }>(
    { value: null, fetchedAt: null, source: 'pending', error: null },
  );
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [tick, setTick] = useState(0);
  const alive = useRef(true);
  const held = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => {
    let ok = true;
    const finish = (next: typeof state) => {
      if (!ok || !alive.current) return;
      setState(next);
      setLoading(false);
      setRetrying(false);
    };

    (async () => {
      // Fixtures: draw it, remember nothing. See the header.
      if (!api.available()) {
        try {
          const value = await load();
          finish({ value, fetchedAt: null, source: 'fixture', error: null });
        } catch (e) {
          finish({ value: null, fetchedAt: null, source: 'none', error: e instanceof Error ? e.message : 'Nothing to show.' });
        }
        return;
      }

      /**
       * `online === undefined` means NetInfo has not answered yet, and we try
       * the request anyway: a fetch on a live network must not wait for a
       * connectivity probe, and a fetch with no network fails in milliseconds
       * and falls through to the cache regardless. Only an explicit `false`
       * skips the attempt, because only an explicit `false` is evidence.
       */
      const r = await readThrough<T>({ scope, name, online: online !== false, load });
      if (r.source !== 'none') held.current = true;
      finish({
        value: r.source === 'none' ? null : r.value,
        fetchedAt: r.source === 'none' ? null : r.fetchedAt,
        source: r.source,
        error: r.error,
      });
    })();

    return () => { ok = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, name, online, tick, ...deps]);

  const retry = useCallback(() => {
    if (held.current) setRetrying(true);
    else setLoading(true);
    void recheck().finally(() => setTick((t) => t + 1));
  }, []);

  return { ...state, loading, retry, retrying };
}
