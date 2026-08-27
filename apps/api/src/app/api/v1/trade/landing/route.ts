/**
 * GET /api/v1/trade/landing?mode=
 *
 * The brokerage-led surface (02 §2, 06 §3): familiar regions first — account,
 * search, watchlists, markets — with Kai's opportunities as a clearly labeled
 * section rather than the whole page.
 *
 * What is real here: the paper account, the watchlist with live delayed prices,
 * the movers (computed from real closes across the seed universe), the ranked
 * setups, and the unfinished decisions in Continue. What is not real yet says
 * so in `notices` instead of rendering an empty box that looks broken:
 * positions, pending orders, sectors and the calendar all arrive with paper
 * trading and the market worker.
 */
import type { NextRequest } from 'next/server';
import { TradeLandingQuery, TradeLandingResponse, SETUP_CAPS, type Mover, type ContinueItem } from '@shared/api';
import { authed, ok, parseQuery, type Ctx } from '@/lib/http';
import { serviceClient } from '@/lib/db';
import { marketBlock } from '@/lib/market';
import { getSnapshot } from '@/lib/market/polygon';
import { loadProfile, loadRiskPolicy, rankedSetups } from '@/lib/kai/context';
import { watchlistItems } from '@/lib/watchlist-view';
import { toCard } from '../../setups/route';

export const dynamic = 'force-dynamic';

const MOVERS_CAP = 5;
const UNIVERSE_FALLBACK = ['SPY', 'QQQ', 'META', 'NVDA', 'AAPL', 'TSLA', 'AMD', 'CRM', 'MSFT', 'AMZN'];

const NOTICES = [
  'Positions and orders arrive with paper trading.',
  'Sectors and the economic calendar arrive with the market worker.',
];

async function universe(mode: string): Promise<string[]> {
  const db = serviceClient();
  const { data } = await db.from('scan_universes').select('symbols').eq('name', mode).maybeSingle();
  const syms = (data as Record<string, unknown> | null)?.symbols;
  return Array.isArray(syms) && syms.length ? (syms as string[]) : UNIVERSE_FALLBACK;
}

export const GET = authed(async (req: NextRequest, ctx: Ctx) => {
  const q = parseQuery(req, TradeLandingQuery);
  const db = serviceClient();
  const profile = await loadProfile(ctx.user.id);
  const mode = q.mode ?? profile.primary_mode;

  const [account, risk, setups, wl, syms, drafts] = await Promise.all([
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
  const equity = acc ? Number(acc.equity ?? acc.cash ?? 0) : null;

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
        route: `/setup/${s.id}`,
      })),
  ].slice(0, 8);

  return ok(
    TradeLandingResponse.parse({
      mode,
      market: marketBlock(),
      account_strip: {
        account_id: acc ? String(acc.id) : null,
        kind: 'paper',
        label: 'PAPER',
        equity,
        cash: acc ? Number(acc.cash ?? 0) : null,
        buying_power: acc ? Number(acc.buying_power ?? 0) : null,
        currency: 'USD',
        plain: acc
          ? `Practice money only. Nothing here touches a real account.`
          : 'Your paper account is still being set up.',
      },
      search_ctx: {
        placeholder: 'Search a symbol, or ask me anything',
        examples: ['META', 'Tesla', 'what is a breakout?'],
      },
      watchlists: [{ id: wl.id, name: wl.name, items: wl.items }],
      markets: { movers, sectors: [], calendar: [] },
      positions_snapshot: {
        open: [],
        plain: 'No open positions — paper trading arrives next.',
      },
      pending_orders: [],
      continue: continueItems,
      kai_opportunities: setups.map((s) => toCard(s, risk, mode)),
      catalysts: [],
      notices: NOTICES,
      degraded: snap.degraded || wl.degraded,
      degraded_reason: snap.degraded_reason ?? wl.degraded_reason,
    })
  );
});
