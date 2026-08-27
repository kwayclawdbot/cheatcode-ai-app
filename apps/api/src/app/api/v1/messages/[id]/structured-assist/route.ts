/**
 * POST /api/v1/messages/:id/structured-assist
 *
 * Kai reads a member's POSTED draft idea and hands back an improved version
 * across the six fields in 08 §7 — direction & thesis, entry condition,
 * invalidation, risk & size, target & horizon, evidence.
 *
 * NOTHING IS PUBLISHED. `published:false` is a literal in the response type,
 * not a flag (see lib/kai/assist.ts, which carries the review itself and the
 * reasoning behind that). The room-scoped twin at
 * `POST /rooms/:id/structured-assist` runs the same review on a draft that was
 * never posted — which is the order 08 §7 actually asks for.
 */
import type { NextRequest } from 'next/server';
import { StructuredAssistResponse } from '@shared/api';
import { authedParams, ok, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { serviceClient } from '@/lib/db';
import { rateLimit } from '@/lib/ratelimit';
import { runStructuredAssist } from '@/lib/kai/assist';
import { loadMembership, requireMember, loadRoom } from '@/lib/rooms';

export const dynamic = 'force-dynamic';

export const POST = authedParams<{ id: string }>(async (_req: NextRequest, ctx: Ctx & { params: { id: string } }) => {
  const db = serviceClient();
  const found = await db
    .from('messages')
    .select('id,room_id,user_id,body,structured_idea')
    .eq('id', ctx.params.id)
    .maybeSingle();
  const row = found.data as Record<string, unknown> | null;
  if (!row) throw new ApiError('NOT_FOUND', 'I could not find that draft.');

  const room = await loadRoom(String(row.room_id));
  const membership = await loadMembership(String(row.room_id), ctx.user.id);
  requireMember(membership, String(room?.name ?? 'that room'));
  if (String(row.user_id) !== ctx.user.id) {
    throw new ApiError('FORBIDDEN', 'I only rework your own drafts.');
  }

  rateLimit({
    key: `assist:${ctx.user.id}`,
    limit: 6,
    windowMs: 60_000,
    messagePlain: 'Give me a moment to catch up with the last one.',
  });

  const result = await runStructuredAssist({
    userId: ctx.user.id,
    original: ((row.structured_idea as Record<string, unknown>) ?? {}) as Record<string, unknown>,
    draftText: String(row.body ?? ''),
    roomMode: (room?.mode as string) ?? null,
    draftId: String(row.id),
    requestId: ctx.requestId,
  });

  return ok(StructuredAssistResponse.parse(result));
});
