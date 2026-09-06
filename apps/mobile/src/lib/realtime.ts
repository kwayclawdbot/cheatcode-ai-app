/**
 * Room live updates.
 *
 * =====================================================================
 * WHAT THIS RUNS ON TODAY: A FIVE-SECOND POLL. AND IT SAYS SO.
 * =====================================================================
 * Supabase Realtime `postgres_changes` on `messages` was written here as the
 * fast path, degrading to a poll if the channel never reached SUBSCRIBED.
 *
 * MEASURED 2026-09-06, SIGNED IN AGAINST HOSTED: the channel reaches
 * SUBSCRIBED and NOTHING EVER ARRIVES. `messages` is not in the
 * `supabase_realtime` publication on either database — only `live_frames` is —
 * and Supabase accepts a subscription to an unpublished table without
 * complaint. So SUBSCRIBED means "the socket is open", not "changes will
 * arrive", and the old code treated the two as the same thing. The room said
 * "Live", stopped polling, and then never updated again. That is worse than no
 * realtime at all: a poll that works beats a socket that lies.
 *
 * So the realtime attempt is OFF, by the constant below, and the room polls.
 * The header says "Refreshing every 5s", which is exactly what is happening.
 *
 * THE POLL IS CHEAP BY CONSTRUCTION. The caller fetches with `after_seq`, a
 * cursor, so a quiet room costs one request that returns an empty array. For a
 * club of this size that is the right amount of machinery, and it behaves the
 * same in fixtures, on a laptop and on hosted.
 *
 * TO TURN REALTIME ON, both of these have to be true, and both are checkable:
 *
 *   1. `messages` is in the publication:
 *        alter publication supabase_realtime add table messages;
 *      (verify: select * from pg_publication_tables where pubname =
 *       'supabase_realtime';)
 *
 *   2. the subscriber can SELECT the rows. Realtime applies RLS as the
 *      subscribing user, and migration 0031 deliberately REVOKED `select on
 *      messages` from `authenticated` — because that grant was also handing
 *      every member the body of every message a moderator had removed. A
 *      publication alone would therefore deliver nothing. Re-granting the whole
 *      table is not the answer; a purpose-built policy or a published,
 *      body-nulled surface is.
 *
 * Until both are done, this constant stays false. It is a boolean rather than a
 * deleted branch so the flip is one line and the code that would run is still
 * in front of whoever does it.
 *
 * No new dependency: @supabase/supabase-js ships the Realtime client.
 */
import { supabase } from './supabase';
import { offlineMode } from './env';

export type RealtimeMode = 'realtime' | 'poll' | 'off';

export const POLL_INTERVAL_MS = 5_000;
const SUBSCRIBE_TIMEOUT_MS = 4_000;

/** See the header. Both conditions above must hold before this becomes true. */
export const REALTIME_ENABLED = false;

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

  // The honest path today. Straight to the poll, without opening a socket that
  // would report SUBSCRIBED and then deliver nothing.
  if (!REALTIME_ENABLED) {
    // No immediate onChange: the caller has just loaded the room itself, and a
    // second fetch in the same breath is a request that can only return what
    // the screen already has.
    startPolling();
    return {
      mode: () => mode,
      unsubscribe: () => {
        disposed = true;
        if (timer) clearInterval(timer);
      },
    };
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
