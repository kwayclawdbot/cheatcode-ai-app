/**
 * Polygon.io REST — the only market-data source in this round.
 *
 * SCOPE: daily + intraday aggregates, a snapshot, news, company reference.
 * No websockets yet (see "WHAT IS NOT DONE" at the bottom of this block).
 *
 * FRESHNESS IS MEASURED, NOT DECLARED  (rewritten 2026-08-29, DATA-1)
 * ------------------------------------------------------------------
 * This file used to hard-code the plan into the product. Every quote came back
 * `freshness:'delayed'` with `delay_reason:'entitlement'` because a constant
 * said so — true on the old delayed plan, and a FALSE STATEMENT the moment the
 * owner upgraded. A financial product may not carry a claim about its own data
 * that nothing checks, in either direction.
 *
 * So the rule is now: **freshness comes from the age of the bytes we actually
 * received, measured in MARKET time, and nothing else may set it.**
 *
 *   `live`    the data reaches the present. Regular hours only — see below.
 *   `delayed` the number is real, late, labeled, and perfectly usable. The app
 *             renders it and KEEPS ITS BUTTONS ENABLED.
 *   `stale`   the market says it is trading and this feed has stopped
 *             answering. Actions should stop.
 *
 * The `delayed` / `stale` distinction is the one that matters and it is
 * preserved exactly: `delayed` is a licensing or session fact, `stale` is a
 * broken feed.
 *
 * MARKET TIME, NOT WALL TIME. `sessionMinutesBetween()` counts only minutes
 * inside 09:30–16:00 ET. On a Saturday afternoon the newest print in the world
 * is Friday's, and the market has produced NOTHING since — so the elapsed
 * market time is zero and the quote reads `delayed` / `market_closed`, not
 * "17 hours stale". The same arithmetic makes a genuinely abandoned feed stale
 * without a special case: a print from two Fridays ago has a full week of
 * session minutes behind it however you hold it.
 *
 * BAR WIDTH IS SUBTRACTED. A candle is stamped at the START of the bar it
 * covers, so a 5-minute bar is up to five minutes "old" the instant it closes.
 * `lateBy = elapsed - barWidth` is the number that means anything.
 *
 * `live` NEVER OUTSIDE REGULAR HOURS. Extended-hours prints exist, but session
 * minutes do not accrue outside 09:30–16:00, so a 15:55 bar and a 19:55 bar are
 * indistinguishable in market time. Rather than guess, nothing outside the
 * regular session is allowed to read `live`. Under-claiming is safe; the
 * opposite is not.
 *
 * ENTITLEMENT IS OBSERVED, NEVER ASSERTED
 * ---------------------------------------
 * `POLYGON_REALTIME` is a HINT and only a hint. It seeds an assumption and any
 * observation overrides it, in either direction:
 *   1. MEASURED LAG (strongest). Every quote built during an open session
 *      records how late its data actually was. A feed that lands inside
 *      `POLYGON_LIVE_MAX_MIN` is real-time whatever the env says; a feed that
 *      is consistently a quarter-hour behind is a delayed plan whatever the env
 *      says.
 *   2. Polygon's own word: `status:"DELAYED"` on an aggregates body.
 *   3. Only then the env hint.
 * And critically: entitlement NEVER decides `freshness`. It only chooses
 * between `entitlement` and `feed_gap` as the delay_reason once the measured
 * age has already said "delayed". Nothing here can label data real-time
 * because a variable said so.
 *
 * REQUEST BUDGET
 * --------------
 * The old plan allowed 5 requests / minute and this file was built around that
 * scarcity (measured 2026-08-29: 12 rapid calls in a row all 200 — the cap is
 * gone). `POLYGON_RPM` now defaults to 100. Unlimited is not a reason to
 * hammer, so three guards remain:
 *   1. a non-blocking token bucket (serve the cache, set `degraded`, never
 *      queue and never fail);
 *   2. an in-flight concurrency cap (`POLYGON_MAX_CONCURRENCY`, default 8);
 *   3. a 429 cooldown — one rate-limit answer parks every caller for
 *      `POLYGON_429_COOLDOWN_S` seconds instead of retrying into the wall.
 * The `candles` table is still the primary store, and the snapshot is still one
 * call for every symbol, because that is good design and not just thrift.
 *
 * WHAT IS NOT DONE, ON PURPOSE
 *   - No websocket. The account has real-time stock entitlement on
 *     `wss://socket.polygon.io/stocks` (auth_success + T/Q/AM subscriptions
 *     accepted, verified 2026-08-29) but nothing in this app consumes a push
 *     stream yet.
 *   - Still no holidays table (README gap 2): the ET clock is the session
 *     authority, `/v1/marketstatus/now` refines it opportunistically when it
 *     has been called recently, and every payload carries `holidays_known:false`.
 */
import type { Freshness, DelayReason, MarketQuote, MarketStatus, Candle, NewsItem } from '@shared/api';
import { env } from '../env';
import { log } from '../log';
import { serviceClient } from '../db';
import { marketStatus } from './index';

const BASE = 'https://api.polygon.io';
const NY = 'America/New_York';

export function polygonConfigured(): boolean {
  return Boolean(env('POLYGON_API_KEY'));
}

/* ------------------------------------------------------------------ */
/* Request budget — a guard, no longer a famine                         */
/* ------------------------------------------------------------------ */

/**
 * The old plan's 5/minute is gone (measured 2026-08-29). The bucket stays
 * because "unlimited" is a licence to hammer somebody else's API, not a reason
 * to. It is still NON-BLOCKING: a caller that cannot get a token is told so
 * immediately and serves its cache, because a queue behind a page load is a
 * worse failure than a slightly older number.
 */
