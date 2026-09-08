/**
 * WHAT THE APP REMEMBERS WHEN IT CANNOT ASK.
 *
 * `api.available()` has never meant "there is a network" — it means "a base URL
 * is configured", which is true on a phone in a lift. So every read in this app
 * had exactly two outcomes: the server answered, or the screen went blank. A
 * member who opened a plan at 8:42 and walked into the underground at 8:44 lost
 * the levels they were about to trade against.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ONE RULE: NOTHING IS CACHED WITHOUT THE INSTANT IT WAS FETCHED
 * ─────────────────────────────────────────────────────────────────────────────
 * An entry is `{ value, fetchedAt }` and there is no way to write one without
 * the timestamp, because a remembered price with no "as of" is indistinguishable
 * from a live one — which is precisely the fabrication `FreshnessMark` exists to
 * prevent. Every read hands the caller `fetchedAt` back, and the screen is
 * expected to print it: "Offline · Last updated 8:42 AM".
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT REFUSES TO DO
 * ─────────────────────────────────────────────────────────────────────────────
 *  - It never invents an entry. A miss is a miss and the screen says so.
 *  - It never caches under a key that does not name the account. Cached rows
 *    are one member's positions and plans; a shared key would show them to the
 *    next person who signs in on that device.
 *  - It never serves anything past `MAX_AGE_MS`. A saved plan from March is not
 *    a plan, it is an artefact, and drawing it under an "offline" banner would
 *    imply it is current.
 *  - It stores nothing Kai generated on the fly and nothing a fixture produced.
 *    The caller decides what is worth remembering; this only remembers it.
 *
 * AsyncStorage, not SecureStore: this is public market data and the member's
 * own plan levels, already on screen a moment ago. Tokens live elsewhere.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Bump when the SHAPE of a cached value changes, so old entries are ignored. */
const VERSION = 'v1';
const PREFIX = `cc.offline.${VERSION}.`;

/**
 * A week. Long enough that a plan written on Monday survives a Friday commute
 * with no signal; short enough that nothing here can be mistaken for current.
 * The screen still has to say how old it is — this is only the outer bound past
 * which we would rather show nothing at all.
 */
export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type CacheEntry<T> = {
  value: T;
  /** Epoch ms at which this value was actually read from the server. */
  fetchedAt: number;
};

type Stored<T> = { v: string; value: T; fetchedAt: number };

/**
 * The key always carries the account. `scope` is the user id — or the string
 * 'anon' before sign-in, which is its own bucket and is cleared with the rest.
 */
export function cacheKey(scope: string, name: string): string {
  return `${PREFIX}${scope}.${name}`;
}

export function isFresh(fetchedAt: number, now: number = Date.now(), maxAgeMs: number = MAX_AGE_MS): boolean {
  return Number.isFinite(fetchedAt) && fetchedAt <= now + 60_000 && now - fetchedAt <= maxAgeMs;
}

/**
 * Read one entry. Returns null for a miss, a shape change, a corrupt record or
 * anything older than `MAX_AGE_MS` — all four are "we do not have this", and
 * collapsing them is correct because the screen's answer is the same.
 */
export async function readCache<T>(scope: string, name: string, now: number = Date.now()): Promise<CacheEntry<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(scope, name));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stored<T>;
    if (!parsed || parsed.v !== VERSION || typeof parsed.fetchedAt !== 'number') return null;
    if (!isFresh(parsed.fetchedAt, now)) return null;
    return { value: parsed.value, fetchedAt: parsed.fetchedAt };
  } catch {
    // A store that will not open is not an error a member should meet; it is
    // simply an app with no memory, which is where it started.
    return null;
  }
}

/**
 * Write one entry. `fetchedAt` defaults to now because the only correct moment
 * to call this is immediately after the server answered — a caller that has to
 * pass a timestamp in has already had the chance to pass in a wrong one.
 */
export async function writeCache<T>(scope: string, name: string, value: T, fetchedAt: number = Date.now()): Promise<void> {
  try {
    await AsyncStorage.setItem(cacheKey(scope, name), JSON.stringify({ v: VERSION, value, fetchedAt } satisfies Stored<T>));
  } catch {
    /* A full or unavailable store costs us the memory, not the screen. */
  }
}

/** Sign-out. Everything under this account's prefix goes; nothing else does. */
export async function clearCache(scope: string): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const mine = keys.filter((k) => k.startsWith(`${PREFIX}${scope}.`));
    if (mine.length) await AsyncStorage.multiRemove(mine);
  } catch {
    /* nothing to do about it, and nothing depends on it succeeding */
  }
}

/**
 * The read-through wrapper the screens use.
 *
 * `load` is tried first whenever the caller says we are online. If it answers,
 * the answer is cached and returned as `source: 'live'`. If it throws — or the
 * caller already knows there is no network — the cache answers instead, with
 * the instant it was fetched, as `source: 'cache'`. If neither can help, the
 * result says `source: 'none'` and carries the reason, so the screen shows a
 * failure rather than an empty list.
 *
 * The three sources exist so the caller can draw three DIFFERENT things, which
 * is the whole of audit F18: live data, remembered data with a timestamp on it,
 * and nothing at all.
 */
export type CachedRead<T> =
  | { source: 'live'; value: T; fetchedAt: number; error: null }
  | { source: 'cache'; value: T; fetchedAt: number; error: string | null }
  | { source: 'none'; value: null; fetchedAt: null; error: string };

export async function readThrough<T>(opts: {
  scope: string;
  name: string;
  online: boolean;
  load: () => Promise<T>;
  now?: number;
}): Promise<CachedRead<T>> {
  const now = opts.now ?? Date.now();
  if (opts.online) {
    try {
      const value = await opts.load();
      await writeCache(opts.scope, opts.name, value, now);
      return { source: 'live', value, fetchedAt: now, error: null };
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Something went wrong. Please try again.';
      const hit = await readCache<T>(opts.scope, opts.name, now);
      if (hit) return { source: 'cache', value: hit.value, fetchedAt: hit.fetchedAt, error: message };
      return { source: 'none', value: null, fetchedAt: null, error: message };
    }
  }
  const hit = await readCache<T>(opts.scope, opts.name, now);
  if (hit) return { source: 'cache', value: hit.value, fetchedAt: hit.fetchedAt, error: null };
  return {
    source: 'none',
    value: null,
    fetchedAt: null,
    error: "You are offline and I have not saved this one yet, so there is nothing to show you.",
  };
}
