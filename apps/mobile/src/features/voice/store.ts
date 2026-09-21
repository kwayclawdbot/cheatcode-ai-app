/**
 * Is Kai's voice on, and does this member want replies spoken — ONE copy for
 * the whole app (lane C).
 *
 * Home, the Kai sheet and Settings all read it, and a toggle flipped in
 * Settings must be true on Home the moment the member goes back. So it is a
 * tiny module store rather than three fetches that can disagree.
 *
 * `available: false` is the default and the answer whenever the service cannot
 * be asked (offline, fixtures, an API without the route). The microphone is
 * NOT DRAWN in that state — the 09-07 audit removed a mic that was a dead
 * button, and it only comes back when the server has said voice is live.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { api } from '../../lib/api';
import { voiceApi } from './api';

export type VoicePrefs = {
  loaded: boolean;
  available: boolean;
  replies: boolean;
  maxSeconds: number;
  saving: boolean;
  error: string | null;
};

let state: VoicePrefs = { loaded: false, available: false, replies: false, maxSeconds: 60, saving: false, error: null };
const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;

function set(patch: Partial<VoicePrefs>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function loadVoicePrefs(force = false): Promise<void> {
  if (!api.available()) {
    if (!state.loaded) set({ loaded: true, available: false });
    return Promise.resolve();
  }
  if (inflight) return inflight;
  if (state.loaded && !force) return Promise.resolve();
  inflight = voiceApi
    .settings()
    .then((s) => set({ loaded: true, available: !!s.available, replies: !!s.replies, maxSeconds: s.max_seconds || 60 }))
    .catch(() => set({ loaded: true, available: false }))
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Optimistic, and put back with a sentence if the server says no. */
export async function setVoiceReplies(on: boolean): Promise<void> {
  const before = state.replies;
  set({ replies: on, saving: true, error: null });
  try {
    const s = await voiceApi.setReplies(on);
    set({ replies: !!s.replies, available: !!s.available, saving: false });
  } catch (e) {
    set({ replies: before, saving: false, error: e instanceof Error ? e.message : "That didn't save. Try again." });
  }
}

export function getVoicePrefs(): VoicePrefs {
  return state;
}

export function useVoicePrefs(): VoicePrefs {
  const snap = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state
  );
  useEffect(() => {
    void loadVoicePrefs();
  }, []);
  return snap;
}
