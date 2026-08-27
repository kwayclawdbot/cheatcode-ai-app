/**
 * PUT /api/v1/memory/settings {enabled}
 *
 * The master switch (`profiles.memory_enabled`). Turning it OFF stops reads and
 * writes but does not delete what is already there — deletion is its own
 * deliberate act, and silently destroying data on a toggle would be worse than
 * keeping it.
 */
import type { NextRequest } from 'next/server';
import { MemorySettingsRequest, MemoryResponse } from '@shared/api';
import { authed, ok, parseBody, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { serviceClient } from '@/lib/db';
import { emitUserEvent } from '@/lib/events';

export const dynamic = 'force-dynamic';

export const PUT = authed(async (req: NextRequest, ctx: Ctx) => {
  const body = await parseBody(req, MemorySettingsRequest);
  const db = serviceClient();

  const { error } = await db
    .from('profiles')
    .update({ memory_enabled: body.enabled })
    .eq('user_id', ctx.user.id);
  if (error) {
    throw new ApiError('INTERNAL', 'We could not save that change. Please try again.', { detail: error.message });
  }

  await emitUserEvent(
    ctx.user.id,
    'system',
    'profile',
    ctx.user.id,
    { event: 'memory_toggled', enabled: body.enabled },
    ctx.requestId
  );

  const rows = await db
    .from('kai_user_memory')
    .select('id,kind,content,refs,created_at')
    .eq('user_id', ctx.user.id)
    .is('superseded_by', null)
    .order('created_at', { ascending: false })
    .limit(200);

  return ok(
    MemoryResponse.parse({
      enabled: body.enabled,
      items: ((rows.data ?? []) as Record<string, unknown>[]).map((r) => ({
        id: String(r.id),
        kind: r.kind as never,
        content: String(r.content),
        refs: (r.refs as Record<string, unknown>) ?? null,
        created_at: String(r.created_at),
      })),
      empty_copy: body.enabled
        ? 'Memory is on. Anything I keep will show up here.'
        : 'Memory is off. What is already here stays until you delete it, and I will not read it.',
    })
  );
});
