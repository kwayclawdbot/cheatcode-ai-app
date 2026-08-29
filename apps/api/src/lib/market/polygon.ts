/**
 * Polygon.io REST — the only market-data source in this round.
 *
 * SCOPE (BUILD-BRIEF-round-2 "Market data"): daily + 5-minute aggregates, a
 * previous-close-derived snapshot, and news. No websockets. No options.
 *
 * ENTITLEMENT, HONESTLY
 * ---------------------
 * The key on this account is a delayed plan: `/v2/aggs/...` answers with
 * `status:"DELAYED"` and `/v2/snapshot/...` answers `NOT_AUTHORIZED`. That is
 * not a failure — it is the licensing reality named in 00 §2 ("until confirmed,
 * the fallback design is delayed-data display"). So every quote we build comes
 * back `freshness:'delayed'` with `delay_reason:'entitlement'`, NEVER `stale`.
 * `stale` means the feed broke and actions should stop; `delayed` means the
 * number is real, late, labeled, and perfectly usable. The app must render
 * "Delayed" and keep its buttons enabled.
 *
 * RATE LIMIT
 * ----------
 * The plan allows 5 requests / minute (measured: the 6th in a burst is a 429).
 * Three defences, in order:
 *   1. `candles` table is the primary store — a symbol already backfilled costs
 *      zero Polygon calls.
 *   2. `/v2/aggs/grouped/...` returns EVERY US ticker for one date in ONE call,
 *      so an N-symbol snapshot costs 2 calls (today + prior close) regardless
 *      of N, and those two responses are cached in memory for 60s.
 *   3. A non-blocking token bucket: when the minute's budget is spent we do not
 *      queue and we do not fail — we serve the cache and set `degraded`.
 *
 * No holidays table still (README gap 2): the "last trading date" walks back
 * over weekends only, and every payload carries `holidays_known:false`.
 */
import type { Freshness, DelayReason, MarketQuote, Candle, NewsItem } from '@shared/api';
import { env } from '../env';
import { log } from '../log';
import { serviceClient } from '../db';
import { marketStatus, marketDate } from './index';

const BASE = 'https://api.polygon.io';
const NY = 'America/New_York';

export function polygonConfigured(): boolean {
  return Boolean(env('POLYGON_API_KEY'));
}

/* ------------------------------------------------------------------ */
/* Token bucket — 5 requests / rolling 60s, non-blocking                */
/* ------------------------------------------------------------------ */

const RPM = () => Number(env('POLYGON_RPM') ?? 5);
let hits: number[] = [];

function takeToken(): boolean {
  const now = Date.now();
  hits = hits.filter((t) => now - t < 60_000);
  if (hits.length >= RPM()) return false;
  hits.push(now);
  return true;
}

/* ------------------------------------------------------------------ */
/* Transport                                                            */
/* ------------------------------------------------------------------ */

export type PolyFail = 'not_configured' | 'rate_limited' | 'unauthorized' | 'error';
export type PolyResult<T> = { ok: true; data: T; delayed: boolean } | { ok: false; reason: PolyFail };

/** Once Polygon has told us the plan is delayed, it stays delayed. */
let entitlementDelayed = true;
export function isEntitlementDelayed(): boolean {
  return entitlementDelayed;
}

async function polyGet<T>(path: string, params: Record<string, string | number | boolean> = {}): Promise<PolyResult<T>> {
  const key = env('POLYGON_API_KEY');
  if (!key) return { ok: false, reason: 'not_configured' };
  if (!takeToken()) return { ok: false, reason: 'rate_limited' };

  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  url.searchParams.set('apiKey', key);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (res.status === 429) return { ok: false, reason: 'rate_limited' };
    if (res.status === 401 || res.status === 403) return { ok: false, reason: 'unauthorized' };
    if (!res.ok) return { ok: false, reason: 'error' };
    const json = (await res.json()) as T & { status?: string };
    if (json?.status === 'NOT_AUTHORIZED') return { ok: false, reason: 'unauthorized' };
    const delayed = json?.status !== 'OK';
    if (delayed) entitlementDelayed = true;
    return { ok: true, data: json, delayed };
  } catch {
    return { ok: false, reason: 'error' };
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/* ET calendar helpers (weekends only — no holidays table, 00 §5)       */
/* ------------------------------------------------------------------ */

function etParts(d: Date) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: NY,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  return {
    weekday: p.weekday as string,
    date: `${p.year}-${p.month}-${p.day}`,
    minutes: Number(p.hour === '24' ? '0' : p.hour) * 60 + Number(p.minute),
  };
}