const RPM = () => posInt(env('POLYGON_RPM'), 100);
const MAX_CONCURRENCY = () => posInt(env('POLYGON_MAX_CONCURRENCY'), 8);
const COOLDOWN_MS = () => posInt(env('POLYGON_429_COOLDOWN_S'), 20) * 1000;

function posInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/**
 * How long a caller waits for a concurrency slot before giving up and serving
 * its cache. Just under the 9s request timeout on purpose: a waiter only ever
 * abandons the queue when the requests ahead of it are themselves about to be
 * aborted, so "we could not get a slot" and "the feed is not answering" are the
 * same event rather than two.
 */
const QUEUE_MAX_MS = () => posInt(env('POLYGON_QUEUE_MAX_MS'), 8000);

let hits: number[] = [];
let inFlight = 0;
/** Set when Polygon answers 429. Every caller stands down until it passes. */
let cooldownUntil = 0;

function takeToken(): boolean {
  const now = Date.now();
  if (now < cooldownUntil) return false;
  hits = hits.filter((t) => now - t < 60_000);
  if (hits.length >= RPM()) return false;
  hits.push(now);
  return true;
}

/**
 * The concurrency cap WAITS; the rate budget REFUSES. The difference is
 * deliberate.
 *
 * Refusing because thirty other requests are in flight this millisecond serves
 * a user stale data to protect nobody — the work is going to happen either way,
 * a few tens of milliseconds apart. Refusing because the minute's budget is
 * genuinely spent is different: there is nothing to wait for inside a page
 * load, so the cache answers and the response says `degraded`.
 *
 * (A trade portal opening six timeframes and a Kai Live segment starting at the
 * same moment is exactly the burst this smooths. Before the plan upgrade a show
 * run immediately before a smoke run starved it for about ninety seconds.)
 */
async function acquireSlot(): Promise<boolean> {
  const deadline = Date.now() + QUEUE_MAX_MS();
  for (;;) {
    // Claimed here, released in polyGet's `finally`. Counting on the way OUT of
    // the wait rather than at the call site is what stops several waiters that
    // wake in the same tick from all reading the same free slot.
    if (inFlight < MAX_CONCURRENCY()) {
      inFlight += 1;
      return true;
    }
    if (Date.now() >= deadline) return false;
    await new Promise((r) => setTimeout(r, 25));
  }
}

/** A 429 is still possible on any plan. One is enough to back everyone off. */
function noteRateLimited(): void {
  cooldownUntil = Date.now() + COOLDOWN_MS();
  log('warn', '-', 'polygon.rate_limited', { cooldown_ms: COOLDOWN_MS() });
}

/* ------------------------------------------------------------------ */
/* Entitlement — observed, never asserted                               */
/* ------------------------------------------------------------------ */

export type FeedEntitlement = 'unknown' | 'delayed' | 'realtime';

/** Polygon's own word, when it volunteers one. */
let statedEntitlement: FeedEntitlement = 'unknown';
/** How late the data actually was, the last time we could measure it. */
let measuredLagMin: number | null = null;
let measuredLagAt = 0;

const LAG_OBSERVATION_TTL_MS = 30 * 60_000;

/** The env HINT. It is the weakest input and any observation overrides it. */
function entitlementHint(): FeedEntitlement {
  const v = (env('POLYGON_REALTIME') ?? '').trim().toLowerCase();
  if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return 'realtime';
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return 'delayed';
  return 'unknown';
}

/**
 * What we believe about the feed, strongest evidence first. Note the order:
 * a measured lag beats Polygon's flag, which beats the env var. If the owner
 * sets POLYGON_REALTIME=1 on a plan that is in fact fifteen minutes behind,
 * the first quote built during an open session corrects it.
 */
export function feedEntitlement(): FeedEntitlement {
  if (measuredLagMin !== null && Date.now() - measuredLagAt < LAG_OBSERVATION_TTL_MS) {
    if (measuredLagMin <= liveMaxMin()) return 'realtime';
    if (measuredLagMin >= DELAYED_PLAN_MIN) return 'delayed';
  }
  if (statedEntitlement !== 'unknown') return statedEntitlement;
  return entitlementHint();
}

/** Kept for callers that only want the old boolean. */
export function isEntitlementDelayed(): boolean {
  return feedEntitlement() === 'delayed';
}

/**
 * Record how late a real payload was, in market minutes, during an OPEN
 * session — the only window in which lateness means anything. Called from
 * `freshnessFor`, which is where the measurement already exists.
 */
function noteMeasuredLag(minutes: number): void {
  measuredLagMin = minutes;
  measuredLagAt = Date.now();
}

/** A delayed US equities plan is a quarter-hour behind. That is the signature. */
const DELAYED_PLAN_MIN = 10;

/* ------------------------------------------------------------------ */
/* Transport                                                            */
/* ------------------------------------------------------------------ */

export type PolyFail = 'not_configured' | 'rate_limited' | 'unauthorized' | 'error';
export type PolyResult<T> = { ok: true; data: T; delayed: boolean } | { ok: false; reason: PolyFail };

