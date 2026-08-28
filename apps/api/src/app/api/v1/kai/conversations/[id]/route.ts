/**
 * PATCH /api/v1/kai/conversations/:id  {title?, pinned?}
 *
 * Rename or pin one conversation from the Home drawer.
 *
 * A user-set title is FINAL: `autoTitle` only ever fills an empty title, so a
 * later turn cannot rename something the person named themselves.
 */
import type { NextRequest } from 'next/server';
import { PatchConversationRequest, PatchConversationResponse } from '@shared/api';
import { authedParams, ok, parseBody, type Ctx } from '@/lib/http';
import { serviceClient } from '@/lib/db';
import { ApiError } from '@/lib/errors';
import { emitUserEvent } from '@/lib/events';
import { loadConversations, setPinned, setTitle, toSummary } from '@/lib/round4/conversations';

export const dynamic = 'force-dynamic';

export const PATCH = authedParams<{ id: string }>(
  async (req: NextRequest, ctx: Ctx & { params: { id: string } }) => {
    const body = await parseBody(req, PatchConversationRequest);
    const db = serviceClient();

    const found = await db
      .from('conversations')
      .select('id')
      .eq('id', ctx.params.id)
      .eq('user_id', ctx.user.id)
      .maybeSingle();
    if (!found.data) throw new ApiError('NOT_FOUND', 'We could not find that conversation.');

    if (body.title !== undefined) await setTitle(ctx.user.id, ctx.params.id, body.title);
    if (body.pinned !== undefined) await setPinned(ctx.user.id, ctx.params.id, body.pinned);

    await emitUserEvent(
      ctx.user.id,
      'system',
      'conversation',
      ctx.params.id,
      { event: 'conversation_updated', fields: Object.keys(body) },
      ctx.requestId
    );

    const { rows, firstText } = await loadConversations({ userId: ctx.user.id, limit: 200 });
    const row = rows.find((r) => r.id === ctx.params.id);
    if (!row) throw new ApiError('NOT_FOUND', 'We could not find that conversation.');

    return ok(
      PatchConversationResponse.parse({
        conversation: toSummary(row, firstText.get(row.id) ?? null),
        plain:
          body.pinned === true
            ? 'Pinned to the top of your conversations.'
            : body.pinned === false
              ? 'Unpinned.'
              : 'Renamed.',
      })
    );
  }
);
