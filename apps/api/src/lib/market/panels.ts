/**
 * THE WORKSPACE PANELS — quote card, earnings, options — one loader each.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ONE LOADER, TWO READERS
 * ═════════════════════════════════════════════════════════════════════════════
 * Kai reads these through `tools-panels.ts`; the phone draws them through
 * `GET /symbols/:symbol/panel`. Both call the functions below and nothing else,
 * so the day's range Kai reads out and the range printed on the panel under
 * his words are one number from one request. A tool with its own query would
 * disagree with the panel on the first bug fix — the adapter rule the desk
 * tools already follow.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * WHERE EACH PANEL'S DATA COMES FROM (owner rule 2026-09-21: options = UW)
 * ═════════════════════════════════════════════════════════════════════════════
 *   stock snapshot (price, day range, volume)     Polygon
 *   quarterly financials (EPS, revenue, filed)    Polygon
 *   next earnings date (confirmed or estimated)   Unusual Whales /api/earnings
 *   listed expiries                               Unusual Whales expiry-breakdown
 *   chain with bid / ask / last / volume / OI / IV Unusual Whales option-contracts
 *
 * Polygon is for STOCK data only. Everything options-shaped is Unusual Whales,
 * the same source the day-trade engine runs on, so a price on this panel and a
 * price on an alert card come from one place.
 *
 *   EARNINGS  history is Polygon's filed quarters; the next date is UW's, and
 *             says whether the company confirmed it or UW estimated it.
 *   OPTIONS   the ladder is the nearest expiry's strikes around the money,
 *             each side priced, with the time of the newest trade on the chain
 *             so a Friday quote read on Sunday says it is Friday's. Contracts
 *             the flow engine recorded are still marked, at the prices it saw
 *             when it recorded them.
 *
 * Nothing here invents a number to fill a hole. A field the source cannot fill
 * is null with a sentence beside it.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * WHY THE DEPENDENCIES ARE INJECTED
 * ═════════════════════════════════════════════════════════════════════════════
 * The proof (`scripts/panels-test.mts`) drives every branch — market open,
 * market shut, no price, no contracts, a flow print on the ladder and one off it
 * — with stubbed reads. No network, no database, no credits. Production uses
 * `panels`, which is the same factory handed the real readers.
 */
import type {
  EarningsPanelResponse,
  EarningsQuarter,
  MarketQuote,
  OptionQuote,
  OptionsChainResponse,
  OptionsChainRow,
  OptionsFlowPrint,
  QuoteCardResponse,
} from '@shared/api';

/* ==================================================================== */
/* What a loader needs                                                  */
/* ==================================================================== */

export type DailyBar = { ts: string; o: number | null; h: number | null; l: number | null; c: number | null; v: number | null };

export type PanelDeps = {
  /** The quote everything else in the app prints, plus the daily bars it came from. */
  quote: (symbol: string) => Promise<{ quote: MarketQuote; daily: DailyBar[]; degraded: boolean; degraded_reason: string | null }>;
  /** Today's running bar, or null outside a session. */
  sessionBar: (symbol: string) => Promise<{ open: number | null; high: number; low: number; volume: number | null; vwap: number | null } | null>;
  name: (symbol: string) => Promise<string | null>;
  financials: (symbol: string) => Promise<{
    quarters: { fiscal_period: string; fiscal_year: string; end_date: string; filing_date: string | null; revenue: number | null; net_income: number | null; eps_diluted: number | null }[];
    degraded: boolean;
  }>;
  /**
   * The next report date from Unusual Whales, or null when it names none.
   * `ok: false` means the source did not answer — a different sentence from
   * "no date is known".
   */
  nextEarnings: (symbol: string) => Promise<
    | { ok: true; next: { date: string; confirmed: boolean; when: 'premarket' | 'postmarket' | null } | null }
    | { ok: false }
  >;
  /** Listed expiries from Unusual Whales, soonest first. */
  optionExpiries: (symbol: string) => Promise<{ expiries: string[]; degraded: boolean }>;
  /** One expiry's chain with prices, from Unusual Whales. */
  optionChain: (
    symbol: string,
    expiry: string,
  ) => Promise<{ contracts: (OptionQuote & { type: 'call' | 'put'; strike: number; expiry: string })[]; degraded: boolean }>;
  /** Contracts the flow engine recorded on this symbol in the last few sessions. */
  flowRecords: (symbol: string) => Promise<{ recorded_at: string; options: Record<string, unknown>[] }[]>;
  /** Injected so the proof can pin "today". */
  now: () => Date;
};