function isWeekend(dateStr: string): boolean {
  const day = new Date(`${dateStr}T12:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Previous weekday. Holidays are unknown, so a holiday reads as an empty day. */
export function prevTradingDate(dateStr: string): string {
  let d = addDays(dateStr, -1);
  while (isWeekend(d)) d = addDays(d, -1);
  return d;
}

/**
 * The most recent date that has (or should have) a complete daily bar.
 * Today only counts once the delayed feed has settled — 16:45 ET.
 */
export function lastTradingDate(now = new Date()): string {
  const { date, minutes } = etParts(now);
  if (!isWeekend(date) && minutes >= 16 * 60 + 45) return date;
  return prevTradingDate(date);
}

/* ------------------------------------------------------------------ */
/* Freshness + labels                                                   */
/* ------------------------------------------------------------------ */

const ET_TIME = new Intl.DateTimeFormat('en-US', {
  timeZone: NY,
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

export function etStamp(iso: string | null): string {
  if (!iso) return 'time unknown';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'time unknown' : `${ET_TIME.format(d)} ET`;
}

/**
 * 00 §5 thresholds (live <3s, delayed 3–60s, stale >60s) PLUS the round-2
 * entitlement rule: a delayed-only plan yields `delayed` + `entitlement`, not
 * `stale`. Actions stay enabled; the label tells the truth.
 */
export function freshnessFor(
  sourceTs: string | null,
  opts: { entitlement?: boolean; seed?: boolean } = {}
): { freshness: Freshness; delay_reason: DelayReason | null } {
  if (opts.seed) return { freshness: 'delayed', delay_reason: 'seed' };
  if (!sourceTs) return { freshness: 'stale', delay_reason: 'feed_gap' };
  if (opts.entitlement ?? entitlementDelayed) return { freshness: 'delayed', delay_reason: 'entitlement' };
  const age = Date.now() - new Date(sourceTs).getTime();
  if (!Number.isFinite(age)) return { freshness: 'stale', delay_reason: 'feed_gap' };
  if (age < 3_000) return { freshness: 'live', delay_reason: null };
  if (age < 60_000) return { freshness: 'delayed', delay_reason: 'feed_gap' };
  return { freshness: 'stale', delay_reason: 'feed_gap' };
}

/**
 * `bar` names the resolution the price was taken from, when it was taken from a
 * chart bar rather than a session close. Saying "last close" over a 5-minute
 * bar is the kind of quiet inference spec §9 forbids, so the two cases read
 * differently — and neither of them may ever read "Live" on a delayed plan.
 */
export function quoteLabel(
  freshness: Freshness,
  reason: DelayReason | null,
  sourceTs: string | null,
  bar: string | null = null
): string {
  const when = etStamp(sourceTs);
  if (freshness === 'live') return `Live · ${when}`;
  if (freshness === 'stale') return `Data unavailable · last seen ${when}`;
  if (reason === 'entitlement') return bar ? `Delayed · last ${bar} bar ${when}` : `Delayed · last close ${when}`;
  if (reason === 'seed') return `Sample data · ${when}`;
  return bar ? `Delayed · last ${bar} bar ${when}` : `Delayed · ${when}`;
}

/** Build the full MarketQuote the Trade surfaces render. */
export function buildQuote(opts: {
  symbol: string;
  price: number | null;
  prevClose: number | null;
  sourceTs: string | null;
  seed?: boolean;
  /** Set when the price is a chart bar's close, not a session close. */
  bar?: string | null;
}): MarketQuote {
  const { freshness, delay_reason } = freshnessFor(opts.sourceTs, { seed: opts.seed });
  const change =
    opts.price !== null && opts.prevClose !== null ? round2(opts.price - opts.prevClose) : null;
  const change_pct =
    change !== null && opts.prevClose ? round2((change / opts.prevClose) * 100) : null;
  return {
    symbol: opts.symbol,
    price: opts.price,
    prev_close: opts.prevClose,
    change,
    change_pct,
    source_ts: opts.sourceTs,
    received_ts: new Date().toISOString(),
    freshness,
    delay_reason,
    label_plain: quoteLabel(freshness, delay_reason, opts.sourceTs, opts.bar ?? null),
    session: marketStatus(),
  };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/* ------------------------------------------------------------------ */
/* Aggregates                                                           */
/* ------------------------------------------------------------------ */

type Agg = { t: number; o?: number; h?: number; l?: number; c?: number; v?: number };
type AggsBody = { results?: Agg[]; resultsCount?: number; status?: string };

function toCandle(a: Agg): Candle {
  return {
    ts: new Date(a.t).toISOString(),
    o: num(a.o),
    h: num(a.h),
    l: num(a.l),
    c: num(a.c),
    v: num(a.v),
  };
}
function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * The resolutions the chart offers.
 *
 * `Timeframe` in @shared/api is the round-1 pair ('1d' | '5m'); the trade portal
 * rail has offered 1m/5m/15m/1h/4h/D since round 4, and every request outside
 * that pair used to answer 400 and fall back to a coarser bar. Polygon serves
 * all six from the SAME aggregates endpoint — only the multiplier and the
 * timespan change — so the whole extension is this table plus a wider type.
 *
 * `CandleTimeframe` is a SUPERSET of `Timeframe`, so every existing caller
 * still type-checks and nothing in packages/shared has to move.
 * `candles.timeframe` is plain text with a (symbol, timeframe, ts) primary key,
 * so the new keys cache exactly like the old two — no migration.
 */
export const CANDLE_TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d'] as const;
export type CandleTimeframe = (typeof CANDLE_TIMEFRAMES)[number];

const TF_PATH: Record<CandleTimeframe, { mult: number; span: string }> = {
  '1m': { mult: 1, span: 'minute' },
  '5m': { mult: 5, span: 'minute' },
  '15m': { mult: 15, span: 'minute' },
  '1h': { mult: 1, span: 'hour' },
  '4h': { mult: 4, span: 'hour' },
  '1d': { mult: 1, span: 'day' },
};

/** How far back a request reaches when the caller does not say. */
export const TF_DEFAULT_SPAN_DAYS: Record<CandleTimeframe, number> = {
  '1m': 3,
  '5m': 5,
  '15m': 10,
  '1h': 45,
  '4h': 120,
  '1d': 180,
};

/** The bar cap for one request. Polygon's own ceiling is 50k; ours is smaller. */
export function maxCandles(): number {
  const n = Number(env('POLYGON_MAX_CANDLES') ?? 1500);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 50_000) : 1500;
}

export async function fetchAggregates(
  symbol: string,
  tf: CandleTimeframe,
  from: string,
  to: string,
  limit = maxCandles()
): Promise<PolyResult<Candle[]>> {
  const { mult, span } = TF_PATH[tf];
  const r = await polyGet<AggsBody>(
    `/v2/aggs/ticker/${encodeURIComponent(symbol.toUpperCase())}/range/${mult}/${span}/${from}/${to}`,
    { adjusted: true, sort: 'asc', limit }
  );
  if (!r.ok) return r;
  return { ok: true, data: (r.data.results ?? []).map(toCandle), delayed: r.delayed };
}

/* ------------------------------------------------------------------ */
/* candles table cache                                                  */
/* ------------------------------------------------------------------ */

export async function readCachedCandles(
  symbol: string,
  tf: CandleTimeframe,
  from?: string,
  to?: string
): Promise<Candle[]> {
  const db = serviceClient();
  let q = db
    .from('candles')
    .select('ts,o,h,l,c,v')
    .eq('symbol', symbol.toUpperCase())
    .eq('timeframe', tf)
    .order('ts', { ascending: true })
    .limit(maxCandles());
  if (from) q = q.gte('ts', `${from}T00:00:00Z`);
  if (to) q = q.lte('ts', `${to}T23:59:59Z`);
  const { data, error } = await q;
  if (error) {
    log('warn', '-', 'candles.read_failed', { symbol, tf, message: error.message });
    return [];
  }
  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      ts: new Date(String(row.ts)).toISOString(),
      o: num(row.o),
      h: num(row.h),
      l: num(row.l),
      c: num(row.c),
      v: num(row.v),
    };
  });
}

export async function writeCandles(symbol: string, tf: CandleTimeframe, candles: Candle[]): Promise<void> {
  if (!candles.length) return;
  const db = serviceClient();
  const rows = candles.map((c) => ({
    symbol: symbol.toUpperCase(),
    timeframe: tf,
    ts: c.ts,
    o: c.o,
    h: c.h,
    l: c.l,
    c: c.c,
    v: c.v === null ? null : Math.round(c.v),
  }));
  // Chunked so one oversized request never blows the statement limit.
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db
      .from('candles')
      .upsert(rows.slice(i, i + 500) as never, { onConflict: 'symbol,timeframe,ts' });
    if (error) {
      log('warn', '-', 'candles.write_failed', { symbol, tf, message: error.message });
      return;
    }
  }
}

export type CandlesResult = {
  candles: Candle[];
  source: 'polygon' | 'cache' | 'none';
  degraded: boolean;
  degraded_reason: string | null;
};

const FAIL_PLAIN: Record<PolyFail, string> = {
  not_configured: 'Live market data is not connected yet — showing what we already had.',
  rate_limited: 'We are pulling market data a little slower than usual — showing the last data we stored.',
  unauthorized: 'This plan does not include that market data — showing the last data we stored.',
  error: 'Market data did not answer just now — showing the last data we stored.',
};

/**
 * Cache-first candles. A symbol whose stored bars already reach the last
 * trading day costs zero Polygon calls.
 */
export async function getCandles(
  symbol: string,
  tf: CandleTimeframe,
  from: string,
  to: string
): Promise<CandlesResult> {
  const cached = await readCachedCandles(symbol, tf, from, to);
  const needle = tf === '1d' ? lastTradingDate() : marketDate();
  const covered = cached.length > 0 && cached[cached.length - 1].ts.slice(0, 10) >= needle;
  if (covered) return { candles: cached, source: 'cache', degraded: false, degraded_reason: null };

  const fresh = await fetchAggregates(symbol, tf, from, to);
  if (fresh.ok && fresh.data.length) {
    await writeCandles(symbol, tf, fresh.data);
    return { candles: fresh.data, source: 'polygon', degraded: false, degraded_reason: null };
  }
  if (cached.length) {
    return {
      candles: cached,
      source: 'cache',
      degraded: true,
      degraded_reason: fresh.ok ? 'Market data had nothing new for that range.' : FAIL_PLAIN[fresh.reason],
    };
  }
  return {
    candles: [],
    source: 'none',
    degraded: true,
    degraded_reason: fresh.ok ? 'No candles for that range yet.' : FAIL_PLAIN[fresh.reason],
  };
}

/* ------------------------------------------------------------------ */
/* Snapshot — grouped daily close + prior close, 60s in-memory          */
/* ------------------------------------------------------------------ */

type GroupedRow = { T: string; c?: number; o?: number; h?: number; l?: number; v?: number; t: number };
type GroupedBody = { results?: GroupedRow[]; status?: string; resultsCount?: number };

type Cached<T> = { at: number; value: T };
const groupedCache = new Map<string, Cached<Map<string, GroupedRow>>>();
const quoteCache = new Map<string, Cached<MarketQuote>>();
const newsCache = new Map<string, Cached<NewsItem[]>>();

const SNAPSHOT_TTL_MS = 60_000;
const GROUPED_TTL_MS = 60_000;
const NEWS_TTL_MS = 10 * 60_000;

function fresh<T>(c: Cached<T> | undefined, ttl: number): T | null {
  if (!c) return null;
  return Date.now() - c.at < ttl ? c.value : null;
}

async function groupedFor(date: string): Promise<Map<string, GroupedRow> | null> {
  const hit = fresh(groupedCache.get(date), GROUPED_TTL_MS);
  if (hit) return hit;
  const r = await polyGet<GroupedBody>(`/v2/aggs/grouped/locale/us/market/stocks/${date}`, {
    adjusted: true,
  });
  if (!r.ok) return null;
  const map = new Map<string, GroupedRow>();
  for (const row of r.data.results ?? []) map.set(row.T, row);
  groupedCache.set(date, { at: Date.now(), value: map });
  return map;
}

export type SnapshotResult = {
  quotes: MarketQuote[];
  degraded: boolean;
  degraded_reason: string | null;
};

/**
 * Quotes for many symbols. One grouped call covers every ticker, so cost is
 * O(1) in the number of symbols, and the daily bars it returns are written into
 * `candles` so the next call is free.
 */
export async function getSnapshot(symbols: string[]): Promise<SnapshotResult> {
  const wanted = [...new Set(symbols.map((s) => s.toUpperCase()).filter(Boolean))];
  const out: MarketQuote[] = [];
  const missing: string[] = [];

  for (const s of wanted) {
    const hit = fresh(quoteCache.get(s), SNAPSHOT_TTL_MS);
    if (hit) out.push(hit);
    else missing.push(s);
  }
  if (!missing.length) return { quotes: order(out, wanted), degraded: false, degraded_reason: null };

  const d0 = lastTradingDate();
  const d1 = prevTradingDate(d0);

  // 1) Try the candles cache first — zero API calls when it is already warm.
  const cachedBars = await readLastDailyBars(missing, d1);
  const stillMissing: string[] = [];
  for (const s of missing) {
    const bars = cachedBars.get(s);
    if (bars && bars.last && bars.last.ts.slice(0, 10) >= d0) {
      const q = buildQuote({
        symbol: s,
        price: bars.last.c,
        prevClose: bars.prev?.c ?? null,
        sourceTs: closeStamp(bars.last.ts),
      });
      quoteCache.set(s, { at: Date.now(), value: q });
      out.push(q);
    } else {
      stillMissing.push(s);
    }
  }
  if (!stillMissing.length) return { quotes: order(out, wanted), degraded: false, degraded_reason: null };

  // 2) Two grouped calls cover every remaining symbol.
  const [g0, g1] = [await groupedFor(d0), await groupedFor(d1)];
  let degraded = false;
  let reason: string | null = null;

  for (const s of stillMissing) {
    const row = g0?.get(s) ?? null;
    const prev = g1?.get(s) ?? null;
    if (row) {
      const q = buildQuote({
        symbol: s,
        price: num(row.c),
        prevClose: num(prev?.c),
        sourceTs: closeStamp(new Date(row.t).toISOString()),
      });
      quoteCache.set(s, { at: Date.now(), value: q });
      out.push(q);
      void writeCandles(s, '1d', [toCandle({ t: row.t, o: row.o, h: row.h, l: row.l, c: row.c, v: row.v })]);
      continue;
    }
    // 3) No bar for today. On a delayed plan that is NORMAL, not a fault: the
    //    feed publishes the daily bar late, so the previous session's close is
    //    genuinely the newest price that exists. Serving it is not degraded —
    //    it is correct, and `delayed`/`entitlement` already says so. Only a
    //    symbol we have nothing at all for counts as degraded.
    const bars = cachedBars.get(s);
    const fromGrouped = g1?.get(s) ?? null;
    const price = bars?.last?.c ?? num(fromGrouped?.c);
    const sourceTs = bars?.last
      ? closeStamp(bars.last.ts)
      : fromGrouped
        ? closeStamp(new Date(fromGrouped.t).toISOString())
        : null;

    if (price === null || sourceTs === null) {
      degraded = true;
      reason =
        reason ??
        (g0 === null
          ? 'We are pulling market data a little slower than usual — showing the last data we stored.'
          : `We have no price for ${s} yet.`);
    }

    out.push({
      ...buildQuote({ symbol: s, price, prevClose: bars?.prev?.c ?? null, sourceTs }),
    });
  }

  return { quotes: order(out, wanted), degraded, degraded_reason: reason };
}

export async function getQuote(symbol: string): Promise<MarketQuote> {
  const { quotes } = await getSnapshot([symbol]);
  return (
    quotes[0] ??
    buildQuote({ symbol: symbol.toUpperCase(), price: null, prevClose: null, sourceTs: null })
  );
}

function order(quotes: MarketQuote[], wanted: string[]): MarketQuote[] {
  const by = new Map(quotes.map((q) => [q.symbol, q]));
  return wanted.map((s) => by.get(s)).filter((q): q is MarketQuote => Boolean(q));
}

/**
 * Polygon stamps a daily bar at the START of the session (04:00Z = midnight
 * ET), which reads as "last close 12:00 AM" in a label. A daily bar's price IS
 * the close, so restamp it at 16:00 ET on that session's date.
 */
function closeStamp(ts: string): string {
  const date = etParts(new Date(ts)).date;
  // Find the UTC instant whose ET rendering is 16:00 on `date`. DST means the
  // offset is 4 or 5 hours, so try both and keep the one that round-trips.
  for (const offset of [20, 21]) {
    const candidate = new Date(`${date}T${String(offset).padStart(2, '0')}:00:00.000Z`);
    const p = etParts(candidate);
    if (p.date === date && p.minutes === 16 * 60) return candidate.toISOString();
  }
  return ts;
}

async function readLastDailyBars(
  symbols: string[],
  since: string
): Promise<Map<string, { last: Candle | null; prev: Candle | null }>> {
  const db = serviceClient();
  const out = new Map<string, { last: Candle | null; prev: Candle | null }>();
  if (!symbols.length) return out;
  const { data, error } = await db
    .from('candles')
    .select('symbol,ts,c')
    .in('symbol', symbols)
    .eq('timeframe', '1d')
    .gte('ts', `${addDays(since, -10)}T00:00:00Z`)
    .order('ts', { ascending: false })
    .limit(symbols.length * 12);
  if (error) return out;
  for (const r of data ?? []) {
    const row = r as Record<string, unknown>;
    const sym = String(row.symbol);
    const candle: Candle = {
      ts: new Date(String(row.ts)).toISOString(),
      o: null,
      h: null,
      l: null,
      c: num(row.c),
      v: null,
    };
    const cur = out.get(sym) ?? { last: null, prev: null };
    if (!cur.last) cur.last = candle;
    else if (!cur.prev) cur.prev = candle;
    out.set(sym, cur);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* ONE PRICE PER SYMBOL — resolveQuote                                  */
/* ------------------------------------------------------------------ */

/**
 * WHY THIS EXISTS
 * ---------------
 * The Trade Portal used to read its header from `getQuote()` — the grouped
 * DAILY snapshot — while the chart under it drew intraday aggregates. Two
 * sources, two numbers, same symbol, same screen: SPY at 771.10 over a last
 * 5-minute bar of 765.26. Spec §9 forbids exactly that: every quote carries its
 * own source timestamp and freshness, and nothing may be inferred silently.
 *
 * THE RULE
 * --------
 *   1. The price IS the last bar of the series the chart is drawing. Header and
 *      chart cannot disagree when they are the same array.
 *   2. An intraday series only earns that job when its last bar is NEWER than
 *      the last daily close we know about. Finer is not fresher: a 5-minute
 *      series that stopped two sessions ago loses to yesterday's close, and the
 *      resolver falls back to the daily series and SAYS SO (`fell_back`,
 *      `resolution_plain`) instead of quietly mixing the two.
 *   3. Only when there is no priced bar at all does the daily snapshot answer
 *      on its own, with its own timestamp and its own "last close …" label.
 *
 * Freshness is untouched: a delayed plan still reports `delayed`/`entitlement`
 * whichever series wins, and never `live`.
 *
 * BUDGET. The daily fallback reads the `candles` table first and only pays a
 * Polygon call when the store has nothing recent enough, and every resolution
 * is memoised for 30s per (symbol, timeframe) — a portal reload inside that
 * window costs zero requests out of the five-a-minute budget.
 */

export type QuoteSeriesKind = 'intraday' | 'daily' | 'snapshot';

export type ResolvedQuote = {
  /** The one quote for this symbol on this request. */
  quote: MarketQuote;
  /** The resolution the price came from — the series a chart must draw. */
  timeframe: CandleTimeframe;
  requested_timeframe: CandleTimeframe;
  /** true when the requested resolution could not carry the price. */
  fell_back: boolean;
  /** The bars the quote was taken from. `quote.price` is the last one's close. */
  candles: Candle[];
  series: QuoteSeriesKind;
  /** Plain sentence naming the substitution, when there was one. */
  resolution_plain: string | null;
  degraded: boolean;
  degraded_reason: string | null;
};

/** 'D', '1D', '1d' and junk all land somewhere sane. */
export function normalizeTimeframe(tf: string | null | undefined, fallback: CandleTimeframe = '1d'): CandleTimeframe {
  const v = String(tf ?? '').trim().toLowerCase();
  if (v === 'd' || v === 'day' || v === '1day') return '1d';
  return (CANDLE_TIMEFRAMES as readonly string[]).includes(v) ? (v as CandleTimeframe) : fallback;
}

function lastPriced(candles: Candle[]): { last: Candle; prev: Candle | null } | null {
  for (let i = candles.length - 1; i >= 0; i--) {
    if (candles[i].c === null) continue;
    let prev: Candle | null = null;
    for (let j = i - 1; j >= 0; j--) {
      if (candles[j].c !== null) {
        prev = candles[j];
        break;
      }
    }
    return { last: candles[i], prev };
  }
  return null;
}

/** Strictly newer, and a missing comparison point never wins. */
function isNewer(ts: string, than: string | null): boolean {
  if (!than) return true;
  const a = Date.parse(ts);
  const b = Date.parse(than);
  return Number.isFinite(a) && Number.isFinite(b) ? a > b : false;
}

function etDateOf(ts: string | null): string | null {
  if (!ts) return null;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : etParts(d).date;
}

function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoUTC(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

const RESOLVE_TTL_MS = 30_000;
const resolveCache = new Map<string, Cached<ResolvedQuote>>();

/**
 * The single quote resolver. Every surface that shows a price beside a chart
 * goes through here so the two can never be sourced separately again.
 */
export async function resolveQuote(
  symbol: string,
  opts: { preferIntraday?: boolean; timeframe?: string | null; from?: string; to?: string } = {}
): Promise<ResolvedQuote> {
  const sym = symbol.toUpperCase();
  const requested = normalizeTimeframe(opts.timeframe, opts.preferIntraday ? '5m' : '1d');
  const key = `${sym}:${requested}:${opts.from ?? ''}:${opts.to ?? ''}`;
  const memo = fresh(resolveCache.get(key), RESOLVE_TTL_MS);
  if (memo) return memo;

  const snapshot = await getQuote(sym);
  const to = opts.to ?? utcToday();

  let tf: CandleTimeframe = requested;
  let bars: Candle[] = [];
  let fellBack = false;
  let note: string | null = null;
  let degraded = false;
  let degradedReason: string | null = null;

  if (requested !== '1d') {
    const intraday = await getCandles(sym, requested, opts.from ?? daysAgoUTC(TF_DEFAULT_SPAN_DAYS[requested]), to);
    const found = lastPriced(intraday.candles);
    if (found && isNewer(found.last.ts, snapshot.source_ts)) {
      bars = intraday.candles;
      degraded = intraday.degraded;
      degradedReason = intraday.degraded_reason;
    } else {
      // The finer series is not the fresher one. Say which chart this is.
      tf = '1d';
      fellBack = true;
      note = found
        ? `The ${requested} bars stop at ${etStamp(found.last.ts)}, so this is the daily chart — the newest data there is for ${sym}.`
        : `There are no ${requested} bars for ${sym} yet, so this is the daily chart.`;
    }
  }

  if (tf === '1d') {
    const from = opts.from ?? daysAgoUTC(TF_DEFAULT_SPAN_DAYS['1d']);
    // Cache first: the daily bars are usually already stored by the snapshot
    // that just ran, and a refill is only worth a request when they are not.
    const stored = await readCachedCandles(sym, '1d', from, to);
    const have = lastPriced(stored);
    if (have && !isNewer(snapshot.source_ts ?? '', have.last.ts)) {
      bars = stored;
    } else {
      const daily = await getCandles(sym, '1d', from, to);
      bars = daily.candles.length ? daily.candles : stored;
      if (daily.degraded && !bars.length) {
        degraded = true;
        degradedReason = daily.degraded_reason;
      }
    }
  }

  const found = lastPriced(bars);
  const resolved: ResolvedQuote = found
    ? (() => {
        const intradaySeries = tf !== '1d';
        const sourceTs = intradaySeries ? found.last.ts : closeStamp(found.last.ts);
        const barDate = etDateOf(found.last.ts);
        const snapDate = etDateOf(snapshot.source_ts);
        const prevClose = intradaySeries
          ? // A bar from a session AFTER the last daily close compares against
            // that close; a bar from inside it compares against the one before.
            barDate && snapDate && barDate > snapDate
            ? snapshot.price
            : snapshot.prev_close
          : (found.prev?.c ?? snapshot.prev_close);
        return {
          quote: buildQuote({
            symbol: sym,
            price: found.last.c,
            prevClose,
            sourceTs,
            bar: intradaySeries ? tf : null,
          }),
          timeframe: tf,
          requested_timeframe: requested,
          fell_back: fellBack,
          candles: bars,
          series: intradaySeries ? 'intraday' : 'daily',
          resolution_plain: note,
          degraded,
          degraded_reason: degradedReason,
        };
      })()
    : {
        // No bar anywhere. The snapshot answers alone, and says so in its label.
        quote: snapshot,
        timeframe: tf,
        requested_timeframe: requested,
        fell_back: fellBack,
        candles: [],
        series: 'snapshot',
        resolution_plain: note,
        degraded: degraded || snapshot.price === null,
        degraded_reason:
          degradedReason ?? (snapshot.price === null ? `I do not have a price for ${sym} right now.` : null),
      };

  resolveCache.set(key, { at: Date.now(), value: resolved });
  return resolved;
}

/**
 * The list form: same rule, one extra database read for the whole set and NO
 * extra Polygon calls. A watchlist row and the portal header it opens must not
 * quote different prices for the same symbol.
 */
export async function resolveQuotes(
  symbols: string[],
  opts: { preferIntraday?: boolean; timeframe?: string | null } = {}
): Promise<SnapshotResult> {
  const wanted = [...new Set(symbols.map((s) => s.toUpperCase()).filter(Boolean))];
  const snap = await getSnapshot(wanted);
  const tf = normalizeTimeframe(opts.timeframe, opts.preferIntraday ? '5m' : '1d');
  if (!opts.preferIntraday || tf === '1d' || !wanted.length) return snap;

  const latest = await readLatestBars(wanted, tf);
  const quotes = snap.quotes.map((q) => {
    const bar = latest.get(q.symbol);
    if (!bar || bar.c === null || !isNewer(bar.ts, q.source_ts)) return q;
    const barDate = etDateOf(bar.ts);
    const snapDate = etDateOf(q.source_ts);
    const prevClose = barDate && snapDate && barDate > snapDate ? q.price : q.prev_close;
    return buildQuote({ symbol: q.symbol, price: bar.c, prevClose, sourceTs: bar.ts, bar: tf });
  });
  return { ...snap, quotes };
}

/** The newest stored bar per symbol at one resolution, in a single query. */
async function readLatestBars(symbols: string[], tf: CandleTimeframe): Promise<Map<string, Candle>> {
  const out = new Map<string, Candle>();
  if (!symbols.length) return out;
  const db = serviceClient();
  const { data, error } = await db
    .from('candles')
    .select('symbol,ts,c')
    .in('symbol', symbols)
    .eq('timeframe', tf)
    .gte('ts', `${daysAgoUTC(4)}T00:00:00Z`)
    .order('ts', { ascending: false })
    .limit(Math.min(2000, symbols.length * 80));
  if (error) {
    log('warn', '-', 'candles.latest_failed', { tf, message: error.message });
    return out;
  }
  for (const r of data ?? []) {
    const row = r as Record<string, unknown>;
    const sym = String(row.symbol);
    if (out.has(sym)) continue;
    out.set(sym, { ts: new Date(String(row.ts)).toISOString(), o: null, h: null, l: null, c: num(row.c), v: null });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* News (evidence block on the symbol page)                             */
/* ------------------------------------------------------------------ */

type NewsBody = {
  results?: {
    id: string;
    title: string;
    article_url?: string;
    published_utc: string;
    description?: string;
    tickers?: string[];
    publisher?: { name?: string };
  }[];
};

export async function getNews(symbol: string, limit = 5): Promise<{ news: NewsItem[]; degraded: boolean }> {
  const key = `${symbol.toUpperCase()}:${limit}`;
  const hit = fresh(newsCache.get(key), NEWS_TTL_MS);
  if (hit) return { news: hit, degraded: false };

  const r = await polyGet<NewsBody>('/v2/reference/news', {
    ticker: symbol.toUpperCase(),
    limit,
    order: 'desc',
    sort: 'published_utc',
  });
  if (!r.ok) return { news: [], degraded: true };

  const news: NewsItem[] = (r.data.results ?? []).slice(0, limit).map((a) => ({
    id: a.id,
    title: a.title,
    publisher: a.publisher?.name ?? null,
    url: a.article_url ?? null,
    published_utc: a.published_utc,
    tickers: a.tickers ?? [],
    description: a.description ?? null,
  }));
  newsCache.set(key, { at: Date.now(), value: news });
  return { news, degraded: false };
}

/* ------------------------------------------------------------------ */
/* Reference: /v3/reference/tickers/{sym}                               */
/* ------------------------------------------------------------------ */

export type TickerReference = {
  ticker?: string;
  name?: string;
  description?: string;
  sic_description?: string;
  market_cap?: number;
  total_employees?: number;
  homepage_url?: string;
  branding?: { logo_url?: string; icon_url?: string };
};

/**
 * The company reference row. It lives HERE, not in profile.ts, for one reason:
 * every Polygon request in this app must go through `polyGet` so it is counted
 * against the 5-a-minute budget. A raw `fetch` elsewhere spends the budget
 * without telling the bucket about it, and the first thing to break is the
 * QUOTE path — which is the one users actually notice.
 *
 * Returns null when the plan, the budget or the network says no. The caller
 * falls back to what it already had rather than blocking a page load.
 */
export async function fetchTickerReference(symbol: string): Promise<TickerReference | null> {
  const r = await polyGet<{ results?: TickerReference }>(
    `/v3/reference/tickers/${encodeURIComponent(symbol.toUpperCase())}`
  );
  if (!r.ok) return null;
  return r.data.results ?? null;
}

/** Test seam: drop every in-memory cache. */
export function resetMarketCaches(): void {
  groupedCache.clear();
  quoteCache.clear();
  newsCache.clear();
  resolveCache.clear();
  hits = [];
}
