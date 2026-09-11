/**
 * KAI'S OWN DESK — the five things this member has already decided, which Kai
 * could not see until now.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE GAP THIS CLOSES
 * ─────────────────────────────────────────────────────────────────────────────
 * `tools.ts` gave Kai the outside world: a price, a chart, a company, the
 * engine's graded rows. Every one of those is a fact about the MARKET. Not one
 * of them is a fact about the person he is talking to.
 *
 * So the app arrived at a Kai who could tell you where NVDA's previous day's
 * high was and could not tell you that you are long it. Ask "how am I doing?"
 * and he had the account balance in his context and nothing to attribute it to.
 * Ask "should I add to my position?" and the word *my* referred to something he
 * had no way of reading. Ask "what am I watching?" — a list the member built,
 * stored under their own id, one table away — and he would answer from the
 * ranked scanner rows, which are not their watchlist and never were.
 *
 * The member kept telling him things by building them in the app. He was the
 * only one not reading them.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EVERY TOOL HERE IS AN ADAPTER, NOT A SECOND IMPLEMENTATION
 * ─────────────────────────────────────────────────────────────────────────────
 * Each one reads through the SAME loader the matching endpoint uses —
 * `watchlistItems`, `loadOpenPositions`, `PLAN_COLUMNS`, the alerts row shaper.
 * That is the whole design rule. A tool that re-queried `positions` with its own
 * column list would eventually disagree with the Trade tab about what the
 * member's stop is, and being told two different stops by two parts of one app
 * is worse than being told none.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SCOPE: THIS MEMBER, ALWAYS
 * ─────────────────────────────────────────────────────────────────────────────
 * Every query below is keyed on `ctx.userId`, which comes from the authenticated
 * request and never from the model. There is no tool input anywhere in this file
 * that names a user, so there is no argument Kai can produce — or be talked into
 * producing by something he read — that reaches another person's rows.
 *
 * AND IT STILL EXECUTES NOTHING. These are five reads. No tool here creates a
 * plan, arms an alert, sizes an order or closes a position; the hard boundary in
 * the system prompt is a statement about the tool table, and the tool table is
 * this file plus its neighbours.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { serviceClient } from '../db';
import { watchlistItems } from '../watchlist-view';
import { loadOpenPositions } from '../execution/positions-view';
import { PLAN_COLUMNS } from '../execution/plans';
import { normalizeTargets } from './context';
import type { ToolCtx, ToolResult } from './tool-kit';
import { NOT_FOUND, sym } from './tool-kit';

/* ------------------------------------------------------------------ */
/* The definitions the model sees                                      */
/* ------------------------------------------------------------------ */

/**
 * Each description says WHEN TO CALL and, more importantly, what the answer is
 * NOT. "Your watchlist" and "the setups in your context" are different lists
 * that often overlap, and a model told only the first will happily conflate
 * them.
 */
