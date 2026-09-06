/**
 * LIVE PRICES — one batched fetch, one honest fallback.
 *
 * THE PROBLEM THIS FIXES. Every surface that showed a price off a `setups` row
 * read `quote_snapshot` — a number frozen into the row when the scanner wrote
 * it, hours or days ago — and then repeated the freshness word that was ALSO
 * frozen into the row. A snapshot stamped `freshness:'delayed'` last Tuesday
 * still said "Delayed 15m" this morning. That is the one thing a financial
 * product may not do: carry a claim about its own data that nothing checks.
 *
 * TWO RULES, AND THEY DO NOT BEND FOR EACH OTHER.
 *
 *   1. When the market can be asked, ask it. `resolveQuotes` is the same call
 *      the Trade section and Kai's price tool make, so a list row and the
 *      portal it opens can never quote different numbers for one symbol.
 *
 *   2. When it cannot, show the last REAL price with the time it happened and
 *      say it is old. Never a blank pretending to be a price, never a stale
 *      number pretending to be live, and never a number nobody printed.
 *
 * FRESHNESS IS RE-MEASURED, NEVER REPEATED. The fallback runs the stored
 * `source_ts` back through `freshnessFor` — the one place freshness is decided
 * — so age is computed against the clock now rather than read out of the row.
 * A Friday close on a Saturday is `delayed` / `market_closed`, which is the
 * truth; the same price during Tuesday's session is `stale`, which is also the
 * truth. Nothing here can upgrade anything to `live`: only a measured print
 * time can do that, and only `freshnessFor` measures it.
 *
 * COST. One `resolveQuotes` for a whole screen: ONE Polygon snapshot request
 * covering every symbol, plus one database read of stored intraday bars. A
 * twenty-row list costs one call, not twenty, and the result is memoised for
 * 10s while the market is open and 60s while it is shut.
 */
import type { Freshness, MarketBlock, MarketQuote } from '@shared/api';
import { log } from '../log';
import { marketBlock } from './index';
import {
  buildQuote,
  polygonConfigured,
  refreshMarketStatus,
  resolveQuotes,
  sessionNow,
} from './polygon';

/** The seeded fixture run. Its prices are samples and must read as samples. */
export const SEED_RUN_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Anything with a symbol and a stored snapshot. `live_quote` is stamped on by
 * `attachLiveQuotes` and read by `quoteFor`; a row that never went through the
 * attach step simply falls back, which is why every caller is safe by default.
 */
export type QuotableRow = {
  symbol: string;
  quote_snapshot?: unknown;
  scanner_run_id?: string | null;
  live_quote?: MarketQuote | null;
};

export type AttachResult = {
  /** Symbols we could not price at all — no live quote and no stored one. */
  unpriced: string[];
  degraded: boolean;
  degraded_reason: string | null;
};

const NOT_ASKED: AttachResult = { unpriced: [], degraded: false, degraded_reason: null };

/**
 * Price a set of rows from the market in ONE call, and stamp each row with what
 * came back. Rows the market could not answer for are left alone — `quoteFor`
 * then falls back to the stored snapshot and labels it honestly.
 *
 * Never throws. A market-data outage must not take a screen down; it must make
 * the screen say the prices are old.
 */
export async function attachLiveQuotes<T extends QuotableRow>(rows: T[]): Promise<AttachResult> {
  const symbols = [...new Set(rows.map((r) => (r.symbol ?? '').toUpperCase()).filter(Boolean))];
  if (!symbols.length) return NOT_ASKED;
  if (!polygonConfigured()) {
    return { unpriced: [], degraded: true, degraded_reason: 'Market data is not configured, so these are stored prices.' };
  }

  try {
    const snap = await resolveQuotes(symbols, { preferIntraday: true });
    const by = new Map(snap.quotes.map((q) => [q.symbol, q]));
    const unpriced: string[] = [];
    for (const row of rows) {
      const q = by.get((row.symbol ?? '').toUpperCase());
      // A quote with no price is not an answer. Leave the row on its stored
      // number rather than replacing a real old price with an empty new one.
      if (q && q.price !== null) row.live_quote = q;
      else if (quoteFor(row).price === null) unpriced.push(row.symbol);
    }
    return {
      unpriced,
      degraded: snap.degraded || unpriced.length > 0,
      degraded_reason:
        snap.degraded_reason ??
        (unpriced.length ? `No price yet for ${[...new Set(unpriced)].join(', ')}.` : null),
    };
  } catch (e) {
    log('warn', '-', 'market.live_attach_failed', { message: (e as Error)?.message ?? 'unknown', symbols: symbols.length });
    return {
      unpriced: [],
      degraded: true,
      degraded_reason: 'Market data did not answer, so these are the last prices we stored.',
    };
  }
}

