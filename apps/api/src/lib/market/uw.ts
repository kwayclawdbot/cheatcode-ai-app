/**
 * UNUSUAL WHALES — options flow and the earnings calendar, read-only.
 *
 * Why this and not Polygon: on this account `/v3/snapshot/options/*` and the
 * Benzinga earnings feed both answer NOT_AUTHORIZED (measured 2026-09-21). The
 * UOA day-trade engine already runs on Unusual Whales (Railway, Python); this
 * is the first TypeScript reader of it and it only ever issues GETs.
 *
 * The token lives in `UNUSUAL_WHALES_TOKEN` and nowhere else. Unset → every
 * call answers `not_configured` and the tool says so in a sentence; it is never
 * a thrown error and never a made-up number.
 *
 * EVERYTHING OPTIONS COMES FROM HERE (owner rule, 2026-09-21). Polygon stays
 * for stock data only. The options panel's chain and prices, the earnings
 * panel's next date, and the day-trade contract tracker all read this file.
 *
 * RATE LIMITS. This token is SHARED with the Railway UOA engine, which polls
 * flow-alerts every 75 seconds all session. So every read here is cached (the
 * TTL is per endpoint and says how fast that thing changes), concurrent asks
 * for the same URL share one request, requests from this process are spaced at
 * least UW_GAP_MS apart, and a 429 stops ALL requests from this process for a
 * cool-down rather than retrying into the limit.
 *
 * TRAPS CARRIED OVER FROM THE ENGINE (docs/options, memory 09-06):
 *   - Aggregates do not call direction. Put/call ratios and "bullish premium"
 *     were measured three ways against what the stock did next and did not
 *     predict it. The tool reports them as activity, never as a forecast.
 *   - `min_dte`/`max_dte` on flow-alerts are measured against TODAY, so this
 *     file never passes them.
 *   - An earnings row with `source: "estimation"` is UW's guess at the date,
 *     not the company's announcement. That flag travels to the tool output.
 *   - `/api/stock/{t}/option-contracts` has NO date parameter: it is always the
 *     latest session's chain. It is used for "now" only, never to rebuild a
 *     past morning.
 *   - `/api/stock/{t}/flow-per-expiry` ignores its date parameter. Not used.
 *   - Dated history reaches back about 90 trading days, rolling. Older asks
 *     answer `historic_data_access_missing`, which reads here as `error`.
 *   - Option symbols are bare OCC (`NET260911P00297500`); Polygon's `O:` prefix
 *     is stripped before a call.
 */
import { env } from '../env';

const BASE = 'https://api.unusualwhales.com';

export type UwFail = 'not_configured' | 'unauthorized' | 'rate_limited' | 'error';
export type UwResult<T> = { ok: true; data: T } | { ok: false; reason: UwFail };

export const UW_FAIL_PLAIN: Record<UwFail, string> = {
  not_configured: 'The options-flow and earnings data source is not connected on this server yet.',
  unauthorized: 'The options-flow data source refused our key.',
  rate_limited: 'The options-flow data source is throttling requests right now.',
  error: 'The options-flow data source did not answer just now.',
};

export function uwConfigured(): boolean {
  return Boolean(env('UNUSUAL_WHALES_TOKEN'));
}

const cache = new Map<string, { at: number; value: unknown }>();
const inFlight = new Map<string, Promise<UwResult<unknown>>>();
let calls = 0;

/** The smallest gap between two requests from this process. */
const UW_GAP_MS = 350;
/** After a 429, how long this process sends nothing at all. */
const UW_COOLDOWN_MS = 30_000;
let nextSlot = 0;
let coolUntil = 0;

/** Wait for this request's slot. Slots are handed out in order, so a burst of
 *  asks goes out as a steady trickle instead of all at once. */
async function takeSlot(): Promise<void> {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + UW_GAP_MS;
  if (at > now) await new Promise((r) => setTimeout(r, at - now));
}

