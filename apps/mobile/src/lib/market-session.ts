/**
 * WHAT SESSION THE MARKET IS IN, AND HOW OFTEN THAT MAKES A PRICE WORTH ASKING FOR.
 *
 * This file is pure on purpose — no React, no react-native, no network — so the
 * cadence rules can be asserted directly by `scripts/live-refresh-test.mts`
 * instead of being inferred from a rendered screen. `useMarketRefresh` is the
 * only thing that turns these numbers into timers.
 *
 * ── WHY THE SESSION DECIDES THE INTERVAL ─────────────────────────────────────
 * Every request costs money and battery, and outside 9:30–16:00 ET most of them
 * come back with the same number they returned last time. So the session is the
 * throttle:
 *
 *   open      quotes every 15s   — the tape is moving; this is the product
 *   pre/post  quotes every 60s   — thin, but it does move
 *   closed    never              — one fetch when the surface opens is the
 *                                  whole truth until the bell
 *
 * "Closed" genuinely means zero requests, not a slow poll. A phone left on the
 * alerts tab overnight must be silent.
 */
import type { MarketStatus } from './types';

/** The three cadences the app has. `pre` and `post` collapse into `extended`. */
export type MarketSession = 'open' | 'extended' | 'closed';

/** What is being refreshed. Candles also need the bar width — see below. */
export type RefreshKind = 'quote' | 'candles';

/* ------------------------------------------------------------------ */
/* The cadence table                                                   */
/* ------------------------------------------------------------------ */

/** Quotes. `null` is "do not poll at all", which is not the same as "slowly". */
export const QUOTE_INTERVAL_MS: Record<MarketSession, number | null> = {
  open: 15_000,
  extended: 60_000,
  closed: null,
};

/**
 * Candles, keyed by bar width.
 *
 * A bar is only interesting while it is still being written, so the refresh
 * cadence matches the bar: asking for 1-hour candles every 15 seconds buys the
 * same bar 240 times, and asking for 1-minute candles every 5 minutes shows a
 * chart four bars behind the price printed above it.
 *
 * The server is cache-first, so this refetches the SERIES rather than merging a
 * partial bar. A merge would mean the client inventing the shape of a bar the
 * server has not closed yet, and a candle nobody printed is fake market data.
 */
export const CANDLE_INTERVAL_MS: Record<string, number> = {
  '1m': 30_000,
  '5m': 60_000,
  '15m': 60_000,
  '1h': 300_000,
  '60m': 300_000,
  '4h': 900_000,
  '240m': 900_000,
  '1d': 300_000,
  D: 300_000,
};

/** Anything whose width we do not recognise is treated as a slow bar. */
const CANDLE_FALLBACK_MS = 300_000;

/**
 * Extended hours are thin. A 30-second candle poll before the bell buys the
 * same three bars over and over, so nothing refreshes faster than the quote
 * cadence out there.
 */
const EXTENDED_FLOOR_MS = 60_000;

/**
 * How often this surface should ask again — or `null` for "do not ask again".
 *
 * `null` is returned for every closed-market case and is the only reason the
 * hook creates no timer at all.
 */
export function refreshIntervalMs(
  session: MarketSession,
  kind: RefreshKind = 'quote',
  timeframe?: string | null,
): number | null {
  if (session === 'closed') return null;
  if (kind === 'quote') return QUOTE_INTERVAL_MS[session];
  const base = CANDLE_INTERVAL_MS[String(timeframe ?? '')] ?? CANDLE_FALLBACK_MS;
  return session === 'extended' ? Math.max(base, EXTENDED_FLOOR_MS) : base;
}

/* ------------------------------------------------------------------ */
/* Reading the session                                                 */
/* ------------------------------------------------------------------ */

/** The server's own word for the session, mapped onto our three. */
export function sessionOf(
  status: MarketStatus['status'] | null | undefined,
): MarketSession | null {
  if (status === 'open') return 'open';
  if (status === 'pre' || status === 'post') return 'extended';
  if (status === 'closed' || status === 'holiday') return 'closed';
  return null;
}

const NY = 'America/New_York';

/**
 * The session according to the wall clock in New York.
 *
 * This is the FALLBACK, not the authority: most payloads carry no `market`
 * block, and a surface with no idea what time it is would either poll all night
 * or never poll at all. It knows the weekend and the regular hours; it does not
 * know holidays, which is exactly what `noteMarketStatus` is for — the server
 * says "closed" on Thanksgiving and that answer outranks this one.
 */
/**
 * Cached to the minute. `currentSession` is read during render by every screen
 * that holds a price, and building an `Intl.DateTimeFormat` on each of those is
 * a measurable cost for an answer that can only change once a minute.
 */
let clockCache: { minute: number; session: MarketSession } | null = null;

export function sessionFromClock(now: Date = new Date()): MarketSession {
  const minute = Math.floor(now.getTime() / 60_000);
  if (clockCache && clockCache.minute === minute) return clockCache.session;
  const session = computeSessionFromClock(now);
  clockCache = { minute, session };
  return session;
}

function computeSessionFromClock(now: Date): MarketSession {
  let weekday: string;
  let hour: number;
  let minute: number;
  try {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone: NY, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
      }).formatToParts(now).map((x) => [x.type, x.value]),
    );
    weekday = String(p.weekday ?? '');
    // `hour12:false` renders midnight as "24" in some engines.
    hour = Number(p.hour) % 24;
    minute = Number(p.minute);
  } catch {
    // A runtime with no zoned Intl must not be told the market is open.
    return 'closed';
  }
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 'closed';
  if (weekday === 'Sat' || weekday === 'Sun') return 'closed';
  const mins = hour * 60 + minute;
  if (mins >= 9 * 60 + 30 && mins < 16 * 60) return 'open';
  if (mins >= 4 * 60 && mins < 20 * 60) return 'extended';
  return 'closed';
}

/* ------------------------------------------------------------------ */
/* What the server last said                                           */
/* ------------------------------------------------------------------ */

/**
 * ONE SURFACE'S ANSWER, SHARED WITH ALL OF THEM.
 *
 * `GET /home` is the only payload that carries a `market` block, and it is also
 * the first screen anybody opens. Rather than teach six more endpoints to send
 * one, Home's answer is remembered here and every other surface reads it. It
 * expires because a remembered "open" must not keep the watchlist polling after
 * the bell if Home was never opened again.
 */
const REMEMBERED_TTL_MS = 15 * 60_000;
let remembered: { session: MarketSession; at: number } | null = null;

export function noteMarketStatus(
  status: MarketStatus['status'] | null | undefined,
  now: number = Date.now(),
): void {
  const s = sessionOf(status);
  if (s) remembered = { session: s, at: now };
}

/** Test seam only — the module-level memory is otherwise process-lifetime. */
export function forgetMarketStatus(): void {
  remembered = null;
}

/**
 * The session to schedule against.
 *
 * Order of trust: what THIS payload says → what any payload said recently →
 * the New York clock. A hint is always right about its own surface, and the
 * remembered answer beats the clock because it knows about holidays.
 */
export function currentSession(
  hint?: MarketStatus['status'] | null,
  now: Date = new Date(),
): MarketSession {
  const direct = sessionOf(hint);
  if (direct) {
    noteMarketStatus(hint, now.getTime());
    return direct;
  }
  if (remembered && now.getTime() - remembered.at < REMEMBERED_TTL_MS) return remembered.session;
  return sessionFromClock(now);
}
