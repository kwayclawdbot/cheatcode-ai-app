/**
 * GET  /api/v1/community/posts/:id/replies?cursor=&limit= — replies, oldest first
 * POST /api/v1/community/posts/:id/replies                 — reply to a post
 *
 * A reply is a message with parent_id, in the POST'S room — the feed room, or
 * the chat a call post lives in (the replier becomes a member of that chat,
 * because core rooms are open and post_room_message requires membership). One
 * level only: replying to a reply is refused by the database (0033).
 *
 * Same checks as any post: a username, ban/mute, the shared 10/min bucket,
 * spam precheck, attachments that are yours, the advice tripwire.
 */
import type { NextRequest } from 'next/server';
import { ADVICE_NUDGE_PLAIN } from '@shared/api';
import { CreateReplyBody, PostWriteResponse, ThreadQuery } from '@shared/community';
import { authedParams, ok, parseBody, parseQuery, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { serviceClient } from '@/lib/db';
import { rateLimit } from '@/lib/ratelimit';
import { spamPrecheck } from '@/lib/spam';
import { adviceCheck, flagAdviceShaped } from '@/lib/moderation';
import { callRpc } from '@/lib/rpc';
import { attachToMessage } from '@/lib/media/store';
import {
  ensureCanWrite,
  hydratePosts,
  loadPostRows,
  loadVisiblePost,
  postWriteError,
  requireHandle,
  validateAttachments,
} from '@/lib/social/posts';
import { repliesPage } from '@/lib/social/threads';

export const dynamic = 'force-dynamic';

export const GET = authedParams<{ id: string }>(async (req: NextRequest, ctx: Ctx & { params: { id: string } }) => {
  const q = parseQuery(req, ThreadQuery);
  const { row } = await loadVisiblePost(ctx.params.id, ctx.user.id);
  const page = await repliesPage({ parentId: row.id, viewerId: ctx.user.id, limit: q.limit, cursor: q.cursor ?? null });
  return ok({
    post_id: row.id,
    replies: page.replies,
    next_cursor: page.next_cursor,
    empty_plain: page.replies.length ? null : q.cursor ? 'That is everything.' : 'No replies yet.',
  });
});

export const POST = authedParams<{ id: string }>(async (req: NextRequest, ctx: Ctx & { params: { id: string } }) => {
  const body = await parseBody(req, CreateReplyBody);
  const parent = await loadVisiblePost(ctx.params.id, ctx.user.id, { allowReply: true });
  if (parent.row.parent_id) {
    throw new ApiError('VALIDATION_FAILED', 'You can reply to a post, but not to a reply. Reply to the post itself.');
  }
  await requireHandle(ctx.user.id);
  await ensureCanWrite(parent.room, ctx.user.id, ctx.requestId);

  rateLimit({
    key: `room-post:${ctx.user.id}`,
    limit: 10,
    windowMs: 60_000,
    messagePlain: 'You are posting quickly. Give it a minute.',
  });

  const text = body.body.trim();
  const db = serviceClient();
  if (text) {
    const previous = await db
      .from('messages')
      .select('body')
      .eq('room_id', parent.room.id)
      .eq('user_id', ctx.user.id)
      .order('seq', { ascending: false })
      .limit(1)
      .maybeSingle();
    const verdict = spamPrecheck(text, ((previous.data as Record<string, unknown> | null)?.body as string) ?? null);
    if (!verdict.ok) throw new ApiError('VALIDATION_FAILED', verdict.plain, { detail: { reason: verdict.reason } });
  }
  const attachmentIds = await validateAttachments(body.attachment_ids, ctx.user.id);

  const rpc = await callRpc<Record<string, unknown> | Record<string, unknown>[]>(
    'post_room_message',
    {
      p_user_id: ctx.user.id,
      p_room_id: parent.room.id,
      p_kind: 'text',
      p_body: text || null,
      p_refs: null,
      p_structured_idea: null,
      p_position_disclosure: null,
      p_parent_id: parent.row.id,
    },
    ctx.requestId
  );
  const inserted = rpc.ok ? (Array.isArray(rpc.data) ? (rpc.data[0] ?? null) : rpc.data) : null;
  if (!inserted) throw postWriteError(rpc.ok ? '' : rpc.missing ? 'rpc missing' : rpc.message);
  const messageId = String(inserted.id);

  if (attachmentIds.length) {
    await attachToMessage({ assetIds: attachmentIds, ownerId: ctx.user.id, messageId, requestId: ctx.requestId });
  }
  const advice = adviceCheck(text);
  if (advice.flagged) {
    await flagAdviceShaped({ messageId, roomId: parent.room.id, notes: advice.notes, requestId: ctx.requestId });
  }

  const row = (await loadPostRows([messageId])).get(messageId);
  if (!row) throw new ApiError('INTERNAL', 'Replied, but I could not read it back. Pull to refresh.');
  const [post] = await hydratePosts([row], ctx.user.id);
  return ok(PostWriteResponse.parse({ post, plain: advice.flagged ? ADVICE_NUDGE_PLAIN : 'Replied.' }), { status: 201 });
});
