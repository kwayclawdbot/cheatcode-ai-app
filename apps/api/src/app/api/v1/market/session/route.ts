/**
 * GET /api/v1/market/session
 *
 * Session status from the exchange calendar when we can reach it, and from the
 * America/New_York clock and weekends when we cannot.
 *
 * THE HOLIDAY GAP IS CLOSED, CONDITIONALLY. `/v1/marketstatus/now` is Polygon's
 * own answer and it knows about holidays and half-days; it costs one request a
 * minute and is cached. When we have it, `holidays_known` is true and the
 * notice says so. When we do not — no key, a rate-limit, a bad minute — the
 * clock answers on its own and the old honest `false` travels with it. The one
 * thing this route may never do is claim a calendar it did not read.
 */
import type { NextRequest } from 'next/server';
import { SessionResponse } from '@shared/api';
import { authed, ok, type Ctx } from '@/lib/http';
import { holidayNotice, liveMarketBlock } from '@/lib/market/live';

export const dynamic = 'force-dynamic';

export const GET = authed(async (_req: NextRequest, _ctx: Ctx) => {
  const market = await liveMarketBlock();
  return ok(
    SessionResponse.parse({
      market,
      holidays_known: market.holidays_known,
      notice_plain: holidayNotice(market.holidays_known),
    })
  );
});
