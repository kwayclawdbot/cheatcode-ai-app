/**
 * POST /api/v1/live/requests
 *
 * "Kai, pull up NVDA." Premium only (spec 15 §L8, L28).
 *
 * RATE LIMITED because the queue is a shared resource with a human-speed
 * consumer: the show gets through roughly ten names an hour, so one enthusiast
 * with a loop could own the entire rundown. Three an hour is enough to ask for
 * what you came for and not enough to become the show.
 *
 * The symbol is validated against `instruments` before it is queued. A request
 * for a ticker the app has never heard of would reach the director, fail to
 * resolve a single candle, and burn a segment slot on silence — so it is
 * refused here, where there is somebody to tell.
 */
import type { NextRequest } from 'next/server';
import { LiveRequestCreate, LiveRequestResponse } from '@shared/live';
import { authed, ok, parseBody, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { entitlementRequired, loadEntitlements } from '@/lib/entitlements';
import { rateLimit } from '@/lib/ratelimit';
import { serviceClient, isMissingObject } from '@/lib/db';
import { currentShow } from '../_lib/shows';

export const dynamic = 'force-dynamic';

const PER_HOUR = 3;

export const POST = authed(async (req: NextRequest, ctx: Ctx) => {
  const body = await parseBody(req, LiveRequestCreate);
  const symbol = body.symbol.toUpperCase();

  const ent = await loadEntitlements(ctx.user.id);
  if (ent.tier !== 'premium') {
    throw entitlementRequired('Asking Kai to pull up a ticker on the live show is part of Premium.');
  }

  rateLimit({
    key: `live:request:${ctx.user.id}`,
    limit: PER_HOUR,
    windowMs: 3_600_000,
    messagePlain: `You can ask for ${PER_HOUR} tickers an hour. Give the ones you already asked for a chance to come up.`,
  });

  const db = serviceClient();

  const known = await db.from('instruments').select('symbol').eq('symbol', symbol).maybeSingle();
  if (!known.data) {
    throw new ApiError('NOT_FOUND', `I do not follow ${symbol}, so I would have nothing to show you.`);
  }

  const show = await currentShow().catch(() => null);

  const { data, error } = await db
    .from('live_requests')
    .insert({
      user_id: ctx.user.id,
      show_id: show?.id ?? null,
      symbol,
      note: body.note ?? null,
      status: 'queued',
    })
    .select('id,symbol,note,status,created_at')
    .single();

  if (error || !data) {
    if (isMissingObject(error)) {
      throw new ApiError('NOT_FOUND', 'Kai Live is not switched on for this environment yet.');
    }
    throw new ApiError('INTERNAL', 'I could not get that request into the queue. Please try again.');
  }

  const ahead = await db
    .from('live_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'queued')
    .lt('created_at', String(data.created_at));

  const position = (ahead.count ?? 0) + 1;

  return ok(
    LiveRequestResponse.parse({
      request: {
        id: String(data.id),
        symbol: String(data.symbol),
        note: (data.note as string) ?? null,
        status: String(data.status),
        created_at: String(data.created_at),
      },
      queue_position: show?.status === 'live' ? position : null,
      plain:
        show?.status === 'live'
          ? position === 1
            ? `${symbol} is next in the queue.`
            : `${symbol} is number ${position} in the queue.`
          : `${symbol} is in the queue for the next show.`,
    }),
    { status: 201 }
  );
});
