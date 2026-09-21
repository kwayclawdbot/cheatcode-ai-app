/**
 * THE WHOLE MARKET IN ONE CALL — what Kai's scanner, sector board and market
 * read are built from.
 *
 * Ported from the War Room brain (`kai_agent_warroom/tools.py`: scan_breakouts,
 * scan_sector, get_macro_snapshot, get_relative_strength). The War Room hit
 * Polygon once per tool; here the three market-wide tools share ONE full-market
 * snapshot, cached, with concurrent callers joining the request already in
 * flight. A question that asks "what's moving and how's the market?" costs one
 * Polygon call, not two.
 *
 * WHAT THE PLAN ALLOWS (measured 2026-09-21, from this machine):
 *   /v2/snapshot/locale/us/markets/stocks/tickers   (all 13k tickers)  OK, ~3s, ~7MB
 *   /v2/aggs/grouped/locale/us/market/stocks/{date}                    OK
 *   /v3/snapshot/indices (I:VIX, I:SPX)                                NOT_AUTHORIZED
 *   /v2/aggs/ticker/I:VIX/...                                          NOT_AUTHORIZED
 *   /v3/snapshot/options/{sym}                                         NOT_AUTHORIZED
 * So there is no VIX here. VIXY — an ETF that holds short-dated VIX futures —
 * stands in for it and is ALWAYS labelled as VIXY, never as "the VIX".
 *
 * Nothing in this file writes anything. The caches are in-process memory.
 */
import { polyGet, buildQuote, prevTradingDate, sessionNow, fetchAggregates } from './polygon';
import type { Candle } from '@shared/api';

/* ------------------------------------------------------------------ */
/* Shapes                                                              */
/* ------------------------------------------------------------------ */

type SnapRow = {
  ticker: string;
  todaysChangePerc?: number;
  updated?: number;
  day?: { o?: number; h?: number; l?: number; c?: number; v?: number };
  prevDay?: { o?: number; h?: number; l?: number; c?: number; v?: number };
  lastTrade?: { p?: number; t?: number };
  min?: { c?: number; t?: number };
};
type SnapBody = { tickers?: SnapRow[]; status?: string };

/** One ticker, reduced to what the tools actually say. */
export type Row = {
  symbol: string;
  price: number;
  prev_close: number | null;
  change_pct: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number;
  prev_volume: number | null;
  /** ms epoch of the newest print behind `price`, or null when unknown. */
  ts: number | null;
};

const pos = (n: unknown): number | null => {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : null;
};
const nsToMs = (n: unknown): number | null => {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return null;
  return v > 1e15 ? Math.round(v / 1e6) : v; // Polygon mixes ns and ms
};

/**
 * One snapshot row → one `Row`, or null when there is no price at all.
 * Price order is the same one `snapshotPrice` in polygon.ts uses: the last
 * trade, then the last minute bar, then the day's close, then yesterday's.
 */
export function toRow(t: SnapRow): Row | null {
  const price = pos(t.lastTrade?.p) ?? pos(t.min?.c) ?? pos(t.day?.c) ?? pos(t.prevDay?.c);
  if (price === null) return null;
  const prev = pos(t.prevDay?.c);
  const chg = Number(t.todaysChangePerc);
  return {
    symbol: t.ticker,
    price,
    prev_close: prev,
    change_pct: Number.isFinite(chg) ? chg : prev ? ((price - prev) / prev) * 100 : null,
    open: pos(t.day?.o),
    high: pos(t.day?.h),
    low: pos(t.day?.l),
    volume: pos(t.day?.v) ?? 0,
    prev_volume: pos(t.prevDay?.v),
    ts: nsToMs(t.lastTrade?.t) ?? nsToMs(t.updated),
  };
}

/* ------------------------------------------------------------------ */
/* The full-market snapshot, cached and de-duplicated                  */
/* ------------------------------------------------------------------ */

export type MarketSnap =
  | { ok: true; rows: Map<string, Row>; fetched_at: number; delayed: boolean }
  | { ok: false; reason: string };