/** Test seam: replace the network with a recorded answer. */
type Fetcher = (url: string) => Promise<{ status: number; json: () => Promise<unknown> }>;
let fetcher: Fetcher | null = null;
export function __setUwFetcher(f: Fetcher | null): void {
  fetcher = f;
}

/** How many real requests this process has sent. Proof scripts read it. */
export function uwCalls(): number {
  return calls;
}

export function resetUwCaches(): void {
  cache.clear();
  inFlight.clear();
  calls = 0;
  nextSlot = 0;
  coolUntil = 0;
}

async function uwGet<T>(path: string, ttlMs: number, params: Record<string, string | number> = {}): Promise<UwResult<T>> {
  const token = env('UNUSUAL_WHALES_TOKEN');
  if (!token) return { ok: false, reason: 'not_configured' };
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const key = url.toString();

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return { ok: true, data: hit.value as T };
  const pending = inFlight.get(key);
  if (pending) return pending as Promise<UwResult<T>>;

  if (Date.now() < coolUntil) return { ok: false, reason: 'rate_limited' };

  const p = (async (): Promise<UwResult<T>> => {
    await takeSlot();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    calls += 1;
    try {
      const res = fetcher
        ? await fetcher(key)
        : await fetch(url, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
            signal: controller.signal,
            cache: 'no-store',
          });
      if (res.status === 429) {
        coolUntil = Date.now() + UW_COOLDOWN_MS;
        return { ok: false, reason: 'rate_limited' };
      }
      if (res.status === 401 || res.status === 403) return { ok: false, reason: 'unauthorized' };
      if (res.status < 200 || res.status >= 300) return { ok: false, reason: 'error' };
      const json = (await res.json()) as T;
      cache.set(key, { at: Date.now(), value: json });
      return { ok: true, data: json };
    } catch {
      return { ok: false, reason: 'error' };
    } finally {
      clearTimeout(timer);
    }
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, p as Promise<UwResult<unknown>>);
  return p;
}

/* ------------------------------------------------------------------ */
/* Endpoints                                                           */
/* ------------------------------------------------------------------ */

export type UwOptionsVolume = {
  date: string;
  call_volume: number;
  put_volume: number;
  call_volume_ask_side?: number;
  call_volume_bid_side?: number;
  put_volume_ask_side?: number;
  put_volume_bid_side?: number;
  call_premium?: string;
  put_premium?: string;
  net_call_premium?: string;
  net_put_premium?: string;
  bullish_premium?: string;
  bearish_premium?: string;
  avg_30_day_call_volume?: string;
  avg_30_day_put_volume?: string;
  call_open_interest?: number;
  put_open_interest?: number;
};

export type UwFlowAlert = {
  type: 'call' | 'put' | string;
  ticker: string;
  created_at: string;
  strike: string;
  expiry: string;
  price?: string;
  underlying_price?: string;
  total_premium?: string;
  total_ask_side_prem?: string;
  total_bid_side_prem?: string;
  volume?: number;
  open_interest?: number;
  volume_oi_ratio?: string;
  has_sweep?: boolean;
  alert_rule?: string;
};

export type UwEarnings = {
  report_date: string;
  report_time?: string;
  source?: string;
  street_mean_est?: string | null;
  actual_eps?: string | null;
  expected_move_perc?: string | null;
  post_earnings_move_1d?: string | null;
};

const MIN = 60_000;

/** Today's call/put activity against its own 30-day average. Two minutes fresh. */
export async function optionsVolume(symbol: string): Promise<UwResult<UwOptionsVolume | null>> {
  const r = await uwGet<{ data?: UwOptionsVolume[] }>(`/api/stock/${encodeURIComponent(symbol)}/options-volume`, 2 * MIN);
  return r.ok ? { ok: true, data: r.data.data?.[0] ?? null } : r;
}