export type PanelResult<T> = { ok: true; value: T } | { ok: false; plain: string };

/* ==================================================================== */
/* Small, pure helpers                                                  */
/* ==================================================================== */

const NY = 'America/New_York';

/** YYYY-MM-DD in New York, which is the calendar every session is named in. */
export function etDate(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: NY });
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

/** Minutes past midnight in New York. */
function etMinutes(d: Date): number {
  const [h, m] = d.toLocaleTimeString('en-GB', { timeZone: NY, hour: '2-digit', minute: '2-digit', hour12: false }).split(':').map(Number);
  return (h % 24) * 60 + m;
}

/** "Sep 21, 10:48 AM ET" — an instant as the market names it. */
function etStamp(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.toLocaleString('en-US', { timeZone: NY, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} ET`;
}

/** "Sep 18" — a session named the way a person names it. */
export function shortDay(date: string): string {
  const d = new Date(`${date.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

/**
 * An OCC option symbol, taken apart. `O:NVDA260925C00180000` →
 * NVDA, 2026-09-25, call, 180. The expiry and strike on a flow record are
 * stored for DISPLAY ("Sep 25", "180"), so this is the only reliable way to put
 * one on a ladder: the symbol is the contract's own name for itself.
 */
export function parseOcc(sym: string): { root: string; expiry: string; type: 'call' | 'put'; strike: number } | null {
  const m = /^(?:O:)?([A-Z.]{1,6})(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/.exec(String(sym ?? '').trim().toUpperCase());
  if (!m) return null;
  const [, root, yy, mm, dd, cp, k] = m;
  return {
    root,
    expiry: `20${yy}-${mm}-${dd}`,
    type: cp === 'C' ? 'call' : 'put',
    strike: Number(k) / 1000,
  };
}

/* ==================================================================== */
/* The loaders                                                          */
/* ==================================================================== */

export function makePanelLoaders(deps: PanelDeps) {
  /**
   * THE QUOTE CARD.
   *
   * The day's range is labelled with the session it belongs to. While the
   * market is open (or in the evening session) it is today's running bar; before
   * the open and on a closed day it is the newest FINISHED session, named by
   * date. A Friday range printed on a Monday morning as "today" is the exact
   * lie a freshness label exists to prevent.
   */
  async function quoteCard(symbol: string): Promise<PanelResult<QuoteCardResponse>> {
    const sym = symbol.trim().toUpperCase();
    const [r, name] = await Promise.all([deps.quote(sym), deps.name(sym).catch(() => null)]);
    const q = r.quote;
    if (q.price === null) {
      return {
        ok: false,
        plain: `I could not get a price for ${sym}. Either the market data provider has nothing under that ticker, or it is not answering right now.`,
      };
    }

    let day: QuoteCardResponse['day'] = {
      open: null, high: null, low: null, volume: null, vwap: null,
      session_date: null, basis: 'none',
      basis_plain: `There is no daily bar for ${sym} yet, so the day's range is not known.`,
    };

    const live = q.session === 'open' || q.session === 'after';
    const bar = live ? await deps.sessionBar(sym).catch(() => null) : null;
    if (bar) {
      day = {
        open: bar.open, high: bar.high, low: bar.low, volume: bar.volume, vwap: bar.vwap,
        session_date: etDate(deps.now()),
        basis: 'session_so_far',
        basis_plain: q.session === 'open' ? 'Today so far' : "Today's session",
      };
    } else {
      const last = [...r.daily].reverse().find((b) => b.h !== null && b.l !== null && (b.h ?? 0) > 0);
      if (last) {
        const date = etDate(new Date(last.ts));
        day = {
          open: last.o, high: last.h, low: last.l, volume: last.v, vwap: null,
          session_date: date,
          basis: 'last_session',
          basis_plain: `${shortDay(date)} session`,
        };
      }
    }

    return {
      ok: true,
      value: {
        kind: 'quote',
        symbol: sym,
        name,
        quote: q,
        day,
        degraded: r.degraded,
        degraded_reason: r.degraded_reason,
      },
    };
  }

  /**
   * EARNINGS — what the company reported, and a next date only with a source.
   */
  async function earnings(symbol: string): Promise<PanelResult<EarningsPanelResponse>> {
    const sym = symbol.trim().toUpperCase();
    const today = etDate(deps.now());
    const [fin, upcoming, name] = await Promise.all([
      deps.financials(sym).catch(() => ({ quarters: [], degraded: true })),
      deps.nextEarnings(sym).catch(() => ({ ok: false as const })),
      deps.name(sym).catch(() => null),
    ]);

    const quarters: EarningsQuarter[] = fin.quarters.slice(0, 4).map((q) => ({
      fiscal_period: q.fiscal_period,
      fiscal_year: q.fiscal_year,
      period_end: q.end_date,
      filed: q.filing_date,
      // Polygon's figures arrive as binary floats (1.7600000000000002); four
      // places keeps every cent and drops the noise.
      eps_diluted: q.eps_diluted === null ? null : Math.round(q.eps_diluted * 10_000) / 10_000,
      revenue: q.revenue,
      net_income: q.net_income,
    }));

    let next: EarningsPanelResponse['next'] = null;
    let nextPlain: string;
    const hit = upcoming.ok ? upcoming.next : null;
    if (hit && /^\d{4}-\d{2}-\d{2}/.test(hit.date) && hit.date.slice(0, 10) >= today) {
      const date = hit.date.slice(0, 10);
      const when = hit.when === 'premarket' ? ', before the open' : hit.when === 'postmarket' ? ', after the close' : '';
      next = {
        date,
        days_away: daysBetween(today, date),
        confirmed: hit.confirmed,
        source_plain: hit.confirmed
          ? `Confirmed by the company${when}. From Unusual Whales.`
          : `Estimated by Unusual Whales${when} — the company has not announced it yet, so it can move.`,
      };
      nextPlain = `Next report ${hit.confirmed ? '' : 'expected '}${shortDay(date)}.`;
    } else if (!upcoming.ok) {
      nextPlain = `The earnings calendar did not answer just now, so ${sym}'s next report date is not shown. Try again in a minute.`;
    } else {
      nextPlain = `Unusual Whales has no upcoming report date for ${sym}, so the date is left blank rather than guessed.`;
    }

    if (!quarters.length && !next) {
      return {
        ok: false,
        plain: fin.degraded
          ? `I could not read ${sym}'s reported quarters just now, and I have no next report date for it.`
          : `There are no reported quarters on file for ${sym} — it may be a fund or too new to have filed — and no next report date.`,
      };
    }

    return {
      ok: true,
      value: {
        kind: 'earnings',
        symbol: sym,
        name,
        next,
        next_plain: nextPlain,
        quarters,
        estimates_plain:
          'This panel shows what the company reported, not what analysts expected, so there is no beat or miss here.',
        degraded: fin.degraded,
        degraded_reason: fin.degraded ? 'The reported quarters did not load just now.' : null,
      },
    };
  }

  /**
   * THE OPTIONS LADDER — what is listed near the money, and what the flow bought.
   */
  async function optionsChain(symbol: string): Promise<PanelResult<OptionsChainResponse>> {
    const sym = symbol.trim().toUpperCase();
    const today = etDate(deps.now());
    const r = await deps.quote(sym);
    const spot = r.quote.price;
    if (spot === null) {
      return {
        ok: false,
        plain: `I could not get a price for ${sym}, so I cannot say which strikes are near the money.`,
      };
    }

    const [listed, records] = await Promise.all([
      deps.optionExpiries(sym).catch(() => ({ expiries: [] as string[], degraded: true })),
      deps.flowRecords(sym).catch(() => []),
    ]);

    // The flow prints, newest first, one per contract — the most recent reading
    // of a contract is the one worth showing, and an older one beside it would
    // be two prices for one thing.
    const flow: OptionsFlowPrint[] = [];
    const seen = new Set<string>();
    for (const rec of [...records].sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))) {
      for (const o of rec.options) {
        const occ = parseOcc(String(o.option_symbol ?? ''));
        if (!occ || occ.root !== sym) continue;
        const key = `${occ.expiry}:${occ.type}:${occ.strike}`;
        if (seen.has(key)) continue;
        seen.add(key);
        flow.push({
          option_symbol: String(o.option_symbol),
          type: occ.type,
          strike: occ.strike,
          expiry: occ.expiry,
          bid: num(o.bid),
          ask: num(o.ask),
          volume: num(o.volume),
          open_interest: num(o.open_interest),
          iv: num(o.iv),
          label: typeof o.label === 'string' && o.label ? o.label : 'Recorded by the options-flow engine',
          recorded_at: rec.recorded_at,
        });
      }
    }
    // A contract that has already expired is history, not a chain.
    const liveFlow = flow.filter((f) => f.expiry >= today);

    // Today's expiry stops trading at the 4 PM bell; after that it is history.
    const pastClose = etMinutes(deps.now()) >= 16 * 60;
    const expiries = listed.expiries.filter((e) => (pastClose ? e > today : e >= today)).sort();
    const expiry = expiries[0] ?? null;
    let rows: OptionsChainRow[] = [];
    let chainDegraded = false;
    let asOf: string | null = null;
    if (expiry) {
      const chain = await deps.optionChain(sym, expiry).catch(() => ({ contracts: [], degraded: true }));
      chainDegraded = chain.degraded;
      const onExpiry = chain.contracts.filter((c) => c.expiry === expiry);
      for (const c of onExpiry) if (c.last_trade_at && (!asOf || c.last_trade_at > asOf)) asOf = c.last_trade_at;
      const strikes = [...new Set(onExpiry.map((c) => c.strike))].sort((a, b) => a - b);
      let nearest = 0;
      strikes.forEach((k, i) => { if (Math.abs(k - spot) < Math.abs(strikes[nearest] - spot)) nearest = i; });
      const window = strikes.slice(Math.max(0, nearest - 5), nearest + 6);
      const side = (k: number, t: 'call' | 'put'): OptionQuote | null => {
        const c = onExpiry.find((x) => x.strike === k && x.type === t);
        if (!c) return null;
        return {
          option_symbol: c.option_symbol, bid: c.bid, ask: c.ask, last: c.last,
          volume: c.volume, open_interest: c.open_interest, iv: c.iv, last_trade_at: c.last_trade_at,
        };
      };
      rows = window.map((k) => {
        const at = (t: 'call' | 'put') => liveFlow.find((f) => f.expiry === expiry && f.strike === k && f.type === t) ?? null;
        return {
          strike: k,
          call: side(k, 'call'),
          put: side(k, 'put'),
          nearest_the_money: k === strikes[nearest],
          call_flow: at('call'),
          put_flow: at('put'),
        };
      });
    }

    const degraded = listed.degraded || chainDegraded;
    if (!rows.length && !liveFlow.length) {
      return {
        ok: false,
        plain: degraded
          ? `The ${sym} option chain did not load just now, so I have no chain to show.`
          : `Unusual Whales lists no ${sym} option contracts expiring from today on — it may not have listed options.`,
      };
    }

    const stamp = asOf ? etStamp(asOf) : null;
    const sameDay = asOf ? etDate(new Date(asOf)) === today : false;
    return {
      ok: true,
      value: {
        kind: 'options',
        symbol: sym,
        spot,
        spot_plain: r.quote.label_plain,
        expiry,
        expiries: expiries.slice(0, 6),
        rows,
        flow: liveFlow.slice(0, 6),
        prices_as_of: asOf,
        prices_plain: !rows.length
          ? 'The chain did not load, so only the contracts the options-flow engine recorded are shown, at the prices it saw when it recorded them.'
          : stamp
            ? `Option prices are from Unusual Whales. The newest trade on this expiry was ${stamp}` +
              (sameDay ? '. ' : ', so these are that session\'s last quotes, not live ones. ') +
              'Bid and ask move constantly — check your broker before you trade.'
            : 'Option prices are from Unusual Whales. None of these contracts has traded yet, so there is no last price; bid and ask are the latest quotes.',
        degraded,
        degraded_reason: degraded ? 'The option chain did not fully load just now.' : null,
      },
    };
  }

  return { quoteCard, earnings, optionsChain };
}

/* ==================================================================== */
/* Unusual Whales answers → what the loaders take (pure, proved on       */
/* recorded responses in scripts/panels-test.mts)                        */
/* ==================================================================== */

type UwEarningsRow = { report_date: string; report_time?: string; source?: string; actual_eps?: string | null; street_mean_est?: string | null };

/** The next report from UW's per-ticker list: dated today or later, not yet reported. */
export function nextEarningsFromUw(
  rows: UwEarningsRow[],
  today: string,
): { date: string; confirmed: boolean; when: 'premarket' | 'postmarket' | null } | null {
  const next = [...rows]
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.report_date) && r.report_date >= today && num(r.actual_eps) === null)
    .sort((a, b) => a.report_date.localeCompare(b.report_date))[0];
  if (!next) return null;
  const t = String(next.report_time ?? '');
  return {
    date: next.report_date,
    confirmed: next.source === 'company',
    when: t === 'premarket' || t === 'postmarket' ? t : null,
  };
}

