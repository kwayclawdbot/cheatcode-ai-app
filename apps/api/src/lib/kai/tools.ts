/**
 * KAI'S TOOLS — the things he can go and look up while he is answering.
 *
 * THE PROBLEM THIS FIXES, in the owner's words: *"kai is not connected to any
 * live polygon data or has no conversation logic with users, look at his
 * response when asked about ticker."*
 *
 * He was right. Until this file existed Kai had no tools at all. His entire
 * world was one pre-rendered string: the user's profile, their risk policy, the
 * few ranked scanner rows for their mode, the last twenty turns, and a market
 * block that says only whether the market is open — no prices in it whatsoever.
 * The only price he ever saw was a `quote_snapshot` frozen on a setup row. Ask
 * him about any symbol outside that handful of rows and he had, truthfully,
 * nothing — while Polygon was live in the same process, the chart resolver was
 * answering twenty-one levels for that same symbol, and the app was drawing them
 * on screen a few hundred pixels above his reply. He was starving in a room full
 * of food.
 *
 * THE ANTI-INVENTION RULE IS NOT WEAKENED BY THIS. IT IS ENFORCED BY IT.
 *
 * Every number in every answer now has to come back from one of these functions,
 * which read the same rows, the same Polygon client and the same resolver the
 * rest of the app uses. Kai names WHAT HE WANTS TO KNOW; the server goes and
 * finds it; he quotes what came back. He still may not compute a price, recall
 * one, or interpolate between two. A tool that cannot answer returns
 * `found: false` with a plain sentence saying why, and saying that sentence is
 * the correct behaviour — never filling the hole with something plausible.
 *
 * WHAT A TOOL MAY NOT DO. None of these grades anything. `search_setups` returns
 * the grades the engine already assigned and nothing else, so an ungraded symbol
 * comes back with no entry, no stop and no target however much of it Kai reads.
 * A markable chart and a quotable price are not a trade plan and never become
 * one.
 *
 * FRESHNESS TRAVELS WITH THE PRICE. Every quote carries the same
 * `label_plain` the app prints — "Delayed 15m · last trade 3:55 PM ET",
 * "Market closed · last close Sep 4" — and the tool result repeats in plain
 * words that a closed-market price is where things stood, not where they are.
 * A stale number presented as live is the one failure mode worse than no number.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { serviceClient } from '../db';
import { log } from '../log';
import { resolveQuote } from '../market/polygon';
import { getCompanyProfile, marketCapPlain, refreshCompanyProfile, summaryFor } from '../market/profile';
import { loadChartContext } from '../round4/chart-context';
import { availableDrawings, availableLevels, resolveLevel } from './chart-commands';
import type { AppMode } from '@shared/api';

/* ------------------------------------------------------------------ */
/* The definitions the model sees                                      */
/* ------------------------------------------------------------------ */

/**
 * FOUR TOOLS, AND DELIBERATELY NOT MORE.
 *
 * Every tool is a round trip: another model call, another few seconds, another
 * bill. The set below is the smallest one that answers the question the owner
 * actually asked — "what about this ticker?" — for a symbol nothing in the
 * database has an opinion about. Anything Kai can already read out of the
 * context he is given does NOT get a tool; a tool that duplicates the prompt
 * only teaches him to spend a turn re-reading what he was handed.
 *
 * The descriptions say when NOT to call, because that is the half a model gets
 * wrong. Left to itself it will look up a quote it was already given.
 */
