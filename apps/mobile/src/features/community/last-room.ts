/**
 * THE ROOM YOU WERE LAST IN — REMEMBERED SEPARATELY FROM WHAT YOU TRADE.
 *
 * Audit F13 (P1): "Reading another room changes trading mode." Community's
 * headbar used to hold `ModeSegmented`, which writes `profiles.primary_mode`
 * through `PUT /mode`, so opening the investing conversation for two minutes
 * came back as a changed Home, a changed second tab and different
 * recommendations. The board's own footnote is the fix in five words: "Reading
 * a room keeps your trading preferences."
 *
 * So the room is now LOCAL NAVIGATION, and local navigation needs somewhere
 * local to be remembered. This is that place.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THE DEVICE AND NOT THE SERVER
 * ─────────────────────────────────────────────────────────────────────────────
 * The alternative is a `profiles.last_room_id` column, and it would be the
 * wrong shape twice over. It puts a UI cursor in the same table as the member's
 * trading preferences — the exact confusion this change exists to undo — and it
 * makes "which room am I looking at" a thing two devices have to agree about.
 * Somebody with a phone and a tablet reading different rooms is not a conflict
 * to resolve; it is two people-shaped facts about one person. `useBeltUp` made
 * the same call for the same reason and says so in its own header.
 *
 * A DEVICE THAT CANNOT REMEMBER simply lands on the default — the room for the
 * member's stage or their desk — which is exactly the first-run behaviour. Every
 * read and write is wrapped, because AsyncStorage failing is not a reason for
 * Community not to open.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IT STORES A SLUG, NOT AN ID
 * ─────────────────────────────────────────────────────────────────────────────
 * Room ids are `gen_random_uuid()` and differ per environment (0043 §4(ii)), so
 * a stored id survives neither a switch between local and hosted nor a database
 * rebuild — and a stored id that no longer resolves is indistinguishable from
 * "never chose a room". A slug is stable, and 0045 fixed the three: `traders`,
 * `investors`, `beginners`.
 *
 * KEYED BY MEMBER. Two accounts on one device do not inherit each other's room.
 * A signed-out read falls back to a shared key rather than losing the memory,
 * because the person is usually the same person.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'cc.community.last_room.v1';
/** The stand-in key for a device with no session yet. */
const ANON = '-';

type Stored = Record<string, string>;

async function readAll(): Promise<Stored> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Stored) : {};
  } catch {
    return {};
  }
}

export type LastRoom = {
  /** The slug this device last read, or null for "never chose one". */
  slug: string | null;
  /**
   * False until the store has answered. The screen must not pick a room before
   * this is true, or it lands on the default and then jumps — which reads as
   * the app having changed the room by itself.
   */
  ready: boolean;
  /** Called when the member opens a room. Fire-and-forget; never throws. */
  remember: (slug: string | null | undefined) => void;
};

export function useLastRoom(userId: string | null): LastRoom {
  const [slug, setSlug] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  /** What is already on disk, so a write that changes nothing does no IO. */
  const written = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    setReady(false);
    (async () => {
      const all = await readAll();
      if (!alive) return;
      const found = all[userId ?? ANON] ?? null;
      written.current = found;
      setSlug(found);
      setReady(true);
    })();
    return () => { alive = false; };
  }, [userId]);

  const remember = useCallback(
    (next: string | null | undefined) => {
      const value = typeof next === 'string' && next.length ? next : null;
      if (!value || value === written.current) return;
      written.current = value;
      setSlug(value);
      void (async () => {
        try {
          const all = await readAll();
          all[userId ?? ANON] = value;
          await AsyncStorage.setItem(KEY, JSON.stringify(all));
        } catch {
          /* A device that cannot remember opens on the default next time. */
        }
      })();
    },
    [userId],
  );

  return { slug, ready, remember };
}
