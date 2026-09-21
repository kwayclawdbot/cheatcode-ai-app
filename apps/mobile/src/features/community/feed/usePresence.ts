/**
 * PRESENCE AND THE LIVE ROOMS STRIP.
 *
 * `usePresence(roomId)` sends `POST /community/presence` when a Community
 * surface gains focus, whenever it moves between the feed and a room, and then
 * every `next_heartbeat_s` (60s) while it stays focused AND the app is in the
 * foreground. Nothing is sent from a background tab: the server counts only
 * real heartbeats, so a phone in a pocket must not count as "here".
 *
 * `useLiveRooms()` reads the strip. Its counts are the server's, verbatim —
 * `listener_count` per room and `online_total` for the header. It refreshes
 * on the same beat, so the numbers on screen are never older than a minute.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { LiveRoomsResponse } from '@shared/community';
import { api } from '../../../lib/api';
import { env } from '../../../lib/env';
import { isForeground, subscribeForeground } from '../../../lib/foreground';
import { fixtureLiveRooms } from './fixtures';

const DEFAULT_BEAT_S = 60;

export function usePresence(roomId: string | null, onBeat?: () => void) {
  const beatRef = useRef(onBeat);
  beatRef.current = onBeat;

  useFocusEffect(
    useCallback(() => {
      if (!api.available()) return undefined;
      let alive = true;
      let timer: ReturnType<typeof setTimeout> | null = null;

      const schedule = (s: number) => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { void beat(); }, Math.max(15, s) * 1000);
      };
      const beat = async () => {
        if (!alive) return;
        if (!isForeground()) { schedule(DEFAULT_BEAT_S); return; }
        let next = DEFAULT_BEAT_S;
        try {
          const r = await api.communityPresence(roomId);
          next = r.next_heartbeat_s || DEFAULT_BEAT_S;
        } catch {
          /* a missed heartbeat only means this member is not counted for a minute */
        }
        if (!alive) return;
        beatRef.current?.();
        schedule(next);
      };

      void beat();
      // Coming back to the foreground is "I am here" again, straight away.
      const off = subscribeForeground((fg) => { if (fg && alive) void beat(); });
      return () => { alive = false; off(); if (timer) clearTimeout(timer); };
    }, [roomId]),
  );
}

export type LiveRoomsState = {
  data: LiveRoomsResponse | null;
  source: 'api' | 'fixtures' | 'unreachable';
  reload: () => Promise<void>;
};

export function useLiveRooms(): LiveRoomsState {
  const [data, setData] = useState<LiveRoomsResponse | null>(null);
  const [source, setSource] = useState<LiveRoomsState['source']>('api');

  const reload = useCallback(async () => {
    if (env.FIXTURES) { setData(fixtureLiveRooms()); setSource('fixtures'); return; }
    if (!api.available()) { setSource('unreachable'); return; }
    try {
      setData(await api.liveRooms());
      setSource('api');
    } catch {
      setSource('unreachable');
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);
  return { data, source, reload };
}
