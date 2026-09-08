import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { fixtureConversations } from '../../lib/fixtures';
import type { ConversationRow, ConversationsPayload } from '../../lib/types';

/**
 * The conversations drawer's data (prototype "Home" board).
 * Conversations get titles, a pin and search. Search filters locally as the
 * user types and re-queries the server when it is connected, so the drawer
 * stays responsive on a slow link.
 *
 * THIS IS THE SELECTION SURFACE, AND SELECTION NOW MEANS SOMETHING (audit F04).
 * A row's `id` is the server conversation Home binds its wall to — see
 * `lib/kai-continuity.ts`. Two consequences for this file:
 *
 *   `reload` IS STABLE, so Home can call it from the hamburger without the
 *   identity of the callback re-running effects. A conversation started during
 *   this sitting only appears on the server after its first turn, and the
 *   drawer is where somebody goes to come back to it, so it is re-read when it
 *   opens rather than once at mount.
 *
 *   NOTHING HERE INVENTS A ROW. There is no optimistic "New conversation" entry
 *   for a thread that has not been spoken in: it would be a title pointing at
 *   an id that does not exist, which is the shape of the bug this lane closed.
 */
export function useConversations() {
  const offline = !api.available();
  const [data, setData] = useState<ConversationsPayload>(offline ? fixtureConversations : { pinned: [], recent: [] });
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(!offline);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (query?: string) => {
    if (offline) { setData(fixtureConversations); setLoading(false); return; }
    setLoading(true);
    try {
      setData(await api.conversations(query));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "I couldn't load your conversations.");
    } finally {
      setLoading(false);
    }
  }, [offline]);

  useEffect(() => { void load(); }, [load]);

  /** Local filter so typing never waits on the network. */
  const filtered = useMemo<ConversationsPayload>(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return data;
    const match = (c: ConversationRow) => c.title.toLowerCase().includes(needle);
    return { pinned: data.pinned.filter(match), recent: data.recent.filter(match) };
  }, [data, q]);

  const togglePin = useCallback(async (id: string) => {
    const all = [...data.pinned, ...data.recent];
    const row = all.find((c) => c.id === id);
    if (!row) return;
    const next = { ...row, pinned: !row.pinned };
    // optimistic — the drawer must feel instant
    setData((d) => {
      const rest = [...d.pinned, ...d.recent].filter((c) => c.id !== id);
      const merged = [...rest, next];
      return { pinned: merged.filter((c) => c.pinned), recent: merged.filter((c) => !c.pinned) };
    });
    if (offline) return;
    try {
      await api.patchConversation(id, { pinned: next.pinned });
    } catch {
      void load(q);   // the server disagreed — take its answer
    }
  }, [data, offline, load, q]);

  const rename = useCallback(async (id: string, title: string) => {
    setData((d) => ({
      pinned: d.pinned.map((c) => (c.id === id ? { ...c, title } : c)),
      recent: d.recent.map((c) => (c.id === id ? { ...c, title } : c)),
    }));
    if (offline) return;
    try { await api.patchConversation(id, { title }); } catch { void load(q); }
  }, [offline, load, q]);

  const reload = useCallback(() => { void load(q); }, [load, q]);

  return {
    data: filtered,
    all: data,
    q,
    setQ: (v: string) => { setQ(v); if (!offline) void load(v); },
    loading,
    error,
    reload,
    togglePin,
    rename,
    isFixture: offline,
  };
}
