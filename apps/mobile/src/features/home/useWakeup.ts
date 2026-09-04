/**
 * The once-a-day gate on Kai's wake-up.
 *
 * Opening the app at 6am and again at 2pm must not produce two mornings. The
 * message is composed once, stamped with the local day and the user id, and
 * kept — the second open of the day shows the same words, already there, with
 * no animation and no fresh greeting.
 *
 * A wake-up Kai could not fill in (no payload) is deliberately NOT persisted:
 * he has not used up his one greeting if he had nothing to say. If the payload
 * lands later in the same session, the message upgrades in place.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { HomeV5 } from '../../lib/types';
import type { Resource } from '../../lib/useResource';
import { composeWakeup, degradedWakeup, greetingFor, localDay, type Wakeup } from './wake-message';

const KEY = (userKey: string) => `kai.wakeup.v1.${userKey}`;

/** How long Kai waits for his data before greeting you anyway. */
const PATIENCE_MS = 6000;

type Stored = { date: string; message: Wakeup };

export type WakeupState = {
  /** null only for the instant before storage answers. */
  wakeup: Wakeup | null;
  /** The opening line, available with no network and no storage read at all. */
  greeting: string;
  /** True when this is the same message the user already saw today. */
  seenBefore: boolean;
  /** True once the body of the message exists (greeting shows before this). */
  ready: boolean;
  /** Forget today's wake-up. Used by the retry direction. */
  clear: () => void;
};

export function useWakeup(opts: { name?: string | null; userKey: string; home: Resource<HomeV5> }): WakeupState {
  const { name, userKey, home } = opts;
  const [wakeup, setWakeup] = useState<Wakeup | null>(null);
  const [seenBefore, setSeenBefore] = useState(false);
  const [storageRead, setStorageRead] = useState(false);
  const [impatient, setImpatient] = useState(false);
  const [nonce, setNonce] = useState(0);
  const alive = useRef(true);
  /** Set once we have committed a message for today, so nothing replays it. */
  const committed = useRef<'none' | 'degraded' | 'full'>('none');

  const greeting = greetingFor(new Date(), name);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  // 1 — has today already been greeted?
  useEffect(() => {
    let ok = true;
    committed.current = 'none';
    setWakeup(null);
    setSeenBefore(false);
    setStorageRead(false);
    setImpatient(false);
    (async () => {
      let stored: Stored | null = null;
      try {
        const raw = await AsyncStorage.getItem(KEY(userKey));
        if (raw) stored = JSON.parse(raw) as Stored;
      } catch {
        // A broken or unavailable store is not an error the user should meet.
        stored = null;
      }
      if (!ok || !alive.current) return;
      if (stored?.message && stored.date === localDay()) {
        committed.current = 'full';
        setWakeup(stored.message);
        setSeenBefore(true);
      }
      setStorageRead(true);
    })();
    return () => { ok = false; };
  }, [userKey, nonce]);

  // 2 — Kai does not wait forever for his own data.
  useEffect(() => {
    if (!storageRead || committed.current === 'full') return;
    const t = setTimeout(() => { if (alive.current) setImpatient(true); }, PATIENCE_MS);
    return () => clearTimeout(t);
  }, [storageRead, nonce]);

  // 3 — compose, persist, and upgrade a degraded message if the data shows up.
  useEffect(() => {
    if (!storageRead) return;
    if (committed.current === 'full') return;

    const settled = !home.loading;
    if (!settled && !impatient) return;

    const message = home.data
      ? composeWakeup({ name, data: home.data })
      : degradedWakeup({ name, reason: home.error });

    if (message.degraded) {
      // Show it, but do not spend the day's greeting on it.
      if (committed.current === 'none') {
        committed.current = 'degraded';
        setWakeup(message);
        setSeenBefore(false);
      }
      return;
    }

    committed.current = 'full';
    setWakeup(message);
    setSeenBefore(false);
    void AsyncStorage.setItem(KEY(userKey), JSON.stringify({ date: message.date, message } satisfies Stored)).catch(() => {});
  }, [storageRead, impatient, home.loading, home.data, home.error, name, userKey]);

  const clear = useCallback(() => {
    void AsyncStorage.removeItem(KEY(userKey)).catch(() => {});
    setNonce((n) => n + 1);
  }, [userKey]);

  return { wakeup, greeting, seenBefore, ready: !!wakeup, clear };
}
