/**
 * GET /api/v1/alerts?filter=  →  Attention · Monitoring · History (V5 A1)
 *
 * Five internal states collapse into three sections and one row of type FILTERS
 * (audit §6). "Active Trades" is gone: positions live in Trade, and what
 * surfaces here is only the monitoring condition attached to them — there is no
 * second place to manage a position.
 *
 * The round-2 keys (`needs_attention`, `watching`, `resolved`) are still
 * present and still mean the same thing; this payload is a superset.
 */
import type { NextRequest } from 'next/server';
import {
  AlertsV5Query,
  AlertsV5Response,
  AlertActivateRequest,
  AlertActivateResponse,
  MONITORING_PLAIN,
  type AlertTypeFilter,
} from '@shared/api';
import { authed, ok, parseBody, parseQuery, type Ctx } from '@/lib/http';
import { serviceClient } from '@/lib/db';
import { ApiError } from '@/lib/errors';
import { emitUserEvent } from '@/lib/events';
import { loadEntitlements, numericFlag, entitlementRequired } from '@/lib/entitlements';
import { notify } from '@/lib/notify';
import { getSnapshot } from '@/lib/market/polygon';
import { loadOpenPositions } from '@/lib/execution/positions-view';
import { ensureDevTicker } from '@/lib/execution/tick-dev';
import { alertRow, monitoringFor } from './shape';
import {
  buildFilters,
  positionMonitoringRows,
  toAttentionRow,
  toHistoryRow,
  toMonitoringRow,
} from './v5';

const COLUMNS =
  'id,status,natural_language,condition,data_dependency,frequency,expires_at,refs,created_at';

export const dynamic = 'force-dynamic';

const EMPTY_COPY = "Kai isn't watching anything for you yet.";

export const GET = authed(async (req: NextRequest, ctx: Ctx) => {
  ensureDevTicker();
  const q = parseQuery(req, AlertsV5Query);
  const db = serviceClient();

  const [alertsRes, positions] = await Promise.all([
    db.from('alerts').select(COLUMNS).eq('user_id', ctx.user.id).order('created_at', { ascending: false }),
    loadOpenPositions({ userId: ctx.user.id }),
  ]);
  if (alertsRes.error) {
    throw new ApiError('INTERNAL', 'We could not load your alerts. Please try again.', {
      detail: alertsRes.error.message,
    });
  }

  const rows = (alertsRes.data ?? []).map((r) => alertRow(r as Record<string, unknown>));

  // Live values for the monitoring rows. One grouped call covers every symbol,
  // so a long watchlist costs the same as a short one.
  const watched = rows.filter((r) => r.status === 'active' || r.status === 'paused' || r.status === 'draft');
  const symbols = [
    ...new Set(
      watched
        .map((r) => (r.refs as Record<string, unknown> | null)?.symbol)
        .filter((s): s is string => typeof s === 'string')
    ),
  ];
  const priceBy = new Map<string, string>();
  if (symbols.length) {
    const snap = await getSnapshot(symbols);
    for (const quote of snap.quotes) {
      priceBy.set(
        quote.symbol,
        quote.price === null ? 'no current price' : `now $${quote.price} · ${quote.freshness}`
      );
    }
  }

  const attention = rows.filter((r) => r.status === 'triggered').map(toAttentionRow);
  const monitoring = [
    ...watched.map((r) => {
      const sym = (r.refs as Record<string, unknown> | null)?.symbol;
      return toMonitoringRow(r, typeof sym === 'string' ? (priceBy.get(sym) ?? null) : null);
    }),
    ...positionMonitoringRows(positions.rows),
  ];
  const history = rows.filter((r) => r.status === 'expired' || r.status === 'cancelled').map(toHistoryRow);

  const allTypes: AlertTypeFilter[] = [
    ...attention.map((a) => a.type),
    ...monitoring.map((m) => m.type),
    ...history.map((h) => h.type),
  ];
  const keep = <T extends { type: AlertTypeFilter }>(items: T[]) =>
    q.filter === 'all' ? items : items.filter((i) => i.type === q.filter);

  return ok(
    AlertsV5Response.parse({
      // round-2 keys, unchanged
      needs_attention: rows.filter((r) => r.status === 'triggered'),
      watching: watched,
      resolved: rows.filter((r) => r.status === 'expired' || r.status === 'cancelled'),
      empty_copy: EMPTY_COPY,
      // V5
      attention: keep(attention),
      monitoring: keep(monitoring),
      history: keep(history),
      filters: buildFilters(allTypes),
      filter: q.filter,
      composer: {
        placeholder: 'Tell me when…',
        examples: [
          'Tell me when TSLA drops below 170',
          'Tell me if META closes under its 20-day average',
          'Tell me when NVDA gets back to 900',
        ],
      },
    })
  );
});

