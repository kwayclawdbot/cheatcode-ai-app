/**
 * GET  /api/v1/desk/watchlist  → what the brain is holding, and what price is doing
 * POST /api/v1/desk/watchlist  → put a ticker you chose onto it
 *
 * The list is the desk's picks plus anything added by hand. A pass is NOT on
 * it: the desk wrote those up and declined, and watching something you
 * declined is how a watchlist becomes a junk drawer.
 *
 * `companies` rides along on the same response: the desk's published research
 * list, which is the judgement of the businesses rather than the positions
 * taken in them. One request, because the Invest tab draws both and a second
 * round trip for the section directly above the first one is a spinner nobody
 * asked for. An empty array means the desk has not published a list — never
 * that the read failed, which throws.
 */
import type { NextRequest } from 'next/server';
import { DeskWatchAddRequest, DeskWatchlistResponse } from '@shared/desk';
import { authed, ok, parseBody, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { addManualWatch, kaiSource, loadResearch, loadWatchlist } from '@/lib/desk/source';

export const dynamic = 'force-dynamic';

export const GET = authed(async (_req: NextRequest, _ctx: Ctx) => {
  const src = kaiSource();
  const [{ asOf, rows }, companies] = await Promise.all([
    loadWatchlist(src),
    loadResearch(src),
  ]);
  return ok(DeskWatchlistResponse.parse({ asOf, rows, companies }));
});

export const POST = authed(async (req: NextRequest, _ctx: Ctx) => {
  const body = await parseBody(req, DeskWatchAddRequest);
  const res = await addManualWatch(kaiSource(), body.ticker, body.theme);
  if (!res.added) throw new ApiError('STATE_CONFLICT', res.reason ?? 'That name is already on the list.');
  // The ADD is untouched: one manual row, scoped exactly as it was. What
  // changed is that the board it hands back carries the research list too —
  // `companies` defaults to `[]` in the contract, and an empty array on this
  // surface is a statement ("the desk has not published a list"), so a 201 that
  // omitted it would be telling the caller something false about the desk in
  // order to save one read of a 27-row table.
  const src = kaiSource();
  const [{ asOf, rows }, companies] = await Promise.all([
    loadWatchlist(src),
    loadResearch(src),
  ]);
  return ok(DeskWatchlistResponse.parse({ asOf, rows, companies }), { status: 201 });
});
