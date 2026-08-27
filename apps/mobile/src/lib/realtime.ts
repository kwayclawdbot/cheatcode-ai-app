/**
 * Room live updates (lane MOBILE-B).
 *
 * Supabase Realtime `postgres_changes` on `messages` filtered by room_id is the
 * fast path. It only works if the publication includes `messages` AND the
 * member's RLS select policy lets them read the row — neither is guaranteed by
 * the v1 migrations, so this module never assumes it worked: if the channel
 * does not reach SUBSCRIBED inside SUBSCRIBE_TIMEOUT_MS, or it errors, closes,
 * or the client is missing entirely, it silently degrades to a 5s poll and
 * reports `mode:'poll'` so the room header can say so honestly.
 *
 * No new dependency: @supabase/supabase-js ships the Realtime client.
 */
import { supabase } from './supabase';
import { offlineMode } from './env';

export type RealtimeMode = 'realtime' | 'poll' | 'off';

export const POLL_INTERVAL_MS = 5_000;
const SUBSCRIBE_TIMEOUT_MS = 4_000;

export type RoomChannel = {
  /** What is actually keeping the room fresh right now. */
  mode: () => RealtimeMode;
  unsubscribe: () => void;
};

/**
 * @param roomId    rooms.id
 * @param onChange  called on every insert (realtime) or tick (poll). The caller
 *                  is responsible for fetching `after_seq` and merging.
 * @param onMode    told whenever the transport changes, so the UI can relabel.
 */
export function subscribeRoom(
  roomId: string,
  onChange: () => void,
  onMode?: (mode: RealtimeMode) => void,
): RoomChannel {
  let mode: RealtimeMode = 'off';
  let disposed = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let settleTimer: ReturnType<typeof setTimeout> | null = null;
  let channel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;

  const setMode = (m: RealtimeMode) => {
    if (disposed || mode === m) return;
    mode = m;
    onMode?.(m);
  };

  const startPolling = () => {
    if (disposed || timer) return;
    setMode('poll');
    timer = setInterval(() => { if (!disposed) onChange(); }, POLL_INTERVAL_MS);
  };

  const stopRealtime = () => {
    if (!channel) return;
    try { supabase?.removeChannel(channel); } catch { /* already gone */ }
    channel = null;
  };

  // Fixtures / no Supabase: nothing to listen to and nothing to poll.
  if (offlineMode || !supabase) {
    setMode('off');
    return { mode: () => mode, unsubscribe: () => { disposed = true; } };
  }

  try {
    channel = supabase
      .channel(`room:${roomId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
        () => { if (!disposed) onChange(); },
      )
      .subscribe((status: string) => {
        if (disposed) return;
        if (status === 'SUBSCRIBED') {
          if (timer) { clearInterval(timer); timer = null; }
          setMode('realtime');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          stopRealtime();
          startPolling();
        }
      });
  } catch {
    startPolling();
  }

  // Belt and braces: if SUBSCRIBED never arrives, poll anyway.
  settleTimer = setTimeout(() => {
    if (!disposed && mode !== 'realtime') startPolling();
  }, SUBSCRIBE_TIMEOUT_MS);

  return {
    mode: () => mode,
    unsubscribe: () => {
      disposed = true;
      if (timer) clearInterval(timer);
      if (settleTimer) clearTimeout(settleTimer);
      stopRealtime();
    },
  };
}

/** Header copy for whatever transport won. Never claims live when it is polling. */
export function transportLabel(mode: RealtimeMode): string | null {
  if (mode === 'realtime') return 'Live';
  if (mode === 'poll') return 'Refreshing every 5s';
  return null;
}