export function expiriesFromUw(rows: { expires?: string }[]): string[] {
  return [...new Set(rows.map((e) => String(e.expires ?? '').slice(0, 10)).filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e)))].sort();
}

type UwChainRow = {
  option_symbol: string;
  nbbo_bid?: string | null;
  nbbo_ask?: string | null;
  last_price?: string | null;
  volume?: number | null;
  open_interest?: number | null;
  implied_volatility?: string | null;
  last_tape_time?: string | null;
};

export function chainFromUw(rows: UwChainRow[]): (OptionQuote & { type: 'call' | 'put'; strike: number; expiry: string })[] {
  const out: (OptionQuote & { type: 'call' | 'put'; strike: number; expiry: string })[] = [];
  for (const c of rows) {
    const occ = parseOcc(c.option_symbol);
    if (!occ) continue;
    // A bid of zero is a real quote (nobody bidding); a missing one is not.
    out.push({
      option_symbol: c.option_symbol,
      type: occ.type,
      strike: occ.strike,
      expiry: occ.expiry,
      bid: num(c.nbbo_bid),
      ask: num(c.nbbo_ask),
      last: num(c.last_price),
      volume: num(c.volume),
      open_interest: num(c.open_interest),
      iv: num(c.implied_volatility),
      last_trade_at: typeof c.last_tape_time === 'string' && c.last_tape_time ? c.last_tape_time : null,
    });
  }
  return out;
}

