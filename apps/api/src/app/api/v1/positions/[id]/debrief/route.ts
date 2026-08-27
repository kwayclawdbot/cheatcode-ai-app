/**
 * POST /api/v1/positions/:id/debrief
 *
 * Kai writes the debrief for a closed position and it is persisted through
 * SCHEMA-2's `record_debrief` RPC so the `debriefs` row and its `user_events`
 * row land in one transaction (01 §3). The object is also stored as a
 * `kai_object` of type `debrief` with model + prompt_version, which makes it an
 * audit record (00 §8) rather than a disposable message.
 *
 * The numbers are computed from orders, fills and plan events; only the
 * judgement is generated. See lib/kai/debrief.ts.
 */
import type { NextRequest } from 'next/server';
import { DebriefRow } from '@shared/api';
import { authedParams, ok, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { serviceClient } from '@/lib/db';
import { emitUserEvent } from '@/lib/events';
import { notify } from '@/lib/notify';
import { callRpc, noteFallback } from '@/lib/rpc';
import { loadDebriefSources } from '@/lib/debriefs';
import { generateDebrief } from '@/lib/kai/debrief';
import { persistKaiObject } from '@/lib/kai/objects';

export const dynamic = 'force-dynamic';

export const POST = authedParams<{ id: string }>(async (_req: NextRequest, ctx: Ctx & { params: { id: string } }) => {
  const db = serviceClient();
  const sources = await loadDebriefSources(ctx.user.id, ctx.params.id);
  if (!sources) throw new ApiError('NOT_FOUND', 'I could not find that trade.');
  if (!sources.position.closed_at) {
    throw new ApiError('STATE_CONFLICT', 'That trade is still open. I will write it up once it is closed.');
  }

  // 0018 puts a unique index on debriefs.position_id and `record_debrief`
  // REGENERATES in place, so asking again gives a fresh write-up rather than a
  // duplicate or a stale one.
  const generated = await generateDebrief(sources, ctx.requestId);
  const payload = generated.payload;

  const object = await persistKaiObject({
    type: 'debrief',
    payload,
    userId: ctx.user.id,
    refs: {
      position_id: sources.position.id,
      symbol: sources.position.symbol,
      user_id: ctx.user.id,
      simulated: sources.position.simulated,
    },
    model: generated.degraded ? 'deterministic/v1' : undefined,
    requestId: ctx.requestId,
  });

  const rpc = await callRpc<{ id?: string; created_at?: string } | string>(
    'record_debrief',
    {
      p_user_id: ctx.user.id,
      p_position_id: sources.position.id,
      p_outcome: payload.outcome,
      p_process_review: { payload, process_receipt: payload.process_receipt },
      p_kai_summary: payload.lesson_plain,
      p_kai_object_id: object?.id ?? null,
    },
    ctx.requestId
  );

  let debriefId: string | null = null;
  if (rpc.ok) {
    debriefId = typeof rpc.data === 'string' ? rpc.data : ((rpc.data as { id?: string })?.id ?? null);
  }

  if (!debriefId) {
    // FALLBACK (documented in README): insert + outbox as two round-trips.
    if (rpc.ok || rpc.missing) noteFallback(ctx.requestId, 'record_debrief');
    const inserted = await db
      .from('debriefs')
      .upsert(
        {
          user_id: ctx.user.id,
          position_id: sources.position.id,
          plan_id: sources.position.origin_plan_id,
          outcome: payload.outcome as never,
          process_review: { payload, process_receipt: payload.process_receipt } as never,
          kai_summary: payload.lesson_plain,
          kai_object_id: object?.id ?? null,
          lesson_refs: object?.id ? [object.id] : null,
        } as never,
        { onConflict: 'position_id' }
      )
      .select('id,created_at')
      .single();
    if (inserted.error || !inserted.data) {
      throw new ApiError('INTERNAL', 'We could not save that write-up. Please try again.', {
        detail: inserted.error?.message,
      });
    }
    debriefId = String((inserted.data as Record<string, unknown>).id);
    await emitUserEvent(
      ctx.user.id,
      'kai_result',
      'debrief',
      debriefId,
      { event: 'debrief_recorded', position_id: sources.position.id, symbol: sources.position.symbol },
      ctx.requestId
    );
  }

  await notify({
    userId: ctx.user.id,
    kind: 'debrief_ready',
    titlePlain: `Your ${sources.position.symbol} write-up is ready`,
    bodyPlain: payload.lesson_plain,
    route: `/debrief/${debriefId}`,
    payload: { debrief_id: debriefId, position_id: sources.position.id },
    requestId: ctx.requestId,
  });

  return ok(
    DebriefRow.parse({
      id: debriefId,
      position_id: sources.position.id,
      symbol: sources.position.symbol,
      created_at: new Date().toISOString(),
      kai_summary: payload.lesson_plain,
      payload,
      kai_object: object,
      simulated: sources.position.simulated,
      degraded: generated.degraded,
      actions: saveLessonActions(debriefId, sources.profile.memory_enabled),
    }),
    { status: 201 }
  );
});

function saveLessonActions(debriefId: string, memoryEnabled: boolean) {
  return [
    {
      action: 'save_lesson',
      label: 'Save lesson',
      enabled: memoryEnabled,
      hint: memoryEnabled ? null : 'Turn memory on in Account if you want me to remember this.',
      primary: true,
      route: `/debrief/${debriefId}`,
    },
    {
      action: 'chart_replay',
      label: 'Chart replay',
      enabled: false,
      hint: 'Chart replay arrives with the market worker.',
      primary: false,
      route: null,
    },
  ];
}