const REASON_PLAIN: Record<string, string> = {
  not_configured: 'Live market data is not connected on this server.',
  rate_limited: 'The market data provider is throttling requests right now.',
  unauthorized: 'This market data plan does not include the whole-market snapshot.',
  error: 'The market data provider did not answer just now.',
};

let snapCache: { at: number; value: MarketSnap & { ok: true } } | null = null;
let snapInFlight: Promise<MarketSnap> | null = null;

/** Fresh enough to scan from: a minute while trading, ten when the market is shut. */
function snapTtlMs(): number {
  return sessionNow() === 'open' ? 60_000 : 10 * 60_000;
}

export async function getMarketSnapshot(): Promise<MarketSnap> {
  if (snapCache && Date.now() - snapCache.at < snapTtlMs()) return snapCache.value;
  if (snapInFlight) return snapInFlight;
  snapInFlight = (async (): Promise<MarketSnap> => {
    const r = await polyGet<SnapBody>('/v2/snapshot/locale/us/markets/stocks/tickers');
    if (!r.ok) return { ok: false, reason: REASON_PLAIN[r.reason] ?? REASON_PLAIN.error };
    const rows = new Map<string, Row>();
    for (const t of r.data.tickers ?? []) {
      const row = t?.ticker ? toRow(t) : null;
      if (row) rows.set(row.symbol, row);
    }
    if (!rows.size) return { ok: false, reason: 'The market data provider returned an empty snapshot.' };
    const value = { ok: true as const, rows, fetched_at: Date.now(), delayed: r.delayed };
    snapCache = { at: Date.now(), value };
    return value;
  })().finally(() => {
    snapInFlight = null;
  });
  return snapInFlight;
}

/** The plain freshness sentence the app prints ("Delayed · last price …"), for one row. */
export function labelFor(row: Row | undefined): string {
  if (!row?.ts) return 'Freshness unknown';
  return buildQuote({
    symbol: row.symbol,
    price: row.price,
    prevClose: row.prev_close,
    sourceTs: new Date(row.ts).toISOString(),
    kind: 'print',
  }).label_plain;
}

/** The whole snapshot's freshness, measured off SPY's own print. */
export function freshnessOf(snap: MarketSnap & { ok: true }): string {
  return labelFor(snap.rows.get('SPY'));
}

/**
 * A few symbols' rows. Free when the whole-market snapshot is already cached;
 * otherwise ONE `tickers=` request for just these.
 */
export async function snapshotRows(symbols: string[]): Promise<Map<string, Row> | null> {
  const wanted = [...new Set(symbols.map((s) => s.toUpperCase()))];
  if (snapCache && Date.now() - snapCache.at < snapTtlMs()) {
    const m = new Map<string, Row>();
    for (const s of wanted) {
      const r = snapCache.value.rows.get(s);
      if (r) m.set(s, r);
    }
    if (m.size === wanted.length) return m;
  }
  const r = await polyGet<SnapBody>('/v2/snapshot/locale/us/markets/stocks/tickers', { tickers: wanted.join(',') });
  if (!r.ok) return null;
  const m = new Map<string, Row>();
  for (const t of r.data.tickers ?? []) {
    const row = t?.ticker ? toRow(t) : null;
    if (row) m.set(row.symbol, row);
  }
  return m;
}

/* ------------------------------------------------------------------ */
/* Movers                                                              */
/* ------------------------------------------------------------------ */

/**
 * Plain common-stock tickers only. Warrants (…W, .WS), units, rights and
 * preferreds are not what anybody means by "what's moving", and they are where
 * the silly +140% prints live.
 */
const COMMON = /^[A-Z]{1,5}$/;
/**
 * Nasdaq's fifth-letter convention: a five-letter ticker ending in W, R or U
 * is a warrant, a right or a unit (SATLW, NBRGR). Four-letter names ending in
 * W — SNOW — are ordinary shares and are kept.
 */
const DERIVATIVE_5TH = /^[A-Z]{4}[WRU]$/;

