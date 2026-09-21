/**
 * THE FEED, ONE TAB AT A TIME — pages, de-duplication and the three toggles.
 *
 * Paging: the server's cursor is opaque. Counts move between pages, so a post
 * can shift a place while somebody scrolls (docs/COMMUNITY-FEED-2026-09-21.md,
 * "the client should de-duplicate by id") — `append` drops ids already shown.
 *
 * Toggles are optimistic, then corrected by the server's own `{on, count}`;
 * a refusal puts the old state back and hands the server's sentence up.
 *
 * Source is said, never hidden: `fixtures` only behind EXPO_PUBLIC_FIXTURES,
 * `unreachable` when the service did not answer (never example posts).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CommunityPost, FeedTab } from '@shared/community';
import { api } from '../../../lib/api';
import { env } from '../../../lib/env';
import { fixtureFeed } from './fixtures';

export type FeedSource = 'api' | 'fixtures' | 'unreachable';

type TabState = {
  posts: CommunityPost[];
  cursor: string | null;
  done: boolean;
  loaded: boolean;
  empty: string | null;
  source: FeedSource;
  error: string | null;
};

const BLANK: TabState = { posts: [], cursor: null, done: false, loaded: false, empty: null, source: 'api', error: null };

export function useFeed(tab: FeedTab) {
  const [byTab, setByTab] = useState<Partial<Record<FeedTab, TabState>>>({});
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const inflight = useRef<Set<string>>(new Set());
  const state = byTab[tab] ?? BLANK;

  const put = useCallback((t: FeedTab, patch: Partial<TabState>) => {
    setByTab((prev) => ({ ...prev, [t]: { ...(prev[t] ?? BLANK), ...patch } }));
  }, []);

  const loadFirst = useCallback(async (t: FeedTab) => {
    if (env.FIXTURES) {
      const f = fixtureFeed(t);
      put(t, { posts: f.posts, cursor: null, done: true, loaded: true, empty: f.empty_plain, source: 'fixtures', error: null });
      return;
    }
    if (!api.available()) {
      put(t, { loaded: true, source: 'unreachable', error: 'The service is not connected.' });
      return;
    }
    try {
      const r = await api.communityFeed(t, null);
      put(t, {
        posts: r.posts, cursor: r.next_cursor, done: !r.next_cursor, loaded: true,
        empty: r.empty_plain, source: 'api', error: null,
      });
    } catch (e) {
      put(t, { loaded: true, source: 'unreachable', error: e instanceof Error ? e.message : 'The feed did not load.' });
    }
  }, [put]);

  useEffect(() => {
    if (!byTab[tab]?.loaded) void loadFirst(tab);
  }, [tab, byTab, loadFirst]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await loadFirst(tab);
    setRefreshing(false);
  }, [tab, loadFirst]);

  const loadMore = useCallback(async () => {
    const s = byTab[tab];
    if (!s || s.done || !s.cursor || loadingMore) return;
    const key = `${tab}:${s.cursor}`;
    if (inflight.current.has(key)) return;
    inflight.current.add(key);
    setLoadingMore(true);
    try {
      const r = await api.communityFeed(tab, s.cursor);
      setByTab((prev) => {
        const cur = prev[tab] ?? BLANK;
        const seen = new Set(cur.posts.map((p) => p.id));
        const added = r.posts.filter((p) => !seen.has(p.id));
        return { ...prev, [tab]: { ...cur, posts: [...cur.posts, ...added], cursor: r.next_cursor, done: !r.next_cursor } };
      });
    } catch {
      /* the next scroll retries; a failed page is not worth a banner */
    } finally {
      inflight.current.delete(key);
      setLoadingMore(false);
    }
  }, [tab, byTab, loadingMore]);

  /** Write one post everywhere it appears, across all loaded tabs. */
  const patchPost = useCallback((id: string, fn: (p: CommunityPost) => CommunityPost) => {
    setByTab((prev) => {
      const next: typeof prev = {};
      for (const [k, v] of Object.entries(prev) as [FeedTab, TabState][]) {
        next[k] = { ...v, posts: v.posts.map((p) => (p.id === id ? fn(p) : p)) };
      }
      return next;
    });
  }, []);

  const removePost = useCallback((id: string) => {
    setByTab((prev) => {
      const next: typeof prev = {};
      for (const [k, v] of Object.entries(prev) as [FeedTab, TabState][]) next[k] = { ...v, posts: v.posts.filter((p) => p.id !== id) };
      return next;
    });
  }, []);

  /** A post of your own lands at the top of For You without a reload. */
  const prepend = useCallback((p: CommunityPost) => {
    setByTab((prev) => {
      const cur = prev.for_you;
      if (!cur) return prev;
      return { ...prev, for_you: { ...cur, posts: [p, ...cur.posts.filter((x) => x.id !== p.id)] } };
    });
  }, []);

  return { ...state, loadingMore, refreshing, refresh, loadMore, patchPost, removePost, prepend };
}

export type PostToggleKind = 'like' | 'repost' | 'bookmark';

/**
 * One toggle, optimistic then settled. Returns the server's refusal sentence,
 * or null when it landed. Works for any list that can patch a post by id.
 */
export async function togglePost(
  post: CommunityPost,
  kind: PostToggleKind,
  patch: (id: string, fn: (p: CommunityPost) => CommunityPost) => void,
): Promise<string | null> {
  const before = post;
  const on = kind === 'like' ? !post.liked : kind === 'repost' ? !post.reposted : !post.bookmarked;
  const bump = (n: number) => Math.max(0, n + (on ? 1 : -1));
  patch(post.id, (p) =>
    kind === 'like' ? { ...p, liked: on, like_count: bump(p.like_count) }
    : kind === 'repost' ? { ...p, reposted: on, repost_count: bump(p.repost_count) }
    : { ...p, bookmarked: on });
  if (env.FIXTURES) return null;
  try {
    if (kind === 'like') {
      const r = await api.setPostLike(post.id, on);
      patch(post.id, (p) => ({ ...p, liked: r.on, like_count: r.count }));
    } else if (kind === 'repost') {
      const r = await api.setPostRepost(post.id, on);
      patch(post.id, (p) => ({ ...p, reposted: r.on, repost_count: r.count }));
    } else {
      const r = await api.setPostBookmark(post.id, on);
      patch(post.id, (p) => ({ ...p, bookmarked: r.bookmarked }));
    }
    return null;
  } catch (e) {
    patch(post.id, () => before);
    return e instanceof Error ? e.message : 'That did not register.';
  }
}