/**
 * The one quote for a row: what the market just said, or the last real price
 * with the time it happened stamped on it.
 *
 * The fallback is built through `buildQuote`, which means the label and the
 * freshness are produced by the same code that labels a live quote — there is
 * no second vocabulary for old data, only a different measurement.
 */
export function quoteFor(row: QuotableRow): MarketQuote {
  if (row.live_quote && row.live_quote.price !== null) return row.live_quote;

  const s = (row.quote_snapshot ?? {}) as Record<string, unknown>;
  const raw = typeof s.price === 'number' ? s.price : Number(s.price);
  const price = Number.isFinite(raw) ? raw : null;
  const sourceTs = typeof s.source_ts === 'string' ? s.source_ts : null;
  const prevRaw = typeof s.prev_close === 'number' ? s.prev_close : Number(s.prev_close);

  return buildQuote({
    symbol: (row.symbol ?? '').toUpperCase(),
    price,
    prevClose: Number.isFinite(prevRaw) ? prevRaw : null,
    sourceTs,
    seed: row.scanner_run_id === SEED_RUN_ID || s.origin === 'seed',
  });
}

/** True when this row is showing a number the market gave us just now. */
export function isLive(row: QuotableRow): boolean {
  return Boolean(row.live_quote && row.live_quote.price !== null);
}

/**
 * The freshness of a SCREEN is the freshness of its worst row.
 *
 * `MarketBlock.freshness` is what Home's opening line reads to decide whether
 * to warn that the prices are behind, and every route was passing a constant
 * `delayed` into it — so the warning could never fire, whatever the data did.
 * A screen with one broken symbol on it is a screen with a problem, and the
 * only honest summary of a mixed set is its worst member.
 */
export function worstFreshness(rows: QuotableRow[]): Freshness {
  let worst: Freshness = 'live';
  for (const r of rows) {
    const f = quoteFor(r).freshness;
    if (f === 'stale') return 'stale';
    if (f === 'delayed') worst = 'delayed';
  }
  return worst;
}

/**
 * The session block, refined by the exchange calendar.
 *
 * `marketBlock()` in ./index is the ET wall clock and weekends — it does not
 * know a holiday, and it has always said so with `holidays_known:false`.
 * Polygon's `/v1/marketstatus/now` DOES know, costs one call a minute, and is
 * already cached inside `refreshMarketStatus`. When that observation is in
 * hand the block reports the exchange's own verdict and `holidays_known:true`;
 * when it is not, nothing changes and the honest false stands.
 */
export async function liveMarketBlock(freshness: Freshness = 'delayed'): Promise<MarketBlock> {
  const base = marketBlock(new Date(), freshness);
  if (!polygonConfigured()) return base;
  try {
    const observed = await refreshMarketStatus();
    if (!observed) return base;
    const status = sessionNow();
    return {
      ...base,
      status,
      holidays_known: true,
      label_plain: MARKET_LABEL[status],
    };
  } catch {
    return base;
  }
}

const MARKET_LABEL: Record<MarketBlock['status'], string> = {
  pre: 'Pre-market',
  open: 'Market open',
  after: 'After hours',
  closed: 'Market closed',
};

/**
 * What the app is entitled to say about holidays, in one sentence, so the
 * session route and Kai's prompt cannot drift apart on it.
 */
export function holidayNotice(known: boolean): string {
  return known
    ? 'Market holidays are accounted for — the session above is the exchange calendar, not a guess from the clock.'
    : 'Market holidays are not known right now — this is the New York clock and weekends only, so on a holiday it will read as open.';
}