export type MoverOpts = {
  direction: 'up' | 'down' | 'both';
  minChangePct: number;
  minVolume: number;
  minPrice: number;
  limit: number;
};

export const MOVER_DEFAULTS: MoverOpts = {
  direction: 'both',
  minChangePct: 2,
  minVolume: 500_000,
  minPrice: 5,
  limit: 12,
};

/**
 * The War Room's ranking, unchanged: size of the move times the shares traded,
 * so a 3% move on thirty million shares outranks a 40% move on a hundred
 * thousand. Only the output is tighter (12 rows, not 15).
 */
export function rankMovers(rows: Iterable<Row>, o: MoverOpts): Row[] {
  const out: Row[] = [];
  for (const r of rows) {
    if (!COMMON.test(r.symbol)) continue;
    if (DERIVATIVE_5TH.test(r.symbol)) continue;
    if (r.change_pct === null) continue;
    if (r.price < o.minPrice || r.volume < o.minVolume) continue;
    if (Math.abs(r.change_pct) < o.minChangePct) continue;
    if (o.direction === 'up' && r.change_pct < 0) continue;
    if (o.direction === 'down' && r.change_pct > 0) continue;
    out.push(r);
  }
  out.sort((a, b) => Math.abs(b.change_pct!) * b.volume - Math.abs(a.change_pct!) * a.volume);
  return out.slice(0, o.limit);
}

/* ------------------------------------------------------------------ */
/* Breadth                                                             */
/* ------------------------------------------------------------------ */

export type Breadth = {
  names_counted: number;
  up: number;
  down: number;
  up_share_pct: number;
  up_volume_share_pct: number | null;
};

/**
 * How many liquid stocks are up versus down — the cheapest honest breadth read.
 * "Liquid" = a common ticker over $5 that traded 500k+ shares yesterday, so the
 * count is not swamped by thousands of untraded shells.
 */
export function breadthOf(rows: Iterable<Row>): Breadth | null {
  let up = 0, down = 0, upVol = 0, downVol = 0;
  for (const r of rows) {
    if (!COMMON.test(r.symbol) || DERIVATIVE_5TH.test(r.symbol) || r.price < 5 || (r.prev_volume ?? 0) < 500_000 || r.change_pct === null) continue;
    if (r.change_pct > 0) { up += 1; upVol += r.volume; }
    else if (r.change_pct < 0) { down += 1; downVol += r.volume; }
  }
  const n = up + down;
  if (n < 50) return null;
  return {
    names_counted: n,
    up,
    down,
    up_share_pct: round1((up / n) * 100),
    up_volume_share_pct: upVol + downVol > 0 ? round1((upVol / (upVol + downVol)) * 100) : null,
  };
}

/* ------------------------------------------------------------------ */
/* Sectors                                                             */
/* ------------------------------------------------------------------ */

export const SECTOR_ETFS: Record<string, string> = {
  XLK: 'Technology',
  XLC: 'Communication services',
  XLY: 'Consumer discretionary',
  XLF: 'Financials',
  XLI: 'Industrials',
  XLE: 'Energy',
  XLV: 'Health care',
  XLP: 'Consumer staples',
  XLU: 'Utilities',
  XLB: 'Materials',
  XLRE: 'Real estate',
};

/**
 * The fifteen largest holdings per sector fund — the War Room's list, with the
 * names that no longer trade (HES, IPG) taken out. A fixed list, and the tool
 * says so: it is the big names in the sector, not every stock in it.
 */
