/** GET /api/v1/debriefs/:id — one write-up, with its stored kai_object. */
import type { NextRequest } from 'next/server';
import { DebriefRow, type DebriefPayload } from '@shared/api';
import { authedParams, ok, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { serviceClient } from '@/lib/db';
import { loadProfile } from '@/lib/kai/context';
import { envelope } from '@/lib/kai/objects';

export const dynamic = 'force-dynamic';

export const GET = authedParams<{ id: string }>(async (_req: NextRequest, ctx: Ctx & { params: { id: string } }) => {
  const db = serviceClient();
  const found = await db
    .from('debriefs')
    .select('id,position_id,outcome,process_review,kai_summary,kai_object_id,lesson_refs,created_at')
    .eq('user_id', ctx.user.id)
    .eq('id', ctx.params.id)
    .maybeSingle();
  if (found.error) {
    throw new ApiError('INTERNAL', 'We could not open that write-up. Please try again.', {
      detail: found.error.message,
    });
  }
  const row = found.data as Record<string, unknown> | null;
  if (!row) throw new ApiError('NOT_FOUND', 'I could not find that write-up.');

  const review = (row.process_review as Record<string, unknown>) ?? {};
  const payload = (review.payload as DebriefPayload) ?? null;
  if (!payload) {
    throw new ApiError('NOT_FOUND', 'That write-up was saved in an older shape and cannot be opened.');
  }

  // 0018 added debriefs.kai_object_id; lesson_refs is the pre-0018 fallback.
  const refs = Array.isArray(row.lesson_refs) ? (row.lesson_refs as string[]) : [];
  const objectId = (row.kai_object_id as string) ?? refs[0] ?? null;
  let object = null;
  if (objectId) {
    const obj = await db
      .from('kai_objects')
      .select('id,type,payload,disclosures,model,prompt_version,refs,created_at')
      .eq('id', objectId)
      .maybeSingle();
    const o = obj.data as Record<string, unknown> | null;
    if (o) {
      object = envelope({
        id: String(o.id),
        type: o.type as never,
        payload: o.payload,
        model: String(o.model),
        createdAt: String(o.created_at),
        refs: (o.refs as Record<string, unknown>) ?? null,
        disclosures: (o.disclosures as string[]) ?? [],
      });
    }
  }

  const profile = await loadProfile(ctx.user.id);

  return ok(
    DebriefRow.parse({
      id: String(row.id),
      position_id: (row.position_id as string) ?? null,
      symbol: payload.symbol,
      created_at: String(row.created_at),
      kai_summary: (row.kai_summary as string) ?? null,
      payload,
      kai_object: object,
      simulated: payload.simulated,
      degraded: false,
      actions: [
        {
          action: 'save_lesson',
          label: 'Save lesson',
          enabled: profile.memory_enabled,
          hint: profile.memory_enabled ? null : 'Turn memory on in Account if you want me to remember this.',
          primary: true,
          route: null,
        },
        {
          action: 'chart_replay',
          label: 'Chart replay',
          enabled: false,
          hint: 'Chart replay arrives with the market worker.',
          primary: false,
          route: null,
        },
      ],
    })
  );
});
