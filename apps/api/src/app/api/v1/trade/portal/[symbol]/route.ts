/**
 * GET /api/v1/trade/portal/:symbol?alert=&setup=&ctx=&timeframe=
 *
 * The chart-first Trade Portal (spec §7), and the landing place for every alert
 * (spec §6). There is NO generic alert-detail screen: an alert card's primary
 * action comes here, and this payload restores the exact event context — ids,
 * timeframe, trigger candle, levels, thesis, grade snapshot, monitoring
 * condition, execution refs and the community thread.
 *
 * WHAT "RESTORED" ACTUALLY MEANS HERE
 * Not "we passed the alert id through". Opening from an alert:
 *   - selects the timeframe the setup lives on and centres the chart on the
 *     trigger candle;
 *   - DRAWS the plan — trigger, entry, stop, invalidation, first target — as
 *     real, persisted annotations with reasons, so the chart the user lands on
 *     already looks the way Kai says it does;
 *   - opens a conversation whose context is that alert;
 *   - returns spec §6's opening message VERBATIM, with only the ticker
 *     substituted. That sentence is a contract, not a suggestion, and the smoke
 *     test asserts it character for character.
 *
 * The round-3 Trade landing content — account, positions, open orders,
 * watchlist, recents — has not been deleted; it moved into `drawers`, which is
 * where the top bar opens it from. Trade opens as a working chart, not as a
 * portfolio dashboard.
 */
