/**
 * GET /api/v1/market/snapshot?symbols=META,NVDA
 *
 * ONE Polygon call covers every ticker, so the cost does not grow with the
 * symbol list. Each quote carries {price, source_ts, received_ts, freshness}
 * plus `delay_reason`, and every one of those is MEASURED from the data that
 * came back — see the block at the top of lib/market/polygon.ts. This route
 * used to document `delayed`/`entitlement` as a permanent property of the
 * plan; it is now whatever the age of the print says, which outside regular
 * hours is `delayed`/`market_closed` and during them can be `live`.
 *
 * `delayed` NEVER DISABLES AN ACTION. That part is unchanged and is the reason
 * the distinction from `stale` is worth keeping.
 */
import type { NextRequest } from 'next/server';
import { SnapshotQuery, SnapshotResponse } from '@shared/api';
import { authed, ok, parseQuery, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { marketBlock } from '@/lib/market';
import { polygonConfigured, resolveQuotes } from '@/lib/market/polygon';

export const dynamic = 'force-dynamic';

const MAX_SYMBOLS = 25;

export const GET = authed(async (req: NextRequest, _ctx: Ctx) => {
  const q = parseQuery(req, SnapshotQuery);
  const symbols = q.symbols
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  if (!symbols.length) throw new ApiError('VALIDATION_FAILED', 'Name at least one symbol to look up.');
  if (symbols.length > MAX_SYMBOLS) {
    throw new ApiError('VALIDATION_FAILED', `That is a lot of symbols at once — ${MAX_SYMBOLS} is the limit.`);
  }

  // resolveQuotes, not getSnapshot: when a symbol's stored intraday bars are
  // newer than the last daily close, the price is that bar — the same rule the
  // portal header follows, so a list and a chart never disagree.
  const snap = await resolveQuotes(symbols, { preferIntraday: true });
  const worst = snap.quotes.some((qq) => qq.freshness === 'stale')
    ? 'stale'
    : snap.quotes.some((qq) => qq.freshness === 'delayed')
      ? 'delayed'
      : 'live';

  return ok(
    SnapshotResponse.parse({
      quotes: snap.quotes,
      market: marketBlock(new Date(), worst),
      degraded: snap.degraded || !polygonConfigured(),
      degraded_reason: polygonConfigured() ? snap.degraded_reason : 'Live market data is not connected yet.',
    })
  );
});
