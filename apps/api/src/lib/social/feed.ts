/**
 * THE FOLLOWING FEED: what the people you follow have done, newest first.
 *
 * Two sources, one list. A member's published CALL and a member's shared TRADE
 * are different objects with different lifecycles, and merging them in the
 * database would have meant a view or a union that has to be re-asserted every
 * time either table grows a column. They are merged here instead, on one key:
 * when it happened. A call's moment is when it was published; a trade's is when
 * it was opened.
 *
 * "YOU FOLLOW NOBODY" IS NOT "THEY POSTED NOTHING". Those are different
 * situations with different answers — one is fixed by finding somebody to
 * follow and the other by waiting — so `follows_nobody` is its own flag and the
 * empty sentence is written from it. An app that shows the same grey box for
 * both is an app that cannot tell the user what to do next.
 *
 * THE TRADES COME THROUGH `readSharedTrades()` AND NOTHING ELSE. That helper is
 * where `profiles.share_trades` is joined; see the header of `shares.ts` for
 * why there is exactly one such function in this app.
 */
import type { FollowFeedItem, FollowFeedResponse } from '@shared/api';
import { serviceClient } from '../db';
import { log } from '../log';
import { loadAuthors } from './authors';
import { CALL_COLUMNS, shapeCall, toCallRow } from './calls';
import { followeeIds } from './follows';
import { readSharedTrades, shapeSharedTrade } from './shares';

/** Enough to scroll, small enough to assemble in one request. */
export const FEED_LIMIT = 50;

export async function followingFeed(opts: {
  viewerId: string;
  limit?: number;
  requestId: string;
}): Promise<FollowFeedResponse> {
  const limit = Math.min(Math.max(opts.limit ?? FEED_LIMIT, 1), FEED_LIMIT);
  const followees = await followeeIds(opts.viewerId);

  if (!followees.length) {
    return {
      items: [],
      follows_nobody: true,
      empty_plain:
        'You are not following anyone yet. Follow a member and their calls and shared trades land here.',
    };
  }

  const db = serviceClient();
  const [callsRes, shares] = await Promise.all([
    db
      .from('community_calls')
      .select(CALL_COLUMNS)
      .in('user_id', followees)
      // A withdrawn call is one the author took back before it resolved. It
      // leaves the feed with it.
      .neq('status', 'withdrawn')
      .order('published_at', { ascending: false })
      .limit(limit),
    readSharedTrades({ authorIds: followees, limit }),
  ]);

  if (callsRes.error) {
    log('warn', opts.requestId, 'social.feed_calls_failed', { message: callsRes.error.message });
  }
  const calls = ((callsRes.data ?? []) as Record<string, unknown>[]).map(toCallRow);

  const authors = await loadAuthors(
    [...calls.map((c) => c.user_id), ...shares.map((s) => s.user_id)],
    opts.requestId
  );

  const items: FollowFeedItem[] = [];
  for (const c of calls) {
    const author = authors.get(c.user_id);
    // An author we cannot draw is a row from an account that is being deleted
    // out from under us. Drop it rather than render a blank person.
    if (!author) continue;
    items.push({ kind: 'call', at: c.published_at, call: shapeCall(c, author) });
  }
  for (const s of shares) {
    const author = authors.get(s.user_id);
    if (!author) continue;
    items.push({ kind: 'trade', at: s.opened_at, trade: shapeSharedTrade(s, author) });
  }

  items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const page = items.slice(0, limit);

  return {
    items: page,
    follows_nobody: false,
    empty_plain: page.length
      ? null
      : 'Nobody you follow has published a call or shared a trade yet.',
  };
}
