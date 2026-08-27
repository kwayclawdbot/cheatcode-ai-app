/** POST /api/v1/notifications/:id/read — stamps delivery.read_at. */
import type { NextRequest } from 'next/server';
import { authedParams, ok, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { serviceClient } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const POST = authedParams<{ id: string }>(async (_req: NextRequest, ctx: Ctx & { params: { id: string } }) => {
  const db = serviceClient();
  const found = await db
    .from('notifications')
    .select('id,delivery')
    .eq('user_id', ctx.user.id)
    .eq('id', ctx.params.id)
    .maybeSingle();
  const row = found.data as Record<string, unknown> | null;
  if (!row) throw new ApiError('NOT_FOUND', 'I could not find that one.');

  const delivery = { ...((row.delivery as Record<string, unknown>) ?? {}), read_at: new Date().toISOString() };
  const { error } = await db
    .from('notifications')
    .update({ delivery: delivery as never })
    .eq('id', ctx.params.id)
    .eq('user_id', ctx.user.id);
  if (error) {
    throw new ApiError('INTERNAL', 'We could not mark that as read. Please try again.', { detail: error.message });
  }

  return ok({ id: ctx.params.id, read: true });
});