/** The most recent flow alerts on one ticker (newest first). Two minutes fresh. */
export async function flowAlerts(symbol: string): Promise<UwResult<UwFlowAlert[]>> {
  const r = await uwGet<{ data?: UwFlowAlert[] }>(`/api/stock/${encodeURIComponent(symbol)}/flow-alerts`, 2 * MIN, {
    limit: 50,
  });
  return r.ok ? { ok: true, data: r.data.data ?? [] } : r;
}

/** An option symbol as UW names it: bare OCC, no Polygon `O:` prefix. */
export function uwOptionSymbol(ticker: string): string {
  return ticker.trim().toUpperCase().replace(/^O:/, '');
}

export type UwExpiry = { expires: string; open_interest?: number; volume?: number; chains?: number };

/** Every listed expiry on a stock, with its open interest. Ten minutes fresh. */
export async function optionExpiries(symbol: string): Promise<UwResult<UwExpiry[]>> {
  const r = await uwGet<{ data?: UwExpiry[] }>(`/api/stock/${encodeURIComponent(symbol)}/expiry-breakdown`, 10 * MIN);
  return r.ok ? { ok: true, data: r.data.data ?? [] } : r;
}

export type UwChainContract = {
  option_symbol: string;
  nbbo_bid?: string | null;
  nbbo_ask?: string | null;
  last_price?: string | null;
  volume?: number | null;
  open_interest?: number | null;
  implied_volatility?: string | null;
  delta?: number | null;
  last_tape_time?: string | null;
};

/**
 * One expiry's whole chain with prices: bid, ask, last, volume, open interest,
 * implied volatility. Always the LATEST session (see the traps above). One
 * minute fresh — the panel is a glance, not a trading screen.
 */
export async function optionChain(symbol: string, expiry: string): Promise<UwResult<UwChainContract[]>> {
  const r = await uwGet<{ data?: UwChainContract[] }>(`/api/stock/${encodeURIComponent(symbol)}/option-contracts`, MIN, {
    expiry,
    limit: 500,
  });
  return r.ok ? { ok: true, data: r.data.data ?? [] } : r;
}

export type UwMinuteBar = {
  start_time: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume_ask_side?: number;
  volume_bid_side?: number;
  volume_mid_side?: number;
  volume_no_side?: number;
};

/**
 * One contract's one-minute bars for one session. Only minutes that traded are
 * present. A past session never changes, so it is kept for twelve hours; today
 * is two minutes fresh.
 */
export async function contractIntraday(optionSymbol: string, date: string, today: string): Promise<UwResult<UwMinuteBar[]>> {
  const ttl = date < today ? 12 * 60 * MIN : 2 * MIN;
  const r = await uwGet<{ data?: UwMinuteBar[] }>(
    `/api/option-contract/${encodeURIComponent(uwOptionSymbol(optionSymbol))}/intraday`,
    ttl,
    { date },
  );
  return r.ok ? { ok: true, data: r.data.data ?? [] } : r;
}

/** Past and next earnings for one ticker. A report date moves rarely: six hours. */
export async function earnings(symbol: string): Promise<UwResult<UwEarnings[]>> {
  const r = await uwGet<{ data?: UwEarnings[] }>(`/api/earnings/${encodeURIComponent(symbol)}`, 6 * 60 * MIN);
  return r.ok ? { ok: true, data: r.data.data ?? [] } : r;
}

/* ------------------------------------------------------------------ */
/* Shaping (pure)                                                      */
/* ------------------------------------------------------------------ */

const n = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};
const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;

/** "$153.0M", "$48.5K" — premium is money and is always said as money. */
export function dollarsPlain(v: number | null): string | null {
  if (v === null) return null;
  const a = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (a >= 1e9) return `${sign}$${r1(a / 1e9)}B`;
  if (a >= 1e6) return `${sign}$${r1(a / 1e6)}M`;
  if (a >= 1e3) return `${sign}$${r1(a / 1e3)}K`;
  return `${sign}$${Math.round(a)}`;
}

