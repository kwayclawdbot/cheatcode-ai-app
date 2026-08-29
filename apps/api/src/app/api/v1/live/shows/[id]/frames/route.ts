/**
 * GET /api/v1/live/shows/:id/frames?since=&limit=&segment_id=
 *
 * The replay. Same frames, same order, same result as watching it live — which
 * is the property the whole contract is built around: applying frames 0..N lands
 * on one state whether it happened at 4pm or is being watched at midnight.
 *
 * The entitlement check is on the SHOW, not the frames, so a free user asking
 * for a market-mode replay is told what it costs rather than handed an empty
 * list. (RLS would also hide the rows from their own JWT — see 0023.)
 */
import type { NextRequest } from 'next/server';
import { LiveFramesQuery, LiveFramesResponse } from '@shared/live';
import { authedParams, ok, parseQuery, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { assertMayWatch, framesOf, showById } from '../../../_lib/shows';

export const dynamic = 'force-dynamic';

export const GET = authedParams<{ id: string }>(async (req: NextRequest, ctx: Ctx & { params: { id: string } }) => {
  const q = parseQuery(req, LiveFramesQuery);
  const show = await showById(ctx.params.id);
  if (!show) throw new ApiError('NOT_FOUND', 'I could not find that show.');

  await assertMayWatch(ctx.user.id, show.mode);

  const { frames, cursor, more } = await framesOf({
    showId: show.id,
    since: q.since ?? -1,
    limit: q.limit,
    segmentId: q.segment_id,
  });

  return ok(LiveFramesResponse.parse({ show, frames, cursor, more }));
});
