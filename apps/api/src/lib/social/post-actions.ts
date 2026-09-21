/**
 * Like, repost, bookmark — each ON is idempotent (the primary key is the rule)
 * and each OFF is a delete that is fine to repeat. Counts are read back off the
 * message row, where the 0033/0050 triggers keep them, so the number the phone
 * shows after a tap is the number everybody else sees.
 *
 * None of these joins the caller to a room. A moderator's mute still holds, and
 * a post the caller cannot see is NOT_FOUND (loadVisiblePost).
 */
import { serviceClient } from '../db';
import { ApiError } from '../errors';
import { rateLimit } from '../ratelimit';
import { ensureNotMuted, loadVisiblePost } from './posts';

const ACTION_LIMIT = 60;
const ACTION_WINDOW_MS = 60_000;

function limit(userId: string, what: string): void {
  rateLimit({
    key: `feed-${what}:${userId}`,
    limit: ACTION_LIMIT,
    windowMs: ACTION_WINDOW_MS,
    messagePlain: 'You are tapping very quickly. Give it a minute.',
  });
}

async function countOf(messageId: string, column: 'reaction_counts' | 'repost_count'): Promise<number> {
  const db = serviceClient();
  const { data } = await db.from('messages').select(column).eq('id', messageId).maybeSingle();
  const row = (data as Record<string, unknown> | null) ?? {};
  if (column === 'repost_count') return Number(row.repost_count ?? 0);
  const n = Number(((row.reaction_counts as Record<string, unknown> | null) ?? {}).like ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function setLike(opts: { postId: string; userId: string; on: boolean }): Promise<{ on: boolean; count: number }> {
  const { row, room } = await loadVisiblePost(opts.postId, opts.userId, { allowReply: true });
  await ensureNotMuted(room, opts.userId);
  limit(opts.userId, 'like');
  const db = serviceClient();
  if (opts.on) {
    const ins = await db
      .from('message_reactions')
      .upsert({ message_id: row.id, user_id: opts.userId, kind: 'like' } as never, {
        onConflict: 'message_id,user_id,kind',
        ignoreDuplicates: true,
      });
    if (ins.error) throw new ApiError('INTERNAL', 'That did not register. Try again.', { detail: ins.error.message });
  } else {
    await db.from('message_reactions').delete().eq('message_id', row.id).eq('user_id', opts.userId).eq('kind', 'like');
  }
  return { on: opts.on, count: await countOf(row.id, 'reaction_counts') };
}

export async function setRepost(opts: { postId: string; userId: string; on: boolean }): Promise<{ on: boolean; count: number }> {
  const { row, room } = await loadVisiblePost(opts.postId, opts.userId);
  const db = serviceClient();
  if (opts.on) {
    if (row.user_id === opts.userId) {
      throw new ApiError('VALIDATION_FAILED', 'That is your own post, so there is nothing to repost.', {
        detail: { reason: 'repost_own' },
      });
    }
    await ensureNotMuted(room, opts.userId);
    limit(opts.userId, 'repost');
    const ins = await db
      .from('post_reposts')
      .upsert({ message_id: row.id, user_id: opts.userId } as never, {
        onConflict: 'message_id,user_id',
        ignoreDuplicates: true,
      });
    if (ins.error) throw new ApiError('INTERNAL', 'That did not register. Try again.', { detail: ins.error.message });
  } else {
    limit(opts.userId, 'repost');
    await db.from('post_reposts').delete().eq('message_id', row.id).eq('user_id', opts.userId);
  }
  return { on: opts.on, count: await countOf(row.id, 'repost_count') };
}

export async function setBookmark(opts: { postId: string; userId: string; on: boolean }): Promise<{ bookmarked: boolean }> {
  const { row } = await loadVisiblePost(opts.postId, opts.userId);
  limit(opts.userId, 'bookmark');
  const db = serviceClient();
  if (opts.on) {
    const ins = await db
      .from('post_bookmarks')
      .upsert({ user_id: opts.userId, message_id: row.id } as never, {
        onConflict: 'user_id,message_id',
        ignoreDuplicates: true,
      });
    if (ins.error) throw new ApiError('INTERNAL', 'That did not save. Try again.', { detail: ins.error.message });
  } else {
    await db.from('post_bookmarks').delete().eq('user_id', opts.userId).eq('message_id', row.id);
  }
  return { bookmarked: opts.on };
}
