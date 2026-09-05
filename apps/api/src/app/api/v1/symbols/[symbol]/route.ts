/**
 * GET /api/v1/symbols/:symbol?mode=
 *
 * THE asset workspace (V5 W1). Consolidation rule 1: the symbol is the
 * canonical object, and everything the app knows about it lives here in four
 * tabs — Overview · Kai · Plan · Community. A setup is a MODULE on Overview,
 * not a separate destination with its own duplicate chart and plan (audit §3).
 *
 * Removed this round: per-asset mode "lenses". Mode is visible GLOBAL context
 * now (audit §10), so `lenses` is always `[]` — the field stays for shape
 * stability and nothing reads it.
 *
 * Still refused, and still for good reasons:
 *   - no bid/ask (no level-1 feed on this plan, so the fields are absent rather
 *     than filled with a last trade pretending to be a book);
 *   - no invented community sentiment — it is computed from structured ideas
 *     members actually posted, and it is null when nobody has posted one.
 */
import type { NextRequest } from 'next/server';
import {
  NOT_A_GUARANTEE_PLAIN,
  PAPER_FILL_PLAIN,
  STATE_ACTION_LABEL,
  SymbolDetailQuery,
  SymbolTickerResponse,
  type ChartAnnotation,
  type PlainAction,
  type SetupState,
  type TickerAlertRow,
} from '@shared/api';
import { authedParams, ok, parseQuery, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { serviceClient } from '@/lib/db';
import { marketBlock } from '@/lib/market';
import { getNews, lastTradingDate, polygonConfigured, resolveQuote } from '@/lib/market/polygon';
import { getCompanyProfile } from '@/lib/market/profile';
import { computeTechnicals } from '@/lib/market/technicals';
import { loadAlertCards } from '@/lib/round4/alerts-feed';
import { listCircles } from '@/lib/round4/circles';
import { speak, experienceOf } from '@/lib/kai/voice';
import { loadProfile, loadRiskPolicy, type SetupRow } from '@/lib/kai/context';
import { derivedEnvelope } from '@/lib/kai/objects';
import { levels, isLong, buildConfirmations } from '@/lib/setups';
import { listWatchlist } from '@/lib/watchlist';
import { loadPaperAccount } from '@/lib/execution/engine';
import { loadOpenPositions } from '@/lib/execution/positions-view';
import { dailyRisk } from '@/lib/execution/risk';
import { PLAN_COLUMNS, exitStylePlain, planScenarios, planSize, planSuggestion, rrFor, rrPlain, toPlanRow } from '@/lib/execution/plans';
import { decisionChain } from '@/lib/execution/chain';
import { ensureDevTicker } from '@/lib/execution/tick-dev';
import {
  action,
  communitySentiment,
  keyLevels,
  positionModule,
  setupModule,
  verifiedClaims,
  whatChanged,
} from '@/lib/v5/workspace';
import { alertRow } from '../../alerts/shape';

export const dynamic = 'force-dynamic';

const TIMEFRAMES = ['1D', '5D', '1M', '3M', 'YTD', '1Y'];

/** The prototype's ticker-page chart chips. */
const TICKER_TIMEFRAMES = [
  { key: '1D', label: '1D' },
  { key: '1W', label: '1W' },
  { key: '1M', label: '1M' },
  { key: '1Y', label: '1Y' },
];

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

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
  for (const t of targets) out.push({ kind: 'level', price: t.price, text: t.label ?? 'Target', semantic: 'target' });
  return out;
}

