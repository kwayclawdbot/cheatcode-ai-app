/**
 * THE PANELS' READERS AND FORMATTERS — pure, so the proof can drive them.
 *
 * No React and no React Native in this file. The loaders in `panels-data.ts`
 * fetch; everything that decides what a payload MEANS on screen lives here,
 * where `scripts/workspace-panels-test.mts` can reach it without a device.
 *
 * THE RULE EVERY FORMATTER KEEPS: null is not zero. A number the server did not
 * send comes back from these as `null`, and the surface draws the sentence for
 * "not known" — never `$0.00`, never `0`, never a dash dressed as a reading.
 *
 * The fixtures at the bottom are EXAMPLE CONTENT and are reachable only from
 * `panels-data.ts` behind `env.FIXTURES` — the same rule `no-fake-data-test`
 * enforces on the community layer, enforced for these by the panels proof.
 */
import type {
  EarningsPanelResponse,
  KaiWorkspaceAction,
  MarketQuote,
  OptionQuote,
  OptionsChainResponse,
  OptionsFlowPrint,
  QuoteCardResponse,
  WatchlistItem,
  WatchlistResponse,
} from '@cheatcode/shared';

type Rec = Record<string, unknown>;
const obj = (v: unknown): Rec => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
export const num = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
};

/** A payload the panel cannot read is a failure with a sentence, not a blank. */
export class PanelShapeError extends Error {
  constructor(what: string) {
    super(`The ${what} came back in a shape I could not read.`);
  }
}

/* ==================================================================== */
/* Formatters                                                           */
/* ==================================================================== */

export const usd = (n: number | null | undefined): string | null =>
  n === null || n === undefined || !Number.isFinite(n) ? null : `$${n.toFixed(2)}`;

/** 21_461_659 → "21.5M". Volume and contract counts. */
export function compact(n: number | null | undefined): string | null {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e4) return `${(n / 1e3).toFixed(1)}K`;
  return Math.round(n).toLocaleString('en-US');
}

/** 46.7e9 → "$46.7B". Revenue and income. */
export function bigMoney(n: number | null | undefined): string | null {
  const c = compact(n);
  return c === null ? null : `${(n ?? 0) < 0 ? '−' : ''}$${c.replace('-', '')}`;
}

