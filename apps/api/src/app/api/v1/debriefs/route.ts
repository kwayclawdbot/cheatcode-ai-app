/**
 * GET /api/v1/debriefs
 *
 * The user's write-ups, plus the closed trades that do not have one yet so the
 * list can offer "Get Kai's debrief" instead of hiding them.
 */
import type { NextRequest } from 'next/server';
import { DebriefsResponse, type DebriefPayload } from '@shared/api';
import { authed, ok, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { serviceClient } from '@/lib/db';
import { loadProfile } from '@/lib/kai/context';
import { POSITION_COLUMNS, planOrigins, positionSimulated, toPositionRow } from '@/lib/debriefs';

export const dynamic = 'force-dynamic';

export const GET = authed(async (_req: NextRequest, ctx: Ctx) => {
  const db = serviceClient();
  const [debriefs, positions, profile] = await Promise.all([
    db
      .from('debriefs')
      .select('id,position_id,outcome,process_review,kai_summary,created_at')
      .eq('user_id', ctx.user.id)
      .order('created_at', { ascending: false })
      .limit(50),
    db
      .from('positions')
      .select(POSITION_COLUMNS)
      .eq('user_id', ctx.user.id)
      .not('closed_at', 'is', null)
      .order('closed_at', { ascending: false })
      .limit(50),
    loadProfile(ctx.user.id),
  ]);

  if (debriefs.error) {
    throw new ApiError('INTERNAL', 'We could not load your write-ups. Please try again.', {
      detail: debriefs.error.message,
    });
  }

  const posRows = (positions.data ?? []) as Record<string, unknown>[];
  const origins = await planOrigins(posRows.map((r) => String(r.origin_plan_id ?? '')));
  const simulatedBy = new Map(
    posRows.map((r) => [String(r.id), positionSimulated(r, origins.get(String(r.origin_plan_id ?? '')))])
  );
  const symbolBy = new Map(posRows.map((r) => [String(r.id), String(r.symbol)]));

  const rows = (debriefs.data ?? []) as Record<string, unknown>[];
  const withDebrief = new Set(rows.map((r) => String(r.position_id)));

  const shaped = rows.map((r) => {
    const review = (r.process_review as Record<string, unknown>) ?? {};
    const payload = (review.payload as DebriefPayload) ?? null;
    const positionId = String(r.position_id ?? '');
    return {
      id: String(r.id),
      position_id: positionId || null,
      symbol: payload?.symbol ?? symbolBy.get(positionId) ?? '—',
      created_at: String(r.created_at),
      kai_summary: (r.kai_summary as string) ?? null,
      payload,
      kai_object: null,
      simulated: payload?.simulated ?? simulatedBy.get(positionId) ?? false,
      degraded: false,
      actions: [
        {
          action: 'save_lesson',
          label: 'Save lesson',
          enabled: profile.memory_enabled,
          hint: profile.memory_enabled ? null : 'Turn memory on in Account if you want me to remember this.',
          primary: true,
          route: `/debrief/${r.id}`,
        },
      ],
    };
  });

  return ok(
    DebriefsResponse.parse({
      // A row written before this shape existed has no payload; skip it rather
      // than guess what it said.
      debriefs: shaped.filter((d) => d.payload),
      awaiting: posRows
        .filter((r) => !withDebrief.has(String(r.id)))
        .map((r) => toPositionRow(r, simulatedBy.get(String(r.id)) ?? false, null)),
      empty_copy: 'No write-ups yet. Close a trade and I will tell you what actually happened.',
    })
  );
});
