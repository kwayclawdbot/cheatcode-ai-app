/**
 * THE PANEL TOOLS — the quote card, the earnings record and the options ladder,
 * read by Kai through exactly the loaders the phone draws them from.
 *
 * Each is an ADAPTER over `lib/market/panels.ts`, never a second query: the
 * range Kai reads out and the range printed on the panel beneath his words are
 * one read. And each carries its own `must_say`, because two of the three are
 * honest partials — no earnings calendar and no option prices on this data
 * plan — and the sentence that says so has to reach the member through Kai as
 * well as through the panel.
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
      'Read which option contracts are LISTED near the money on a stock for its nearest expiry, plus any ' +
      'contracts the options-flow engine recorded on it in the last few sessions with the bid and ask it saw ' +
      'at that moment. Call this when the user asks about the options on a ticker, which strikes exist, or ' +
      'what the unusual flow bought. The listed ladder carries NO prices — live option prices are not on ' +
      'this data plan — so never quote a premium unless it came back on a recorded flow contract, and say ' +
      'when it was recorded.',
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
      next_report: v.next ? { date: v.next.date, days_away: v.next.days_away, where_this_date_came_from: v.next.source_plain } : null,
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
          ? 'The next date is from the source named with it and can move; say where it came from.'
          : 'There is no next report date on record — say it is not known rather than guessing one.'),
    };
  }

  const r = await loaders.optionsChain(symbol);
  if (!r.ok) return NOT_FOUND(r.plain);
  const v = r.value;
  return {
    found: true,
    symbol: v.symbol,
    underlying_price: v.spot,
    underlying_how_fresh_plain: v.spot_plain,
    nearest_expiry: v.expiry,
    other_expiries: v.expiries.slice(1),
    listed_strikes: v.rows.map((row) => ({
      strike: row.strike,
      call_listed: Boolean(row.call),
      put_listed: Boolean(row.put),
      nearest_the_money: row.nearest_the_money,
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
