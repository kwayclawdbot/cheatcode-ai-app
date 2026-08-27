/**
 * GET /api/v1/watchlist · POST /api/v1/watchlist {symbol}
 *
 * 00 §4 lets the client write watchlists directly under RLS. Both paths exist
 * on purpose: the client may write direct, and these wrappers give the server
 * surfaces (Trade landing, follow, symbol page) one place to do the same work
 * with quotes attached.
 */
import type { NextRequest } from 'next/server';
import { WatchlistResponse, WatchlistAddRequest } from '@shared/api';
import { authed, ok, parseBody, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { serviceClient } from '@/lib/db';
import { emitUserEvent } from '@/lib/events';
import { addToWatchlist, WATCHLIST_UNAVAILABLE_PLAIN } from '@/lib/watchlist';
import { watchlistItems } from '@/lib/watchlist-view';

export const dynamic = 'force-dynamic';

const EMPTY_COPY = 'Nothing on your watchlist yet. Add a symbol and I will keep its price here.';

export const GET = authed(async (_req: NextRequest, ctx: Ctx) => {
  const wl = await watchlistItems(ctx.user.id, ctx.requestId);
  return ok(
    WatchlistResponse.parse({
      id: wl.id,
      name: wl.name,
      items: wl.items,
      empty_copy: wl.missing ? WATCHLIST_UNAVAILABLE_PLAIN : EMPTY_COPY,
      degraded: wl.degraded || wl.missing,
      degraded_reason: wl.missing ? WATCHLIST_UNAVAILABLE_PLAIN : wl.degraded_reason,
    })
  );
});

export const POST = authed(async (req: NextRequest, ctx: Ctx) => {
  const body = await parseBody(req, WatchlistAddRequest);
  const symbol = body.symbol.toUpperCase();

  const db = serviceClient();
  const known = await db.from('instruments').select('symbol').eq('symbol', symbol).maybeSingle();
  if (!known.data) {
    throw new ApiError('NOT_FOUND', `I do not follow ${symbol} yet, so I cannot put it on your list.`);
  }

  const res = await addToWatchlist(ctx.user.id, symbol, body.note ?? null, ctx.requestId);
  if (res.missing) throw new ApiError('INTERNAL', WATCHLIST_UNAVAILABLE_PLAIN);
  if (!res.ok) throw new ApiError('INTERNAL', 'We could not add that to your watchlist. Please try again.');

  if (!res.already) {
    await emitUserEvent(
      ctx.user.id,
      'system',
      'watchlist',
      res.ref.id ?? ctx.user.id,
      { event: 'watchlist_added', symbol },
      ctx.requestId
    );
  }

  const wl = await watchlistItems(ctx.user.id, ctx.requestId);
  return ok(
    WatchlistResponse.parse({
      id: wl.id,
      name: wl.name,
      items: wl.items,
      empty_copy: EMPTY_COPY,
      degraded: wl.degraded,
      degraded_reason: wl.degraded_reason,
    }),
    { status: res.already ? 200 : 201 }
  );
});
