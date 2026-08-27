/**
 * GET /api/v1/alerts → {needs_attention, watching, resolved}
 *
 * Drafts appear under Watching as "draft — activate" (BUILD-BRIEF, Alerts stub).
 */
import type { NextRequest } from 'next/server';
import {
  AlertsResponse,
  AlertActivateRequest,
  AlertActivateResponse,
  MONITORING_PLAIN,
} from '@shared/api';
import { authed, ok, parseBody, type Ctx } from '@/lib/http';
import { serviceClient } from '@/lib/db';
import { ApiError } from '@/lib/errors';
import { emitUserEvent } from '@/lib/events';
import { loadEntitlements, numericFlag, entitlementRequired } from '@/lib/entitlements';
import { notify } from '@/lib/notify';
import { alertRow, monitoringFor } from './shape';

const COLUMNS =
  'id,status,natural_language,condition,data_dependency,frequency,expires_at,refs,created_at';

export const dynamic = 'force-dynamic';

const EMPTY_COPY = "Kai isn't watching anything for you yet.";

export const GET = authed(async (_req: NextRequest, ctx: Ctx) => {
  const db = serviceClient();
  const { data, error } = await db
    .from('alerts')
    .select(COLUMNS)
    .eq('user_id', ctx.user.id)
    .order('created_at', { ascending: false });
  if (error) throw new ApiError('INTERNAL', 'We could not load your alerts. Please try again.', { detail: error.message });

  const rows = (data ?? []).map((r) => alertRow(r as Record<string, unknown>));
  return ok(
    AlertsResponse.parse({
      needs_attention: rows.filter((r) => r.status === 'triggered'),
      watching: rows.filter((r) => r.status === 'draft' || r.status === 'active' || r.status === 'paused'),
      resolved: rows.filter((r) => r.status === 'expired' || r.status === 'cancelled'),
      empty_copy: EMPTY_COPY,
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
