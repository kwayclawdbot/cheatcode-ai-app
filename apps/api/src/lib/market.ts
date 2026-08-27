/**
 * Market session status, computed from the America/New_York wall clock.
 *
 * KNOWN GAP: there is no market-holidays table in Phase 0, so US market
 * holidays are NOT accounted for — only weekends and the intraday windows.
 * `holidays_known:false` is returned so the client can be honest about it.
 * The session engine in the market-intelligence worker (03 Unit 2) becomes the
 * authority once it exists; until then this is the only session source.
 *
 * Windows (ET): pre 04:00–09:30 · open 09:30–16:00 · after 16:00–20:00 ·
 * closed otherwise and all weekend.
 */
import type { MarketBlock, MarketStatus, Freshness } from '@shared/api';

const NY = 'America/New_York';

function nyParts(now: Date) {
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
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  return {
    weekday: parts.weekday as string,
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour === '24' ? '0' : parts.hour) * 60 + Number(parts.minute),
  };
}

export function marketStatus(now = new Date()): MarketStatus {
  const { weekday, minutes } = nyParts(now);
  if (weekday === 'Sat' || weekday === 'Sun') return 'closed';
  if (minutes >= 4 * 60 && minutes < 9 * 60 + 30) return 'pre';
  if (minutes >= 9 * 60 + 30 && minutes < 16 * 60) return 'open';
  if (minutes >= 16 * 60 && minutes < 20 * 60) return 'after';
  return 'closed';
}

/** The trading day a briefing belongs to (ET calendar date). */
export function marketDate(now = new Date()): string {
  return nyParts(now).date;
}

const LABELS: Record<MarketStatus, string> = {
  pre: 'Pre-market',
  open: 'Market open',
  after: 'After hours',
  closed: 'Market closed',
};

export function marketBlock(now = new Date(), freshness: Freshness = 'delayed'): MarketBlock {
  const status = marketStatus(now);
  return {
    status,
    session_ts: now.toISOString(),
    freshness,
    holidays_known: false,
    label_plain: LABELS[status],
  };
}

/**
 * Freshness for seed/persisted quotes is whatever the row says — we never
 * upgrade a stored snapshot to 'live'.
 */
export function freshnessFromSnapshot(snapshot: unknown): Freshness {
  const f = (snapshot as { freshness?: unknown } | null)?.freshness;
  return f === 'live' || f === 'delayed' || f === 'stale' ? f : 'stale';
}

export function quoteFromSnapshot(symbol: string, snapshot: unknown) {
  const s = (snapshot ?? {}) as Record<string, unknown>;
  const price = typeof s.price === 'number' ? s.price : Number(s.price);
  return {
    symbol,
    price: Number.isFinite(price) ? price : null,
    source_ts: typeof s.source_ts === 'string' ? s.source_ts : null,
    received_ts: typeof s.received_ts === 'string' ? s.received_ts : null,
    freshness: freshnessFromSnapshot(s),
  };
}
