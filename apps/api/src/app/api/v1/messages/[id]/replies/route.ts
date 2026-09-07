/**
 * GET /api/v1/messages/:id/replies
 *
 * The comments on one post, oldest first, with the post itself at the top so
 * the screen never has to hold two requests in its head.
 *
 * THERE IS NO PAGINATION AND THAT IS A DECISION, not an omission. Threads here
 * are one level deep (migration 0033 §1), which means a thread is the comments
 * on one post and nothing else. If one ever grows past a few hundred, the room
 * has a bigger problem than a missing cursor, and a hard cap that says so is
 * more honest than a "load more" that quietly hides how loud a thread got.
 *
 * A REMOVED COMMENT STILL COMES BACK, with a null body and `deleted` true, the
 * same way it does in the room. Its place in the conversation is information:
 * a reply that answers something that is no longer there reads as a non-sequitur
 * unless the gap is visible.
 */
import type { NextRequest } from 'next/server';
import { RepliesResponse } from '@shared/api';
import { authedParams, ok, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { serviceClient } from '@/lib/db';
import { attachmentsForMessages } from '@/lib/media/store';
import {
  MESSAGE_COLUMNS,
  authorsFor,
  callsFor,
  loadMembership,
  objectsFor,
  quotesFor,
  reactionsMineFor,
  requireMember,
  toMessageRow,
  loadRoom,
} from '@/lib/rooms';

export const dynamic = 'force-dynamic';

const MAX_REPLIES = 300;

export const GET = authedParams<{ id: string }>(
  async (_req: NextRequest, ctx: Ctx & { params: { id: string } }) => {
    const db = serviceClient();

    const parentRes = await db
      .from('messages_public')
      .select(MESSAGE_COLUMNS)
      .eq('id', ctx.params.id)
      .maybeSingle();
    const parentRow = (parentRes.data as Record<string, unknown> | null) ?? null;
    if (!parentRow) throw new ApiError('NOT_FOUND', 'I could not find that post.');

    const roomId = String(parentRow.room_id);
    const room = await loadRoom(roomId);
    const membership = await loadMembership(roomId, ctx.user.id);
    requireMember(membership, String(room?.name ?? 'that room'));

    const repliesRes = await db
      .from('messages_public')
      .select(MESSAGE_COLUMNS)
      .eq('parent_id', ctx.params.id)
      .order('seq', { ascending: true })
      .limit(MAX_REPLIES);
    const replyRows = (repliesRes.data ?? []) as Record<string, unknown>[];

    const all = [parentRow, ...replyRows];
    const ids = all.map((r) => String(r.id));

    // Six batched lookups for the whole thread. Never one per row.
    //
    // `quotes` matters most HERE. A thread is one level deep, so a comment
    // answering another comment says so by quoting it (migration 0035 §2) —
    // this is the screen where nearly every quote in the app is read, and
    // resolving them one at a time would be a query per comment.
    //
    // `calls` matters here for a different reason: a call is a post people
    // reply to, so opening the thread on one is the SECOND place its card has
    // to draw. Without it the post at the top of the comments would be a bare
    // sentence while the same post in the room above was a card.
    const [authors, objects, mine, media, quotes, calls] = await Promise.all([
      authorsFor(all.map((r) => String(r.user_id ?? ''))),
      objectsFor(
        all
          .map((r) => (r.refs as Record<string, unknown> | null)?.kai_object_id)
          .filter((v): v is string => typeof v === 'string')
      ),
      reactionsMineFor(ids, ctx.user.id),
      attachmentsForMessages(all.filter((r) => Number(r.attachment_count ?? 0) > 0).map((r) => String(r.id))),
      quotesFor(all.map((r) => r.quoted_message_id).filter((v): v is string => typeof v === 'string')),
      callsFor(
        all
          .map((r) => (r.refs as Record<string, unknown> | null)?.community_call_id)
          .filter((v): v is string => typeof v === 'string')
      ),
    ]);

    const extras = { mine, media, quotes, calls };

    return ok(
      RepliesResponse.parse({
        parent: toMessageRow(parentRow, authors, objects, extras),
        replies: replyRows.map((r) => toMessageRow(r, authors, objects, extras)),
        empty_copy: 'No comments yet. Be the first to say something about this.',
      })
    );
  }
);