export const KAI_TOOLS: Anthropic.Tool[] = [
  {
    name: 'look_up_price',
    description:
      'Get the current price of any stock, whether or not it is in your context. ' +
      'Returns the price, the change on the day, and a plain sentence saying how fresh it is — ' +
      'which you must repeat, because a closed-market price is where things stood, not where they are. ' +
      'Call this when the user asks about a symbol whose price you were not given, or asks what something ' +
      'is trading at now. Do NOT call it for a symbol whose price is already in your context.',
    input_schema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'The ticker, e.g. SPY, NVDA, AAPL.' },
      },
      required: ['symbol'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'read_chart_levels',
    description:
      'Get every price level that can be measured on a stock\'s chart from its real bars — the previous ' +
      'session\'s high, low and close, the 8/21/50/200-day averages, the opening range, VWAP, the day\'s ' +
      'high and low, the year\'s high and low, swing highs and lows, and support and resistance. ' +
      'NONE of these need a graded setup: they are arithmetic on bars and exist for almost any symbol. ' +
      'Call this when the user asks what is on a chart, where the levels are, or what price is doing ' +
      'relative to anything. It returns only levels that actually resolved — anything absent from the ' +
      'result does not exist for this symbol and must not be mentioned as though it does.',
    input_schema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'The ticker whose chart you want the levels for.' },
      },
      required: ['symbol'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'look_up_company',
    description:
      'Find out what a company actually does — its name, what business it is in, its sector and how big ' +
      'it is. Call this when the user asks what a ticker is, what the company does, or when you would ' +
      'otherwise be guessing at a company from its symbol.',
    input_schema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'The ticker to look up.' },
      },
      required: ['symbol'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'search_setups',
    description:
      'Search the graded setups the engine has produced. Use it to check whether a particular symbol has ' +
      'a graded setup before you say it does not, or to find the best-graded ideas in a mode. ' +
      'It returns the grade, the thesis and the levels the engine assigned and NOTHING ELSE — if a symbol ' +
      'comes back with no setup, there is no graded trade on it and you must not construct one.',
    input_schema: {
      type: 'object',
      properties: {
        symbol: {
          type: ['string', 'null'],
          description: 'A ticker to check. Leave null to list the best-graded setups instead.',
        },
        mode: {
          type: ['string', 'null'],
          description: 'day_trade, swing or invest. Leave null for the mode the user is in.',
        },
      },
      required: ['symbol', 'mode'],
      additionalProperties: false,
    },
    strict: true,
  },
];

/* ------------------------------------------------------------------ */
/* Running one                                                         */
/* ------------------------------------------------------------------ */

export type ToolCtx = { userId: string; mode: AppMode; requestId: string };

/** The shape every tool answers in. `found:false` is a real answer, not an error. */
type ToolResult = Record<string, unknown> & { found: boolean };

const NOT_FOUND = (why: string): ToolResult => ({ found: false, plain: why });

const sym = (v: unknown): string => String(v ?? '').trim().toUpperCase();

/**
 * A PRICE, WITH ITS AGE ATTACHED TO IT.
 *
 * `resolveQuote` is the same call the Trade section makes, so the number Kai
 * quotes and the number printed at the top of the screen are one number from one
 * source. `label_plain` and `stale` are not decoration: a price from a closed
 * market that is spoken as though it were live is worse than no price, and this
 * is the only place that distinction can be made honestly.
 */
async function lookUpPrice(input: Record<string, unknown>): Promise<ToolResult> {
  const symbol = sym(input.symbol);
  if (!symbol) return NOT_FOUND('No ticker was given, so there is nothing to look up.');
  const r = await resolveQuote(symbol, { timeframe: '1d' });
  const q = r.quote;
  if (q.price === null) {
    return NOT_FOUND(
      `I could not get a price for ${symbol}. Either the market data provider has nothing under that ticker, or it is not answering right now.`
    );
  }
  const stale = q.session !== 'open';
  return {
    found: true,
    symbol,
    price: q.price,
    change: q.change,
    change_pct: q.change_pct,
    prev_close: q.prev_close,
    market: q.session,
    stale,
    freshness: q.freshness,
    // The sentence the app itself prints. Kai repeats it rather than inventing
    // his own description of how old the number is.
    how_fresh_plain: q.label_plain,
    must_say: stale
      ? 'The market is not open, so this is the last price it traded at — say so rather than calling it the current price.'
      : `This price is ${q.freshness}. Say that it is ${q.freshness} rather than implying it is to the second.`,
  };
}

/**
 * EVERY LEVEL THAT RESOLVES, AND NOTHING THAT DOES NOT.
 *
 * Deliberately built on `loadChartContext` + `resolveLevel` — the SAME resolver
 * the chart commands go through — rather than a second implementation. There is
 * exactly one place in this codebase that turns "the previous day's high" into a
 * number, and a tool that answered from anywhere else could disagree with the
 * line drawn on the chart, which is the one thing a user would never forgive.
 */
