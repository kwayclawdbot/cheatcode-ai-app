/**
 * GET /api/v1/trade/landing?mode=
 *
 * Round 3 re-orders this to the brokerage hierarchy the audit demands (§7),
 * because until execution existed Trade read as another research destination:
 *   1. account value · day change · buying power · PAPER
 *   2. positions · open orders · what needs action
 *   3. watchlist · recent symbols
 *   4. search · discovery
 *   5. Kai's opportunities — clearly labeled, LAST, not the whole page
 *
 * Everything here is real now. The round-2 keys (`account_strip`,
 * `positions_snapshot`, `pending_orders`, `continue`, `markets`) are still
 * present and still correct, so this payload is a superset.
 */
import type { NextRequest } from 'next/server';
import {
  TradeLandingQuery,
  TradeLandingV5Response,
  SETUP_CAPS,
  PAPER_ACCOUNT_PLAIN,
  PAPER_FILL_PLAIN,
  type Mover,
  type ContinueItem,
  type NeedsActionItem,
  type RecentSymbol,
} from '@shared/api';
import { authed, ok, parseQuery, type Ctx } from '@/lib/http';
import { serviceClient } from '@/lib/db';
import { marketBlock, marketDate } from '@/lib/market';
import { getSnapshot } from '@/lib/market/polygon';
import { loadProfile, loadRiskPolicy, rankedSetups } from '@/lib/kai/context';
import { watchlistItems } from '@/lib/watchlist-view';
import { ORDER_COLUMNS, fillsFor, loadPaperAccount, orderEvents } from '@/lib/execution/engine';
import { toOrderRow } from '@/lib/execution/shape';
import { loadOpenPositions } from '@/lib/execution/positions-view';
import { dailyRisk } from '@/lib/execution/risk';
import { round2 } from '@/lib/execution/paper';
import { ensureDevTicker } from '@/lib/execution/tick-dev';
import { toCard } from '../../setups/route';

export const dynamic = 'force-dynamic';

const MOVERS_CAP = 5;
const UNIVERSE_FALLBACK = ['SPY', 'QQQ', 'META', 'NVDA', 'AAPL', 'TSLA', 'AMD', 'CRM', 'MSFT', 'AMZN'];

const NOTICES = [
  'Practice money only. Nothing here touches a real account.',
  'Sectors and the economic calendar arrive with the market worker.',
];

async function universe(mode: string): Promise<string[]> {
  const db = serviceClient();
  const { data } = await db.from('scan_universes').select('symbols').eq('name', mode).maybeSingle();
  const syms = (data as Record<string, unknown> | null)?.symbols;
  return Array.isArray(syms) && syms.length ? (syms as string[]) : UNIVERSE_FALLBACK;
}