async function polyGet<T>(path: string, params: Record<string, string | number | boolean> = {}): Promise<PolyResult<T>> {
  const key = env('POLYGON_API_KEY');
  if (!key) return { ok: false, reason: 'not_configured' };
  if (!(await acquireSlot())) return { ok: false, reason: 'rate_limited' };
  if (!takeToken()) {
    inFlight -= 1;
    return { ok: false, reason: 'rate_limited' };
  }

  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  url.searchParams.set('apiKey', key);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (res.status === 429) {
      noteRateLimited();
      return { ok: false, reason: 'rate_limited' };
    }
    if (res.status === 401 || res.status === 403) return { ok: false, reason: 'unauthorized' };
    if (!res.ok) return { ok: false, reason: 'error' };
    const json = (await res.json()) as T & { status?: string };
    if (json?.status === 'NOT_AUTHORIZED') return { ok: false, reason: 'unauthorized' };
    // Polygon's own statement about THIS body. A delayed plan stamps
    // `status:"DELAYED"`; the upgraded plan answers `OK`. `OK` is not by itself
    // proof of real time, so it clears nothing — only the measured lag can.
    const delayed = json?.status === 'DELAYED';
    if (delayed) statedEntitlement = 'delayed';
    return { ok: true, data: json, delayed };
  } catch {
    return { ok: false, reason: 'error' };
  } finally {
    inFlight -= 1;
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
 * The UTC instant whose America/New_York rendering is `minutesOfDay` on
 * `dateStr`. DST means the offset is 4 or 5 hours, so both are tried and the
 * one that round-trips wins — the same trick `closeStamp` has always used,
 * lifted out so the session arithmetic can share it.
 */
function etInstant(dateStr: string, minutesOfDay: number): Date | null {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return null;
  for (const offsetH of [4, 5]) {
    const cand = new Date(Date.UTC(y, m - 1, d, 0, minutesOfDay + offsetH * 60, 0, 0));
    const p = etParts(cand);
    if (p.date === dateStr && p.minutes === minutesOfDay) return cand;
  }
  return null;
}

const SESSION_OPEN_MIN = 9 * 60 + 30;
const SESSION_CLOSE_MIN = 16 * 60;
/** One regular session, in minutes. Also the width of a daily bar. */
export const SESSION_MINUTES = SESSION_CLOSE_MIN - SESSION_OPEN_MIN;

/** Past this the answer is "definitively stale" and not worth iterating for. */
const MAX_SPAN_DAYS = 45;

/**
 * Minutes of REGULAR trading between two instants.
 *
 * This is the whole of the session-awareness rule in one function. Nights,
 * weekends and every minute outside 09:30–16:00 ET count as zero, because the
 * market produced no prints in them — so "the last trade was 17 hours ago" on a
 * Saturday is ZERO market minutes and reads as correct rather than broken,
 * while a print abandoned mid-session accrues lateness by the minute.
 *
 * Holidays are still unknown (README gap 2), so a holiday counts as a full
 * session here — a print from before a holiday looks up to 390 minutes later
 * than it is. `sessionNow()` covers the common case by preferring Polygon's own
 * market status when it is warm.
 */
export function sessionMinutesBetween(from: Date, to: Date): number {
  const a = from.getTime();
  const b = to.getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  if (b - a > MAX_SPAN_DAYS * 86_400_000) return Number.POSITIVE_INFINITY;

  let total = 0;
  let date = etParts(from).date;
  const endDate = etParts(to).date;
  for (let guard = 0; guard <= MAX_SPAN_DAYS + 2; guard++) {
    if (!isWeekend(date)) {
      const open = etInstant(date, SESSION_OPEN_MIN);
      const close = etInstant(date, SESSION_CLOSE_MIN);
      if (open && close) {
        const lo = Math.max(a, open.getTime());
        const hi = Math.min(b, close.getTime());
        if (hi > lo) total += (hi - lo) / 60_000;
      }
    }
    if (date >= endDate) break;
    date = addDays(date, 1);
  }
  return total;
}

/* ------------------------------------------------------------------ */
/* Session — the ET clock, refined by Polygon when it is warm           */
/* ------------------------------------------------------------------ */

let observedStatus: { status: MarketStatus; at: number } | null = null;
const MARKET_STATUS_TTL_MS = 60_000;
/** An observation older than this is not evidence about right now. */
const OBSERVED_STATUS_MAX_AGE_MS = 10 * 60_000;

type MarketStatusBody = { market?: string; earlyHours?: boolean; afterHours?: boolean };

/**
 * `/v1/marketstatus/now` — one cheap call that knows about holidays, which the
 * ET clock in `lib/market/index.ts` does not. It is a REFINEMENT and never a
 * dependency: the clock answers on its own whenever this has not run, so a
 * blocked or unbudgeted call costs accuracy on a holiday and nothing else.
 */
export async function refreshMarketStatus(): Promise<MarketStatus | null> {
  if (observedStatus && Date.now() - observedStatus.at < MARKET_STATUS_TTL_MS) return observedStatus.status;
  const r = await polyGet<MarketStatusBody>('/v1/marketstatus/now');
  if (!r.ok) return null;
  const body = r.data;
  const status: MarketStatus = body.earlyHours
    ? 'pre'
    : body.afterHours
      ? 'after'
      : body.market === 'open'
        ? 'open'
        : body.market === 'extended-hours'
          ? 'after'
          : 'closed';
  observedStatus = { status, at: Date.now() };
  return status;
}

/**
 * The session right now. Polygon's answer when we have a recent one, the ET
 * clock otherwise. An explicit `now` far from the wall clock (tests, backfills)
 * always uses the clock — an observation is evidence about the present only.
 */
export function sessionNow(now = new Date()): MarketStatus {
  const drift = Math.abs(now.getTime() - Date.now());
  if (drift < 60_000 && observedStatus && Date.now() - observedStatus.at < OBSERVED_STATUS_MAX_AGE_MS) {
    return observedStatus.status;
  }
  return marketStatus(now);
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

/** How much time a bar covers. A candle is stamped at the bar's START. */
export const TF_MINUTES: Record<CandleTimeframe, number> = {
  '1m': 1,
  '5m': 5,
  '15m': 15,
  '1h': 60,
  '4h': 240,
  '1d': SESSION_MINUTES,
};

/** Inside this much market lateness the data reaches the present. */
function liveMaxMin(): number {
  const n = Number(env('POLYGON_LIVE_MAX_MIN'));
  return Number.isFinite(n) && n > 0 ? n : 2;
}

/**
 * Beyond this much lateness DURING AN OPEN SESSION the feed is not late, it is
 * gone. 45 minutes is deliberately generous: it covers a 15-minute entitlement
 * delay, a coarse bar, and a daily-close fallback early in a session, and it is
 * still far short of "this number has not moved all morning".
 */
function delayedMaxMin(): number {
  const n = Number(env('POLYGON_DELAYED_MAX_MIN'));
  return Number.isFinite(n) && n > 0 ? n : 45;
}

export type FreshnessOpts = {
  /** Seeded fixtures are labelled as fixtures and never measured. */
  seed?: boolean;
  /** The resolution `sourceTs` is the START of, when it is a bar. */
  bar?: CandleTimeframe | null;
  now?: Date;
};

/**
 * THE ONE PLACE FRESHNESS IS DECIDED. Read the block at the top of this file
 * before changing a number here.
 *
 * Inputs: the timestamp of data we actually received, how wide a bar that
 * timestamp opens, and what the market is doing right now. No constants, no
 * entitlement claim, no env var reaches the verdict — `POLYGON_LIVE_MAX_MIN`
 * and `POLYGON_DELAYED_MAX_MIN` move the thresholds, they do not set an answer.
 */
export function freshnessFor(
  sourceTs: string | null,
  opts: FreshnessOpts = {}
): { freshness: Freshness; delay_reason: DelayReason | null } {
  if (opts.seed) return { freshness: 'delayed', delay_reason: 'seed' };
  if (!sourceTs) return { freshness: 'stale', delay_reason: 'feed_gap' };
  const t = Date.parse(sourceTs);
  if (!Number.isFinite(t)) return { freshness: 'stale', delay_reason: 'feed_gap' };

  const now = opts.now ?? new Date();
  // A timestamp in the future is not late data, it is a broken stamp, and it is
  // the one input that could make everything below read `live` by accident.
  // (`closeStampOf` is the reason one can exist at all — see its note.)
  if (t > now.getTime() + 60_000) return { freshness: 'stale', delay_reason: 'feed_gap' };
  const elapsed = sessionMinutesBetween(new Date(t), now);
  const width = opts.bar ? (TF_MINUTES[opts.bar] ?? 0) : 0;
  const lateBy = Math.max(0, elapsed - width);
  const open = sessionNow(now) === 'open';

  if (!open) {
    // The market is shut. Whatever the newest print is, the market has produced
    // nothing since — that is `market_closed`, not a broken feed. Only data old
    // enough to span whole sessions is actually stale, and `elapsed` counts
    // exactly those.
    if (lateBy <= delayedMaxMin()) return { freshness: 'delayed', delay_reason: 'market_closed' };
    return { freshness: 'stale', delay_reason: 'feed_gap' };
  }

  // Trading. Now lateness is a measurement of this feed, so record it — this is
  // the observation that overrides any entitlement claim (see feedEntitlement).
  if (Number.isFinite(lateBy)) noteMeasuredLag(lateBy);

  if (lateBy <= liveMaxMin()) return { freshness: 'live', delay_reason: null };
  if (lateBy <= delayedMaxMin()) {
    // Late, but usable and labeled. WHY it is late is the only question
    // entitlement gets to answer, and only after the age already said delayed.
    return {
      freshness: 'delayed',
      delay_reason: feedEntitlement() === 'realtime' ? 'feed_gap' : 'entitlement',
    };
  }
  return { freshness: 'stale', delay_reason: 'feed_gap' };
}

/**
 * `bar` names the resolution the price was taken from, when it was taken from a
 * chart bar rather than a session close. Saying "last close" over a 5-minute
 * bar is the kind of quiet inference spec §9 forbids, so the two cases read
 * differently.
 *
 * `kind` covers the rest. A daily bar for a session that has NOT closed is a
 * running aggregate, and "last close 11:32 AM" would name a close that has not
 * happened; an actual print from 8pm is a price, not a close either. Each says
 * what it is.
 */
export type PriceKind = 'close' | 'print' | 'day_so_far';

export function quoteLabel(
  freshness: Freshness,
  reason: DelayReason | null,
  sourceTs: string | null,
  bar: string | null = null,
  kind: PriceKind = 'close'
): string {
  const when = etStamp(sourceTs);
  if (freshness === 'live') return `Live · ${when}`;
  if (freshness === 'stale') return `Data unavailable · last seen ${when}`;
  if (reason === 'seed') return `Sample data · ${when}`;
  const lead = reason === 'market_closed' ? 'Market closed' : 'Delayed';
  if (bar) return `${lead} · last ${bar} bar ${when}`;
  if (kind === 'day_so_far') return `${lead} · today's close so far, ${when}`;
  if (kind === 'print') return `${lead} · last price ${when}`;
  return `${lead} · last close ${when}`;
}

/** Build the full MarketQuote the Trade surfaces render. */
export function buildQuote(opts: {
  symbol: string;
  price: number | null;
  prevClose: number | null;
  sourceTs: string | null;
  seed?: boolean;
  /** Set when the price is a chart bar's close, not a session close. */
  bar?: CandleTimeframe | null;
  /** What sort of number `price` is. Wrong here is a small, repeated lie. */
  kind?: PriceKind;
}): MarketQuote {
  const { freshness, delay_reason } = freshnessFor(opts.sourceTs, {
    seed: opts.seed,
    bar: opts.bar ?? null,
  });
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
    label_plain: quoteLabel(freshness, delay_reason, opts.sourceTs, opts.bar ?? null, opts.kind ?? 'close'),
    session: sessionNow(),
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

/** How many BARS we are willing to send back. A display cap, nothing else. */
export function maxCandles(): number {
  const n = Number(env('POLYGON_MAX_CANDLES') ?? 1500);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 50_000) : 1500;
}

/**
 * `limit` ON THE AGGREGATES ENDPOINT IS NOT A BAR COUNT.
 *
 * It bounds the number of BASE (one-minute) aggregates Polygon will scan while
 * building the answer, and the response simply STOPS when that budget runs out
 * — silently, with `status:"OK"` and a `resultsCount` that looks reasonable.
 *
 * This file passed `POLYGON_MAX_CANDLES` (1500) into it, which is a bar count,
 * and so asked for 1500 minutes of scanning however wide the bars were.
 * Measured 2026-08-29, NVDA, the same day, one request each:
 *
 *   1m  Aug 26 → Aug 29   2442 bars, ending Fri 13:03 ET   (3 hours short)
 *   5m  Aug 24 → Aug 29    302 bars, ending Wed 13:05 ET   (3 days short)
 *   15m Aug 19 → Aug 29    104 bars, ending Aug 20 13:45   (9 days short)
 *
 * The 15-minute chart has been ending NINE DAYS before the present. Nobody saw
 * it because freshness was a constant that read "delayed" over any bar at all;
 * the first thing the measured version did was call those series stale, which
 * is what they were. With the budget raised to Polygon's own 50k ceiling all
 * three run to the last print of the session.
 *
 * The 50k ceiling is still a ceiling — about 50 calendar days of one-minute
 * bases — so a request wider than that is CLAMPED at the old end rather than
 * being allowed to stop short at the new one. A chart that is missing history
 * is a chart; a chart that is missing the present is a lie.
 */
function baseAggregateLimit(): number {
  return posInt(env('POLYGON_BASE_LIMIT'), 50_000);
}

/** Conservative: weekends cost almost nothing, so calendar days over-estimate. */
const BASE_MINUTES_PER_CALENDAR_DAY = 1000;

function clampFrom(tf: CandleTimeframe, from: string, to: string): string {
  if (tf === '1d') return from; // daily bases, not minute bases — no ceiling in practice
  const maxDays = Math.max(1, Math.floor(baseAggregateLimit() / BASE_MINUTES_PER_CALENDAR_DAY));
  const earliest = addDays(to, -maxDays);
  return from < earliest ? earliest : from;
}

/**
 * `keep` is the number of bars to return, NEWEST first-kept: a chart that has
 * to drop something drops history, never the present.
 */
export async function fetchAggregates(
  symbol: string,
  tf: CandleTimeframe,
  from: string,
  to: string,
  keep = maxCandles()
): Promise<PolyResult<Candle[]>> {
  const { mult, span } = TF_PATH[tf];
  const start = clampFrom(tf, from, to);
  if (start !== from) {
    log('info', '-', 'polygon.range_clamped', { symbol, tf, asked: from, used: start, to });
  }
  const r = await polyGet<AggsBody>(
    `/v2/aggs/ticker/${encodeURIComponent(symbol.toUpperCase())}/range/${mult}/${span}/${start}/${to}`,
    { adjusted: true, sort: 'asc', limit: baseAggregateLimit() }
  );
  if (!r.ok) return r;
  const all = (r.data.results ?? []).map(toCandle);
  return { ok: true, data: keep > 0 ? all.slice(-keep) : all, delayed: r.delayed };
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
  // NEWEST-first out of the database, reversed on the way out. Ascending with a
  // LIMIT keeps the OLDEST rows, which is the same mistake `limit` on the
  // aggregates endpoint was making: it silently truncates the present.
  let q = db
    .from('candles')
    .select('ts,o,h,l,c,v')
    .eq('symbol', symbol.toUpperCase())
    .eq('timeframe', tf)
    .order('ts', { ascending: false })
    .limit(maxCandles());
  if (from) q = q.gte('ts', `${from}T00:00:00Z`);
  if (to) q = q.lte('ts', `${to}T23:59:59Z`);
  const { data, error } = await q;
  if (error) {
    log('warn', '-', 'candles.read_failed', { symbol, tf, message: error.message });
    return [];
  }
  return (data ?? []).reverse().map((r) => {
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
 * COVERAGE IS A TIME, NOT A DATE.
 *
 * The old test was `newest stored bar's DATE >= the last trading date`. On a
 * 5-minute series that means the first bar stored after the opening bell marked
 * the whole day covered — the chart then froze at 09:35 until midnight, and no
 * amount of reloading refilled it. That was survivable on a plan that only
 * allowed five requests a minute and was a quarter-hour behind anyway. It is
 * indefensible on this one.
 *
 * So the store is "covered" exactly when the newest bar in it would be labelled
 * current by the same function the user's label comes from: `live`, or
 * `market_closed` (nothing has traded since, so there is nothing to fetch).
 * `delayed` and `stale` both mean go and ask.
 */
function candlesCovered(cached: Candle[], tf: CandleTimeframe, now = new Date()): boolean {
  // A single stored bar is not a series. The grouped-daily fallback writes ONE
  // daily row per symbol, and under the date-based test that row satisfied a
  // 180-day request for the rest of the day — a daily chart drawn from one
  // candle, which is what the smoke run has been printing all along.
  if (cached.length < 2) return false;
  const last = cached[cached.length - 1];
  const { freshness, delay_reason } = freshnessFor(last.ts, { bar: tf, now });
  return freshness === 'live' || delay_reason === 'market_closed';
}

/**
 * A floor under the refill rate. On a 15-minute-delayed feed nothing can ever
 * reach `live`, so `candlesCovered` would say "go and ask" on every single
 * request. The budget is no longer five a minute, but it is not a licence to
 * refetch the same series once per page paint either.
 */
const refetchedAt = new Map<string, number>();
function refillCooldownMs(now = new Date()): number {
  const n = Number(env('POLYGON_REFILL_COOLDOWN_S'));
  if (Number.isFinite(n) && n > 0) return n * 1000;
  return sessionNow(now) === 'open' ? 20_000 : 60_000;
}

/**
 * Cache-first candles. A symbol whose stored bars already reach the present
 * costs zero Polygon calls.
 */
export async function getCandles(
  symbol: string,
  tf: CandleTimeframe,
  from: string,
  to: string
): Promise<CandlesResult> {
  const cached = await readCachedCandles(symbol, tf, from, to);
  const now = new Date();
  const key = `${symbol.toUpperCase()}:${tf}`;
  const cooling = now.getTime() - (refetchedAt.get(key) ?? 0) < refillCooldownMs(now);
  const covered = candlesCovered(cached, tf, now) || (cached.length > 0 && cooling);
  if (covered) return { candles: cached, source: 'cache', degraded: false, degraded_reason: null };
  refetchedAt.set(key, now.getTime());

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

/**
 * A minute is a long time in an open market and no time at all in a shut one.
 * The old flat 60s was a budget decision; this is a product one.
 */
function snapshotTtlMs(now = new Date()): number {
  const n = Number(env('POLYGON_SNAPSHOT_TTL_S'));
  if (Number.isFinite(n) && n > 0) return n * 1000;
  return sessionNow(now) === 'open' ? 10_000 : 60_000;
}
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

/* ------------------------------------------------------------------ */
/* Ticker snapshot — one call, and a MEASURED timestamp per symbol      */
/* ------------------------------------------------------------------ */

/**
 * `/v2/snapshot/locale/us/markets/stocks/tickers?tickers=…` used to answer
 * `NOT_AUTHORIZED` on this account. It does not any more (verified 2026-08-29),
 * and it is a strictly better source than the grouped daily bars for one reason
 * that outranks the rest: it carries `lastTrade.t`, **the nanosecond timestamp
 * of an actual print**. Everything else here has to infer a time from a bar's
 * start; this states it. Freshness measured from a real trade time is the whole
 * point of this file's rewrite.
 *
 * It is also one call for every symbol, exactly like the grouped call, and it
 * gives `day` (today's running aggregate) and `prevDay` — which map onto the
 * app's existing price / prev_close semantics without changing what any surface
 * means by "change".
 */
type SnapAgg = { o?: number; h?: number; l?: number; c?: number; v?: number; t?: number };
type SnapTicker = {
  ticker: string;
  day?: SnapAgg;
  prevDay?: SnapAgg;
  min?: SnapAgg;
  lastTrade?: { p?: number; t?: number };
  updated?: number;
};
type SnapBody = { status?: string; tickers?: SnapTicker[] };

/** Polygon hands trade times in NANOseconds and bar times in milliseconds. */
function nsToMs(ns: number | undefined): number | null {
  return typeof ns === 'number' && ns > 0 ? Math.floor(ns / 1e6) : null;
}

/**
 * A price and the instant it happened, taken from the same field — never one
 * from here and the other from there. That pairing is the rule: a Friday-4pm
 * close carrying an 8pm timestamp is a small lie that a freshness label then
 * repeats out loud.
 *
 * Preference is the last print, then the close of the last minute bar (its `t`
 * is the bar's START, like every other bar in this file), then the day's
 * running close restamped at its session close. Polygon's own `updated` is
 * never used: it says when the snapshot was assembled, not when the market did
 * anything.
 */
function snapshotPrice(t: SnapTicker, now = new Date()): { price: number; ts: string; kind: PriceKind } | null {
  const trade = nsToMs(t.lastTrade?.t);
  const tradePrice = num(t.lastTrade?.p);
  if (trade !== null && tradePrice !== null) {
    return { price: tradePrice, ts: new Date(trade).toISOString(), kind: 'print' };
  }
  const minClose = num(t.min?.c);
  if (typeof t.min?.t === 'number' && t.min.t > 0 && minClose !== null && minClose !== 0) {
    return { price: minClose, ts: new Date(t.min.t + 60_000).toISOString(), kind: 'print' };
  }
  const dayClose = num(t.day?.c);
  if (dayClose !== null && dayClose !== 0 && typeof t.day?.t === 'number' && t.day.t > 0) {
    return { price: dayClose, ...closeStampOf(new Date(t.day.t).toISOString(), now) };
  }
  return null;
}

async function tickersSnapshot(symbols: string[]): Promise<Map<string, SnapTicker> | null> {
  if (!symbols.length) return new Map();
  const r = await polyGet<SnapBody>('/v2/snapshot/locale/us/markets/stocks/tickers', {
    tickers: symbols.join(','),
  });
  if (!r.ok) return null;
  const out = new Map<string, SnapTicker>();
  for (const t of r.data.tickers ?? []) out.set(t.ticker, t);
  return out;
}

export type SnapshotResult = {
  quotes: MarketQuote[];
  degraded: boolean;
  degraded_reason: string | null;
};

/**
 * Quotes for many symbols, in ONE call, with a timestamp per symbol that came
 * off the wire rather than out of a calendar.
 *
 * Order of preference, and why:
 *   1. the ticker snapshot — a real print time, today's running price, and the
 *      prior close, all measured;
 *   2. the `candles` store — free, and correct while the market is shut;
 *   3. two grouped daily calls — the old path, kept because it is the one that
 *      still works if the snapshot entitlement ever goes away again.
 *
 * Note the reordering: the candles store used to come FIRST. That was right
 * when the newest thing Polygon would tell us was yesterday's close, and wrong
 * now — during a session it would answer with a stored close and never look at
 * the live price at all.
 */
export async function getSnapshot(symbols: string[]): Promise<SnapshotResult> {
  const wanted = [...new Set(symbols.map((s) => s.toUpperCase()).filter(Boolean))];
  const out: MarketQuote[] = [];
  const missing: string[] = [];
  const ttl = snapshotTtlMs();

  for (const s of wanted) {
    const hit = fresh(quoteCache.get(s), ttl);
    if (hit) out.push(hit);
    else missing.push(s);
  }
  if (!missing.length) return { quotes: order(out, wanted), degraded: false, degraded_reason: null };

  // Keep the session opinion warm; it costs one call a minute and it is the
  // only thing here that knows about holidays.
  void refreshMarketStatus().catch(() => null);

  // 1) One snapshot call for every symbol, with real print times.
  const snapped = await tickersSnapshot(missing);
  const afterSnapshot: string[] = [];
  for (const s of missing) {
    const row = snapped?.get(s);
    const priced = row ? snapshotPrice(row) : null;
    // `prevDay.c` is the comparison Polygon itself uses for `todaysChange`, so
    // last print against prior close is one consistent pair, not two sources.
    const prevClose = num(row?.prevDay?.c);
    if (priced && prevClose !== null) {
      const q = buildQuote({
        symbol: s,
        price: priced.price,
        prevClose,
        sourceTs: priced.ts,
        kind: priced.kind,
      });
      quoteCache.set(s, { at: Date.now(), value: q });
      out.push(q);
    } else {
      afterSnapshot.push(s);
    }
  }
  if (!afterSnapshot.length) return { quotes: order(out, wanted), degraded: false, degraded_reason: null };

  const d0 = lastTradingDate();
  const d1 = prevTradingDate(d0);

  // 2) The candles store — free, and right whenever the market is shut.
  const cachedBars = await readLastDailyBars(afterSnapshot, d1);
  const stillMissing: string[] = [];
  for (const s of afterSnapshot) {
    const bars = cachedBars.get(s);
    if (bars && bars.last && bars.last.ts.slice(0, 10) >= d0) {
      const stamped = closeStampOf(bars.last.ts);
      const q = buildQuote({
        symbol: s,
        price: bars.last.c,
        prevClose: bars.prev?.c ?? null,
        sourceTs: stamped.ts,
        kind: stamped.kind,
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
      const stamped = closeStampOf(new Date(row.t).toISOString());
      const q = buildQuote({
        symbol: s,
        price: num(row.c),
        prevClose: num(prev?.c),
        sourceTs: stamped.ts,
        kind: stamped.kind,
      });
      quoteCache.set(s, { at: Date.now(), value: q });
      out.push(q);
      void writeCandles(s, '1d', [toCandle({ t: row.t, o: row.o, h: row.h, l: row.l, c: row.c, v: row.v })]);
      continue;
    }
    // 3) No bar for the newest session. While the market is shut that is not a
    //    fault: the previous session's close is genuinely the newest price that
    //    exists, and `delayed`/`market_closed` already says so. Only a symbol
    //    we have nothing at all for counts as degraded. During an OPEN session
    //    the same answer is a gap, and `freshnessFor` will grade it as one on
    //    its own — nothing here has to declare it.
    const bars = cachedBars.get(s);
    const fromGrouped = g1?.get(s) ?? null;
    const price = bars?.last?.c ?? num(fromGrouped?.c);
    const stampedFallback = bars?.last
      ? closeStampOf(bars.last.ts)
      : fromGrouped
        ? closeStampOf(new Date(fromGrouped.t).toISOString())
        : null;
    const sourceTs = stampedFallback?.ts ?? null;

    if (price === null || sourceTs === null) {
      degraded = true;
      reason =
        reason ??
        (g0 === null
          ? 'We are pulling market data a little slower than usual — showing the last data we stored.'
          : `We have no price for ${s} yet.`);
    }

    out.push({
      ...buildQuote({
        symbol: s,
        price,
        prevClose: bars?.prev?.c ?? null,
        sourceTs,
        kind: stampedFallback?.kind ?? 'close',
      }),
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
 *
 * NEVER INTO THE FUTURE. On the old plan a daily bar only arrived after the
 * session had ended, so 16:00 ET was always in the past. On the upgraded plan
 * `/v2/aggs` serves TODAY'S RUNNING daily bar during the session, and stamping
 * that at 16:00 would date the data hours ahead of the clock — which reads as
 * "live" to any age-based measurement and as "last close 4:00 PM" to a user, at
 * 11:32 in the morning. So a session that has not closed is stamped at `now`
 * and reported through `closeStampOf().daySoFar`, which changes the sentence.
 */
function closeStampOf(ts: string, now = new Date()): { ts: string; kind: PriceKind } {
  const date = etParts(new Date(ts)).date;
  const close = etInstant(date, SESSION_CLOSE_MIN);
  if (!close) return { ts, kind: 'close' };
  if (close.getTime() > now.getTime()) return { ts: now.toISOString(), kind: 'day_so_far' };
  return { ts: close.toISOString(), kind: 'close' };
}

function closeStamp(ts: string, now = new Date()): string {
  return closeStampOf(ts, now).ts;
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
 *   2. An intraday series only earns that job when it REACHES THE PRESENT —
 *      see the paragraph below, which changed on 2026-08-29. Finer is not
 *      fresher: a 5-minute series that stopped two sessions ago loses to
 *      yesterday's close, and the resolver falls back to the daily series and
 *      SAYS SO (`fell_back`, `resolution_plain`) instead of quietly mixing the
 *      two.
 *   3. Only when there is no priced bar at all does the daily snapshot answer
 *      on its own, with its own timestamp and its own "last close …" label.
 *
 * WHAT CHANGED, AND WHAT MUST BE RE-CHECKED MONDAY
 * ------------------------------------------------
 * The old test was `intradayBar.ts > snapshot.source_ts` — strictly newer. It
 * existed because on the OLD plan intraday aggregates lagged the daily bars by
 * whole sessions, so "newer" was a real and frequent question.
 *
 * That test is now actively wrong, and would have broken the chart the first
 * morning after the upgrade. The snapshot's timestamp is no longer a 4pm close
 * from a previous session; it is the time of an actual print, seconds old. A
 * 5-minute bar is stamped at its START, so during a live session the newest
 * intraday bar is ALWAYS "older" than the last trade — by up to five minutes,
 * every five minutes, forever. Strict newness would have failed on every
 * comparison and pushed the portal onto the daily chart for the whole session.
 *
 * So the question is no longer "is this bar newer" but **"does this series
 * reach the present" **: the bar's COVERAGE END (start + width) is compared
 * with the newest data we know of, and one bar of slack is allowed for the bar
 * that has not closed yet. A series that stopped sessions ago still loses.
 *
 * ⚠ UNVERIFIED — this was written on Saturday 2026-08-29 with the market shut,
 * so only the closed-market half of it has been exercised. **On Monday, during
 * regular hours, confirm:** (a) `/api/v1/trade/portal/{sym}?tf=5m` keeps
 * `chart_config.series == "intraday"` all session and does not flip to daily;
 * (b) the header price tracks the last 5m bar rather than a stale close;
 * (c) `quote.freshness` reads `live` (or `delayed`/`entitlement` if the plan
 * turns out to be delayed after all — `feedEntitlement()` will have measured
 * it by then).
 *
 * BUDGET. The daily fallback reads the `candles` table first and only pays a
 * Polygon call when the store has nothing recent enough, and every resolution
 * is memoised for 30s per (symbol, timeframe).
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

/**
 * Does a bar-series reach the present?
 *
 * `barTs` is the START of the newest bar, so the series covers up to
 * `barTs + width`. It counts as current when that coverage is within ONE more
 * bar of the newest data we know about — the slack is for the bar that is
 * still filling, which by definition has not closed yet.
 *
 * The comparison is in MARKET minutes, so a Friday-afternoon series is still
 * current on Sunday night, and a series that quit on Tuesday is not current on
 * Thursday.
 */
function seriesReachesPresent(
  barTs: string,
  tf: CandleTimeframe,
  against: string | null,
  slackBars = 2
): boolean {
  if (!against) return true;
  const bar = Date.parse(barTs);
  const ref = Date.parse(against);
  if (!Number.isFinite(bar) || !Number.isFinite(ref)) return false;
  if (bar >= ref) return true;
  const width = TF_MINUTES[tf] ?? 0;
  const behind = sessionMinutesBetween(new Date(bar), new Date(ref));
  return behind <= width * slackBars + 1;
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
    // Reaches the present, not merely newer — see the block above this
    // function for why the strict test had to go.
    if (found && seriesReachesPresent(found.last.ts, requested, snapshot.source_ts)) {
      bars = intraday.candles;
      degraded = intraday.degraded;
      degradedReason = intraday.degraded_reason;
    } else {
      // The finer series does not reach the present. Say which chart this is.
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
    // One session of slack, not two: the stored daily bar for the session the
    // snapshot printed in is current; the one before it is a session behind and
    // worth a request. (The old test compared against a 4pm close stamp and so
    // refetched on every resolve once the snapshot began carrying real print
    // times — a call per portal open, for a bar we already had.)
    if (have && seriesReachesPresent(have.last.ts, '1d', snapshot.source_ts, 1)) {
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
        const stamped = intradaySeries ? null : closeStampOf(found.last.ts);
        const sourceTs = stamped ? stamped.ts : found.last.ts;
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
            kind: stamped?.kind ?? 'close',
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
    // Same test as the portal, for the same reason: a stored bar takes the
    // price when its series reaches the present, and loses when it does not.
    // Strict newness would never fire once the snapshot began carrying a real
    // print time, and the list and the portal would drift apart again.
    if (!bar || bar.c === null || !seriesReachesPresent(bar.ts, tf, q.source_ts)) return q;
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
 * against the budget and, just as importantly, so the entitlement and 429
 * observations it carries are seen. A raw `fetch` elsewhere spends the budget
 * without telling the bucket about it and throws away what the response said
 * about the plan.
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

/** Test seam: drop every in-memory cache AND every observation. */
export function resetMarketCaches(): void {
  groupedCache.clear();
  quoteCache.clear();
  newsCache.clear();
  resolveCache.clear();
  refetchedAt.clear();
  hits = [];
  inFlight = 0;
  cooldownUntil = 0;
  observedStatus = null;
  statedEntitlement = 'unknown';
  measuredLagMin = null;
  measuredLagAt = 0;
}