export const SECTOR_HOLDINGS: Record<string, string[]> = {
  XLK: ['AAPL', 'MSFT', 'NVDA', 'AVGO', 'ORCL', 'CRM', 'ADBE', 'AMD', 'ACN', 'CSCO', 'QCOM', 'TXN', 'INTU', 'IBM', 'AMAT'],
  XLF: ['BRK.B', 'JPM', 'V', 'MA', 'BAC', 'WFC', 'GS', 'MS', 'AXP', 'BLK', 'SPGI', 'C', 'PGR', 'CME', 'CB'],
  XLE: ['XOM', 'CVX', 'COP', 'EOG', 'SLB', 'PSX', 'MPC', 'VLO', 'OKE', 'KMI', 'WMB', 'FANG', 'BKR', 'HAL'],
  XLV: ['LLY', 'JNJ', 'UNH', 'ABBV', 'MRK', 'TMO', 'ABT', 'DHR', 'AMGN', 'PFE', 'BMY', 'ISRG', 'VRTX', 'GILD', 'CI'],
  XLY: ['AMZN', 'TSLA', 'HD', 'MCD', 'NKE', 'LOW', 'SBUX', 'BKNG', 'TJX', 'CMG', 'ORLY', 'AZO', 'MAR', 'HLT', 'ABNB'],
  XLP: ['PG', 'COST', 'KO', 'PEP', 'WMT', 'PM', 'MO', 'MDLZ', 'CL', 'KMB', 'TGT', 'GIS', 'KR', 'SYY', 'STZ'],
  XLI: ['GE', 'CAT', 'RTX', 'HON', 'UPS', 'UNP', 'BA', 'DE', 'ETN', 'LMT', 'ADP', 'GD', 'NOC', 'CSX', 'FDX'],
  XLU: ['NEE', 'SO', 'DUK', 'CEG', 'SRE', 'AEP', 'D', 'PCG', 'XEL', 'EXC', 'ED', 'WEC', 'PEG', 'AWK', 'ES'],
  XLB: ['LIN', 'SHW', 'APD', 'ECL', 'FCX', 'NEM', 'DOW', 'NUE', 'DD', 'PPG', 'VMC', 'MLM', 'CTVA', 'ALB', 'STLD'],
  XLRE: ['PLD', 'AMT', 'EQIX', 'WELL', 'CCI', 'PSA', 'DLR', 'SPG', 'O', 'CBRE', 'VICI', 'EXR', 'WY', 'AVB', 'EQR'],
  XLC: ['META', 'GOOGL', 'GOOG', 'NFLX', 'DIS', 'TMUS', 'VZ', 'T', 'CMCSA', 'CHTR', 'EA', 'WBD', 'TTWO', 'OMC'],
};

/** Growth/cyclical funds versus defensive ones — the rotation read. */
const OFFENSE = ['XLK', 'XLY', 'XLC'];
const DEFENSE = ['XLP', 'XLU', 'XLV'];

/**
 * "tech", "Technology", "xlk", "energy" → the fund. Null when nothing matches;
 * the tool then lists the funds it knows rather than guessing.
 */
export function sectorEtfFor(raw: string | null | undefined): string | null {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return null;
  const up = s.toUpperCase();
  if (SECTOR_ETFS[up]) return up;
  for (const [etf, name] of Object.entries(SECTOR_ETFS)) {
    if (name.toLowerCase() === s) return etf;
  }
  return industryToEtf(s);
}

/**
 * An industry description (Polygon's SIC text, or the seed sector) → the
 * sector fund it most likely sits in. The War Room's keyword table, plus the
 * seed-sector words. First match wins, so the order matters.
 */
