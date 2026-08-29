/**
 * GET /api/v1/live/current?since=&mode=
 *
 * "What is on right now, and what have I missed?" — one request, because those
 * are the same question for anyone who just opened the app.
 *
 * LATE JOIN IS THE DEFAULT CASE, NOT AN EDGE CASE. Nobody arrives at the start
 * of a show. Omitting `since` returns the whole timeline from seq 0, which
 * replays the segments already aired and lands the client in exactly the state
 * a viewer who watched from the beginning is in. Passing the last `seq` the
 * client applied returns only the difference. There is no third mode and no
 * separate "catch-up" endpoint, because a catch-up path that differs from the
 * replay path is a second implementation of the same reconciliation that will
 * eventually disagree with the first.
 */
import type { NextRequest } from 'next/server';
import { LiveCurrentQuery, LiveCurrentResponse, liveChannel } from '@shared/live';
import { authed, ok, parseQuery, type Ctx } from '@/lib/http';
import { assertMayWatch, currentShow, framesOf, segmentsOf } from '../_lib/shows';

export const dynamic = 'force-dynamic';

export const GET = authed(async (req: NextRequest, ctx: Ctx) => {
  const q = parseQuery(req, LiveCurrentQuery);
  const show = await currentShow(q.mode);

  if (!show) {
    return ok(
      LiveCurrentResponse.parse({
        show: null,
        segment: null,
        segments: [],
        frames: [],
        cursor: -1,
        channel: null,
        plain: 'Nothing is on right now. The review show goes up after the close.',
      })
    );
  }

  await assertMayWatch(ctx.user.id, show.mode);

  const segments = await segmentsOf(show.id);
  const { frames, cursor } = await framesOf({ showId: show.id, since: q.since ?? -1 });
  const playing = segments.find((s) => s.state === 'playing') ?? null;
  const done = segments.filter((s) => s.state === 'done').length;

  return ok(
    LiveCurrentResponse.parse({
      show,
      segment: playing,
      segments,
      frames,
      cursor,
      channel: liveChannel(show.id),
      plain:
        show.status === 'live'
          ? playing
            ? `Kai is on ${playing.symbol} right now.`
            : 'The show is on air.'
          : `That show has ended. ${done} segment${done === 1 ? '' : 's'} to watch back.`,
    })
  );
});