async function readChartLevels(input: Record<string, unknown>, ctx: ToolCtx): Promise<ToolResult> {
  const symbol = sym(input.symbol);
  if (!symbol) return NOT_FOUND('No ticker was given, so there is no chart to read.');
  const chart = await loadChartContext(ctx.userId, { symbol, timeframe: '1d' });
  if (!chart) {
    return NOT_FOUND(
      `I have no stored bars for ${symbol}, so there is no chart of it I can measure. I am not going to describe one from memory.`
    );
  }
  const names = availableLevels(chart);
  const levels = names
    .map((name) => {
      const r = resolveLevel(chart, name);
      return r ? { level: name, price: r.price, what_it_is: r.reason, from: r.provenance } : null;
    })
    .filter((l): l is NonNullable<typeof l> => l !== null);

  if (!levels.length) {
    return NOT_FOUND(
      `${symbol} has bars but not enough of them for any level to be measured yet, so there is nothing on its chart I can name.`
    );
  }
  return {
    found: true,
    symbol,
    timeframe: 'the daily chart',
    last_price: chart.bars.lastPrice,
    levels,
    drawings_available: availableDrawings(chart),
    has_graded_setup: Boolean(chart.setup),
    must_say: chart.setup
      ? 'This symbol has a graded setup, so its trigger, stop and targets are real and you may discuss them.'
      : 'These are measurements off the bars, not a graded setup. There is no entry, stop or target on this symbol and you must not produce one.',
  };
}

/**
 * WHAT THE COMPANY IS.
 *
 * THE SECOND LOOKUP IS NOT A RETRY, IT IS THE FIX FOR A REAL HOLE.
 * `getCompanyProfile` reads `instruments` and caches into it — but it stores
 * with an `update ... where symbol = ?`, which does nothing at all when there is
 * no row for that symbol. For any ticker outside the tracked universe (CRWD, for
 * one) the Polygon description is fetched, thrown away because the write lands
 * on nothing, and the re-read then returns an empty seed. Kai correctly said he
 * knew nothing about CrowdStrike while the answer had just been in the process.
 *
 * `refreshCompanyProfile` RETURNS what it fetched, whether or not it managed to
 * store it, so asking it directly gets the real answer without changing what
 * gets written to `instruments` — adding rows there is a schema decision with
 * consequences for every table pointing at it, and not one to make from a tool.
 */
async function lookUpCompany(input: Record<string, unknown>): Promise<ToolResult> {
  const symbol = sym(input.symbol);
  if (!symbol) return NOT_FOUND('No ticker was given.');
  let p = await getCompanyProfile(symbol);
  if (!p?.summary && !p?.sector) p = await refreshCompanyProfile(symbol, p?.name ?? null);
  if (!p || (!p.name && !p.summary)) {
    return NOT_FOUND(`I could not find out what ${symbol} is. I am not going to guess a business from a ticker.`);
  }
  return {
    found: true,
    symbol,
    name: p.name ?? null,
    what_it_does: summaryFor(p),
    sector: p.sector ?? null,
    size: p.market_cap_plain ?? marketCapPlain(p.market_cap ?? null),
    next_earnings: p.next_earnings ?? null,
  };
}

/**
 * THE GRADED ROWS, AND ONLY WHAT THE ENGINE PUT IN THEM.
 *
 * This is the tool that lets Kai say "no, there really is no graded setup on
 * SPY" as a fact he checked rather than as a guess from a list he happened to be
 * handed. Note what it does NOT do: it never composes an entry, a stop or a
 * target. Those columns are copied out of the row or they are null.
 */
