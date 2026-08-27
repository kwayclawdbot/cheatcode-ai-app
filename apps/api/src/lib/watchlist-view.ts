/**
 * Watchlist rows with quotes, names and any live setup attached.
 *
 * Shared by GET /watchlist, DELETE /watchlist/:symbol and GET /trade/landing so
 * all three show the same thing, priced the same way, with the same freshness.
 */
import type { WatchlistItem } from '@shared/api';
import { serviceClient } from './db';
import { getSnapshot } from './market/polygon';
import { listWatchlist } from './watchlist';

export async function watchlistItems(userId: string, requestId: string): Promise<{
  id: string | null;
  name: string;
  missing: boolean;
  items: WatchlistItem[];
  degraded: boolean;
  degraded_reason: string | null;
}> {
  const wl = await listWatchlist(userId, requestId);
  if (!wl.items.length) {
    return { id: wl.id, name: wl.name, missing: wl.missing, items: [], degraded: false, degraded_reason: null };
  }

  const symbols = wl.items.map((i) => i.symbol);
  const db = serviceClient();
  const [snap, names, setups] = await Promise.all([
    getSnapshot(symbols),
    db.from('instruments').select('symbol,name').in('symbol', symbols),
    db
      .from('setups')
      .select('id,symbol,grade_display,state,score')
      .in('symbol', symbols)
      .in('state', ['discovered', 'watching', 'forming', 'ready'])
      .order('score', { ascending: false, nullsFirst: false }),
  ]);

  const nameBy = new Map(
    ((names.data ?? []) as Record<string, unknown>[]).map((r) => [String(r.symbol), (r.name as string) ?? null])
  );
  const quoteBy = new Map(snap.quotes.map((q) => [q.symbol, q]));
  const setupBy = new Map<string, Record<string, unknown>>();
  for (const s of (setups.data ?? []) as Record<string, unknown>[]) {
    if (!setupBy.has(String(s.symbol))) setupBy.set(String(s.symbol), s);
  }

  const items: WatchlistItem[] = wl.items.map((i) => {
    const setup = setupBy.get(i.symbol) ?? null;
    return {
      symbol: i.symbol,
      name: nameBy.get(i.symbol) ?? null,
      note: i.note,
      added_at: i.added_at,
      quote: quoteBy.get(i.symbol) ?? null,
      setup_id: setup ? String(setup.id) : null,
      grade_display: setup ? ((setup.grade_display as string) ?? null) : null,
      state: setup ? (setup.state as WatchlistItem['state']) : null,
    };
  });

  return {
    id: wl.id,
    name: wl.name,
    missing: wl.missing,
    items,
    degraded: snap.degraded,
    degraded_reason: snap.degraded_reason,
  };
}