/**
 * POST /api/v1/alerts  {draft_id} → active
 *
 * Activation is the moment a watch becomes real, so it is the moment the tier
 * limit applies (02 §6/§11: free = 5 active alerts, from `entitlement_flags`).
 * Over the limit answers ENTITLEMENT_REQUIRED with the tier, price and upgrade
 * route so the app can offer the upgrade instead of a dead end.
 *
 * Activated ≠ evaluated. There is no alerts engine in this round, so the alert
 * comes back `monitoring:'armed_no_feed'` and the app says so out loud.
 */
export const POST = authed(async (req: NextRequest, ctx: Ctx) => {
  const body = await parseBody(req, AlertActivateRequest);
  const db = serviceClient();

  const found = await db
    .from('alerts')
    .select(COLUMNS)
    .eq('user_id', ctx.user.id)
    .eq('id', body.draft_id)
    .maybeSingle();
  if (found.error) {
    throw new ApiError('INTERNAL', 'We could not open that watch. Please try again.', {
      detail: found.error.message,
    });
  }
  const draft = found.data as Record<string, unknown> | null;
  if (!draft) throw new ApiError('NOT_FOUND', 'I could not find that watch.');

  const status = String(draft.status);
  if (status === 'active') {
    return ok(
      AlertActivateResponse.parse({
        alert: alertRow(draft),
        monitoring: 'armed_no_feed',
        monitoring_plain: MONITORING_PLAIN.armed_no_feed,
        limit: await limitBlock(ctx.user.id),
      })
    );
  }
  if (status !== 'draft' && status !== 'paused') {
    throw new ApiError('STATE_CONFLICT', 'That watch has already finished — make a new one instead.');
  }

  const ent = await loadEntitlements(ctx.user.id);
  const max = numericFlag(ent.flags, 'alerts_max_active');
  const { count } = await db
    .from('alerts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', ctx.user.id)
    .eq('status', 'active');
  const used = count ?? 0;

  if (max !== null && used >= max) {
    throw entitlementRequired(
      `You have ${used} watches running, which is the limit on the free plan. Pause one, or move up to Premium for as many as you want.`
    );
  }

  const updated = await db
    .from('alerts')
    .update({ status: 'active' })
    .eq('id', body.draft_id)
    .eq('user_id', ctx.user.id)
    .select(COLUMNS)
    .single();
  if (updated.error || !updated.data) {
    throw new ApiError('INTERNAL', 'We could not start that watch. Please try again.', {
      detail: updated.error?.message,
    });
  }

  const row = updated.data as Record<string, unknown>;
  const m = monitoringFor('active');
  const summary = (row.natural_language as string) ?? 'your watch';

  await emitUserEvent(
    ctx.user.id,
    'system',
    'alert',
    String(row.id),
    { event: 'alert_activated', summary_plain: summary, monitoring: m.monitoring },
    ctx.requestId
  );
  await notify({
    userId: ctx.user.id,
    kind: 'alert_activated',
    titlePlain: 'Watch armed',
    bodyPlain: `${summary} ${m.plain}`,
    route: `/alert/${row.id}`,
    payload: { alert_id: row.id, monitoring: m.monitoring },
    requestId: ctx.requestId,
  });

  return ok(
    AlertActivateResponse.parse({
      alert: alertRow(row),
      monitoring: m.monitoring,
      monitoring_plain: m.plain,
      limit: await limitBlock(ctx.user.id),
    }),
    { status: 201 }
  );
});

async function limitBlock(userId: string) {
  const db = serviceClient();
  const ent = await loadEntitlements(userId);
  const max = numericFlag(ent.flags, 'alerts_max_active');
  const { count } = await db
    .from('alerts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'active');
  const used = count ?? 0;
  return {
    used,
    max,
    tier: ent.tier,
    plain:
      max === null
        ? `${used} watch${used === 1 ? '' : 'es'} running. Premium has no limit.`
        : `${used} of ${max} watches running on the free plan.`,
  };
}
