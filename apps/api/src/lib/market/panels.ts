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
 * WHAT THE DATA PLAN CAN AND CANNOT ANSWER (checked against Polygon 2026-09-21)
 * ═════════════════════════════════════════════════════════════════════════════
 *   stock snapshot (price, day range, volume)     yes
 *   quarterly financials (EPS, revenue, filed)    yes
 *   earnings calendar (Benzinga)                  NOT ENTITLED
 *   option contracts reference (strikes, expiry)  yes
 *   option chain snapshot / last trade / quotes   NOT ENTITLED
 *
 * So two of these panels are honest partials, and they say so in a sentence
 * that travels WITH the data rather than in a comment nobody sees:
 *
 *   EARNINGS  history is real; a next date appears only when the options-flow
 *             engine recorded one (Unusual Whales' company data), with where it
 *             came from and when it was read. No estimates, so no beat/miss.
 *   OPTIONS   the ladder is the LISTED strikes near the money for the nearest
 *             expiry. It carries no prices. A price appears only on a contract
 *             the flow engine recorded, and it is the bid/ask AT THAT MOMENT,
 *             stamped with the moment.
 *
 * Nothing here invents a number to fill a hole. A field the plan cannot fill is
 * null with a sentence beside it.
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
  /** The newest next-earnings date any stored flow record carried, and when it was read. */
  earningsHint: (symbol: string) => Promise<{ date: string; recorded_at: string } | null>;
  optionContracts: (
    symbol: string,
    window: { expiryFrom: string; expiryTo: string; strikeLo: number; strikeHi: number },
  ) => Promise<{ contracts: { ticker: string; type: 'call' | 'put'; strike: number; expiry: string }[]; degraded: boolean; reason: string | null }>;
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

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
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
    const [fin, hint, name] = await Promise.all([
      deps.financials(sym).catch(() => ({ quarters: [], degraded: true })),
      deps.earningsHint(sym).catch(() => null),
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
    if (hint && /^\d{4}-\d{2}-\d{2}/.test(hint.date) && hint.date.slice(0, 10) >= today) {
      const date = hint.date.slice(0, 10);
      next = {
        date,
        days_away: daysBetween(today, date),
        source_plain:
          `From the company data the options-flow feed carried on ${shortDay(etDate(new Date(hint.recorded_at)))}. ` +
          'Report dates can move — the company announces the confirmed one.',
      };
      nextPlain = `Next report expected ${shortDay(date)}.`;
    } else {
      nextPlain =
        `No source this app has names ${sym}'s next report date. ` +
        'The market-data plan does not include an earnings calendar, so the date is left blank rather than guessed.';
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
          'Analyst estimates are not on this app\'s data plan, so there is no beat or miss here — only what the company reported.',
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
      deps.optionContracts(sym, {
        expiryFrom: today,
        expiryTo: addDays(today, 45),
        strikeLo: spot * 0.85,
        strikeHi: spot * 1.15,
      }),
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

    const expiries = [...new Set(listed.contracts.map((c) => c.expiry))].sort();
    const expiry = expiries[0] ?? null;
    let rows: OptionsChainRow[] = [];
    if (expiry) {
      const onExpiry = listed.contracts.filter((c) => c.expiry === expiry);
      const strikes = [...new Set(onExpiry.map((c) => c.strike))].sort((a, b) => a - b);
      let nearest = 0;
      strikes.forEach((k, i) => { if (Math.abs(k - spot) < Math.abs(strikes[nearest] - spot)) nearest = i; });
      const window = strikes.slice(Math.max(0, nearest - 5), nearest + 6);
      rows = window.map((k) => {
        const call = onExpiry.find((c) => c.strike === k && c.type === 'call')?.ticker ?? null;
        const put = onExpiry.find((c) => c.strike === k && c.type === 'put')?.ticker ?? null;
        const at = (t: 'call' | 'put') => liveFlow.find((f) => f.expiry === expiry && f.strike === k && f.type === t) ?? null;
        return {
          strike: k,
          call,
          put,
          nearest_the_money: k === strikes[nearest],
          call_flow: at('call'),
          put_flow: at('put'),
        };
      });
    }

    if (!rows.length && !liveFlow.length) {
      return {
        ok: false,
        plain: listed.degraded
          ? `The list of ${sym} option contracts did not load just now, so I have no chain to show.`
          : `No ${sym} option contracts are listed within 15% of the price in the next 45 days — it may not have listed options.`,
      };
    }

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
        prices_plain:
          'Live option prices are not on this app\'s market-data plan, so this shows which contracts are listed, not what they cost. ' +
          'A price appears only on a contract the options-flow engine recorded, and it is the bid and ask at the moment it was recorded.',
        degraded: listed.degraded,
        degraded_reason: listed.degraded ? 'The list of listed contracts did not load just now.' : null,
      },
    };
  }

  return { quoteCard, earnings, optionsChain };
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
    earningsHint: async (symbol) => {
      const { data } = await serviceClient()
        .from('setups')
        .select('created_at,score_components')
        .eq('symbol', symbol)
        .eq('quote_snapshot->>origin', UOA_ORIGIN)
        .order('created_at', { ascending: false })
        .limit(5);
      for (const row of (data ?? []) as { created_at: string; score_components: Record<string, unknown> | null }[]) {
        const uoa = (row.score_components?.uoa ?? null) as Record<string, unknown> | null;
        const date = typeof uoa?.next_earnings_date === 'string' ? uoa.next_earnings_date : null;
        if (date) return { date, recorded_at: row.created_at };
      }
      return null;
    },
    optionContracts: (symbol, window) => polygon.getOptionContracts(symbol, window),
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
export async function panels(): Promise<ReturnType<typeof makePanelLoaders>> {
  if (!loaders) loaders = makePanelLoaders(await liveDeps());
  return loaders;
}
