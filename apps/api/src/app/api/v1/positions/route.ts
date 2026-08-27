/**
 * GET /api/v1/positions?status=closed|open|all
 *
 * Round 3 makes this the real positions list: `open[]` carries the marked
 * position rows Trade renders (mark, freshness, stop/target, health), while
 * `positions[]` keeps the round-2 shape the debrief list reads. Both are the
 * same rows — a client is never asked to reconcile two sources.
 *
 * Health is measured against the PLAN, not against the P/L: a green position
 * sitting on its stop is at risk, and a red one with room is not broken yet.
 */
import type { NextRequest } from 'next/server';
import { PAPER_FILL_PLAIN, PositionsQuery, PositionsV5Response } from '@shared/api';
import { authed, ok, parseQuery, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { serviceClient } from '@/lib/db';
import { POSITION_COLUMNS, planOrigins, positionSimulated, toPositionRow } from '@/lib/debriefs';
import { loadRiskPolicy } from '@/lib/kai/context';
import { dailyRisk } from '@/lib/execution/risk';
import { loadOpenPositions } from '@/lib/execution/positions-view';
import { round2 } from '@/lib/execution/paper';
import { marketDate } from '@/lib/market';
import { ensureDevTicker } from '@/lib/execution/tick-dev';

export const dynamic = 'force-dynamic';

export const GET = authed(async (req: NextRequest, ctx: Ctx) => {
  ensureDevTicker();
  const q = parseQuery(req, PositionsQuery);
  const db = serviceClient();

  let query = db
    .from('positions')
    .select(POSITION_COLUMNS)
    .eq('user_id', ctx.user.id)
    .order('closed_at', { ascending: false, nullsFirst: false })
    .limit(100);
  if (q.status === 'closed') query = query.not('closed_at', 'is', null);
  if (q.status === 'open') query = query.is('closed_at', null);

  const { data, error } = await query;
  if (error) {
    throw new ApiError('INTERNAL', 'We could not load your trades. Please try again.', { detail: error.message });
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  const origins = await planOrigins(rows.map((r) => String(r.origin_plan_id ?? '')));

  const debriefs = rows.length
    ? await db
        .from('debriefs')
        .select('id,position_id')
        .eq('user_id', ctx.user.id)
        .in('position_id', rows.map((r) => String(r.id)))
    : { data: [] };
  const debriefBy = new Map(
    ((debriefs.data ?? []) as Record<string, unknown>[]).map((d) => [String(d.position_id), String(d.id)])
  );

  const [policy, open] = await Promise.all([
    loadRiskPolicy(ctx.user.id),
    loadOpenPositions({ userId: ctx.user.id, closed: false }),
  ]);
  const risk = await dailyRisk(ctx.user.id, policy?.daily_loss_cap_usd ?? null);

  const unrealizedTotal = round2(open.rows.reduce((a, p) => a + (p.unrealized_pnl ?? 0), 0));

  const since = `${marketDate()}T00:00:00Z`;
  const realizedToday = round2(
    rows
      .filter((r) => r.closed_at && String(r.closed_at) >= since)
      .reduce((a, r) => a + Number(r.realized_pnl ?? 0), 0)
  );

  return ok(
    PositionsV5Response.parse({
      positions: rows.map((r) =>
        toPositionRow(
          r,
          positionSimulated(r, origins.get(String(r.origin_plan_id ?? ''))),
          debriefBy.get(String(r.id)) ?? null
        )
      ),
      empty_copy:
        q.status === 'open'
          ? 'Nothing open. Everything you have is in cash.'
          : 'No closed trades yet. When you have one, I will write up what happened.',
      open: open.rows,
      daily_risk: risk,
      totals: {
        open_count: open.rows.length,
        unrealized_pnl: unrealizedTotal,
        realized_today: realizedToday,
        plain: open.rows.length
          ? `${open.rows.length} position${open.rows.length === 1 ? '' : 's'} open, ${unrealizedTotal >= 0 ? 'up' : 'down'} $${Math.abs(unrealizedTotal)} on paper so far.`
          : 'Nothing open right now.',
      },
      paper_plain: PAPER_FILL_PLAIN,
    })
  );
});