async function searchSetups(input: Record<string, unknown>, ctx: ToolCtx): Promise<ToolResult> {
  const symbol = sym(input.symbol);
  const rawMode = String(input.mode ?? '').trim();
  const mode = (['day_trade', 'swing', 'invest'].includes(rawMode) ? rawMode : ctx.mode) as AppMode;
  const db = serviceClient();

  let q = db
    .from('setups')
    .select('id,symbol,mode,intent,state,grade_display,grade_band,score,thesis_plain,entry_condition,stop,targets,invalidation,valid_until')
    .eq('mode', mode)
    .order('score', { ascending: false })
    .limit(symbol ? 5 : 8);
  if (symbol) q = q.eq('symbol', symbol);

  const { data, error } = await q;
  if (error) {
    log('warn', ctx.requestId, 'kai.tool_failed', { tool: 'search_setups', message: error.message });
    return NOT_FOUND('I could not read the setup list just now.');
  }
  const rows = (data ?? []) as Record<string, unknown>[];
  if (!rows.length) {
    return {
      found: false,
      plain: symbol
        ? `There is no graded ${mode.replace('_', ' ')} setup on ${symbol}. That is the real answer — do not build a trade plan for it. You can still read its chart.`
        : `The engine has no graded ${mode.replace('_', ' ')} setups on the board right now.`,
    };
  }
  return {
    found: true,
    mode,
    setups: rows.map((r) => ({
      symbol: r.symbol,
      grade: r.grade_display ?? r.grade_band ?? null,
      score: r.score ?? null,
      direction: r.intent ?? null,
      state: r.state ?? null,
      why: r.thesis_plain ?? null,
      entry_condition: r.entry_condition ?? null,
      stop: r.stop ?? null,
      targets: r.targets ?? null,
      invalidation: r.invalidation ?? null,
      good_until: r.valid_until ?? null,
    })),
  };
}

/**
 * Run one tool call. NEVER THROWS.
 *
 * A tool that blows up must come back as a sentence Kai can say, not as an
 * exception that kills the turn — the whole point of this work is that the user
 * always gets an answer, even when the answer is "I could not find that out".
 */
export async function runKaiTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolCtx
): Promise<ToolResult> {
  const t0 = Date.now();
  try {
    let out: ToolResult;
    switch (name) {
      case 'look_up_price': out = await lookUpPrice(input); break;
      case 'read_chart_levels': out = await readChartLevels(input, ctx); break;
      case 'look_up_company': out = await lookUpCompany(input); break;
      case 'search_setups': out = await searchSetups(input, ctx); break;
      default: return NOT_FOUND(`I do not have a way to look that up.`);
    }
    log('info', ctx.requestId, 'kai.tool_ran', {
      tool: name, symbol: input.symbol ?? null, found: out.found, ms: Date.now() - t0,
    });
    return out;
  } catch (e) {
    log('warn', ctx.requestId, 'kai.tool_failed', {
      tool: name, message: e instanceof Error ? e.message : String(e),
    });
    return NOT_FOUND('That lookup failed on my side, so I do not have the answer.');
  }
}

/**
 * What the prompt tells him about having tools at all.
 *
 * SHORT ON PURPOSE. The tool descriptions carry the detail; a second copy of
 * them in the system prompt is a second thing to keep in step, and they drift.
 * What belongs here is only the part the descriptions cannot say: the standing
 * rule about numbers, which is about ALL of them at once.
 */
export const TOOL_PROTOCOL = `LOOKING THINGS UP

You can go and look things up. If the user asks about a stock you were not given
— any stock, listed below or not — look it up rather than saying you have no
information about it. You have the price, the levels on its chart, what the
company does, and the graded setups.

THE RULE ABOUT NUMBERS IS UNCHANGED AND THE TOOLS MAKE IT EASIER, NOT HARDER:
every number you say must be one a tool just handed you or one that is written in
your context. You do not compute prices, you do not remember them, and you do not
work one out from two others. If a lookup comes back with nothing, say so plainly
— that is a complete and honest answer, and it is always better than a number
that sounds right.

Repeat the freshness a price comes with. A price from a closed market is where
things stood, not where they are, and saying it is the current price is wrong
even when the number is right.

A price and a chart are not a trade. Having looked up levels on a symbol with no
graded setup, you still have no entry, no stop and no target for it, and you do
not invent them.

Do not look up things nobody asked about.`;
