/**
 * NOTICING THAT SOMEBODY MOVED UP A BELT.
 *
 * There is no "you were promoted" event on the wire, and asking for one would
 * be the wrong shape: a belt is derived from points (`belt_for()` in migration
 * 0039), so it is a FACT that is true or not each time you look, not a message
 * that can be missed or delivered twice. What this does is compare the belt the
 * server reports now against the last one this device saw, and say something
 * only when it went up.
 *
 * THREE RULES, AND EACH ONE EXISTS BECAUSE THE OBVIOUS VERSION IS WRONG:
 *
 *   1. THE FIRST READ NEVER CELEBRATES. Somebody who installs the app on a
 *      second phone already holds a brown belt; congratulating them on it is
 *      congratulating them on nothing that just happened. The first read seeds
 *      the store silently.
 *
 *   2. IT ONLY EVER FIRES UPWARD. Belts move both ways — a run of calls going
 *      against you takes a rung back — and the store is written in both
 *      directions so the next promotion is still noticed. Going down is not an
 *      event this app interrupts anybody about.
 *
 *   3. IT IS DEVICE-LOCAL AND SAYS SO BY BEING SO. AsyncStorage, not the
 *      server: the alternative is a `seen_at` column whose only job is to stop
 *      a sheet appearing twice, and a person with two phones seeing this once
 *      on each is a much smaller problem than a schema that has to be right
 *      about it.
 */
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../../lib/api';
import { beltRank } from './belts';
import type { Belt, BeltBlock } from '../../lib/types';

const KEY = 'cc.belt_seen.v1';

async function readSeen(userId: string): Promise<Belt | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, Belt>;
    return map[userId] ?? null;
  } catch {
    return null;
  }
}

async function writeSeen(userId: string, belt: Belt): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, Belt>) : {};
    map[userId] = belt;
    await AsyncStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* A device that cannot remember shows it again next launch. Harmless. */
  }
}

export type BeltUp = {
  /** The belt to celebrate, or null when there is nothing to say. */
  block: BeltBlock | null;
  dismiss: () => void;
};

export function useBeltUp(userId: string | null): BeltUp {
  const [block, setBlock] = useState<BeltBlock | null>(null);

  useEffect(() => {
    if (!userId || !api.available()) return;
    let alive = true;
    (async () => {
      let record;
      try {
        record = (await api.contributorSocial(userId)).record;
      } catch {
        return;   // The board is not live here. Nothing to say, and no error.
      }
      if (!alive || !record) return;
      const seen = await readSeen(userId);
      if (!alive) return;
      await writeSeen(userId, record.belt.key);
      // Rule 1: nothing on the first read. Rule 2: upward only.
      if (seen && beltRank(record.belt.key) > beltRank(seen) && alive) setBlock(record.belt);
    })();
    return () => { alive = false; };
  }, [userId]);

  const dismiss = useCallback(() => setBlock(null), []);
  return { block, dismiss };
}

/**
 * The same moment, forced, so it can be looked at and shot.
 *
 * A rare state that nobody has opened is a state nobody has designed — the
 * portal keeps `?sim=readfail` for exactly this reason. This is the belt
 * sheet's equivalent, reachable at `/community?belt=1`.
 */
export const PREVIEW_BELT: BeltBlock = {
  key: 'purple',
  label: 'Purple belt',
  next_at: 180,
  next_label: 'Brown belt',
  progress: 0.08,
};
