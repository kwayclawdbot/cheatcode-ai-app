/**
 * GET /api/v1/positions?status=closed|open|all
 *
 * Feeds the debrief list ("closed positions without one → Get Kai's debrief").
 * Simulated positions carry `simulated:true` so every surface can label them —
 * a dev-made trade must never be mistaken for something the user did.
 */
import type { NextRequest } from 'next/server';
import { PositionsQuery, PositionsResponse } from '@shared/api';
import { authed, ok, parseQuery, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { serviceClient } from '@/lib/db';
import { POSITION_COLUMNS, planOrigins, positionSimulated, toPositionRow } from '@/lib/debriefs';

export const dynamic = 'force-dynamic';

export const GET = authed(async (req: NextRequest, ctx: Ctx) => {
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

  return ok(
    PositionsResponse.parse({
      positions: rows.map((r) =>
        toPositionRow(
          r,
          positionSimulated(r, origins.get(String(r.origin_plan_id ?? ''))),
          debriefBy.get(String(r.id)) ?? null
        )
      ),
      empty_copy:
        q.status === 'open'
          ? 'No open positions — paper trading arrives next.'
          : 'No closed trades yet. When you have one, I will write up what happened.',
    })
  );
});