export const GET = authedParams<{ symbol: string }>(
  async (req: NextRequest, ctx: Ctx & { params: { symbol: string } }) => {
    ensureDevTicker();
    const q = parseQuery(req, SymbolDetailQuery);
    const symbol = ctx.params.symbol.toUpperCase();
    const db = serviceClient();

    const instrument = await db.from('instruments').select('symbol,name').eq('symbol', symbol).maybeSingle();
    if (!instrument.data) {
      throw new ApiError('NOT_FOUND', `I do not follow ${symbol} yet, so I have nothing to show you here.`);
    }

    const profile = await loadProfile(ctx.user.id);
    const mode = q.mode ?? profile.primary_mode;

    // The ticker page draws a DAILY chart, so its header is priced from that
    // same daily series — one symbol, one price, one source timestamp (spec §9).
    const [priced, setupsRes, alertsRes, wl, newsRes, positions, account, policy, plansRes, ordersRes] =
      await Promise.all([
        resolveQuote(symbol, { timeframe: '1d', from: daysAgo(150), to: lastTradingDate() }),
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
        loadOpenPositions({ userId: ctx.user.id }),
        loadPaperAccount(ctx.user.id),
        loadRiskPolicy(ctx.user.id),
        db
          .from('trade_plans')
          .select(PLAN_COLUMNS)
          .eq('user_id', ctx.user.id)
          .eq('symbol', symbol)
          .in('status', ['draft', 'planned', 'active'])
          .order('created_at', { ascending: false })
          .limit(1),
        db
          .from('orders')
          .select('id,status,created_at')
          .eq('user_id', ctx.user.id)
          .eq('symbol', symbol)
          .in('status', ['submitted', 'accepted', 'partially_filled'])
          .order('created_at', { ascending: false }),
      ]);

    const quote = priced.quote;
    const rows = (setupsRes.data ?? []) as unknown as SetupRow[];
    // Mode is global context now, so the setup shown is simply the best live one
    // for the user's current mode, with any mode as the fallback.
    const current = rows.find((r) => r.mode === mode) ?? rows[0] ?? null;

    const position = positions.rows.find((p) => p.symbol === symbol) ?? null;
    const alerts = ((alertsRes.data ?? []) as Record<string, unknown>[]).map((a) => alertRow(a));
    const watchlisted = wl.items.some((i) => i.symbol === symbol);
    const roomId = (current as unknown as { discussion_room_id?: string } | null)?.discussion_room_id ?? null;

    // ---- Kai interpretation (round-2 shape, still the source of truth) -----
    const interpretation = current
      ? {
          conclusion_plain: current.thesis_plain ?? `I have a ${current.state} setup on ${symbol}.`,
          state: current.state as SetupState,
          grade_display: current.grade_display,
          risk_plain: (() => {
            const { stop } = levels(current);
            return stop === null
              ? 'I do not have an invalidation level on this one yet.'
              : `It fails ${isLong(current.intent) ? 'below' : 'above'} $${stop}.`;
          })(),
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

    // ---- plan tab ---------------------------------------------------------
    const planRow = ((plansRes.data ?? []) as Record<string, unknown>[])[0] ?? null;
    const existingPlan = planRow ? toPlanRow(planRow, policy, account?.equity ?? null) : null;

    const setupLevels = current ? levels(current) : { entry: null, stop: null, targets: [], perShare: null, rr: null };

    /*
     * This used to read `setupLevels.entry ?? quote.price`, which meant a
     * symbol with no graded setup still came back carrying an "entry" that was
     * simply the last traded price wearing the label. The Trade section refuses
     * that downstream; the plan screen did not, and printed it as a decided
     * level. It is refused HERE now, at the source, so no screen can show it:
     * a plan needs an entry AND a level that says it was wrong, or there is no
     * plan and `no_plan_plain` says why in words the screen prints as they are.
     */
    const suggestion = planSuggestion(symbol, setupLevels, Boolean(current?.grade_display));
    const suggestedEntry = suggestion.entry;
    const suggestedSize = planSize(
      suggestedEntry,
      suggestion.stop,
      suggestion.targets,
      policy,
      account?.equity ?? null,
      null
    );
    const suggestedRr = rrFor(suggestedEntry, suggestion.stop, suggestion.targets);
    const openOrders = (ordersRes.data ?? []) as Record<string, unknown>[];
    const risk = await dailyRisk(ctx.user.id, policy?.daily_loss_cap_usd ?? null);

    const [chain, sentiment, claims, changed] = await Promise.all([
      decisionChain({ userId: ctx.user.id, symbol, limit: 15 }),
      communitySentiment(symbol, roomId ? [roomId] : []),
      verifiedClaims(symbol),
      whatChanged({ userId: ctx.user.id, symbol, setup: current }),
    ]);

    // ---- state-driven persistent actions ----------------------------------
    const state = current ? String(current.state) : null;
    const stateLabel = state ? (STATE_ACTION_LABEL[state] ?? 'Review setup') : null;
    const workspaceActions: PlainAction[] = [
      action('buy', position && position.direction === 'short' ? 'Cover' : 'Buy', `/order/new?symbol=${symbol}&side=${position && position.direction === 'short' ? 'buy_to_cover' : 'buy_to_open'}${existingPlan ? `&plan=${existingPlan.id}` : ''}${current ? `&setup=${current.id}` : ''}`, true),
      action(
        'sell',
        position && position.direction === 'long' ? 'Sell' : 'Short',
        `/order/new?symbol=${symbol}&side=${position && position.direction === 'long' ? 'sell_to_close' : 'sell_short'}`,
      ),
      // The star, not the setup's primary. "Watch this" belongs to the setup
      // module (audit §8's mapping of "follow setup" → "Watch this"); reusing
      // the same words on the watchlist toggle put two identical buttons on one
      // screen doing different things.
      action(
        watchlisted ? 'remove_watchlist' : 'add_watchlist',
        watchlisted ? 'On your watchlist' : 'Add to watchlist',
        null,
        false,
        !wl.missing,
        wl.missing ? 'Watchlists are not set up on this database yet.' : null
      ),
      action('set_alert', 'Set an alert', '/alert/new'),
      action('ask_kai', 'Ask Kai', null),
    ];
    if (stateLabel && current) {
      workspaceActions.unshift(action('setup_primary', stateLabel, `/symbol/${symbol}?tab=overview&setup=${current.id}`));
    }

    const statusLine = position
      ? `${position.direction === 'long' ? 'Long' : 'Short'} ${position.qty} · ${position.unrealized_pnl === null ? 'no current price' : `${position.unrealized_pnl >= 0 ? 'up' : 'down'} $${Math.abs(position.unrealized_pnl)}`}`
      : watchlisted
        ? 'Watching · no position'
        : 'No position · not on your watchlist';

    /* ---- round 4: the ticker research page --------------------------- */
    // Company profile, deterministic technicals, Kai's short take, the
    // community line and the "one active alert" row. Everything above is
    // unchanged — this payload is a superset of the V5 workspace.
    const experience = experienceOf(
      (profile.onboarding as Record<string, unknown>)?.experience ?? profile.experience
    );
    const [company, feed, circlesRes] = await Promise.all([
      getCompanyProfile(symbol),
      loadAlertCards({ userId: ctx.user.id, requestId: ctx.requestId }),
      listCircles({ userId: ctx.user.id }),
    ]);
    const technicals = computeTechnicals({
      // The very bars the quote above was taken from.
      candles: priced.candles,
      price: quote.price,
      freshness: quote.freshness,
    });

    const liveCard = feed.cards.find((c) => c.identity.symbol === symbol && c.tab !== 'history') ?? null;
    const activeAlert: TickerAlertRow | null = liveCard
      ? {
          alert_id: liveCard.alert_id,
          card_id: liveCard.id,
          grade: liveCard.grade,
          state: liveCard.state,
          plain: `${liveCard.grade.display ?? 'Ungraded'} · ${liveCard.state_label}${liveCard.event.triggered_at ? ` · ${liveCard.event.at_plain}` : ''}`,
          triggered_at: liveCard.event.triggered_at,
          route: liveCard.primary_action.route ?? `/trade/${symbol}`,
        }
      : null;

    const circle = circlesRes.circles.find((c) => c.symbol === symbol || c.setup_id === current?.id) ?? null;
    const postsToday = await countPostsToday(roomId);

    // Kai's take on the ticker page is the interpretation, said in the voice
    // this user chose. It is Kai's assessment and it is labelled as one.
    const kaiTake = speak(
      interpretation.conclusion_plain,
      experience,
      current?.state === 'ready' ? 'confirmed' : 'thesis'
    );

    return ok(
      SymbolTickerResponse.parse({
        // round-2 keys
        symbol,
        name: ((instrument.data as Record<string, unknown>).name as string) ?? null,
        mode,
        quote,
        market: marketBlock(new Date(), quote.freshness),
        chart: {
          timeframes: TIMEFRAMES,
          default_timeframe: mode === 'day_trade' ? '1D' : '3M',
          candles_path: `/api/v1/market/candles?symbol=${symbol}&tf=1d`,
          annotations: annotationsFor(current),
        },
        lenses: [],
        kai_interpretation: interpretation,
        your_context: {
          watchlisted,
          alerts,
          plans: existingPlan ? [existingPlan] : [],
          positions: position ? [position] : [],
          plain: [
            watchlisted ? `${symbol} is on your watchlist.` : `${symbol} is not on your watchlist.`,
            alerts.length ? `You have ${alerts.length} watch${alerts.length === 1 ? '' : 'es'} on it.` : 'No watches on it.',
            position ? position.plain : 'No position.',
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

        // ---- V5 workspace ---------------------------------------------------
        identity: {
          symbol,
          name: ((instrument.data as Record<string, unknown>).name as string) ?? null,
          watchlisted,
          status_line: statusLine,
          room_id: roomId,
        },
        chart_config: {
          timeframes: TIMEFRAMES,
          default_timeframe: mode === 'day_trade' ? '1D' : '3M',
          candles_path: `/api/v1/market/candles?symbol=${symbol}&tf=1d`,
          annotations: annotationsFor(current),
        },
        overview: {
          setup_module: current ? setupModule(current, quote.price) : null,
          position: position ? positionModule(position) : null,
          watchlist: watchlisted,
          key_levels: keyLevels(current, quote.price),
          what_changed: changed,
        },
        kai: {
          interpretation,
          grade: current?.grade_display ?? null,
          scenarios: planScenarios(
            suggestedEntry,
            suggestion.stop,
            suggestion.targets,
            suggestedSize.shares,
            current ? isLong(current.intent) : true
          ),
          research_refs: newsRes.news.slice(0, 3).map((n) => ({
            label: n.title,
            detail_plain: n.publisher,
            at: n.published_utc,
            url: n.url,
          })),
          conversation_id: null,
          ask_action: action('ask_kai', 'Ask Kai', null, true),
        },
        plan: {
          existing_plan: existingPlan,
          suggested: {
            entry: suggestedEntry,
            stop: suggestion.stop,
            targets: suggestion.targets,
            // Whether there is anything here at all, and why not. The screen
            // prints `no_plan_plain` verbatim rather than leaving three
            // dashes the reader has to interpret.
            has_plan: suggestion.has_plan,
            no_plan_plain: suggestion.no_plan_plain,
            size: suggestedSize,
            rr: suggestedRr,
            rr_plain: rrPlain(suggestedRr, policy),
            scenarios: planScenarios(
              suggestedEntry,
              suggestion.stop,
              suggestion.targets,
              suggestedSize.shares,
              current ? isLong(current.intent) : true
            ),
            stop_attaches_plain: exitStylePlain(existingPlan?.exit_style ?? 'auto'),
          },
          order_state: {
            open_orders: openOrders.length,
            last_order_id: openOrders.length ? String(openOrders[0].id) : null,
            plain: openOrders.length
              ? `${openOrders.length} order${openOrders.length === 1 ? '' : 's'} working on ${symbol}. Accepted is not filled.`
              : `Nothing working on ${symbol} right now.`,
          },
          daily_risk: { cap: risk.cap, used: risk.used, remaining: risk.remaining, currency: 'USD' },
          actions: existingPlan
            ? [
                action('review_order', 'Review order', `/order/new?symbol=${symbol}&side=${existingPlan.intent}&plan=${existingPlan.id}`, true),
                action('open_plan', 'Open the plan', `/plan/${existingPlan.id}`),
              ]
            : [action('build_plan', 'Build a plan', `/plan/new?symbol=${symbol}${current ? `&setup=${current.id}` : ''}`, true)],
        },
        community: {
          thread_summary: sentiment ? `${sentiment.label}.` : null,
          sentiment,
          verified_claims: claims,
          room_id: roomId,
          line_plain: sentiment
            ? `${sentiment.label}${claims.length ? ` · ${claims.length} claim${claims.length === 1 ? '' : 's'} checked` : ''} · Join discussion`
            : roomId
              ? 'There is a room for this one, but nobody has written down an idea about it yet.'
              : 'Discussion for this symbol has not started.',
          actions: roomId
            ? [action('join_discussion', 'Join discussion', `/room/${roomId}`, true)]
            : [action('join_discussion', 'Join discussion', '/community', false, false, 'No room for this symbol yet.')],
        },
        history: chain,
        actions: workspaceActions,
        paper_plain: PAPER_FILL_PLAIN,
        degraded: quote.price === null || positions.degraded,
        degraded_reason:
          quote.price === null ? 'I do not have a price for this one right now.' : positions.degraded_reason,

        // ---- round 4: the ticker research page --------------------------
        company,
        ticker_overview: {
          summary: company.summary,
          market_cap: company.market_cap,
          market_cap_plain: company.market_cap_plain,
          next_earnings: company.next_earnings,
          pe: company.pe,
          sector: company.sector,
          source: company.source,
          plain:
            company.source === 'polygon'
              ? 'From the company filing, trimmed to two sentences.'
              : company.source === 'seed'
                ? 'Written by us, not taken from a filing.'
                : 'I have no description for this one yet.',
        },
        technicals,
        kai_view: {
          take: kaiTake,
          disclosure: NOT_A_GUARANTEE_PLAIN,
          actions: [
            action('ask_kai', 'Ask Kai', null, true),
            action('explain_chart', 'Explain the chart', `/trade/${symbol}?ctx=kai`),
            action('compare', 'Compare', `/trade/${symbol}?ctx=kai`),
          ],
        },
        ticker_community: {
          most_mentioned_level: null,
          posts_today: postsToday,
          sentiment: sentiment ? sentiment.label : null,
          circle: circle
            ? { id: circle.id, name: circle.name, route: circle.route, expires_at: circle.expires_at }
            : null,
          room_id: roomId,
          plain: circle
            ? `${circle.name} is open · ${circle.time_left_plain}.`
            : sentiment
              ? `${sentiment.label}. ${sentiment.caveat_plain}`
              : 'Nobody has written down an idea about this one yet.',
        },
        active_alert: activeAlert,
        chart_timeframes: TICKER_TIMEFRAMES,
        open_in_trade: action('open_in_trade', 'Open in Trade', `/trade/${symbol}`, true),
      })
    );
  }
);

/** Structured ideas posted in this symbol's room since midnight ET. */
async function countPostsToday(roomId: string | null): Promise<number> {
  if (!roomId) return 0;
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const { count } = await serviceClient()
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('room_id', roomId)
    .is('deleted_at', null)
    .gte('created_at', since.toISOString());
  return count ?? 0;
}
