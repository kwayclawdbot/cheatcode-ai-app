/**
 * GET /api/v1/live/internal/market?symbol=&tfs=1d,4h,1h,15m
 *
 * One symbol, several timeframes, in the order asked for — the top-down bundle
 * the analyzer reads. Worker-only (`x-internal-secret`).
 *
 * ONE ROUND TRIP FOR THE WHOLE SEGMENT. The analyzer needs four timeframes plus
 * the company and a price before it can write a word, and doing that as five
 * requests from a process on another machine turns a 400 ms prep into two
 * seconds of the buffer not filling. `getCandles` is cache-first, so the cost of
 * bundling them is one Postgres round trip per timeframe and, at most, one
 * Polygon call per timeframe that is actually stale.
 *
 * IT ALSO CARRIES WHAT THE CHART CANNOT SAY. Earnings and headlines are the two
 * things a viewer asks about that no amount of price action answers — "why did
 * it move", "is the business actually growing". Both ride this same round trip:
 * financials change once a quarter and are cached for a day, news for ten
 * minutes, so neither meaningfully costs a segment. Kai is handed all of it and
 * decides what is worth saying; the director decides what is worth showing.
 *
 * BARS ARE TRIMMED PER TIMEFRAME. The model does not need 1,500 one-minute bars
 * to say what the hour is doing, and every bar sent is tokens paid for on every
 * segment of every show. The trim keeps the NEWEST bars, like the chart's own
 * cap does, because history is the thing you can afford to lose.
 */
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ok } from '@/lib/http';
import { validationError } from '@/lib/errors';
import { internalRoute } from '../../_lib/internal';
import { isCandleTimeframe } from '../../_lib/rundown';
import {
  getCandles,
  getFinancials,
  getNews,
  resolveQuote,
  TF_DEFAULT_SPAN_DAYS,
  type CandleTimeframe,
} from '@/lib/market/polygon';
import { computeTechnicals } from '@/lib/market/technicals';
import { getCompanyProfile, marketCapPlain, summaryFor } from '@/lib/market/profile';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const Query = z.object({
  symbol: z.string().min(1).max(12),
  tfs: z.string().min(1).max(60).default('1d,4h,1h,15m'),
});

/** Enough bars to read structure, few enough to stay affordable per segment. */
const BARS_PER_TF: Record<CandleTimeframe, number> = {
  '1d': 180,
  '4h': 140,
  '1h': 130,
  '15m': 120,
  '5m': 110,
  '1m': 90,
};

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export const GET = internalRoute(async (req: NextRequest) => {
  const url = new URL(req.url);
  const parsed = Query.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) throw validationError(parsed.error.issues);

  const symbol = parsed.data.symbol.toUpperCase();
  const tfs = parsed.data.tfs
    .split(',')
    .map((s) => s.trim())
    .filter(isCandleTimeframe);

  const to = new Date().toISOString().slice(0, 10);
  const profile = await getCompanyProfile(symbol).catch(() => null);

  const timeframes = [] as unknown[];
  let degraded = false;
  let degradedReason: string | null = null;
  let dailyCandles: { ts: string; c: number | null }[] = [];

  for (const tf of tfs) {
    const res = await getCandles(symbol, tf, daysAgo(TF_DEFAULT_SPAN_DAYS[tf]), to);
    const candles = res.candles.slice(-BARS_PER_TF[tf]);
    if (tf === '1d') dailyCandles = candles;
    const last = candles[candles.length - 1] ?? null;
    const t = candles.length
      ? computeTechnicals({ candles, price: last?.c ?? null, timeframe: tf, freshness: 'delayed' })
      : null;
    if (res.degraded) {
      degraded = true;
      degradedReason = degradedReason ?? res.degraded_reason ?? 'Market data is degraded.';
    }
    timeframes.push({
      timeframe: tf,
      candles,
      technicals: t
        ? {
            trend: t.trend,
            momentum: t.momentum,
            volatility: t.volatility,
            support: t.support,
            resistance: t.resistance,
            computed_from: t.computed_from,
          }
        : null,
      first_ts: candles[0]?.ts ?? null,
      last_ts: last?.ts ?? null,
      degraded: res.degraded,
    });
  }

  // Fetched together: neither blocks the other, and a failure in either is a
  // missing section rather than a failed segment.
  const [q, fin, nws] = await Promise.all([
    resolveQuote(symbol, { timeframe: '1d' }).catch(() => null),
    getFinancials(symbol, 5).catch(() => ({ quarters: [], degraded: true })),
    getNews(symbol, 6).catch(() => ({ news: [], degraded: true })),
  ]);

  /**
   * The prior session, as two real timestamps.
   *
   * `compare_prior` frames a span of chart, and a span over invented times
   * frames a stretch of nothing. Taking it from the last two DAILY bars means
   * the window is a session that actually happened; when there are not two
   * bars, the command simply has nothing to resolve against and is dropped.
   */
  const priorSession =
    dailyCandles.length >= 2
      ? {
          from: dailyCandles[dailyCandles.length - 2].ts,
          to: dailyCandles[dailyCandles.length - 1].ts,
        }
      : null;

  return ok({
    symbol,
    company: {
      name: profile?.name ?? null,
      summary: summaryFor(profile),
      sector: profile?.sector ?? null,
      market_cap_plain: marketCapPlain(profile?.market_cap ?? null),
    },
    quote: {
      price: q?.quote?.price ?? null,
      change_pct: q?.quote?.change_pct ?? null,
      freshness: q?.quote?.freshness ?? 'stale',
    },
    timeframes,
    prior_session: priorSession,
    /** Newest first. Empty when the plan or the filing calendar says nothing. */
    fundamentals: fin.quarters,
    /** Newest first. `sentiment` is Polygon's, per this ticker, with its reason. */
    news: nws.news,
    degraded,
    degraded_reason: degradedReason,
  });
});