const INDUSTRY_KEYWORDS: [string, string][] = [
  ['index etf', ''],
  ['real estate', 'XLRE'], ['reit', 'XLRE'],
  ['semi', 'XLK'], ['software', 'XLK'], ['computer', 'XLK'], ['technology', 'XLK'], ['tech', 'XLK'],
  ['internet', 'XLC'], ['communication', 'XLC'], ['media', 'XLC'], ['telecom', 'XLC'], ['telephone', 'XLC'],
  ['bank', 'XLF'], ['financ', 'XLF'], ['insurance', 'XLF'], ['investment', 'XLF'], ['security brokers', 'XLF'],
  ['petroleum', 'XLE'], ['crude', 'XLE'], ['oil', 'XLE'], ['natural gas', 'XLE'], ['energy', 'XLE'],
  ['pharma', 'XLV'], ['biolog', 'XLV'], ['biotech', 'XLV'], ['medical', 'XLV'], ['health', 'XLV'], ['surgical', 'XLV'],
  ['retail', 'XLY'], ['motor vehicle', 'XLY'], ['auto', 'XLY'], ['restaurant', 'XLY'], ['eating', 'XLY'],
  ['hotel', 'XLY'], ['consumer cyclical', 'XLY'], ['consumer discretionary', 'XLY'],
  ['food', 'XLP'], ['beverage', 'XLP'], ['household', 'XLP'], ['tobacco', 'XLP'], ['consumer defensive', 'XLP'],
  ['consumer staples', 'XLP'],
  ['aerospace', 'XLI'], ['industrial', 'XLI'], ['machinery', 'XLI'], ['transportation', 'XLI'], ['trucking', 'XLI'],
  ['electric services', 'XLU'], ['utilit', 'XLU'], ['water supply', 'XLU'],
  ['chemical', 'XLB'], ['mining', 'XLB'], ['metal', 'XLB'], ['materials', 'XLB'], ['steel', 'XLB'],
];

export function industryToEtf(text: string): string | null {
  const s = text.toLowerCase();
  for (const [kw, etf] of INDUSTRY_KEYWORDS) if (s.includes(kw)) return etf || null;
  return null;
}

/* ------------------------------------------------------------------ */
/* Past closes for every ticker at once (grouped daily)                */
/* ------------------------------------------------------------------ */

type GroupedBody = { results?: { T: string; c?: number }[] };

/** A settled day never changes; keep it for the life of the process (12h cap). */
const closesCache = new Map<string, { at: number; value: Map<string, number> }>();
const CLOSES_TTL_MS = 12 * 60 * 60_000;

async function closesOnDate(date: string): Promise<Map<string, number> | null> {
  const hit = closesCache.get(date);
  if (hit && Date.now() - hit.at < CLOSES_TTL_MS) return hit.value;
  const r = await polyGet<GroupedBody>(`/v2/aggs/grouped/locale/us/market/stocks/${date}`, { adjusted: true });
  if (!r.ok) return null;
  const m = new Map<string, number>();
  for (const row of r.data.results ?? []) {
    const c = pos(row.c);
    if (row.T && c !== null) m.set(row.T, c);
  }
  closesCache.set(date, { at: Date.now(), value: m });
  return m;
}

/**
 * Every ticker's close N sessions before `sessionDate` — the session the "now"
 * price belongs to — in ONE call. Anchored on the price's own session, not on
 * `lastTradingDate()`, which during the day is YESTERDAY and would quietly make
 * a "5-day" change a six-session one.
 *
 * A date that comes back empty was a holiday the calendar did not know about;
 * step back a day and try again (three tries), so a 5-day change is measured
 * against a real session rather than against nothing.
 */
