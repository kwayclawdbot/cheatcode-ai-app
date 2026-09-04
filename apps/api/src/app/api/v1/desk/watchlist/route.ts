/**
 * GET  /api/v1/desk/watchlist  → what the brain is holding, and what price is doing
 * POST /api/v1/desk/watchlist  → put a ticker you chose onto it
 *
 * The list is the desk's picks plus anything added by hand. A pass is NOT on
 * it: the desk wrote those up and declined, and watching something you
 * declined is how a watchlist becomes a junk drawer.
 */
import type { NextRequest } from 'next/server';
import { DeskWatchAddRequest, DeskWatchlistResponse } from '@shared/desk';
import { authed, ok, parseBody, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { addManualWatch, kaiSource, loadWatchlist } from '@/lib/desk/source';

export const dynamic = 'force-dynamic';

export const GET = authed(async (_req: NextRequest, _ctx: Ctx) => {
  const { asOf, rows } = await loadWatchlist(kaiSource());
  return ok(DeskWatchlistResponse.parse({ asOf, rows }));
});

export const POST = authed(async (req: NextRequest, _ctx: Ctx) => {
  const body = await parseBody(req, DeskWatchAddRequest);
  const res = await addManualWatch(kaiSource(), body.ticker, body.theme);
  if (!res.added) throw new ApiError('STATE_CONFLICT', res.reason ?? 'That name is already on the list.');
  const { asOf, rows } = await loadWatchlist(kaiSource());
  return ok(DeskWatchlistResponse.parse({ asOf, rows }), { status: 201 });
});