export const GET = authed(async (req: NextRequest, ctx: Ctx) => {
  ensureDevTicker();
  const q = parseQuery(req, TradeLandingQuery);
  const db = serviceClient();
  const profile = await loadProfile(ctx.user.id);
  const mode = q.mode ?? profile.primary_mode;

  const [account, risk, setups, wl, syms, drafts, positions, paperAccount, ordersRes, debriefsRes] =
    await Promise.all([
      db
        .from('accounts')
        .select('id,name,cash,buying_power,equity,starting_balance')
        .eq('user_id', ctx.user.id)
        .eq('kind', 'paper')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle(),
      loadRiskPolicy(ctx.user.id),
      rankedSetups(mode, SETUP_CAPS[mode]),
      watchlistItems(ctx.user.id, ctx.requestId),
      universe(mode),
      db
        .from('alerts')
        .select('id,status,natural_language,refs,created_at')
        .eq('user_id', ctx.user.id)
        .in('status', ['draft', 'triggered'])
        .order('created_at', { ascending: false })
        .limit(10),
      loadOpenPositions({ userId: ctx.user.id }),
      loadPaperAccount(ctx.user.id),
      db
        .from('orders')
        .select(ORDER_COLUMNS)
        .eq('user_id', ctx.user.id)
        .in('status', ['submitted', 'accepted', 'partially_filled'])
        .order('created_at', { ascending: false })
        .limit(50),
      db
        .from('positions')
        .select('id,symbol,closed_at,realized_pnl')
        .eq('user_id', ctx.user.id)
        .not('closed_at', 'is', null)
        .order('closed_at', { ascending: false })
        .limit(10),
    ]);

  // Movers: real closes for the mode's universe, ranked by the size of the move.
  const snap = await getSnapshot(syms.slice(0, 20));
  const movers: Mover[] = snap.quotes
    .filter((qq) => qq.change_pct !== null)
    .sort((a, b) => Math.abs(b.change_pct ?? 0) - Math.abs(a.change_pct ?? 0))
    .slice(0, MOVERS_CAP)
    .map((qq) => ({
      symbol: qq.symbol,
      name: null,
      quote: qq,
      direction: (qq.change_pct ?? 0) >= 0 ? ('up' as const) : ('down' as const),
    }));

  const acc = account.data as Record<string, unknown> | null;
  const equity = paperAccount?.equity ?? (acc ? Number(acc.equity ?? acc.cash ?? 0) : null);

  // Orders, with their fills and events so `accepted` never reads as filled.
  const orderRows = (ordersRes.data ?? []) as Record<string, unknown>[];
  const orderIds = orderRows.map((r) => String(r.id));
  const [fills, events] = await Promise.all([fillsFor(orderIds), orderEvents(orderIds)]);
  const openOrders = orderRows.map((r) => toOrderRow(r, fills, events));

  const dailyRiskBlock = await dailyRisk(ctx.user.id, risk?.daily_loss_cap_usd ?? null);

  // The day change on a paper account is the unrealised move on what is open
  // plus what was realised today. Nothing is modelled — both come from rows.
  const unrealized = round2(positions.rows.reduce((a, p) => a + (p.unrealized_pnl ?? 0), 0));
  const todayStart = `${marketDate()}T00:00:00Z`;
  const realizedToday = round2(
    ((debriefsRes.data ?? []) as Record<string, unknown>[])
      .filter((r) => String(r.closed_at ?? '') >= todayStart)
      .reduce((a, r) => a + Number(r.realized_pnl ?? 0), 0)
  );
  const dayChange = round2(unrealized + realizedToday);
  const dayChangePct = equity && equity !== 0 ? round2((dayChange / equity) * 100) : null;

  const continueItems: ContinueItem[] = [
    ...((drafts.data ?? []) as Record<string, unknown>[]).map((a) => {
      const triggered = String(a.status) === 'triggered';
      const refs = (a.refs as Record<string, unknown>) ?? {};
      return {
        kind: triggered ? ('triggered_alert' as const) : ('alert_draft' as const),
        id: String(a.id),
        symbol: typeof refs.symbol === 'string' ? refs.symbol : null,
        label: triggered ? 'Review' : 'Activate',
        plain: triggered
          ? `${a.natural_language ?? 'A watch'} — this hit.`
          : `${a.natural_language ?? 'A watch'} — drafted, not armed yet.`,
        route: `/alert/${a.id}`,
      };
    }),
    ...setups
      .filter((s) => s.state === 'ready')
      .map((s) => ({
        kind: 'followed_setup' as const,
        id: s.id,
        symbol: s.symbol,
        label: 'Open setup',
        plain: `${s.symbol} has met everything I defined. Your move.`,
        route: `/symbol/${s.symbol}?tab=overview&setup=${s.id}`,
      })),
  ].slice(0, 8);

  // What actually needs the user, in the order it needs them.
  const needsAction: NeedsActionItem[] = [
    ...positions.rows
      .filter((p) => p.health === 'at_risk')
      .map((p) => ({
        kind: 'position' as const,
        id: p.id,
        symbol: p.symbol,
        headline: `${p.symbol} is testing your exit level`,
        plain: p.health_plain,
        route: p.route,
        action_label: 'Manage',
      })),
    ...positions.rows
      .filter((p) => p.stop === null)
      .map((p) => ({
        kind: 'position' as const,
        id: p.id,
        symbol: p.symbol,
        headline: `${p.symbol} has no exit level`,
        plain: 'There is no price at which you have already decided you were wrong on this one.',
        route: p.route,
        action_label: 'Set an exit',
      })),
    ...((drafts.data ?? []) as Record<string, unknown>[])
      .filter((a) => String(a.status) === 'triggered')
      .map((a) => {
        const refs = (a.refs as Record<string, unknown>) ?? {};
        return {
          kind: 'alert' as const,
          id: String(a.id),
          symbol: typeof refs.symbol === 'string' ? refs.symbol : null,
          headline: 'A watch you set hit',
          plain: String(a.natural_language ?? 'A condition you set has happened.'),
          route: `/alert/${a.id}`,
          action_label: 'Review',
        };
      }),
    ...((debriefsRes.data ?? []) as Record<string, unknown>[]).slice(0, 3).map((p) => ({
      kind: 'debrief' as const,
      id: String(p.id),
      symbol: String(p.symbol),
      headline: `${String(p.symbol)} is closed`,
      plain: 'Kai can write up what happened while it is still fresh.',
      route: `/position/${String(p.id)}`,
      action_label: "Get the debrief",
    })),
  ].slice(0, 8);

  // "Recent" is what the user actually touched — positions, orders and plans —
  // not a viewing history we do not keep.
  const recentSeen = new Set<string>();
  const recent: RecentSymbol[] = [];
  for (const p of positions.rows) {
    if (recentSeen.has(p.symbol)) continue;
    recentSeen.add(p.symbol);
    recent.push({
      symbol: p.symbol,
      name: null,
      quote: null,
      reason_plain: 'You hold this one.',
      route: `/symbol/${p.symbol}`,
    });
  }
  for (const o of openOrders) {
    if (recentSeen.has(o.symbol)) continue;
    recentSeen.add(o.symbol);
    recent.push({
      symbol: o.symbol,
      name: null,
      quote: null,
      reason_plain: 'You have an order working on this one.',
      route: `/symbol/${o.symbol}`,
    });
  }
  for (const s of setups) {
    if (recent.length >= 6 || recentSeen.has(s.symbol)) continue;
    recentSeen.add(s.symbol);
    recent.push({
      symbol: s.symbol,
      name: null,
      quote: null,
      reason_plain: 'Kai is watching this one for you.',
      route: `/symbol/${s.symbol}`,
    });
  }

  // Recent rows are priced from the SAME grouped snapshot the watchlist and the
  // movers strip use. They were shipping `quote:null`, so a symbol the user
  // actually holds rendered as "No quote yet" two rows under its own position.
  const recentTop = recent.slice(0, 6);
  const quoteBy = new Map(snap.quotes.map((qq) => [qq.symbol, qq]));
  const unpriced = recentTop.map((r) => r.symbol).filter((sym) => !quoteBy.has(sym));
  let recentDegraded = false;
  let recentDegradedReason: string | null = null;
  if (unpriced.length) {
    const extra = await getSnapshot(unpriced);
    for (const qq of extra.quotes) quoteBy.set(qq.symbol, qq);
    recentDegraded = extra.degraded;
    recentDegradedReason = extra.degraded_reason;
  }
  for (const r of recentTop) r.quote = quoteBy.get(r.symbol) ?? null;

  return ok(
    TradeLandingV5Response.parse({
      mode,
      market: marketBlock(),
      // round-2 keys
      account_strip: {
        account_id: acc ? String(acc.id) : null,
        kind: 'paper',
        label: 'PAPER',
        equity,
        cash: paperAccount?.cash ?? (acc ? Number(acc.cash ?? 0) : null),
        buying_power: paperAccount?.buying_power ?? (acc ? Number(acc.buying_power ?? 0) : null),
        currency: 'USD',
        plain: acc ? PAPER_ACCOUNT_PLAIN : 'Your paper account is still being set up.',
      },
      search_ctx: {
        placeholder: 'Search a symbol, or ask me anything',
        examples: ['META', 'Tesla', 'what is a breakout?'],
      },
      watchlists: [{ id: wl.id, name: wl.name, items: wl.items }],
      markets: { movers, sectors: [], calendar: [] },
      positions_snapshot: {
        open: positions.rows,
        plain: positions.rows.length
          ? `${positions.rows.length} position${positions.rows.length === 1 ? '' : 's'} open, ${unrealized >= 0 ? 'up' : 'down'} $${Math.abs(unrealized)} on paper.`
          : 'Nothing open. Everything you have is in cash.',
      },
      pending_orders: openOrders,
      continue: continueItems,
      kai_opportunities: setups.map((s) => toCard(s, risk, mode)),
      catalysts: [],
      notices: NOTICES,

      // ---- V5 hierarchy ---------------------------------------------------
      account: {
        account_id: acc ? String(acc.id) : null,
        kind: 'paper',
        label: 'PAPER',
        value: equity,
        day_change: dayChange,
        day_change_pct: dayChangePct,
        buying_power: paperAccount?.buying_power ?? (acc ? Number(acc.buying_power ?? 0) : null),
        cash: paperAccount?.cash ?? (acc ? Number(acc.cash ?? 0) : null),
        currency: 'USD',
        plain: acc ? PAPER_ACCOUNT_PLAIN : 'Your paper account is still being set up.',
      },
      positions: positions.rows,
      open_orders: openOrders,
      needs_action: needsAction,
      watchlist: wl.items,
      recent: recentTop,
      discovery: { movers, catalysts: [] },
      daily_risk: {
        cap: dailyRiskBlock.cap,
        used: dailyRiskBlock.used,
        remaining: dailyRiskBlock.remaining,
        currency: 'USD',
      },
      paper_plain: PAPER_FILL_PLAIN,
      degraded: snap.degraded || wl.degraded || positions.degraded || recentDegraded,
      degraded_reason:
        snap.degraded_reason ?? wl.degraded_reason ?? positions.degraded_reason ?? recentDegradedReason,
    })
  );
});
