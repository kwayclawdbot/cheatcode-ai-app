/**
 * GET /api/v1/trade/default
 *
 * "The trade page defaults to a search request vs opening the trading terminal."
 * It does not any more. The Trade tab asks this endpoint ONE question — which
 * chart am I working? — and opens it. There is no state in which Trade is a
 * card asking the user to find a symbol.
 *
 * THE RULES THIS ENDPOINT PLAYS BY
 *   1. Database only. No Polygon call, no snapshot, no grading pass. Three
 *      small indexed reads run in parallel and the answer is assembled in
 *      memory, because the tab is waiting on it with a 700ms budget before it
 *      gives up and opens SPY.
 *   2. It never answers "nothing". SPY is a real, seeded instrument and the
 *      market itself; a brand-new account opens on it rather than on a prompt.
 *   3. It says WHY in one plain sentence, so the portal can tell the user why
 *      it chose this chart instead of leaving them to guess.
 *
 * WHY THE ALERT LOOKUP IS NOT `loadAlertCards`
 * The feed is the right answer to "show me my alerts" and the wrong answer to
 * "name one symbol": it prices every card, loads company profiles, grades
 * setups and writes version snapshots. That is seconds. Here we read the rows
 * and take the newest one whose lifecycle actually puts it on the Active tab —
 * `status='triggered'` (what the tick writes the instant a condition is met) or
 * `tab='active'` (0021's generated column, once a feed read has reconciled it).
 */
import {
  TRADE_DEFAULT_FALLBACK_SYMBOL,
  TradeDefaultResponse,
  type TradeDefaultReason,
} from '@shared/api';
import { authed, ok, type Ctx } from '@/lib/http';
import { serviceClient } from '@/lib/db';
import { alertIdentity } from '@/lib/round4/alert-identity';
import { hasColumns } from '@/lib/round4/schema-probe';

export const dynamic = 'force-dynamic';

/** 0021's `tab` values that mean "this needs you now". */
const ACTIVE_TAB = 'active';

/** How many rows of each kind we look at. The pick is always among the newest. */
const SCAN = 20;

type Pick = {
  symbol: string;
  reason: TradeDefaultReason;
  alertId: string | null;
};

/**
 * The newest alert of the user's that is on the Active tab and names a symbol.
 *
 * `alerts.symbol` and `alerts.tab` arrive with 0021, so both are probed. On a
 * database without them the status alone still identifies a triggered watch and
 * the symbol still comes out of the parsed condition — the same source of truth
 * the feed uses, never a client hint.
 */
async function activeAlert(userId: string): Promise<Pick | null> {
  const db = serviceClient();
  const round4 = await hasColumns('alerts', ['symbol', 'tab']);
  const cols = `id,status,condition,data_dependency,refs,created_at${round4 ? ',symbol,tab' : ''}`;

  const { data, error } = await db
    .from('alerts')
    .select(cols)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(SCAN);
  if (error) return null;

  for (const row of ((data ?? []) as unknown as Record<string, unknown>[])) {
    const status = String(row.status ?? '');
    const onActiveTab = status === 'triggered' || String(row.tab ?? '') === ACTIVE_TAB;
    if (!onActiveTab) continue;
    if (status === 'draft' || status === 'cancelled' || status === 'expired') continue;

    const stored = typeof row.symbol === 'string' && row.symbol.trim() ? row.symbol.trim().toUpperCase() : null;
    const symbol =
      stored ??
      alertIdentity({
        condition: row.condition,
        dataDependency: row.data_dependency,
        refs: (row.refs as { symbol?: string; level?: number } | null) ?? null,
      }).symbol;
    if (!symbol) continue;
    return { symbol, reason: 'alert', alertId: String(row.id) };
  }
  return null;
}

/**
 * An open position, the one that needs attention first.
 *
 * "Needs attention" without a quote is not a guess: a position with no stop has
 * no price at which the user has already decided they were wrong, and that is
 * true whatever the mark is. Everything else falls back to the most recent.
 */
async function openPosition(userId: string): Promise<Pick | null> {
  const db = serviceClient();
  const withStop = await hasColumns('positions', ['stop']);
  const cols = `id,symbol,opened_at${withStop ? ',stop' : ''}`;

  const { data, error } = await db
    .from('positions')
    .select(cols)
    .eq('user_id', userId)
    .is('closed_at', null)
    .order('opened_at', { ascending: false })
    .limit(SCAN);
  if (error) return null;

  const rows = ((data ?? []) as unknown as Record<string, unknown>[]).filter((r) => typeof r.symbol === 'string');
  if (!rows.length) return null;

  const unprotected = withStop ? rows.find((r) => r.stop === null || r.stop === undefined) : undefined;
  const row = unprotected ?? rows[0];
  return { symbol: String(row.symbol).toUpperCase(), reason: 'position', alertId: null };
}

/** The first row of the user's own watchlist. */
async function firstWatchlistRow(userId: string): Promise<Pick | null> {
  const db = serviceClient();
  const { data, error } = await db
    .from('watchlist_items')
    .select('symbol,added_at,watchlists!inner(user_id)')
    .eq('watchlists.user_id', userId)
    .order('added_at', { ascending: true })
    .limit(1);
  if (error) return null;
  const row = ((data ?? []) as unknown as Record<string, unknown>[])[0];
  if (!row || typeof row.symbol !== 'string') return null;
  return { symbol: row.symbol.toUpperCase(), reason: 'watchlist', alertId: null };
}

/**
 * The last symbol the user actually worked. We do not keep a viewing history,
 * so this is the last order they placed — a symbol they demonstrably touched,
 * not one we watched them look at.
 */
async function recentlyWorked(userId: string): Promise<Pick | null> {
  const db = serviceClient();
  const { data, error } = await db
    .from('orders')
    .select('symbol,created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) return null;
  const row = ((data ?? []) as unknown as Record<string, unknown>[])[0];
  if (!row || typeof row.symbol !== 'string') return null;
  return { symbol: row.symbol.toUpperCase(), reason: 'recent', alertId: null };
}

const LABEL: Record<TradeDefaultReason, (s: string) => string> = {
  alert: (s) => `${s} is the alert that needs you, so Trade opens on it.`,
  position: (s) => `You have ${s} open, so Trade opens on it.`,
  watchlist: (s) => `${s} is the first name on your watchlist.`,
  recent: (s) => `${s} is the last one you worked.`,
  fallback: (s) => `Nothing of yours needs a chart yet, so Trade opens on ${s} — the market itself.`,
};

export const GET = authed(async (_req: Request, ctx: Ctx) => {
  // All four reads go out together: the slowest one is the whole latency.
  const [alert, position, watchlist, recent] = await Promise.all([
    activeAlert(ctx.user.id),
    openPosition(ctx.user.id),
    firstWatchlistRow(ctx.user.id),
    recentlyWorked(ctx.user.id),
  ]);

  const pick: Pick =
    alert ??
    position ??
    watchlist ??
    recent ?? { symbol: TRADE_DEFAULT_FALLBACK_SYMBOL, reason: 'fallback', alertId: null };

  return ok(
    TradeDefaultResponse.parse({
      symbol: pick.symbol,
      reason: pick.reason,
      alert_id: pick.alertId,
      ctx: pick.reason === 'alert' ? 'alert' : 'kai',
      label_plain: LABEL[pick.reason](pick.symbol),
    })
  );
});
