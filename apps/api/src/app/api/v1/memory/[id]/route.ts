/** DELETE /api/v1/memory/:id — hard-deletes one remembered item (00 §8). */
import type { NextRequest } from 'next/server';
import { MemoryDeleteResponse } from '@shared/api';
import { authedParams, ok, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { serviceClient } from '@/lib/db';
import { emitUserEvent } from '@/lib/events';

export const dynamic = 'force-dynamic';

export const DELETE = authedParams<{ id: string }>(async (_req: NextRequest, ctx: Ctx & { params: { id: string } }) => {
  const db = serviceClient();
  const { data, error } = await db
    .from('kai_user_memory')
    .delete()
    .eq('user_id', ctx.user.id)
    .eq('id', ctx.params.id)
    .select('id');
  if (error) {
    throw new ApiError('INTERNAL', 'We could not delete that. Please try again.', { detail: error.message });
  }
  if (!(data ?? []).length) throw new ApiError('NOT_FOUND', 'I could not find that one.');

  await emitUserEvent(
    ctx.user.id,
    'system',
    'kai_user_memory',
    ctx.params.id,
    { event: 'memory_deleted' },
    ctx.requestId
  );

  return ok(MemoryDeleteResponse.parse({ deleted: 1, plain: 'Deleted. I will not bring that up again.' }));
});