export function summarizeVolume(v: UwOptionsVolume) {
  const cv = n(v.call_volume) ?? 0;
  const pv = n(v.put_volume) ?? 0;
  const c30 = n(v.avg_30_day_call_volume);
  const p30 = n(v.avg_30_day_put_volume);
  return {
    session: v.date,
    call_contracts: cv,
    put_contracts: pv,
    puts_per_call: cv > 0 ? r2(pv / cv) : null,
    calls_vs_30_day_avg: c30 && c30 > 0 ? `${r1(cv / c30)}x` : null,
    puts_vs_30_day_avg: p30 && p30 > 0 ? `${r1(pv / p30)}x` : null,
    call_premium: dollarsPlain(n(v.call_premium)),
    put_premium: dollarsPlain(n(v.put_premium)),
    premium_on_bullish_side: dollarsPlain(n(v.bullish_premium)),
    premium_on_bearish_side: dollarsPlain(n(v.bearish_premium)),
    open_interest_calls: n(v.call_open_interest),
    open_interest_puts: n(v.put_open_interest),
  };
}

/** New York wall-clock time, e.g. "10:12 AM ET". */
function etClock(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })} ET`;
}

/** The biggest few flow alerts by premium, each said as one contract. */
export function biggestFlow(alerts: UwFlowAlert[], limit = 5) {
  return [...alerts]
    .filter((a) => n(a.total_premium) !== null)
    .sort((a, b) => (n(b.total_premium) ?? 0) - (n(a.total_premium) ?? 0))
    .slice(0, limit)
    .map((a) => {
      const ask = n(a.total_ask_side_prem) ?? 0;
      const bid = n(a.total_bid_side_prem) ?? 0;
      const side = ask + bid > 0 ? ask / (ask + bid) : null;
      return {
        contract: `${n(a.strike) ?? a.strike} ${String(a.type).toLowerCase()} expiring ${a.expiry}`,
        premium: dollarsPlain(n(a.total_premium)),
        traded_at_ask_pct: side === null ? null : Math.round(side * 100),
        sweep: Boolean(a.has_sweep),
        volume_vs_open_interest: n(a.volume_oi_ratio) === null ? null : `${r1(n(a.volume_oi_ratio)!)}x`,
        stock_price_then: n(a.underlying_price),
        when: `${String(a.created_at).slice(0, 10)} ${etClock(a.created_at) ?? ''}`.trim(),
      };
    });
}

const WHEN_PLAIN: Record<string, string> = {
  premarket: 'before the open',
  postmarket: 'after the close',
};

/**
 * Next report + the last four, from UW's per-ticker earnings list.
 * `today` is an ET date (YYYY-MM-DD); a report dated today counts as upcoming.
 */
export function summarizeEarnings(rows: UwEarnings[], today: string) {
  const sorted = [...rows].filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.report_date)).sort((a, b) => a.report_date.localeCompare(b.report_date));
  const next = sorted.find((r) => r.report_date >= today && n(r.actual_eps) === null) ?? null;
  const past = sorted.filter((r) => r.report_date < today && n(r.actual_eps) !== null).reverse().slice(0, 4);
  const daysUntil = next
    ? Math.round((Date.parse(`${next.report_date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
    : null;
  return {
    next: next
      ? {
          date: next.report_date,
          days_away: daysUntil,
          when: WHEN_PLAIN[String(next.report_time)] ?? 'time not announced',
          date_confirmed: next.source === 'company',
          eps_expected: n(next.street_mean_est),
          options_expect_move_pct: n(next.expected_move_perc) === null ? null : r1(n(next.expected_move_perc)! * 100),
        }
      : null,
    last_reports: past.map((r) => {
      const est = n(r.street_mean_est);
      const act = n(r.actual_eps);
      const move = n(r.post_earnings_move_1d);
      return {
        date: r.report_date,
        eps_expected: est,
        eps_actual: act,
        result: est === null || act === null ? null : act > est ? 'beat' : act < est ? 'missed' : 'matched',
        stock_move_next_day_pct: move === null ? null : r1(move * 100),
      };
    }),
  };
}
