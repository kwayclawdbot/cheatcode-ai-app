/**
 * Watchlists (SCHEMA-2 migration 0017).
 *
 * 00 §4 lets the client write these directly under RLS; these wrappers exist so
 * the server paths that need them — `POST /setups/:id/follow`, the Trade
 * landing, the symbol page — do not depend on the client having done it.
 *
 * `missing:true` is returned when 0017 has not been applied yet. Callers report
 * that honestly rather than pretending the add worked.
 */
import { serviceClient, isMissingObject } from './db';
import { log } from './log';

export type WatchlistRef = { id: string | null; name: string; missing: boolean };
export type WatchlistRow = { symbol: string; note: string | null; added_at: string | null };

const DEFAULT_NAME = 'Watchlist';

/** The user's first watchlist, created on demand if the trigger has not. */
export async function ensureWatchlist(userId: string, requestId = '-'): Promise<WatchlistRef> {
  const db = serviceClient();
  const found = await db
    .from('watchlists')
    .select('id,name')
    .eq('user_id', userId)
    .order('position', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (found.error && isMissingObject(found.error)) return { id: null, name: DEFAULT_NAME, missing: true };
  if (found.data) {
    const row = found.data as Record<string, unknown>;
    return { id: String(row.id), name: String(row.name ?? DEFAULT_NAME), missing: false };
  }

  const created = await db
    .from('watchlists')
    .insert({ user_id: userId, name: DEFAULT_NAME })
    .select('id,name')
    .single();
  if (created.error) {
    if (isMissingObject(created.error)) return { id: null, name: DEFAULT_NAME, missing: true };
    log('warn', requestId, 'watchlist.create_failed', { message: created.error.message });
    return { id: null, name: DEFAULT_NAME, missing: false };
  }
  const row = created.data as Record<string, unknown>;
  return { id: String(row.id), name: String(row.name ?? DEFAULT_NAME), missing: false };
}

export async function listWatchlist(
  userId: string,
  requestId = '-'
): Promise<WatchlistRef & { items: WatchlistRow[] }> {
  const ref = await ensureWatchlist(userId, requestId);
  if (!ref.id) return { ...ref, items: [] };

  const db = serviceClient();
  const { data, error } = await db
    .from('watchlist_items')
    .select('symbol,note,added_at')
    .eq('watchlist_id', ref.id)
    .order('added_at', { ascending: false });
  if (error) {
    if (isMissingObject(error)) return { ...ref, missing: true, items: [] };
    log('warn', requestId, 'watchlist.list_failed', { message: error.message });
    return { ...ref, items: [] };
  }
  return {
    ...ref,
    items: (data ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      return {
        symbol: String(row.symbol),
        note: (row.note as string) ?? null,
        added_at: (row.added_at as string) ?? null,
      };
    }),
  };
}

export async function addToWatchlist(
  userId: string,
  symbol: string,
  note: string | null,
  requestId = '-'
): Promise<{ ok: boolean; already: boolean; missing: boolean; ref: WatchlistRef }> {
  const ref = await ensureWatchlist(userId, requestId);
  if (!ref.id) return { ok: false, already: false, missing: ref.missing, ref };

  const db = serviceClient();
  const existing = await db
    .from('watchlist_items')
    .select('symbol')
    .eq('watchlist_id', ref.id)
    .eq('symbol', symbol.toUpperCase())
    .maybeSingle();
  if (existing.error && isMissingObject(existing.error)) {
    return { ok: false, already: false, missing: true, ref };
  }
  if (existing.data) return { ok: true, already: true, missing: false, ref };

  const { error } = await db
    .from('watchlist_items')
    .insert({ watchlist_id: ref.id, symbol: symbol.toUpperCase(), note });
  if (error) {
    if (isMissingObject(error)) return { ok: false, already: false, missing: true, ref };
    log('warn', requestId, 'watchlist.add_failed', { symbol, message: error.message });
    return { ok: false, already: false, missing: false, ref };
  }
  return { ok: true, already: false, missing: false, ref };
}

export async function removeFromWatchlist(
  userId: string,
  symbol: string,
  requestId = '-'
): Promise<{ ok: boolean; missing: boolean }> {
  const ref = await ensureWatchlist(userId, requestId);
  if (!ref.id) return { ok: false, missing: ref.missing };
  const db = serviceClient();
  const { error } = await db
    .from('watchlist_items')
    .delete()
    .eq('watchlist_id', ref.id)
    .eq('symbol', symbol.toUpperCase());
  if (error) {
    if (isMissingObject(error)) return { ok: false, missing: true };
    log('warn', requestId, 'watchlist.remove_failed', { symbol, message: error.message });
    return { ok: false, missing: false };
  }
  return { ok: true, missing: false };
}

export const WATCHLIST_UNAVAILABLE_PLAIN =
  'Your watchlist is not set up on this database yet, so I could not save that there.';
