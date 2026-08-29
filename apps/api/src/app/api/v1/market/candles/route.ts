/**
 * GET /api/v1/market/candles?symbol=&tf=1m|5m|15m|1h|4h|1d&from=&to=
 *
 * Cache-first: the `candles` table is the store and Polygon is the refill. A
 * symbol whose stored bars already reach the PRESENT costs zero API calls —
 * "the present" measured by the same freshness function that labels the answer,
 * not by a calendar date (see `candlesCovered` in lib/market/polygon.ts).
 *
 * SIX RESOLUTIONS, ONE ENDPOINT. The trade portal's rail offers 1m/5m/15m/1h/
 * 4h/D; this route used to accept only `1d` and `5m`, so four of the six 400'd
 * and the client silently redrew a coarser bar labelled "not exact". Polygon
 * serves all six from the same aggregates path with a different
 * multiplier/timespan, they cache under their own `candles.timeframe` key, and
 * they share the one token bucket — so the widening costs no extra request
 * budget and no migration. `tf` is validated here against
 * `CANDLE_TIMEFRAMES` rather than @shared/api's round-1 `Timeframe` pair; the
 * response shape is unchanged apart from the wider `timeframe` string.
 *
 * BARS ARE CAPPED per request at POLYGON_MAX_CANDLES (default 1500) — a
 * three-month 1m range is 30k bars nobody can draw, and the cap is applied to
 * the cache read and the wire body alike, keeping the newest bars.
 */
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { CandlesQuery, CandlesResponse } from '@shared/api';
import { authed, ok, parseQuery, type Ctx } from '@/lib/http';
import { marketBlock } from '@/lib/market';
import {
  CANDLE_TIMEFRAMES,
  TF_DEFAULT_SPAN_DAYS,
  getCandles,
  freshnessFor,
  maxCandles,
  polygonConfigured,
} from '@/lib/market/polygon';

export const dynamic = 'force-dynamic';

/** The shared schemas, widened to the six resolutions the chart actually offers. */
const Tf = z.enum(CANDLE_TIMEFRAMES);
const CandlesQueryTf = CandlesQuery.extend({ tf: Tf.default('1d') });
const CandlesResponseTf = CandlesResponse.extend({ timeframe: Tf });

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export const GET = authed(async (req: NextRequest, _ctx: Ctx) => {
  const q = parseQuery(req, CandlesQueryTf);
  const symbol = q.symbol.toUpperCase();
  const to = q.to ?? new Date().toISOString().slice(0, 10);
  const from = q.from ?? daysAgo(TF_DEFAULT_SPAN_DAYS[q.tf]);

  const result = await getCandles(symbol, q.tf, from, to);
  // Keep the NEWEST bars: a chart that has to drop something drops history.
  const candles = result.candles.slice(-maxCandles());
  const last = candles[candles.length - 1] ?? null;
  // `tf` is not decoration here: a candle is stamped at the START of the bar it
  // covers, so a 4-hour bar is four hours "old" the moment it closes. Without
  // the width the widest resolutions would read stale for most of their life.
  const { freshness, delay_reason } = freshnessFor(last?.ts ?? null, { bar: q.tf });

  return ok(
    CandlesResponseTf.parse({
      symbol,
      timeframe: q.tf,
      candles,
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
