/**
 * POST /api/v1/kai/conversations
 * {mode, pinned?} → {id}. Pinned context is stored on the row and re-read on
 * every message so Kai keeps talking about the same setup.
 */
import type { NextRequest } from 'next/server';
import { CreateConversationRequest, CreateConversationResponse } from '@shared/api';
import { authed, ok, parseBody, type Ctx } from '@/lib/http';
import { serviceClient } from '@/lib/db';
import { ApiError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

export const POST = authed(async (req: NextRequest, ctx: Ctx) => {
  const body = await parseBody(req, CreateConversationRequest);
  const db = serviceClient();

  const { data, error } = await db
    .from('conversations')
    .insert({
      user_id: ctx.user.id,
      mode: body.mode,
      title: body.title ?? null,
      context: { pinned: body.pinned ?? {} },
    })
    .select('id,mode,created_at')
    .single();

  if (error || !data) {
    throw new ApiError('INTERNAL', 'We could not start that conversation. Please try again.', {
      detail: error?.message,
    });
  }

  const row = data as unknown as { id: string; mode: string; created_at: string };
  return ok(
    CreateConversationResponse.parse({
      id: row.id,
      mode: row.mode,
      created_at: row.created_at,
    }),
    { status: 201 }
  );
});
