/**
 * THE FOLLOW GRAPH.
 *
 * Before 0038 a follow was a drawn button and an `AsyncStorage` key — it died
 * with the app's cache and was never visible to the person followed. It is a
 * row now, and the row is service-role only (0038 §6): a social write needs a
 * rate limit and a notification fan-out, and a PostgREST insert can do neither.
 *
 * FOLLOWER COUNTS ARE PUBLIC, FOLLOWER LISTS ARE NOT. This file returns numbers
 * and a boolean and never a list of people, which is why `follows` gets no read
 * policy: a policy that can serve the count can be paged into the list.
 */
import type { FollowState } from '@shared/api';
import { serviceClient } from '../db';
import { ApiError } from '../errors';
import { log } from '../log';

/**
 * The follow button's whole state, so the phone never infers half of it.
 *
 * `follower_count` is how many people follow THEM; `following_count` is how
 * many people they follow. Both are about the profile being looked at, not
 * about the caller — the caller's own side of it is the `following` boolean.
 */
export async function followState(viewerId: string, subjectId: string): Promise<FollowState> {
  const db = serviceClient();
  const [mine, followers, following] = await Promise.all([
    db
      .from('follows')
      .select('follower_id')
      .eq('follower_id', viewerId)
      .eq('followee_id', subjectId)
      .maybeSingle(),
    db.from('follows').select('*', { count: 'exact', head: true }).eq('followee_id', subjectId),
    db.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', subjectId),
  ]);

  return {
    user_id: subjectId,
    following: Boolean(mine.data),
    follower_count: followers.count ?? 0,
    following_count: following.count ?? 0,
  };
}

/** Everybody this person follows. The Following feed's whole input. */
export async function followeeIds(viewerId: string, limit = 500): Promise<string[]> {
  const db = serviceClient();
  const { data, error } = await db
    .from('follows')
    .select('followee_id')
    .eq('follower_id', viewerId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    log('warn', '-', 'social.followees_read_failed', { message: error.message });
    return [];
  }
  return ((data ?? []) as Record<string, unknown>[]).map((r) => String(r.followee_id));
}

export async function follow(opts: {
  viewerId: string;
  subjectId: string;
  requestId: string;
}): Promise<FollowState> {
  if (opts.viewerId === opts.subjectId) {
    // `follows_not_self` in 0038 refuses this too. It is caught here so the
    // member reads a sentence instead of a constraint name — the database is
    // the place that cannot forget, not the place that talks to people.
    throw new ApiError('VALIDATION_FAILED', 'You cannot follow yourself.');
  }

  const db = serviceClient();
  const exists = await db.from('profiles').select('user_id').eq('user_id', opts.subjectId).maybeSingle();
  if (!exists.data) throw new ApiError('NOT_FOUND', 'I could not find that member.');

  const { error } = await db
    .from('follows')
    .upsert({ follower_id: opts.viewerId, followee_id: opts.subjectId } as never, {
      // Following twice is not a state change and must not be an error: the
      // primary key already makes it one row, and a double tap is a double tap.
      onConflict: 'follower_id,followee_id',
      ignoreDuplicates: true,
    });
  if (error) {
    log('warn', opts.requestId, 'social.follow_failed', { message: error.message });
    throw new ApiError('INTERNAL', 'I could not save that. Please try again.');
  }
  return followState(opts.viewerId, opts.subjectId);
}

export async function unfollow(opts: {
  viewerId: string;
  subjectId: string;
  requestId: string;
}): Promise<FollowState> {
  const db = serviceClient();
  const { error } = await db
    .from('follows')
    .delete()
    .eq('follower_id', opts.viewerId)
    .eq('followee_id', opts.subjectId);
  if (error) {
    log('warn', opts.requestId, 'social.unfollow_failed', { message: error.message });
    throw new ApiError('INTERNAL', 'I could not save that. Please try again.');
  }
  // Unfollowing something you were not following is not an error either. The
  // answer to "am I following them" is no, which is what was asked for.
  return followState(opts.viewerId, opts.subjectId);
}
