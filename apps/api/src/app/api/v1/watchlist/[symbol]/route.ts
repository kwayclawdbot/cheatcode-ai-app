/** DELETE /api/v1/watchlist/:symbol */
import type { NextRequest } from 'next/server';
import { WatchlistResponse } from '@shared/api';
import { authedParams, ok, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { emitUserEvent } from '@/lib/events';
import { removeFromWatchlist, WATCHLIST_UNAVAILABLE_PLAIN } from '@/lib/watchlist';
import { watchlistItems } from '@/lib/watchlist-view';

export const dynamic = 'force-dynamic';

export const DELETE = authedParams<{ symbol: string }>(
  async (_req: NextRequest, ctx: Ctx & { params: { symbol: string } }) => {
    const symbol = ctx.params.symbol.toUpperCase();
    const res = await removeFromWatchlist(ctx.user.id, symbol, ctx.requestId);
    if (res.missing) throw new ApiError('INTERNAL', WATCHLIST_UNAVAILABLE_PLAIN);
    if (!res.ok) throw new ApiError('INTERNAL', 'We could not take that off your watchlist. Please try again.');

    await emitUserEvent(
      ctx.user.id,
      'system',
      'watchlist',
      ctx.user.id,
      { event: 'watchlist_removed', symbol },
      ctx.requestId
    );

    const wl = await watchlistItems(ctx.user.id, ctx.requestId);
    return ok(
      WatchlistResponse.parse({
        id: wl.id,
        name: wl.name,
        items: wl.items,
        empty_copy: 'Nothing on your watchlist yet. Add a symbol and I will keep its price here.',
        degraded: wl.degraded,
        degraded_reason: wl.degraded_reason,
      })
    );
  }
);
