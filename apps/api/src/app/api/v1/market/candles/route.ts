/**
 * GET /api/v1/market/candles?symbol=&tf=1d|5m&from=&to=
 *
 * Cache-first: the `candles` table is the store and Polygon is the refill. A
 * symbol whose bars already reach the last trading day costs zero API calls
 * (the plan allows 5 a minute — see lib/market/polygon.ts).
 */
import type { NextRequest } from 'next/server';
import { CandlesQuery, CandlesResponse } from '@shared/api';
import { authed, ok, parseQuery, type Ctx } from '@/lib/http';
import { marketBlock } from '@/lib/market';
import { getCandles, freshnessFor, polygonConfigured } from '@/lib/market/polygon';

export const dynamic = 'force-dynamic';

const DEFAULT_SPAN_DAYS: Record<'1d' | '5m', number> = { '1d': 180, '5m': 5 };

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export const GET = authed(async (req: NextRequest, _ctx: Ctx) => {
  const q = parseQuery(req, CandlesQuery);
  const symbol = q.symbol.toUpperCase();
  const to = q.to ?? new Date().toISOString().slice(0, 10);
  const from = q.from ?? daysAgo(DEFAULT_SPAN_DAYS[q.tf]);

  const result = await getCandles(symbol, q.tf, from, to);
  const last = result.candles[result.candles.length - 1] ?? null;
  const { freshness, delay_reason } = freshnessFor(last?.ts ?? null);

  return ok(
    CandlesResponse.parse({
      symbol,
      timeframe: q.tf,
      candles: result.candles,
      source: result.source,
      freshness,
      delay_reason,
      market: marketBlock(new Date(), freshness),
      degraded: result.degraded || !polygonConfigured(),
      degraded_reason: polygonConfigured()
        ? result.degraded_reason
        : 'Live market data is not connected yet.',
    })
  );
});
