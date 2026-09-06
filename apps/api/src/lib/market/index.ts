/**
 * Market session status, computed from the America/New_York wall clock.
 *
 * HOLIDAYS: this file is the WALL CLOCK and weekends, and it does not know a
 * holiday — `holidays_known:false` says so, and that is honest. It is no
 * longer the only session source: `liveMarketBlock()` in ./live asks Polygon's
 * `/v1/marketstatus/now`, which is the exchange's own answer and does know,
 * and falls back to this when it cannot. Prefer that in a route; this stays
 * the floor everything can rely on with no network at all.
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
 * `quoteFromSnapshot` / `freshnessFromSnapshot` USED TO LIVE HERE. They are
 * gone on purpose, and this note is here so nobody writes them again.
 *
 * They read the price AND the freshness word out of a `quote_snapshot` that a
 * scanner had frozen into a `setups` row, and the comment above them said "we
 * never upgrade a stored snapshot to 'live'". That was the right instinct
 * pointed at the wrong end of the problem: the danger was never that an old
 * number would be called live, it was that a number frozen last Tuesday kept
 * repeating the word `delayed` that was true when it was written, on a screen
 * looked at today.
 *
 * A stored quote's freshness is a MEASUREMENT, not a field. `lib/market/live.ts`
 * makes it: `attachLiveQuotes` asks the market once for a whole screen, and
 * `quoteFor` falls back to the stored price with its age re-measured against
 * the clock now. Use those.
 */