/** "2026-09-25" → "Sep 25". */
export function shortDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** An instant as the market names it: "Sep 21, 9:52 AM ET". */
export function etStampOf(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const s = d.toLocaleString('en-US', {
    timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  return `${s} ET`;
}

/** A strike without trailing zeros: 182.5, 180. */
export const strikeLabel = (k: number): string => (Number.isInteger(k) ? String(k) : k.toFixed(k * 10 % 1 === 0 ? 1 : 2));

/** Where price sits in the day's range, 0..1, or null when the range is not known. */
export function rangePosition(low: number | null, high: number | null, price: number | null): number | null {
  if (low === null || high === null || price === null || high <= low) return null;
  return Math.max(0, Math.min(1, (price - low) / (high - low)));
}

/* ==================================================================== */
/* Readers                                                              */
/* ==================================================================== */

function readQuote(v: unknown, symbol: string): MarketQuote {
  const q = obj(v);
  const f = str(q.freshness);
  const session = str(q.session);
  return {
    symbol: str(q.symbol) ?? symbol,
    occ_symbol: null,
    price: num(q.price),
    source_ts: str(q.source_ts),
    received_ts: str(q.received_ts),
    freshness: f === 'live' || f === 'delayed' || f === 'stale' ? f : 'stale',
    delay_reason: (str(q.delay_reason) as MarketQuote['delay_reason']) ?? null,
    prev_close: num(q.prev_close),
    change: num(q.change),
    change_pct: num(q.change_pct),
    label_plain: str(q.label_plain) ?? 'Freshness not known',
    session: session === 'pre' || session === 'open' || session === 'after' || session === 'closed' ? session : 'closed',
  };
}

export function readQuoteCard(raw: unknown, symbol: string): QuoteCardResponse {
  const r = obj(raw);
  if (r.kind !== 'quote' || !r.quote) throw new PanelShapeError('price card');
  const d = obj(r.day);
  const basis = str(d.basis);
  return {
    kind: 'quote',
    symbol: str(r.symbol) ?? symbol,
    name: str(r.name),
    quote: readQuote(r.quote, symbol),
    day: {
      open: num(d.open), high: num(d.high), low: num(d.low), volume: num(d.volume), vwap: num(d.vwap),
      session_date: str(d.session_date),
      basis: basis === 'session_so_far' || basis === 'last_session' ? basis : 'none',
      basis_plain: str(d.basis_plain) ?? "The day's range is not known.",
    },
    degraded: r.degraded === true,
    degraded_reason: str(r.degraded_reason),
  };
}

export function readEarnings(raw: unknown, symbol: string): EarningsPanelResponse {
  const r = obj(raw);
  if (r.kind !== 'earnings' || !Array.isArray(r.quarters)) throw new PanelShapeError('earnings record');
  const n = obj(r.next);
  const nextDate = str(n.date);
  return {
    kind: 'earnings',
    symbol: str(r.symbol) ?? symbol,
    name: str(r.name),
    next: nextDate
      ? { date: nextDate, days_away: num(n.days_away), source_plain: str(n.source_plain) ?? 'Source not named.', confirmed: n.confirmed === true }
      : null,
    next_plain: str(r.next_plain) ?? 'The next report date is not known.',
    quarters: arr(r.quarters).map((q) => {
      const x = obj(q);
      return {
        fiscal_period: str(x.fiscal_period) ?? '',
        fiscal_year: str(x.fiscal_year) ?? '',
        period_end: str(x.period_end) ?? '',
        filed: str(x.filed),
        eps_diluted: num(x.eps_diluted),
        revenue: num(x.revenue),
        net_income: num(x.net_income),
      };
    }),
    estimates_plain: str(r.estimates_plain) ?? '',
    degraded: r.degraded === true,
    degraded_reason: str(r.degraded_reason),
  };
}

function readFlow(v: unknown): OptionsFlowPrint | null {
  const f = obj(v);
  const type = f.type === 'call' || f.type === 'put' ? f.type : null;
  const strike = num(f.strike);
  const expiry = str(f.expiry);
  const option_symbol = str(f.option_symbol);
  const recorded_at = str(f.recorded_at);
  if (!type || strike === null || !expiry || !option_symbol || !recorded_at) return null;
  return {
    option_symbol, type, strike, expiry,
    bid: num(f.bid), ask: num(f.ask), volume: num(f.volume), open_interest: num(f.open_interest), iv: num(f.iv),
    label: str(f.label) ?? 'Recorded by the options-flow engine',
    recorded_at,
  };
}

/** One priced side of a strike. No symbol → not listed; a missing price stays null. */
function readSide(v: unknown): OptionQuote | null {
  const x = obj(v);
  const option_symbol = str(x.option_symbol);
  if (!option_symbol) return null;
  return {
    option_symbol,
    bid: num(x.bid), ask: num(x.ask), last: num(x.last),
    volume: num(x.volume), open_interest: num(x.open_interest), iv: num(x.iv),
    last_trade_at: str(x.last_trade_at),
  };
}

/** "3.20 / 3.30" — bid and ask without the dollar sign, the way a chain prints them. */
export function bidAsk(q: { bid: number | null; ask: number | null }): string | null {
  if (q.bid === null && q.ask === null) return null;
  const f = (n: number | null) => (n === null ? 'not known' : n.toFixed(2));
  return `${f(q.bid)} / ${f(q.ask)}`;
}

export function readOptionsChain(raw: unknown, symbol: string): OptionsChainResponse {
  const r = obj(raw);
  if (r.kind !== 'options' || !Array.isArray(r.rows)) throw new PanelShapeError('options list');
  return {
    kind: 'options',
    symbol: str(r.symbol) ?? symbol,
    spot: num(r.spot),
    spot_plain: str(r.spot_plain) ?? '',
    expiry: str(r.expiry),
    expiries: arr(r.expiries).map(str).filter((x): x is string => !!x),
    rows: arr(r.rows)
      .map((row) => {
        const x = obj(row);
        const strike = num(x.strike);
        if (strike === null) return null;
        return {
          strike,
          call: readSide(x.call),
          put: readSide(x.put),
          nearest_the_money: x.nearest_the_money === true,
          call_flow: x.call_flow ? readFlow(x.call_flow) : null,
          put_flow: x.put_flow ? readFlow(x.put_flow) : null,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null),
    flow: arr(r.flow).map(readFlow).filter((x): x is OptionsFlowPrint => x !== null),
    prices_plain: str(r.prices_plain) ?? '',
    prices_as_of: str(r.prices_as_of),
    degraded: r.degraded === true,
    degraded_reason: str(r.degraded_reason),
  };
}

export function readWatchlist(raw: unknown): WatchlistResponse {
  const r = obj(raw);
  if (!Array.isArray(r.items)) throw new PanelShapeError('watchlist');
  return {
    id: str(r.id),
    name: str(r.name) ?? 'Watchlist',
    items: arr(r.items)
      .map((it): WatchlistItem | null => {
        const x = obj(it);
        const symbol = str(x.symbol);
        if (!symbol) return null;
        return {
          symbol,
          name: str(x.name),
          note: str(x.note),
          added_at: str(x.added_at),
          quote: x.quote ? readQuote(x.quote, symbol) : null,
          setup_id: str(x.setup_id),
          grade_display: str(x.grade_display),
          state: (str(x.state) as WatchlistItem['state']) ?? null,
        };
      })
      .filter((x): x is WatchlistItem => x !== null),
    empty_copy: str(r.empty_copy) ?? 'Nothing on your watchlist yet.',
    degraded: r.degraded === true,
    degraded_reason: str(r.degraded_reason),
  };
}

/* ==================================================================== */
/* Fixtures — EXAMPLE CONTENT, reachable only behind env.FIXTURES        */
/* ==================================================================== */

const FIX_NOW = '2026-09-21T14:29:50Z';

const fixtureQuote = (symbol: string, price: number, prev: number): MarketQuote => ({
  symbol, occ_symbol: null, price, source_ts: FIX_NOW, received_ts: FIX_NOW,
  freshness: 'delayed', delay_reason: 'entitlement',
  prev_close: prev, change: +(price - prev).toFixed(2), change_pct: +(((price - prev) / prev) * 100).toFixed(2),
  label_plain: 'Example data · fixtures mode', session: 'open',
});

export function fixtureQuoteCard(symbol: string): QuoteCardResponse {
  const s = symbol.toUpperCase();
  return {
    kind: 'quote', symbol: s, name: s === 'NVDA' ? 'NVIDIA Corporation' : null,
    quote: fixtureQuote(s, 181.2, 179.5),
    day: {
      open: 180.1, high: 182.4, low: 179.8, volume: 21_500_000, vwap: 181.04,
      session_date: '2026-09-21', basis: 'session_so_far', basis_plain: 'Today so far',
    },
    degraded: false, degraded_reason: null,
  };
}

export function fixtureEarnings(symbol: string): EarningsPanelResponse {
  const s = symbol.toUpperCase();
  return {
    kind: 'earnings', symbol: s, name: s === 'NVDA' ? 'NVIDIA Corporation' : null,
    next: { date: '2026-11-18', days_away: 58, confirmed: false, source_plain: 'Estimated by Unusual Whales — the company has not announced it yet, so it can move.' },
    next_plain: 'Next report expected Nov 18.',
    quarters: [
      { fiscal_period: 'Q2', fiscal_year: '2027', period_end: '2026-07-26', filed: '2026-08-26', eps_diluted: 1.08, revenue: 46.7e9, net_income: 26.4e9 },
      { fiscal_period: 'Q1', fiscal_year: '2027', period_end: '2026-04-26', filed: '2026-05-28', eps_diluted: 0.76, revenue: 44.1e9, net_income: 18.8e9 },
      { fiscal_period: 'Q4', fiscal_year: '2026', period_end: '2026-01-25', filed: '2026-02-26', eps_diluted: 0.89, revenue: 39.3e9, net_income: 22.1e9 },
      { fiscal_period: 'Q3', fiscal_year: '2026', period_end: '2025-10-26', filed: '2025-11-20', eps_diluted: 0.78, revenue: 35.1e9, net_income: 19.3e9 },
    ],
    estimates_plain: 'This panel shows what the company reported, not what analysts expected, so there is no beat or miss here.',
    degraded: false, degraded_reason: null,
  };
}

export function fixtureOptionsChain(symbol: string): OptionsChainResponse {
  const s = symbol.toUpperCase();
  const expiry = '2026-09-25';
  const occ = (t: 'C' | 'P', k: number) => `${s}260925${t}${String(Math.round(k * 1000)).padStart(8, '0')}`;
  const flow: OptionsFlowPrint = {
    option_symbol: `O:${occ('C', 182.5)}`, type: 'call', strike: 182.5, expiry,
    bid: 2.1, ask: 2.18, volume: 8123, open_interest: 1400, iv: 0.41,
    label: 'The contract the flow bought', recorded_at: '2026-09-21T13:52:00Z',
  };
  const spot = 181.2;
  const strikes = [167.5, 170, 172.5, 175, 177.5, 180, 182.5, 185, 187.5, 190, 192.5];
  // Example prices, shaped like a real chain: intrinsic value plus time value
  // that shrinks away from the money. Fixtures mode only.
  const side = (t: 'C' | 'P', k: number): OptionQuote => {
    const intrinsic = Math.max(0, t === 'C' ? spot - k : k - spot);
    const mid = +(intrinsic + 2.4 * Math.exp(-Math.abs(spot - k) / 6)).toFixed(2);
    const half = mid < 1 ? 0.02 : 0.05;
    return {
      option_symbol: occ(t, k), bid: +(mid - half).toFixed(2), ask: +(mid + half).toFixed(2), last: mid,
      volume: Math.round((t === 'C' ? 9000 : 5600) * Math.exp(-Math.abs(spot - k) / 5)), open_interest: Math.round(4000 + 300 * Math.abs(spot - k)),
      iv: +(0.38 + Math.abs(spot - k) / 400).toFixed(3), last_trade_at: '2026-09-21T14:29:41Z',
    };
  };
  return {
    kind: 'options', symbol: s, spot, spot_plain: 'Example data · fixtures mode',
    expiry, expiries: [expiry, '2026-10-02', '2026-10-09', '2026-10-16'],
    rows: strikes.map((k) => ({
      strike: k, call: side('C', k), put: side('P', k), nearest_the_money: k === 180,
      call_flow: k === 182.5 ? flow : null, put_flow: null,
    })),
    flow: [flow],
    prices_as_of: '2026-09-21T14:29:41Z',
    prices_plain: 'Option prices are from Unusual Whales. The newest trade on this expiry was Sep 21, 10:29 AM ET. Bid and ask move constantly — check your broker before you trade.',
    degraded: false, degraded_reason: null,
  };
}

export function fixtureWatchlist(): WatchlistResponse {
  const item = (symbol: string, name: string, price: number, prev: number, grade: string | null): WatchlistItem => ({
    symbol, name, note: null, added_at: '2026-09-10T14:00:00Z', quote: fixtureQuote(symbol, price, prev),
    setup_id: null, grade_display: grade, state: grade ? 'ready' : null,
  });
  return {
    id: 'fixture-watchlist', name: 'Watchlist',
    items: [
      item('NVDA', 'NVIDIA Corporation', 181.2, 179.5, 'B+'),
      item('AMD', 'Advanced Micro Devices', 162.4, 165.1, null),
      item('PLTR', 'Palantir Technologies', 31.05, 30.2, 'A-'),
      item('SPY', 'SPDR S&P 500 ETF', 661.3, 660.9, null),
    ],
    empty_copy: 'Nothing on your watchlist yet.',
    degraded: false, degraded_reason: null,
  };
}

/**
 * FIXTURES MODE ONLY: a canned Kai turn that opens a panel.
 *
 * In fixtures mode there is no model, so the wall answers every question with
 * one canned reply. This lets a proof (and a designer) watch the REAL path a
 * `workspace_action` frame takes — the engine hands it to the bridge, the
 * bridge applies it to the store, the host draws the surface — without a
 * server. It is keyed on words because it is a stand-in for the model, not a
 * router in front of one; the live path never calls it.
 */
export function fixtureWorkspaceTurn(text: string): { reply: string; action: KaiWorkspaceAction } | null {
  const t = text.toLowerCase();
  const tick = /\b([A-Z]{1,5})\b/.exec(text.replace(/\b(I|A)\b/g, ''))?.[1] ?? 'NVDA';
  if (/earning/.test(t)) return { reply: `Pulling up ${tick}'s earnings — the quarters it reported, and when it reports next.`, action: { type: 'show_earnings', symbol: tick } };
  if (/option|strike|chain/.test(t)) return { reply: `Here is the ${tick} option chain near the price, with the bid and ask on each contract.`, action: { type: 'show_options', symbol: tick } };
  if (/watchlist|watching/.test(t)) return { reply: 'Here is your watchlist, priced.', action: { type: 'show_watchlist' } };
  if (/position|portfolio|holding/.test(t)) return { reply: 'Here are your paper positions and how they are doing.', action: { type: 'show_portfolio' } };
  if (/\bchart\b/.test(t)) return { reply: `Here is ${tick} on the 15-minute chart. The shaded band is where it has been buying back in, and the line above it is yesterday's high — that is the level I would watch today.`, action: { type: 'open_chart', symbol: tick, timeframe: '15m', setup_id: null } };
  if (/quote|price|range|volume/.test(t)) return { reply: `Here is ${tick}'s price card — the day's range and volume are under the price.`, action: { type: 'show_quote', symbol: tick } };
  return null;
}