/* ==================================================================== */
/* The real readers                                                     */
/* ==================================================================== */

/**
 * Wired lazily so importing this module (the proof does) never opens a
 * database client or reads an API key.
 */
async function liveDeps(): Promise<PanelDeps> {
  const polygon = await import('./polygon');
  const uw = await import('./uw');
  const { serviceClient } = await import('../db');
  const { UOA_ORIGIN } = await import('../uoa/ingest');

  return {
    quote: async (symbol) => {
      const r = await polygon.resolveQuote(symbol, { timeframe: '1d' });
      return { quote: r.quote, daily: r.series === 'daily' || r.timeframe === '1d' ? r.candles : [], degraded: r.degraded, degraded_reason: r.degraded_reason };
    },
    sessionBar: (symbol) => polygon.getSessionBar(symbol),
    name: async (symbol) => {
      const { data } = await serviceClient().from('instruments').select('name').eq('symbol', symbol).maybeSingle();
      return ((data as { name?: string } | null)?.name as string) ?? null;
    },
    financials: (symbol) => polygon.getFinancials(symbol, 4),
    nextEarnings: async (symbol) => {
      const r = await uw.earnings(symbol);
      return r.ok ? { ok: true, next: nextEarningsFromUw(r.data, etDate(new Date())) } : { ok: false };
    },
    optionExpiries: async (symbol) => {
      const r = await uw.optionExpiries(symbol);
      return r.ok ? { expiries: expiriesFromUw(r.data), degraded: false } : { expiries: [], degraded: true };
    },
    optionChain: async (symbol, expiry) => {
      const r = await uw.optionChain(symbol, expiry);
      return r.ok ? { contracts: chainFromUw(r.data), degraded: false } : { contracts: [], degraded: true };
    },
    flowRecords: async (symbol) => {
      const since = new Date(Date.now() - 4 * 86_400_000).toISOString();
      const { data } = await serviceClient()
        .from('setups')
        .select('created_at,score_components')
        .eq('symbol', symbol)
        .eq('quote_snapshot->>origin', UOA_ORIGIN)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(10);
      return ((data ?? []) as { created_at: string; score_components: Record<string, unknown> | null }[]).map((row) => ({
        recorded_at: row.created_at,
        options: Array.isArray(row.score_components?.recommended_options)
          ? (row.score_components!.recommended_options as Record<string, unknown>[])
          : [],
      }));
    },
    now: () => new Date(),
  };
}

let loaders: ReturnType<typeof makePanelLoaders> | null = null;

/** The production loaders. Every caller — tool and route — goes through here. */
/** The live readers on their own — Home's calendar asks `nextEarnings` directly. */
export function makePanelDeps(): Promise<PanelDeps> {
  return liveDeps();
}

export async function panels(): Promise<ReturnType<typeof makePanelLoaders>> {
  if (!loaders) loaders = makePanelLoaders(await liveDeps());
  return loaders;
}
