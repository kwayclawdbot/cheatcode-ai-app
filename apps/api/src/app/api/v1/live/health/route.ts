/**
 * GET /api/v1/live/health
 *
 * The operator's view: what is on, how deep the buffer is, what it has cost, and
 * what went wrong last.
 *
 * BUFFER DEPTH IS THE NUMBER THAT MATTERS. Everything else here is accounting;
 * buffer depth is the only figure that predicts the one failure an audience can
 * actually see, which is the show going quiet. It is derived from the SEGMENT
 * ROWS — segments prepared but not yet played — rather than reported by the
 * worker, so a wedged director cannot report a healthy buffer it does not have.
 *
 * Spend and last error DO come from the worker (`live_shows.meta`), because only
 * the process that paid the bill knows what it cost.
 */
import type { NextRequest } from 'next/server';
import { LiveHealthResponse } from '@shared/live';
import { authed, ok, type Ctx } from '@/lib/http';
import { assertMayWatch, currentShow, segmentsOf } from '../_lib/shows';

export const dynamic = 'force-dynamic';

export const GET = authed(async (_req: NextRequest, ctx: Ctx) => {
  const show = await currentShow();
  if (!show) {
    return ok(
      LiveHealthResponse.parse({
        show: null,
        segment: null,
        buffer_depth: 0,
        segments_done: 0,
        spend_usd: 0,
        budget_usd_per_hour: 0,
        degraded: false,
        last_error: null,
        heartbeat_at: null,
        plain: 'No show has run yet.',
      })
    );
  }

  await assertMayWatch(ctx.user.id, show.mode);

  const segments = await segmentsOf(show.id);
  const meta = (show.meta ?? {}) as Record<string, unknown>;
  const health = (meta.health ?? {}) as Record<string, unknown>;

  const prepared = segments.filter((s) => s.state === 'prepared').length;
  const done = segments.filter((s) => s.state === 'done').length;
  const playing = segments.find((s) => s.state === 'playing') ?? null;
  const spend = segments.reduce((acc, s) => acc + (s.cost_usd ?? 0), 0);

  return ok(
    LiveHealthResponse.parse({
      show,
      segment: playing,
      buffer_depth: prepared,
      segments_done: done,
      spend_usd: Math.round(spend * 10000) / 10000,
      budget_usd_per_hour: Number(health.budget_usd_per_hour ?? 0),
      degraded: health.degraded === true,
      last_error: (health.last_error as string) ?? null,
      heartbeat_at: (health.heartbeat_at as string) ?? null,
      plain:
        show.status !== 'live'
          ? `That show has ended. ${done} segments, ${spend.toFixed(2)} dollars.`
          : prepared === 0
            ? 'On air with nothing prepared behind it — the next gap will be a bridge.'
            : `On air, ${prepared} segment${prepared === 1 ? '' : 's'} ready behind this one.`,
    })
  );
});