import type { NextRequest } from 'next/server';
import {
  COMMUNITY_LABEL_PLAIN,
  PAPER_ACCOUNT_PLAIN,
  PAPER_CAPABILITY_PLAIN,
  PORTAL_OPENING_MESSAGE_TEMPLATE,
  PortalQuery,
  PortalResponse,
  portalOpeningMessage,
  type AlertCard,
  type AlertCardState,
  type PlainAction,
  type PortalContextKey,
} from '@shared/api';
import { authedParams, ok, parseQuery, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { serviceClient } from '@/lib/db';
import { marketBlock } from '@/lib/market';
import { getQuote } from '@/lib/market/polygon';
import { getCompanyProfile } from '@/lib/market/profile';
import { loadProfile, loadRiskPolicy, type SetupRow } from '@/lib/kai/context';
import { levels, isLong } from '@/lib/setups';
import { watchlistItems } from '@/lib/watchlist-view';
import { loadPaperAccount } from '@/lib/execution/engine';
import { loadOpenPositions } from '@/lib/execution/positions-view';
import { dailyRisk } from '@/lib/execution/risk';
import {
  PLAN_COLUMNS,
  exitStylePlain,
  planScenarios,
  planSize,
  rrFor,
  rrPlain,
  toPlanRow,
} from '@/lib/execution/plans';
import { toOrderRow } from '@/lib/execution/shape';
import { ORDER_COLUMNS } from '@/lib/execution/engine';
import { ensureDevTicker } from '@/lib/execution/tick-dev';
import { action, communitySentiment, verifiedClaims } from '@/lib/v5/workspace';
import { listAnnotations, markPlanLevels } from '@/lib/round4/annotations';
import { listCircles } from '@/lib/round4/circles';
import { loadAlertCards } from '@/lib/round4/alerts-feed';
import { experienceOf, speak } from '@/lib/kai/voice';

export const dynamic = 'force-dynamic';

const SETUP_COLUMNS =
  'id,symbol,mode,intent,state,score,grade_band,grade_display,score_components,thesis_plain,thesis_technical,entry_condition,invalidation,stop,targets,catalyst,quote_snapshot,valid_until,scanner_run_id,discussion_room_id';

/** The portal's timeframes (spec §7 mobile hierarchy). */
const TIMEFRAMES = [
  { key: '1m', label: '1m' },
  { key: '5m', label: '5m' },
  { key: '15m', label: '15m' },
  { key: '1h', label: '1h' },
  { key: '4h', label: '4h' },
  { key: '1d', label: 'D' },
];

/** Which timeframe an alert should land on. Day trades open intraday. */
function defaultTimeframe(mode: string): string {
  return mode === 'day_trade' ? '5m' : '1d';
}

export const GET = authedParams<{ symbol: string }>(
  async (req: NextRequest, ctx: Ctx & { params: { symbol: string } }) => {
    ensureDevTicker();
    const q = parseQuery(req, PortalQuery);
    const symbol = ctx.params.symbol.toUpperCase();
    const db = serviceClient();

    const instrument = await db.from('instruments').select('symbol,name').eq('symbol', symbol).maybeSingle();
    if (!instrument.data) {
      throw new ApiError('NOT_FOUND', `I do not follow ${symbol} yet, so there is no chart to open.`);
    }

    const profile = await loadProfile(ctx.user.id);
    const experience = experienceOf(
      (profile.onboarding as Record<string, unknown>)?.experience ?? profile.experience
    );

    /* ---- the objects this portal is about ---------------------------- */
    const [quote, company, setupsRes, policy, positions, account, wl, plansRes, ordersRes] = await Promise.all([
      getQuote(symbol),
      getCompanyProfile(symbol),
      db
        .from('setups')
        .select(SETUP_COLUMNS)
        .eq('symbol', symbol)
        .in('state', ['discovered', 'watching', 'forming', 'ready', 'invalidated'])
        .order('score', { ascending: false, nullsFirst: false }),
      loadRiskPolicy(ctx.user.id),
      loadOpenPositions({ userId: ctx.user.id }),
      loadPaperAccount(ctx.user.id),
      watchlistItems(ctx.user.id, ctx.requestId),
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
        .select(ORDER_COLUMNS)
        .eq('user_id', ctx.user.id)
        .in('status', ['submitted', 'accepted', 'partially_filled'])
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    const rows = (setupsRes.data ?? []) as unknown as SetupRow[];
    const setup =
      (q.setup ? rows.find((r) => r.id === q.setup) : null) ??
      rows.find((r) => r.mode === profile.primary_mode) ??
      rows[0] ??
      null;

    /* ---- the alert we were opened from ------------------------------- */
    let alertCard: AlertCard | null = null;
    let alertRowData: Record<string, unknown> | null = null;
    if (q.alert) {
      const found = await db
        .from('alerts')
        .select('id,status,natural_language,condition,refs,expires_at,created_at,updated_at')
        .eq('user_id', ctx.user.id)
        .eq('id', q.alert)
        .maybeSingle();
      alertRowData = (found.data as Record<string, unknown> | null) ?? null;
      if (!alertRowData) {
        // Opening a stale link is not an error the user caused. The portal
        // opens on the symbol and says the alert is gone, rather than 404ing
        // a chart the user can plainly see should exist.
        alertCard = null;
      } else {
        const feed = await loadAlertCards({ userId: ctx.user.id, requestId: ctx.requestId });
        alertCard = feed.cards.find((c) => c.alert_id === q.alert) ?? null;
      }
    }
    if (!alertCard && !q.alert) {
      const feed = await loadAlertCards({ userId: ctx.user.id, requestId: ctx.requestId });
      alertCard = feed.cards.find((c) => c.identity.symbol === symbol) ?? null;
    }

    const openedFromAlert = Boolean(q.alert && alertCard);
    const mode = setup?.mode ?? alertCard?.identity.mode ?? profile.primary_mode;
    const timeframe = q.timeframe ?? defaultTimeframe(mode);

    /* ---- levels, from the plan first and the setup second ------------- */
    const planRow = ((plansRes.data ?? []) as Record<string, unknown>[])[0] ?? null;
    const existingPlan = planRow ? toPlanRow(planRow, policy, account?.equity ?? null) : null;
    const setupLevels = setup ? levels(setup) : { entry: null, stop: null, targets: [], perShare: null, rr: null };
    const long = setup ? isLong(setup.intent) : true;

    const entry = existingPlan?.entry ?? setupLevels.entry;
    const stop = existingPlan?.stop ?? setupLevels.stop;
    const targets = existingPlan?.targets?.length ? existingPlan.targets : setupLevels.targets;

    /* ---- draw the plan when we arrived from an alert ------------------ */
    const triggerTs = openedFromAlert
      ? ((alertRowData?.updated_at as string) ?? (alertRowData?.created_at as string) ?? null)
      : null;

    if (openedFromAlert && (entry !== null || stop !== null || targets.length)) {
      await markPlanLevels({
        userId: ctx.user.id,
        symbol,
        timeframe,
        entry,
        stop,
        invalidation: stop,
        targets,
        long,
        sourceAlertId: q.alert ?? null,
        sourceSetupId: setup?.id ?? null,
        sourcePlanId: existingPlan?.id ?? null,
        triggerTs,
      });
    }

    const annotations = await listAnnotations({ userId: ctx.user.id, symbol, timeframe });

    /* ---- community ---------------------------------------------------- */
    const roomId = (setup as unknown as { discussion_room_id?: string } | null)?.discussion_room_id ?? null;
    const [sentiment, claims, circles] = await Promise.all([
      communitySentiment(symbol, roomId ? [roomId] : []),
      verifiedClaims(symbol),
      listCircles({ userId: ctx.user.id }),
    ]);
    const circle = circles.circles.find((c) => c.symbol === symbol || c.setup_id === setup?.id) ?? null;

    /* ---- execution state --------------------------------------------- */
    const position = positions.rows.find((p) => p.symbol === symbol) ?? null;
    const orders = ((ordersRes.data ?? []) as Record<string, unknown>[]).map((o) => toOrderRow(o, [], []));
    const symbolOrders = orders.filter((o) => o.symbol === symbol);
    const execState: AlertCardState | null =
      alertCard?.state ??
      (position ? 'position_active' : symbolOrders.length ? 'order_pending' : existingPlan ? 'planned' : setup ? (setup.state === 'ready' ? 'ready' : 'watching') : null);

    const executionAction: PlainAction = position
      ? action('manage_trade', 'Manage trade', `/position/${position.id}`, true)
      : symbolOrders.length
        ? action('manage_order', 'Manage order', `/order/${symbolOrders[0].id}`, true)
        : existingPlan
          ? action('prepare_order', 'Prepare order', `/order/new?symbol=${symbol}&plan=${existingPlan.id}`, true)
          : entry !== null && stop !== null
            ? action('build_plan', 'Review trade', `/plan/new?symbol=${symbol}${setup ? `&setup=${setup.id}` : ''}`, true)
            : action(
                'no_plan',
                'Nothing to prepare yet',
                null,
                true,
                false,
                'I need an entry and an invalidation level before there is a trade to prepare.'
              );

    /* ---- Kai context -------------------------------------------------- */
    const selected: PortalContextKey = q.ctx ?? (openedFromAlert ? 'alert' : 'kai');
    const openingMessage = openedFromAlert ? portalOpeningMessage(symbol) : null;

    // ONE conversation per symbol + alert per day. Opening the portal is not the
    // same as starting a new conversation: without this, walking back and forth
    // between Alerts and Trade would fill the drawer with a dozen identical
    // empty threads, and the drawer is the feature.
    let conversationId: string | null = null;
    const sinceMidnight = new Date();
    sinceMidnight.setUTCHours(0, 0, 0, 0);
    try {
      const existing = await db
        .from('conversations')
        .select('id,context,created_at')
        .eq('user_id', ctx.user.id)
        .gte('created_at', sinceMidnight.toISOString())
        .order('created_at', { ascending: false })
        .limit(30);
      const match = ((existing.data ?? []) as Record<string, unknown>[]).find((r) => {
        const chart = ((r.context as Record<string, unknown>) ?? {}).chart as Record<string, unknown> | undefined;
        return chart?.symbol === symbol && (chart?.alert_id ?? null) === (q.alert ?? null);
      });
      if (match) conversationId = String(match.id);
    } catch {
      conversationId = null;
    }

    try {
      if (conversationId) throw new Error('reused');
      const conv = await db
        .from('conversations')
        .insert({
          user_id: ctx.user.id,
          mode,
          title: `${symbol} ${mode === 'day_trade' ? 'Day Trade' : mode === 'swing' ? 'Swing' : 'Invest'}`,
          context: {
            pinned: { symbols: [symbol], setup_ids: setup ? [setup.id] : [] },
            sheet: q.alert ? { kind: 'alert', id: q.alert, symbol } : { kind: 'symbol', symbol },
            // The chart block is what lets Kai issue chart_command frames that
            // resolve against real levels. See lib/kai/chart-commands.ts.
            chart: {
              symbol,
              timeframe,
              setup_id: setup?.id ?? null,
              alert_id: q.alert ?? null,
              plan_id: existingPlan?.id ?? null,
              trigger_ts: triggerTs,
            },
          },
        })
        .select('id')
        .single();
      conversationId = conv.data ? String((conv.data as Record<string, unknown>).id) : null;
    } catch {
      // `reused` lands here on purpose; anything else leaves the portal without
      // a conversation, which the payload reports as degraded rather than hides.
    }

    // NOTE: the portal deliberately does NOT compute technicals. The ticker page
    // owns that block, and pulling 150 daily bars here to set one boolean spent
    // a request out of a five-a-minute budget for something this payload never
    // returns. The chart-command resolver loads its own swing levels, cache
    // first, and only when Kai is actually asked to mark one.
    const risk = await dailyRisk(ctx.user.id, policy?.daily_loss_cap_usd ?? null);
    const suggestedEntry = entry ?? quote.price;
    const suggestedSize = planSize(suggestedEntry, stop, targets, policy, account?.equity ?? null, null);
    const suggestedRr = rrFor(suggestedEntry, stop, targets);

    const monitoringCondition = alertCard
      ? alertCard.trade_plan.entry_condition_plain
      : entry === null
        ? 'Nothing is being monitored on this one.'
        : `${long ? 'Above' : 'Below'} $${entry}.`;
    const distance =
      entry !== null && quote.price !== null
        ? `${Math.abs(entry - quote.price).toFixed(2)} away from the trigger at the last ${quote.freshness} print.`
        : 'No current price, so I cannot say how far away it is.';

    return ok(
      PortalResponse.parse({
        identity: {
          symbol,
          name: ((instrument.data as Record<string, unknown>).name as string) ?? null,
          company_name: company.name,
          logo_url: company.logo_url,
          mode,
          instrument: 'equity',
          watchlisted: wl.items.some((i) => i.symbol === symbol),
          status_line: position
            ? `${position.direction === 'long' ? 'Long' : 'Short'} ${position.qty} · ${position.unrealized_pnl === null ? 'no current price' : `${position.unrealized_pnl >= 0 ? 'up' : 'down'} $${Math.abs(position.unrealized_pnl)}`}`
            : existingPlan
              ? 'Plan written · no position'
              : 'No position',
          room_id: roomId,
        },
        quote,
        market: marketBlock(new Date(), quote.freshness),
        chart_config: {
          timeframe,
          timeframes: TIMEFRAMES,
          candles_path: `/api/v1/market/candles?symbol=${symbol}`,
          focus_ts: triggerTs,
          range: { from: null, to: null },
          plain: speak(
            `${symbol} on the ${timeframe === '1d' ? 'daily' : timeframe} chart. ${quote.label_plain}`,
            experience
          ),
        },
        annotations: annotations.annotations,
        contexts: {
          selected,
          kai: {
            conversation_id: conversationId,
            opening_message: openingMessage,
            placeholder: 'Ask Kai about this chart…',
            // The prompts differ by experience for the same reason Kai's voice
            // does: a beginner needs "what would make this wrong" spelled out,
            // and someone who trades daily wants the level, not the lesson.
            suggestions: openedFromAlert
              ? experience === 'new'
                ? ['What would make this wrong?', 'Mark the trigger level', 'Show me this on the daily chart']
                : ['Show me what invalidates this', 'Mark the trigger level', 'Switch to the daily chart']
              : experience === 'pro'
                ? ['Mark the invalidation', 'Compare with the prior session', 'Highlight the community level']
                : ['What is the level that matters here?', 'Mark the support and resistance', 'Compare with the prior session'],
            degraded: conversationId === null,
            degraded_reason:
              conversationId === null ? 'I could not open a conversation for this chart. Try again in a moment.' : null,
          },
          alert: alertCard,
          plan: {
            existing_plan: existingPlan,
            suggested: {
              entry: suggestedEntry,
              stop,
              targets,
              size: suggestedSize,
              rr: suggestedRr,
              rr_plain: rrPlain(suggestedRr, policy),
              scenarios: planScenarios(suggestedEntry, stop, targets, suggestedSize.shares, long),
              stop_attaches_plain: exitStylePlain(existingPlan?.exit_style ?? 'auto'),
            },
            daily_risk: { cap: risk.cap, used: risk.used, remaining: risk.remaining, currency: 'USD' },
            actions: existingPlan
              ? [
                  action('review_order', 'Review order', `/order/new?symbol=${symbol}&plan=${existingPlan.id}`, true),
                  action('open_plan', 'Open the plan', `/plan/${existingPlan.id}`),
                ]
              : [action('build_plan', 'Build a plan', `/plan/new?symbol=${symbol}${setup ? `&setup=${setup.id}` : ''}`, true)],
            plain: existingPlan
              ? 'This is the plan you saved. The order ticket is filled in from it, and you confirm it yourself.'
              : 'No plan saved for this one yet. The suggestion below is sized from your own rules.',
          },
          community: {
            room_id: roomId,
            circle: circle
              ? {
                  id: circle.id,
                  name: circle.name,
                  route: circle.route,
                  expires_at: circle.expires_at,
                  members: circle.members,
                }
              : null,
            sentiment,
            verified_claims: claims,
            most_mentioned_level: null,
            label_plain: COMMUNITY_LABEL_PLAIN,
            plain: sentiment
              ? `${sentiment.label}. ${COMMUNITY_LABEL_PLAIN}`
              : circle
                ? `${circle.name} is open · ${circle.time_left_plain}.`
                : 'Nobody has written down an idea about this one yet.',
            actions: circle
              ? [action('open_circle', `Open ${circle.name}`, circle.route, true)]
              : roomId
                ? [action('join_discussion', 'Join discussion', `/room/${roomId}`, true)]
                : [action('join_discussion', 'Join discussion', '/community', false, false, 'No room for this symbol yet.')],
          },
        },
        restored: {
          alert_id: q.alert ?? null,
          setup_id: setup?.id ?? null,
          symbol,
          instrument: 'equity',
          mode,
          timeframe,
          focus_ts: triggerTs,
          levels: {
            entry,
            stop,
            invalidation: stop,
            targets: targets.map((t) => t.price),
            community: [],
          },
          grade_snapshot: alertCard?.grade ?? null,
          thesis_plain: setup?.thesis_plain ?? alertCard?.detail.thesis_plain ?? null,
          monitoring: {
            condition_plain: monitoringCondition,
            progress_plain: distance,
            last_evaluated_at: quote.received_ts,
          },
          execution: {
            plan_id: existingPlan?.id ?? null,
            order_id: symbolOrders[0]?.id ?? null,
            position_id: position?.id ?? null,
          },
          community: { room_id: roomId, circle_id: circle?.id ?? null },
          plain: openedFromAlert
            ? PORTAL_OPENING_MESSAGE_TEMPLATE.replace('{SYMBOL}', symbol)
            : `${symbol} on the ${timeframe === '1d' ? 'daily' : timeframe} chart.`,
        },
        execution: {
          state: execState,
          primary_action: executionAction,
          capability_plain: PAPER_CAPABILITY_PLAIN,
          paper: true,
        },
        drawers: {
          account: {
            kind: 'paper',
            equity: account?.equity ?? null,
            cash: account?.cash ?? null,
            buying_power: account?.buying_power ?? null,
            day_change: null,
            plain: PAPER_ACCOUNT_PLAIN,
          },
          positions: positions.rows,
          open_orders: orders,
          watchlist: wl.items.map((i) => ({
            symbol: i.symbol,
            name: i.name ?? null,
            price: i.quote?.price ?? null,
            route: `/symbol/${i.symbol}`,
          })),
          recent: [],
        },
        paper_plain: PAPER_ACCOUNT_PLAIN,
        degraded: quote.price === null || positions.degraded,
        degraded_reason:
          quote.price === null ? 'I do not have a price for this one right now.' : positions.degraded_reason,
      })
    );
  }
);