export const DESK_TOOLS: Anthropic.Tool[] = [
  {
    name: 'read_watchlist',
    description:
      'Read the symbols THIS user put on their own watchlist, with the current price of each and whether ' +
      'the engine has a graded setup on it. Call this whenever they say "my list", "what am I watching", ' +
      '"my watchlist", or ask you to compare the things they follow. This is NOT the ranked setup list in ' +
      'your context — that is what the engine surfaced, this is what they chose. Never answer a question ' +
      'about their watchlist from the ranked list.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    strict: true,
  },
  {
    name: 'read_positions',
    description:
      'Read the trades this user actually has on — symbol, direction, size, average cost, the current ' +
      'mark, unrealised P&L, and the stop and target from the plan it came from. Pass status "open" for ' +
      'what they are holding now and "closed" for trades that are finished. Call this for any question ' +
      'with "my" or "I" in it about a trade: am I long, how am I doing, should I add, where is my stop. ' +
      'These are PAPER positions — no real money — and you say so when it matters. You can read them; ' +
      'you cannot close, size or modify one.',
    input_schema: {
      type: 'object',
      properties: {
        status: {
          type: ['string', 'null'],
          description: '"open" for current holdings, "closed" for finished trades. Null means open.',
        },
      },
      required: ['status'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'read_plans',
    description:
      'Read the trade plans this user has written down — the symbol, the direction, the entry condition, ' +
      'the stop, the targets, the size the server worked out from their own risk policy, and whether the ' +
      'plan is still a draft or is armed and waiting. Call this when they ask about "my plan", what they ' +
      'were going to do on a symbol, or why a plan has not filled. A draft plan is written down and ' +
      'nothing is watching it; say which it is rather than implying it is live.',
    input_schema: {
      type: 'object',
      properties: {
        symbol: { type: ['string', 'null'], description: 'Limit to one ticker, or null for their recent plans.' },
      },
      required: ['symbol'],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: 'read_alerts',
    description:
      'Read what this user has asked you to watch for them, and the state each one is in: draft, armed, ' +
      'already triggered, expired or cancelled. Call this when they ask what you are watching, whether ' +
      'an alert fired, or why they did not hear about something. Report the state honestly — an armed ' +
      'alert with no live feed behind it is armed, not watching, and the result says which.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    strict: true,
  },
  {
    name: 'read_trade_reviews',
    description:
      'Read the write-ups of this user\'s finished trades — what the outcome was, what worked, what did ' +
      'not, and the lesson that came out of it. Call this when they ask how they have been doing, what ' +
      'they keep getting wrong, or whether a situation is like one they have been in before. Use it to ' +
      'be specific about their OWN history instead of generic about trading.',
    input_schema: {
      type: 'object',
      properties: {
        symbol: { type: ['string', 'null'], description: 'Limit to one ticker, or null for the most recent.' },
      },
      required: ['symbol'],
      additionalProperties: false,
    },
    strict: true,
  },
];

/* ------------------------------------------------------------------ */
/* Running one                                                         */
/* ------------------------------------------------------------------ */

/** Nothing here is ever more than this many rows. A tool result is a hand, not a file. */
const CAP = 12;

/**
 * WHAT THEY CHOSE TO FOLLOW.
 *
 * Straight through `watchlistItems`, which is the same function `GET /watchlist`
 * and the Trade landing page call — so the price Kai quotes for a watchlist
 * symbol is the price on the row the member is looking at, resolved by the same
 * resolver, labelled with the same freshness.
 */
async function readWatchlist(ctx: ToolCtx): Promise<ToolResult> {
  const wl = await watchlistItems(ctx.userId, ctx.requestId);
  if (wl.missing) {
    return NOT_FOUND('I could not reach their watchlist just now, so I do not know what is on it.');
  }
  if (!wl.items.length) {
    return {
      found: false,
      plain: 'Their watchlist is empty — they have not added anything yet. That is a real answer, not a lookup failure.',
    };
  }
  return {
    found: true,
    list_name: wl.name,
    count: wl.items.length,
    symbols: wl.items.slice(0, CAP).map((i) => ({
      symbol: i.symbol,
      company: i.name,
      their_note: i.note,
      added: i.added_at,
      price: i.quote?.price ?? null,
      how_fresh_plain: i.quote?.label_plain ?? null,
      graded_setup: i.grade_display ?? null,
      setup_state: i.state ?? null,
    })),
    must_say:
      'This is THEIR list. A symbol on it with no graded setup has no entry, stop or target, and watching ' +
      'something is not a reason to trade it.',
    ...(wl.degraded ? { prices_degraded: true, degraded_reason: wl.degraded_reason } : {}),
  };
}

/**
 * WHAT THEY ARE ACTUALLY IN.
 *
 * `loadOpenPositions` already does the hard part: it marks each row, labels the
 * mark's freshness, carries the plan's stop and target onto the position, and
 * decides health AGAINST THE PLAN rather than against the P&L — a green position
 * sitting on its stop is at risk and a red one with room is not broken. All of
 * that is re-used rather than re-derived, so Kai's read of a position and the
 * Trade tab's read are one read.
 */
async function readPositions(input: Record<string, unknown>, ctx: ToolCtx): Promise<ToolResult> {
  const wantClosed = String(input.status ?? '').trim().toLowerCase() === 'closed';
  const loaded = await loadOpenPositions({ userId: ctx.userId, closed: wantClosed });
  if (!loaded.rows.length) {
    return {
      found: false,
      plain: wantClosed
        ? 'They have no finished trades yet.'
        : 'They have no open positions right now. Say that plainly — do not talk about a trade they are not in.',
    };
  }
  return {
    found: true,
    status: wantClosed ? 'closed' : 'open',
    count: loaded.rows.length,
    positions: loaded.rows.slice(0, CAP).map((p) => ({
      symbol: p.symbol,
      direction: p.direction,
      shares: p.qty,
      average_cost: p.avg_cost,
      mark_price: p.mark_price,
      how_fresh_plain: p.mark_freshness,
      unrealized_pnl: p.unrealized_pnl,
      unrealized_pct: p.unrealized_pct,
      stop: p.stop,
      target: p.target,
      health: p.health,
      health_plain: p.health_plain,
      exit_style: p.exit_style,
      opened_at: p.opened_at,
      // A fixture trade must never be discussed as something they lived through.
      simulated: p.simulated,
    })),
    must_say:
      'These are PAPER positions — no real money moved. You may read them and talk about them; you cannot ' +
      'close, resize or modify one. Any exit is something they do themselves.',
    ...(loaded.degraded ? { marks_degraded: true, degraded_reason: loaded.degraded_reason } : {}),
  };
}

/**
 * WHAT THEY MEANT TO DO — which is not the same as what they did.
 *
 * The status is the whole point of this tool. `draft` means written down and
 * nothing is watching it; `active` means armed. Kai answering "why didn't my
 * plan fill?" needs to be able to say "because it was never armed", and that
 * sentence is only available if the status travels with the row.
 */
async function readPlans(input: Record<string, unknown>, ctx: ToolCtx): Promise<ToolResult> {
  const symbol = sym(input.symbol);
  const db = serviceClient();
  let q = db
    .from('plans')
    .select(PLAN_COLUMNS)
    .eq('user_id', ctx.userId)
    .order('created_at', { ascending: false })
    .limit(CAP);
  if (symbol) q = q.eq('symbol', symbol);

  const { data, error } = await q;
  if (error) return NOT_FOUND('I could not read their plans just now.');
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  if (!rows.length) {
    return {
      found: false,
      plain: symbol
        ? `They have no written plan for ${symbol}.`
        : 'They have not written down any trade plans yet.',
    };
  }
  return {
    found: true,
    count: rows.length,
    plans: rows.map((r) => ({
      plan_id: String(r.id),
      symbol: r.symbol,
      direction: r.intent,
      status: r.status,
      armed: r.status === 'active',
      entry_condition: r.entry_condition ?? null,
      stop: r.stop ?? null,
      targets: normalizeTargets(r.targets),
      invalidation: r.invalidation ?? null,
      size: r.size ?? null,
      exit_style: r.exit_style ?? null,
      from_setup: r.setup_id ? String(r.setup_id) : null,
      written: r.created_at,
    })),
    must_say:
      'A plan with status "draft" is written down and NOTHING is watching it — it cannot fill. Only an ' +
      'active plan is armed. Say which one a plan is rather than letting them assume.',
  };
}

/**
 * WHAT THEY ASKED YOU TO WATCH — and the honest state of each one.
 *
 * `armed` is not `watching`. There is no alert-evaluation worker in this
 * release, so an active alert is armed with no feed behind it, and the app
 * already says so on the card (`MONITORING_PLAIN`). Kai reads the same sentence
 * off the same mapping rather than composing a cheerier one.
 */
async function readAlerts(ctx: ToolCtx): Promise<ToolResult> {
  const db = serviceClient();
  const { data, error } = await db
    .from('alerts')
    .select('id,status,natural_language,condition,expires_at,refs,created_at')
    .eq('user_id', ctx.userId)
    .order('created_at', { ascending: false })
    .limit(CAP);
  if (error) return NOT_FOUND('I could not read their alerts just now.');
  const rows = (data ?? []) as Record<string, unknown>[];
  if (!rows.length) {
    return { found: false, plain: 'They have not asked you to watch anything yet.' };
  }
  // Imported lazily to keep this module free of the alerts route's own shape
  // helpers at load time; the mapping itself is the route's, not a copy.
  const { monitoringFor } = await import('../../app/api/v1/alerts/shape');
  return {
    found: true,
    count: rows.length,
    alerts: rows.map((r) => {
      const m = monitoringFor(String(r.status) as never);
      return {
        alert_id: String(r.id),
        what_they_asked_for: (r.natural_language as string) ?? null,
        condition: r.condition ?? null,
        status: r.status,
        monitoring: m.monitoring,
        monitoring_plain: m.plain,
        expires: (r.expires_at as string) ?? null,
        created: r.created_at,
      };
    }),
    must_say:
      'Repeat the monitoring sentence as it is written. An armed alert with no live feed behind it is ' +
      'armed, not watching, and telling them otherwise is a promise the system cannot keep.',
  };
}

/**
 * THEIR OWN HISTORY, IN THEIR OWN WORDS.
 *
 * The lesson on a write-up is the single most useful sentence Kai can have about
 * a person, and it is the one the "Saved to what Kai remembers" button copies
 * into memory. This tool is how he reaches the ones they never saved — the whole
 * record rather than the bookmarked part of it.
 *
 * Note what is NOT projected: `process_review.payload` in full. A debrief
 * payload carries sizes and P&L and Kai already has the account; what he needs
 * here is the outcome and the lesson, and a tool that hands over everything
 * teaches the model to quote from a blob it did not read carefully.
 */
async function readTradeReviews(input: Record<string, unknown>, ctx: ToolCtx): Promise<ToolResult> {
  const symbol = sym(input.symbol);
  const db = serviceClient();
  const { data, error } = await db
    .from('debriefs')
    .select('id,position_id,outcome,process_review,kai_summary,created_at')
    .eq('user_id', ctx.userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return NOT_FOUND('I could not read their trade write-ups just now.');

  const rows = (data ?? []) as Record<string, unknown>[];
  const reviews = rows
    .map((r) => {
      const payload = ((r.process_review as Record<string, unknown>)?.payload ?? null) as Record<
        string,
        unknown
      > | null;
      return {
        review_id: String(r.id),
        symbol: (payload?.symbol as string) ?? null,
        outcome: r.outcome ?? null,
        what_worked: (payload?.what_worked as unknown) ?? null,
        what_failed: (payload?.what_failed as unknown) ?? null,
        lesson: (r.kai_summary as string) ?? (payload?.lesson_plain as string) ?? null,
        written: r.created_at,
      };
    })
    .filter((r) => !symbol || r.symbol === symbol)
    .slice(0, CAP);

  if (!reviews.length) {
    return {
      found: false,
      plain: symbol
        ? `They have no write-up of a ${symbol} trade.`
        : 'They have no trade write-ups yet, so there is no history of their own for you to draw on.',
    };
  }
  return {
    found: true,
    count: reviews.length,
    reviews,
    must_say:
      'These are their own finished trades. Be specific about what happened rather than general about ' +
      'trading, and do not congratulate — this product has no gamification.',
  };
}

export async function runDeskTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolCtx
): Promise<ToolResult | null> {
  switch (name) {
    case 'read_watchlist': return readWatchlist(ctx);
    case 'read_positions': return readPositions(input, ctx);
    case 'read_plans': return readPlans(input, ctx);
    case 'read_alerts': return readAlerts(ctx);
    case 'read_trade_reviews': return readTradeReviews(input, ctx);
    default: return null;
  }
}
