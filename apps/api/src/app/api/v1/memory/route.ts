/**
 * GET /api/v1/memory · DELETE /api/v1/memory
 *
 * What Kai remembers about this person, and the ability to delete all of it.
 *
 * 00 §8: deletion is a HARD delete — the row and its embedding go, together, in
 * one statement. There is no soft-delete column and no tombstone, because a
 * user who deletes their memory has to be able to believe it is gone.
 */
import type { NextRequest } from 'next/server';
import { MemoryResponse, MemoryDeleteResponse } from '@shared/api';
import { authed, ok, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { serviceClient } from '@/lib/db';
import { emitUserEvent } from '@/lib/events';
import { loadProfile } from '@/lib/kai/context';

export const dynamic = 'force-dynamic';

export const GET = authed(async (_req: NextRequest, ctx: Ctx) => {
  const db = serviceClient();
  const [profile, rows] = await Promise.all([
    loadProfile(ctx.user.id),
    db
      .from('kai_user_memory')
      .select('id,kind,content,refs,created_at')
      .eq('user_id', ctx.user.id)
      .is('superseded_by', null)
      .order('created_at', { ascending: false })
      .limit(200),
  ]);
  if (rows.error) {
    throw new ApiError('INTERNAL', 'We could not load that. Please try again.', { detail: rows.error.message });
  }

  return ok(
    MemoryResponse.parse({
      enabled: profile.memory_enabled,
      items: ((rows.data ?? []) as Record<string, unknown>[]).map((r) => ({
        id: String(r.id),
        kind: r.kind as never,
        content: String(r.content),
        refs: (r.refs as Record<string, unknown>) ?? null,
        created_at: String(r.created_at),
      })),
      empty_copy: profile.memory_enabled
        ? 'I have not kept anything yet. When something is worth remembering, it will show up here and you can delete it.'
        : 'Memory is off, so I am not keeping anything.',
    })
  );
});

export const DELETE = authed(async (_req: NextRequest, ctx: Ctx) => {
  const db = serviceClient();
  const { data, error } = await db
    .from('kai_user_memory')
    .delete()
    .eq('user_id', ctx.user.id)
    .select('id');
  if (error) {
    throw new ApiError('INTERNAL', 'We could not delete that. Please try again.', { detail: error.message });
  }

  const deleted = (data ?? []).length;
  await emitUserEvent(
    ctx.user.id,
    'system',
    'kai_user_memory',
    ctx.user.id,
    { event: 'memory_deleted_all', count: deleted },
    ctx.requestId
  );

  return ok(
    MemoryDeleteResponse.parse({
      deleted,
      plain: deleted
        ? `Deleted ${deleted} item${deleted === 1 ? '' : 's'}. That is gone — embeddings and all.`
        : 'There was nothing to delete.',
    })
  );
});
