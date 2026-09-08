/**
 * IS THERE A NETWORK? — the question this app could not previously ask.
 *
 * `api.available()` reads as a connectivity check and is not one: it is
 * `!offlineMode && env.hasApi`, which asks whether a base URL was compiled in.
 * It is true on a phone in a lift and true in aeroplane mode. Every screen that
 * used it to decide whether to fetch was really deciding whether the build was
 * configured, and every request that then failed became an indistinguishable
 * "Something went wrong" — the exact conflation audit F18 names.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A MODULE, NOT A REACT PROVIDER
 * ─────────────────────────────────────────────────────────────────────────────
 * One NetInfo subscription serves the whole app. Making it a context would put
 * a component in `app/_layout.tsx` — which this lane does not own — and would
 * buy nothing: there is exactly one network, it has no props, and nothing about
 * it varies by position in the tree. So the subscription is started lazily by
 * the first `useConnectivity()` and shared by every later one, and a screen
 * needs no wiring above it to get a true answer.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THREE STATES, AND `unknown` IS ONE OF THEM
 * ─────────────────────────────────────────────────────────────────────────────
 * Before NetInfo's first answer we do not know. `online: undefined` means that,
 * and it deliberately does NOT mean offline: flashing an offline banner for
 * 200ms on every cold start would teach members to ignore it, which is worse
 * than not having one. `capabilityFor` treats only an explicit `false` as
 * offline for the same reason.
 *
 * The captive-portal rule — `isInternetReachable` false means offline even when
 * `isConnected` is true — lives in `lib/capability-state.ts` as `onlineFrom`,
 * with the argument for it, so it can be asserted without a native module.
 */
import { useEffect, useState } from 'react';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
/** The two-booleans-to-one-answer rule, kept pure so it can be asserted. */
import { onlineFrom } from '../../lib/capability-state';

export type Connectivity = {
  /** undefined until the first answer. NEVER treat undefined as offline. */
  online: boolean | undefined;
  /** "wifi" / "cellular" / "none" — for the sentence, never for a decision. */
  kind: string | null;
  /** Epoch ms of the last change. Null before the first answer. */
  changedAt: number | null;
};

const INITIAL: Connectivity = { online: undefined, kind: null, changedAt: null };

let current: Connectivity = INITIAL;
let unsubscribe: (() => void) | null = null;
const listeners = new Set<(c: Connectivity) => void>();

export function readState(s: NetInfoState): Connectivity {
  return { online: onlineFrom(s), kind: s.type ?? null, changedAt: Date.now() };
}

function publish(next: Connectivity) {
  const changed = next.online !== current.online || next.kind !== current.kind;
  current = changed ? next : { ...current };
  if (changed) listeners.forEach((l) => l(current));
}

function start() {
  if (unsubscribe) return;
  try {
    unsubscribe = NetInfo.addEventListener((s) => publish(readState(s)));
    void NetInfo.fetch().then((s) => publish(readState(s))).catch(() => {});
  } catch {
    /**
     * No native module (a bare web bundle, a test renderer). We stay at
     * `undefined` forever, which means every screen behaves exactly as it did
     * before this file existed. Guessing "online" here would be inventing a
     * fact, and guessing "offline" would break every screen at once.
     */
    unsubscribe = null;
  }
}

/** Ask the OS again, now. This is what "Retry connection" calls first. */
export async function recheck(): Promise<Connectivity> {
  try {
    const s = await NetInfo.refresh();
    publish(readState(s));
  } catch {
    /* leave the last known answer standing */
  }
  return current;
}

/** For tests: drive the module without a native module underneath it. */
export function __setConnectivityForTest(c: Connectivity): void {
  publish(c);
}

export function snapshot(): Connectivity {
  return current;
}

export function useConnectivity(): Connectivity {
  const [state, setState] = useState<Connectivity>(current);
  useEffect(() => {
    start();
    listeners.add(setState);
    setState(current);
    return () => { listeners.delete(setState); };
  }, []);
  return state;
}
