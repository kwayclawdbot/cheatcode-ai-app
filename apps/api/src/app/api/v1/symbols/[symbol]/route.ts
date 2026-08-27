/**
 * GET /api/v1/symbols/:symbol?mode=
 *
 * The symbol page (02 §2, 06 §4): quote header, chart config with the setup's
 * levels as SEMANTIC annotations, one lens per mode, Kai's interpretation, the
 * user's own context, timestamped evidence, and the actions that are honestly
 * available.
 *
 * Three deliberate refusals:
 *   - No bid/ask. There is no level-1 feed on this plan, so the fields are
 *     absent rather than filled with a last-trade price pretending to be a book.
 *   - No Buy/Sell. Paper orders are a later round; the client shows them
 *     disabled with the reason.
 *   - No community sentiment. `thread_summary` and `sentiment` are null until
 *     rooms actually carry the discussion — an invented number here would be
 *     exactly the "popularity as evidence" failure 08 §6 prohibits.
 */
import type { NextRequest } from 'next/server';
import {
  SymbolDetailQuery,
  SymbolDetailResponse,
  type ChartAnnotation,
  type ModeLens,
  type AppMode,
  type UiAction,
} from '@shared/api';
import { authedParams, ok, parseQuery, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { serviceClient } from '@/lib/db';
import { marketBlock } from '@/lib/market';
import { getQuote, getNews, polygonConfigured } from '@/lib/market/polygon';
import { loadProfile, type SetupRow } from '@/lib/kai/context';
import { derivedEnvelope } from '@/lib/kai/objects';
import { levels, isLong, buildConfirmations } from '@/lib/setups';
import { listWatchlist } from '@/lib/watchlist';
import { alertRow } from '../../alerts/shape';

export const dynamic = 'force-dynamic';

const MODES: AppMode[] = ['day_trade', 'swing', 'invest'];
const TIMEFRAMES = ['1D', '5D', '1M', '3M', 'YTD', '1Y'];

const SETUP_COLUMNS =
  'id,symbol,mode,intent,state,score,grade_band,grade_display,score_components,thesis_plain,thesis_technical,entry_condition,invalidation,stop,targets,catalyst,quote_snapshot,valid_until,scanner_run_id,discussion_room_id';

function annotationsFor(row: SetupRow | null): ChartAnnotation[] {
  if (!row) return [];
  const { entry, stop, targets } = levels(row);
  const out: ChartAnnotation[] = [];
  if (entry !== null) out.push({ kind: 'level', price: entry, text: 'Entry', semantic: 'entry' });
  if (stop !== null) {
    out.push({ kind: 'level', price: stop, text: 'Invalidation', semantic: 'invalidation' });
    out.push({ kind: 'level', price: stop, text: 'Stop', semantic: 'stop' });
  }
  for (const t of targets) {
    out.push({ kind: 'level', price: t.price, text: t.label ?? 'Target', semantic: 'target' });
  }
  return out;
}

function lensFor(mode: AppMode, row: SetupRow | null): ModeLens {
  const label = mode.replace('_', ' ');
  if (!row) {
    return {
      mode,
      has_setup: false,
      setup_id: null,
      state: null,
      grade_display: null,
      headline_plain: `No active ${label} setup here right now.`,
      detail_plain: `I am not seeing anything worth trading on the ${label} timeframe. That is a normal answer, not a missing one.`,
      next_action: null,
    };
  }
  const { entry, stop } = levels(row);
  const long = isLong(row.intent);
  return {
    mode,
    has_setup: true,
    setup_id: row.id,
    state: row.state as ModeLens['state'],
    grade_display: row.grade_display,
    headline_plain: row.thesis_plain ?? `A ${label} setup is live here.`,
    detail_plain: [
      entry !== null ? `It triggers ${long ? 'above' : 'below'} $${entry}.` : null,
      stop !== null ? `It fails ${long ? 'below' : 'above'} $${stop}.` : null,
      `Right now it is ${row.state}.`,
    ]
      .filter(Boolean)
      .join(' '),
    next_action: {
      action: 'open_setup',
      label: 'Open setup',
      enabled: true,
      hint: null,
      primary: true,
      route: `/setup/${row.id}`,
    },
  };
}

export const GET = authedParams<{ symbol: string }>(
  async (req: NextRequest, ctx: Ctx & { params: { symbol: string } }) => {
    const q = parseQuery(req, SymbolDetailQuery);
    const symbol = ctx.params.symbol.toUpperCase();
    const db = serviceClient();

    const instrument = await db
      .from('instruments')
      .select('symbol,name')
      .eq('symbol', symbol)
      .maybeSingle();
    if (!instrument.data) {
      throw new ApiError('NOT_FOUND', `I do not follow ${symbol} yet, so I have nothing to show you here.`);
    }

    const profile = await loadProfile(ctx.user.id);
    const mode = q.mode ?? profile.primary_mode;

    const [quote, setupsRes, alertsRes, wl, newsRes] = await Promise.all([
      getQuote(symbol),
      db
        .from('setups')
        .select(SETUP_COLUMNS)
        .eq('symbol', symbol)
        .in('state', ['discovered', 'watching', 'forming', 'ready', 'invalidated'])
        .order('score', { ascending: false, nullsFirst: false }),
      db
        .from('alerts')
        .select('id,status,natural_language,condition,data_dependency,frequency,expires_at,refs,created_at')
        .eq('user_id', ctx.user.id)
        .in('status', ['draft', 'active', 'paused', 'triggered'])
        .contains('refs', { symbol } as never),
      listWatchlist(ctx.user.id, ctx.requestId),
      getNews(symbol, 5),
    ]);

    const rows = (setupsRes.data ?? []) as unknown as SetupRow[];
    const byMode = new Map<AppMode, SetupRow>();
    for (const r of rows) if (!byMode.has(r.mode)) byMode.set(r.mode, r);
    const current = byMode.get(mode) ?? null;

    const lenses = MODES.map((m) => lensFor(m, byMode.get(m) ?? null));

    // Kai's interpretation comes from the setup when there is one. When there is
    // not, we say there is not — we do not spend a model call inventing a view.
    const interpretation = current
      ? {
          conclusion_plain: current.thesis_plain ?? `I have a ${current.state} setup on ${symbol}.`,
          state: current.state as ModeLens['state'],
          grade_display: current.grade_display,
          risk_plain: (() => {
            const { stop } = levels(current);
            return stop === null
              ? 'I do not have an invalidation level on this one yet.'
              : `It fails ${isLong(current.intent) ? 'below' : 'above'} $${stop}.`;
          })(),
          // From the confirmations, not from raw score_components: that jsonb
          // also carries metadata (source, lookback_sessions, refreshed_at) and
          // reading it numerically turned "lookback_sessions: 10" into
          // "only 10 out of 100".
          missing_evidence: buildConfirmations(current, quote.price)
            .filter((c) => c.ok === false)
            .map((c) => c.detail_plain ?? c.label),
          invalidation_plain: current.thesis_technical,
          last_updated: new Date().toISOString(),
          source: 'setup' as const,
          kai_object: derivedEnvelope(current, ctx.user.id),
          refs: { symbol, setup_id: current.id, market_date: new Date().toISOString().slice(0, 10) },
        }
      : {
          conclusion_plain: `I have no graded setup on ${symbol} right now, so I have no view to give you on it.`,
          state: null,
          grade_display: null,
          risk_plain: 'Nothing is at risk here because there is nothing prepared.',
          missing_evidence: [],
          invalidation_plain: null,
          last_updated: new Date().toISOString(),
          source: 'none' as const,
          kai_object: null,
          refs: { symbol, market_date: new Date().toISOString().slice(0, 10) },
        };

    const alerts = ((alertsRes.data ?? []) as Record<string, unknown>[]).map((a) => alertRow(a));
    const watchlisted = wl.items.some((i) => i.symbol === symbol);

    const actions: UiAction[] = [
      { action: 'ask_kai', label: 'Ask Kai', enabled: true, hint: null, primary: true, route: null },
      { action: 'set_alert', label: 'Set alert', enabled: true, hint: null, primary: false, route: '/alert/new' },
      {
        action: watchlisted ? 'remove_watchlist' : 'add_watchlist',
        label: watchlisted ? 'On your watchlist' : 'Add to watchlist',
        enabled: !wl.missing,
        hint: wl.missing ? 'Watchlists are not set up on this database yet.' : null,
        primary: false,
        route: null,
      },
      {
        action: 'buy',
        label: 'Buy',
        enabled: false,
        hint: 'Paper trading arrives next.',
        primary: false,
        route: null,
      },
      {
        action: 'sell',
        label: 'Sell',
        enabled: false,
        hint: 'Paper trading arrives next.',
        primary: false,
        route: null,
      },
    ];

    const roomId = (current as unknown as { discussion_room_id?: string } | null)?.discussion_room_id ?? null;

    return ok(
      SymbolDetailResponse.parse({
        symbol,
        name: ((instrument.data as Record<string, unknown>).name as string) ?? null,
        mode,
        quote,
        market: marketBlock(new Date(), quote.freshness),
        chart: {
          timeframes: TIMEFRAMES,
          default_timeframe: mode === 'day_trade' ? '1D' : '3M',
          candles_path: `/api/v1/market/candles?symbol=${symbol}`,
          annotations: annotationsFor(current),
        },
        lenses,
        kai_interpretation: interpretation,
        your_context: {
          watchlisted,
          alerts,
          plans: [],
          positions: [],
          plain: [
            watchlisted ? `${symbol} is on your watchlist.` : `${symbol} is not on your watchlist.`,
            alerts.length ? `You have ${alerts.length} watch${alerts.length === 1 ? '' : 'es'} on it.` : 'No watches on it.',
            'No position — paper trading arrives next.',
          ].join(' '),
        },
        evidence: {
          news: newsRes.news,
          plain: newsRes.news.length
            ? 'Headlines, newest first. Each one carries the time it was published — check that before you act on it.'
            : polygonConfigured()
              ? 'No recent headlines came back for this one.'
              : 'News is not connected yet.',
        },
        community: {
          thread_summary: null,
          sentiment: null,
          room_id: roomId,
          plain: roomId
            ? 'There is a room for this setup. What members think is not evidence — I keep it separate from my own read.'
            : 'Discussion opens with Community rooms.',
        },
        actions,
        degraded: quote.price === null,
        degraded_reason: quote.price === null ? 'I do not have a price for this one right now.' : null,
      })
    );
  }
);