export async function closesSessionsBack(
  n: number,
  sessionDate: string
): Promise<{ date: string; closes: Map<string, number> } | null> {
  let date = sessionDate;
  for (let i = 0; i < n; i += 1) date = prevTradingDate(date);
  for (let tries = 0; tries < 3; tries += 1) {
    const m = await closesOnDate(date);
    if (m === null) return null;
    if (m.size > 0) return { date, closes: m };
    date = prevTradingDate(date);
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Daily closes for one symbol (read-only, memory-cached)              */
/* ------------------------------------------------------------------ */

const dailyCache = new Map<string, { at: number; value: Candle[] }>();
/** A day's bars move all session; five minutes keeps today's forming bar honest. */
const DAILY_TTL_MS = 5 * 60_000;

/**
 * About a year of daily bars for one symbol, straight from Polygon and kept in
 * memory. Deliberately NOT through `getCandles`, which writes the candles
 * table: a market-context read should not have side effects.
 *
 * The range runs to TODAY's New York date, not `lastTradingDate()`: during the
 * session that includes today's forming bar, so "the previous session" in the
 * level engine is yesterday rather than the day before. Callers that want only
 * finished sessions use `closesBefore`.
 */
export async function dailyBars(symbol: string, now = Date.now()): Promise<Candle[] | null> {
  const s = symbol.toUpperCase();
  const hit = dailyCache.get(s);
  if (hit && now - hit.at < DAILY_TTL_MS) return hit.value;
  const to = etDate(now);
  const d = new Date(`${to}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 400);
  const r = await fetchAggregates(s, '1d', d.toISOString().slice(0, 10), to, 0);
  if (!r.ok) return null;
  dailyCache.set(s, { at: now, value: r.data });
  return r.data;
}

/** "2.4x", or "<0.1x" early in the day rather than a misleading "0x". */
export function ratioPlain(a: number, b: number | null): string | null {
  if (!b || b <= 0 || !Number.isFinite(a)) return null;
  const r = a / b;
  return r < 0.1 ? '<0.1x' : `${Math.round(r * 10) / 10}x`;
}

/* ------------------------------------------------------------------ */
/* Arithmetic                                                          */
/* ------------------------------------------------------------------ */

export const round1 = (n: number) => Math.round(n * 10) / 10;
export const round2 = (n: number) => Math.round(n * 100) / 100;

export function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  let s = 0;
  for (let i = values.length - period; i < values.length; i += 1) s += values[i];
  return s / period;
}

/** The New York calendar date of an instant. */
export function etDate(ms: number | string): string {
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

/**
 * Closes of the sessions BEFORE `sessionDate`, oldest first. `sessionDate` is
 * the session the "now" price belongs to, so a forming bar for today is never
 * compared against itself, and in the evening today's finished bar is not
 * counted twice.
 */
export function closesBefore(bars: Candle[], sessionDate: string): number[] {
  return bars
    .filter((b) => b.c !== null && b.c > 0 && etDate(b.ts) < sessionDate)
    .map((b) => b.c as number);
}

/** % change from the close `sessions` sessions back to `now`. `prior` ends at the previous session. */
export function pctFrom(prior: number[], sessions: number, now: number): number | null {
  if (sessions < 1 || prior.length < sessions) return null;
  const base = prior[prior.length - sessions];
  return base > 0 ? round1(((now - base) / base) * 100) : null;
}

/* ------------------------------------------------------------------ */
/* The regime read                                                     */
/* ------------------------------------------------------------------ */

export type RegimeInputs = {
  /** SPY closes of the sessions before the current one, oldest first. */
  spyCloses: number[];
  spyNow: number;
  spyChangePct: number | null;
  vixyChangePct: number | null;
  breadth: Breadth | null;
};

export type RegimeRead = {
  label: 'risk_on' | 'pullback' | 'risk_off' | 'chop' | 'unknown';
  plain: string;
  reasons: string[];
  spy_vs_averages: {
    above_20_day: boolean | null;
    above_50_day: boolean | null;
    above_200_day: boolean | null;
    avg_200_day_rising: boolean | null;
  };
};

const REGIME_PLAIN: Record<RegimeRead['label'], string> = {
  risk_on: 'Buyers are in control: the market is above its long-term average and nothing is flashing stress.',
  pullback: 'The longer uptrend is intact, but the market is backing off or under some stress right now.',
  risk_off: 'Sellers are in control: stress is showing up in several places at once.',
  chop: 'No clear direction: the market is below its long-term average without an outright selloff.',
  unknown: 'There is not enough price history to read the trend.',
};

/**
 * A quick, transparent read in the spirit of the regime engine
 * (`~/breakout-alert-system/regime/engine.py`): the 200-day average is the
 * backbone, and stress is counted from RAW measures with real thresholds rather
 * than from blended scores. It is four checks, not the engine's six factors,
 * and the tool says so.
 *
 *   backbone  SPY above a RISING 200-day average
 *   stress    SPY down 1.5%+ today · VIXY up 5%+ today · 65%+ of liquid stocks
 *             down · SPY below its 50-day average
 */
export function readRegime(i: RegimeInputs): RegimeRead {
  const a20 = sma(i.spyCloses, 20);
  const a50 = sma(i.spyCloses, 50);
  const a200 = sma(i.spyCloses, 200);
  const a200Prior = i.spyCloses.length >= 220 ? sma(i.spyCloses.slice(0, -20), 200) : null;
  const vs = {
    above_20_day: a20 === null ? null : i.spyNow > a20,
    above_50_day: a50 === null ? null : i.spyNow > a50,
    above_200_day: a200 === null ? null : i.spyNow > a200,
    avg_200_day_rising: a200 === null || a200Prior === null ? null : a200 > a200Prior,
  };
  if (a200 === null) return { label: 'unknown', plain: REGIME_PLAIN.unknown, reasons: [], spy_vs_averages: vs };

  const reasons: string[] = [];
  const pctVs = (avg: number) => round1(((i.spyNow - avg) / avg) * 100);
  reasons.push(
    `SPY is ${Math.abs(pctVs(a200))}% ${vs.above_200_day ? 'above' : 'below'} its 200-day average` +
      (vs.avg_200_day_rising === null ? '.' : `, and that average is ${vs.avg_200_day_rising ? 'rising' : 'falling'}.`)
  );
  let stress = 0;
  if (i.spyChangePct !== null && i.spyChangePct <= -1.5) {
    stress += 1;
    reasons.push(`SPY is down ${Math.abs(round1(i.spyChangePct))}% today.`);
  }
  if (i.vixyChangePct !== null && i.vixyChangePct >= 5) {
    stress += 1;
    reasons.push(`VIXY (an ETF that tracks VIX futures) is up ${round1(i.vixyChangePct)}% today — fear is rising.`);
  }
  if (i.breadth && i.breadth.up_share_pct <= 35) {
    stress += 1;
    reasons.push(`Only ${i.breadth.up_share_pct}% of liquid stocks are up today.`);
  }
  if (a50 !== null && vs.above_50_day === false) {
    stress += 1;
    reasons.push(`SPY is below its 50-day average (${pctVs(a50)}%).`);
  }
  if (a20 !== null && vs.above_20_day === false && vs.above_50_day !== false) {
    reasons.push('SPY has slipped under its 20-day average.');
  }

  const backbone = vs.above_200_day === true && vs.avg_200_day_rising !== false;
  let label: RegimeRead['label'];
  if (backbone) {
    if (stress >= 3) label = 'risk_off';
    else if (stress >= 1 || vs.above_20_day === false) label = 'pullback';
    else label = 'risk_on';
  } else {
    label = stress >= 1 ? 'risk_off' : 'chop';
  }
  if (stress === 0) reasons.push('No stress signals are firing today.');
  return { label, plain: REGIME_PLAIN[label], reasons, spy_vs_averages: vs };
}

/** Offense (XLK/XLY/XLC) vs defense (XLP/XLU/XLV) today, in percentage points. */
export function rotationOf(rows: Map<string, Row>): { offense_minus_defense_pts: number; plain: string } | null {
  const avg = (list: string[]) => {
    const v = list.map((s) => rows.get(s)?.change_pct).filter((n): n is number => typeof n === 'number');
    return v.length === list.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const o = avg(OFFENSE);
  const d = avg(DEFENSE);
  if (o === null || d === null) return null;
  const gap = round1(o - d);
  const plain =
    Math.abs(gap) < 0.3
      ? 'Growth and defensive sectors are moving together today — no clear rotation.'
      : gap > 0
        ? `Growth sectors (tech, consumer discretionary, communications) are leading defensive ones by ${gap} points today — a risk-on tilt.`
        : `Defensive sectors (staples, utilities, health care) are leading growth ones by ${Math.abs(gap)} points today — a cautious tilt.`;
  return { offense_minus_defense_pts: gap, plain };
}

/** Test seam: drop every in-memory cache. */
export function resetScanCaches(): void {
  snapCache = null;
  snapInFlight = null;
  closesCache.clear();
  dailyCache.clear();
}
