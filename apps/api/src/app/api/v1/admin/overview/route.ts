/**
 * GET /api/v1/admin/overview — the §8 numbers, and the ones that refuse.
 *
 * Every figure on this screen comes from `crm_funnel_v`, `crm_daily_signups_v`,
 * `crm_mrr_v`, `invites` or `crm_people.source`. There is no projected revenue,
 * no invented tier, and no metric that renders a zero it did not measure — see
 * `lib/admin/metrics.ts` for why `tracked` sits next to `value`.
 *
 * A READ IS AN ACT. This writes an `admin.overview.read` audit row like every
 * other admin call, because a log that only records writes cannot answer the
 * question an audit log exists for (brief §3).
 */
import type { NextRequest } from 'next/server';
import { AdminOverviewResponse } from '@shared/api';
import { ok, staffed, type StaffCtx } from '@/lib/http';
import { writeAudit } from '@/lib/admin/audit';
import { sourceStates } from '@/lib/admin/sources';
import { dailySignups, funnel, inviteTotals, metrics, sourceMix } from '@/lib/admin/metrics';

export const dynamic = 'force-dynamic';

export const GET = staffed(async (_req: NextRequest, ctx: StaffCtx) => {
  const [rows, daily, mix, invites, sources] = await Promise.all([
    funnel(),
    dailySignups(30),
    sourceMix(),
    inviteTotals(),
    sourceStates(),
  ]);
  const computed = await metrics(rows, invites);

  await writeAudit({
    actorUserId: ctx.user.id,
    action: 'admin.overview.read',
    targetKind: 'overview',
    targetId: null,
    requestId: ctx.requestId,
    ip: ctx.ip,
  });

  const live = sources.filter((s) => s.configured).map((s) => s.source);
  return ok(
    AdminOverviewResponse.parse({
      funnel: rows,
      metrics: computed,
      daily,
      source_mix: mix,
      invites,
      sources,
      generated_at: new Date().toISOString(),
      plain:
        live.length === sources.length
          ? 'Everything below is counted from rows in this database.'
          : `Everything below is counted from rows in this database, and covers ${live.join(', ')} only — the other sources are switched off.`,
    })
  );
});
