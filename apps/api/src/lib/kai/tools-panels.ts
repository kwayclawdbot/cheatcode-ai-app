/**
 * THE PANEL TOOLS — the quote card, the earnings record and the options ladder,
 * read by Kai through exactly the loaders the phone draws them from.
 *
 * Each is an ADAPTER over `lib/market/panels.ts`, never a second query: the
 * range Kai reads out and the range printed on the panel beneath his words are
 * one read. And each carries its own `must_say`: where the earnings date came
 * from (confirmed or estimated), and how fresh the option prices are — the
 * sentence has to reach the member through Kai as well as through the panel.
 * Options and the earnings date come from Unusual Whales; stock data from
 * Polygon.
 *
 * Read-only, like every other tool. The watchlist and portfolio panels need no
 * new tool: `read_watchlist` and `read_positions` in `tools-desk.ts` already
 * read those rows through the same loaders the Trade tab uses.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { panels as livePanels, type makePanelLoaders } from '../market/panels';
import { NOT_FOUND, sym, type ToolCtx, type ToolResult } from './tool-kit';

type Loaders = ReturnType<typeof makePanelLoaders>;

const symbolOnly = (what: string): Anthropic.Tool['input_schema'] => ({
  type: 'object',
  properties: { symbol: { type: 'string', description: what } },
  required: ['symbol'],
  additionalProperties: false,
});

export const PANEL_TOOLS: Anthropic.Tool[] = [
  {
    name: 'read_quote_card',
    description:
      'Get the full price card for one stock: the price, the change on the day, the previous close, the ' +
      "day's open, high and low, the volume, and which session that range belongs to. Call this when the " +
      "user asks about the day's range, how much has traded, where it opened, or wants the whole quote. For " +
      'just the price, look_up_price is enough. Repeat the freshness and the session label that come back — ' +
      "a finished session's range is not today's.",
    input_schema: symbolOnly('The ticker, e.g. NVDA.'),
    strict: true,
  },
  {
    name: 'read_earnings_history',
    description:
      "Read one company's recent reported quarters — earnings per share, revenue, net income, the period and " +
      'when it was filed — plus its next report date when one is known. This is the same record the earnings ' +
      'panel shows. Call it when the user asks how the last quarters went or wants the numbers behind them. ' +
      'For "when does X report" across several tickers or the watchlist, use read_earnings. If no next date ' +
      'comes back, say that the date is not known rather than estimating one.',
    input_schema: symbolOnly('The ticker whose earnings you want.'),
    strict: true,
  },
  {
    name: 'read_options_chain',
    description:
      'Read the option chain on a stock for its nearest expiry: the strikes around the money, and for each ' +
      'call and put its bid, ask, last price, volume, open interest and implied volatility, plus any ' +
      'contracts the options-flow engine recorded on it in the last few sessions. Call this when the user ' +
      'asks what an option costs, which strikes exist, or what the unusual flow bought. Say how fresh the ' +
      'prices are — the time of the newest trade comes back with them — and never call a quote from a ' +
      'finished session live.',
    input_schema: symbolOnly('The underlying ticker, e.g. NVDA.'),
    strict: true,
  },
];

const round = (n: number | null | undefined, dp = 2): number | null =>
  n === null || n === undefined || !Number.isFinite(n) ? null : Number(n.toFixed(dp));

/** The work, with the loaders passed in so the proof can drive it with stubs. */
export async function runPanelToolWith(
  loaders: Loaders,
  name: string,
  input: Record<string, unknown>,
): Promise<ToolResult | null> {
  if (!PANEL_TOOLS.some((t) => t.name === name)) return null;
  const symbol = sym(input.symbol);
  if (!symbol) return NOT_FOUND('No ticker was given, so there is nothing to look up.');

  if (name === 'read_quote_card') {
    const r = await loaders.quoteCard(symbol);
    if (!r.ok) return NOT_FOUND(r.plain);
    const v = r.value;
    const stale = v.quote.session !== 'open';
    return {
      found: true,
      symbol: v.symbol,
      company: v.name,
      price: v.quote.price,
      change: v.quote.change,
      change_pct: v.quote.change_pct,
      prev_close: v.quote.prev_close,
      how_fresh_plain: v.quote.label_plain,
      day_open: v.day.open,
      day_high: v.day.high,
      day_low: v.day.low,
      volume: v.day.volume,
      vwap: round(v.day.vwap),
      range_is_for: v.day.basis_plain,
      must_say:
        (stale
          ? 'The market is not open, so the price is the last one it traded at. '
          : `The price is ${v.quote.freshness}. `) +
        `The range and volume are for: ${v.day.basis_plain}. Say which session they belong to.`,
      ...(v.degraded ? { degraded: true, degraded_reason: v.degraded_reason } : {}),
    };
  }

  if (name === 'read_earnings_history') {
    const r = await loaders.earnings(symbol);
    if (!r.ok) return NOT_FOUND(r.plain);
    const v = r.value;
    return {
      found: true,
      symbol: v.symbol,
      company: v.name,
      next_report: v.next
        ? { date: v.next.date, days_away: v.next.days_away, confirmed: v.next.confirmed ?? false, where_this_date_came_from: v.next.source_plain }
        : null,
      next_report_plain: v.next_plain,
      quarters: v.quarters.map((q) => ({
        quarter: `${q.fiscal_period} ${q.fiscal_year}`.trim(),
        period_ended: q.period_end,
        filed: q.filed,
        eps_diluted: q.eps_diluted,
        revenue: q.revenue,
        net_income: q.net_income,
      })),
      must_say:
        `${v.estimates_plain} ` +
        (v.next
          ? v.next.confirmed
            ? 'The company confirmed the next date.'
            : 'The next date is an estimate, not an announcement — say so, because it can move.'
          : 'There is no next report date on record — say it is not known rather than guessing one.'),
    };
  }

  const r = await loaders.optionsChain(symbol);
  if (!r.ok) return NOT_FOUND(r.plain);
  const v = r.value;
  const side = (q: (typeof v.rows)[number]['call']) =>
    q
      ? {
          bid: q.bid,
          ask: q.ask,
          last: q.last,
          volume: q.volume,
          open_interest: q.open_interest,
          implied_volatility_pct: q.iv === null ? null : round(q.iv * 100, 1),
        }
      : null;
  return {
    found: true,
    symbol: v.symbol,
    underlying_price: v.spot,
    underlying_how_fresh_plain: v.spot_plain,
    nearest_expiry: v.expiry,
    other_expiries: v.expiries.slice(1),
    prices_as_of: v.prices_as_of ?? null,
    strikes: v.rows.map((row) => ({
      strike: row.strike,
      nearest_the_money: row.nearest_the_money,
      call: side(row.call),
      put: side(row.put),
    })),
    recorded_flow: v.flow.map((f) => ({
      contract: `${f.type} ${f.strike} expiring ${f.expiry}`,
      bid_when_recorded: f.bid,
      ask_when_recorded: f.ask,
      volume_when_recorded: f.volume,
      open_interest: f.open_interest,
      what_it_is: f.label,
      recorded_at: f.recorded_at,
    })),
    must_say: v.prices_plain,
    ...(v.degraded ? { degraded: true, degraded_reason: v.degraded_reason } : {}),
  };
}

export async function runPanelTool(
  name: string,
  input: Record<string, unknown>,
  _ctx: ToolCtx,
): Promise<ToolResult | null> {
  if (!PANEL_TOOLS.some((t) => t.name === name)) return null;
  return runPanelToolWith(await livePanels(), name, input);
}
