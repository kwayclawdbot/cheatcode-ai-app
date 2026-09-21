import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';

/**
 * THE BOOKMARKS ON THE ALERTS BOARD — one set per member, kept on the server.
 *
 * Read once when the board mounts, written on every tap. The tap is drawn at
 * once (a bookmark that waits for a round trip feels broken) and put back if
 * the server refuses, with the refusal kept for the board to show.
 *
 * WHERE THE SERVER CANNOT KEEP IT. Offline, fixtures, or a stack where 0055 is
 * not applied (`available: false`): the mark still toggles, for this session
 * only, and `persisted` is false so nothing claims it was saved anywhere.
 *
 * The set lives at module level so the Home lane's embedded card and the board
 * agree about the same card without a second request.
 */
let saved = new Set<string>();
let loaded = false;
let persisted = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function useAlertBookmarks() {
  /*
   * A SNAPSHOT IN STATE, not a discarded counter: the React Compiler memoises
   * on what a render reads, and the module-level set is invisible to it. The
   * snapshot is what the card reads, so every change re-renders for real.
   */
  const [snap, setSnap] = useState<{ ids: Set<string>; persisted: boolean }>(() => ({ ids: saved, persisted }));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const l = () => setSnap({ ids: saved, persisted });
    listeners.add(l);
    if (!loaded && api.available()) {
      loaded = true;
      api.alertBookmarks()
        .then((r) => { saved = new Set(r.card_ids); persisted = r.available; notify(); })
        .catch(() => { persisted = false; loaded = false; });
    }
    return () => { listeners.delete(l); };
  }, []);

  const toggle = useCallback(async (cardId: string, symbol: string) => {
    const next = !saved.has(cardId);
    saved = new Set(saved);
    if (next) saved.add(cardId); else saved.delete(cardId);
    notify();
    setError(null);
    if (!api.available() || !persisted) return;
    try {
      await api.setAlertBookmark(cardId, symbol, next);
    } catch (e) {
      saved = new Set(saved);
      if (next) saved.delete(cardId); else saved.add(cardId);
      notify();
      setError(e instanceof Error ? e.message : 'That did not save. Try again.');
    }
  }, []);

  return {
    isSaved: (cardId: string) => snap.ids.has(cardId),
    savedIds: snap.ids,
    toggle,
    /** False when a save only lasts this session (see header). */
    persisted: snap.persisted,
    error,
  };
}
