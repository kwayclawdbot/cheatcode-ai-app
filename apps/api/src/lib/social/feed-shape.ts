/**
 * The pure half of the feed: cursors, media ordering, result cards, empty
 * copy. No database, no clock — `scripts/community-feed-test.ts` runs all of it
 * in microseconds.
 *
 * The ranking itself lives in SQL (`community_feed_page`, migration 0050) so
 * that the order and the cursor are computed in one place; the formula is
 * written out in docs/COMMUNITY-FEED-2026-09-21.md and proved against a real
 * database by `scripts/community-feed-proof.mts`.
 */
import type { CommunityCall } from '@shared/api';
import type { ChartAttachment, FeedTab, PostMedia, PostResult } from '@shared/community';
import { ChartAttachment as ChartAttachmentSchema } from '@shared/community';

/* ------------------------------------------------------------------ */
/* Cursors                                                              */
/* ------------------------------------------------------------------ */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SCORE_RE = /^-?\d{1,12}(\.\d{1,6})?$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:?\d{2})$/;

/**
 * A feed cursor is the (score, id) of the last row handed out. The score is a
 * STRING of the numeric the database produced (6 decimals), never re-printed
 * through a float, so the next page's `(score, id) < cursor` comparison is
 * exact and no post is skipped or repeated at a page boundary.
 */
export type FeedCursor = { s: string; i: string };

export function encodeFeedCursor(c: FeedCursor): string {
  return Buffer.from(JSON.stringify(c), 'utf8').toString('base64url');
}

/** Null for anything that is not a cursor this server wrote. Never throws. */
export function decodeFeedCursor(raw: string | undefined | null): FeedCursor | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Record<string, unknown>;
    const s = typeof v.s === 'string' ? v.s : typeof v.s === 'number' ? String(v.s) : '';
    const i = typeof v.i === 'string' ? v.i : '';
    if (!SCORE_RE.test(s) || !UUID_RE.test(i)) return null;
    return { s, i };
  } catch {
    return null;
  }
}

/** Thread and bookmark cursors: (ISO time, id). */
export type TimeCursor = { t: string; i: string };

export function encodeTimeCursor(c: TimeCursor): string {
  return Buffer.from(JSON.stringify(c), 'utf8').toString('base64url');
}

export function decodeTimeCursor(raw: string | undefined | null): TimeCursor | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Record<string, unknown>;
    const t = typeof v.t === 'string' ? v.t : '';
    const i = typeof v.i === 'string' ? v.i : '';
    if (!ISO_RE.test(t) || Number.isNaN(Date.parse(t)) || !UUID_RE.test(i)) return null;
    return { t, i };
  } catch {
    return null;
  }
}

/** A numeric from PostgREST can arrive as a number or a string; keep 6 decimals. */
export function scoreString(v: unknown): string {
  if (typeof v === 'string' && SCORE_RE.test(v)) return v;
  const n = Number(v);
  if (!Number.isFinite(n)) return '0';
  return n.toFixed(6).replace(/\.?0+$/, '') || '0';
}

/* ------------------------------------------------------------------ */
/* Media: pictures first, then charts                                   */
/* ------------------------------------------------------------------ */

type ImageView = {
  id: string;
  url: string | null;
  mime_type: string;
  width: number | null;
  height: number | null;
  bytes: number;
  aspect: number | null;
  position: number;
};

/**
 * Charts are read back out of `refs.charts` through the SAME schema that
 * accepted them, so a row edited by hand into nonsense is dropped here rather
 * than handed to a phone that will try to draw it.
 */
export function chartsFromRefs(refs: Record<string, unknown> | null | undefined): ChartAttachment[] {
  const raw = refs?.charts;
  if (!Array.isArray(raw)) return [];
  const out: ChartAttachment[] = [];
  for (const c of raw) {
    const parsed = ChartAttachmentSchema.safeParse(c);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

export function postMediaOf(images: ImageView[], refs: Record<string, unknown> | null | undefined): PostMedia[] {
  const pics = [...images]
    .sort((a, b) => a.position - b.position)
    .map((m, idx) => ({ ...m, type: 'image' as const, position: idx }));
  const charts = chartsFromRefs(refs).map((c, idx) => ({
    type: 'chart' as const,
    symbol: c.symbol,
    timeframe: c.timeframe,
    levels: c.levels,
    position: pics.length + idx,
  }));
  return [...pics, ...charts];
}

/* ------------------------------------------------------------------ */
/* The result card                                                      */
/* ------------------------------------------------------------------ */

/**
 * A result exists only for a call the resolver has RESOLVED. Open and
 * withdrawn calls have none — "points only from resolved outcomes" applies to
 * what is shown as an outcome as much as to what is scored.
 */
export function resultOf(call: CommunityCall | null | undefined): PostResult | null {
  if (!call) return null;
  if (call.status !== 'target' && call.status !== 'stop' && call.status !== 'expired') return null;
  return {
    call_id: call.id,
    symbol: call.symbol,
    direction: call.direction,
    status: call.status,
    outcome_label: call.outcome_label,
    result_pct: call.result_pct,
    resolved_at: call.resolved_at,
    scoreable: call.scoreable,
  };
}

/* ------------------------------------------------------------------ */
/* Copy                                                                 */
/* ------------------------------------------------------------------ */

export function feedEmptyPlain(tab: FeedTab, opts: { followsNobody?: boolean; firstPage: boolean }): string {
  if (!opts.firstPage) return 'That is everything.';
  switch (tab) {
    case 'following':
      return opts.followsNobody
        ? 'You are not following anyone yet. Follow a member and their posts land here.'
        : 'Nobody you follow has posted yet.';
    case 'trade_calls':
      return 'No calls yet. A call is a post with a direction and levels.';
    case 'media':
      return 'No charts or pictures yet.';
    default:
      return 'Nothing here yet. Be the first to post.';
  }
}

/** The thesis a call gets when the post did not give one: the post's words, trimmed to 280. */
export function thesisFor(body: string, symbol: string, direction: 'long' | 'short'): string {
  const text = body.replace(/\s+/g, ' ').trim();
  if (!text) return `${direction === 'long' ? 'Long' : 'Short'} ${symbol.toUpperCase()}`;
  if (text.length <= 280) return text;
  const cut = text.slice(0, 279);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > 200 ? cut.slice(0, sp) : cut).trimEnd()}…`;
}

/** Up to `max` distinct authors, most recent first, from replies already sorted newest-first. */
export function participantIds(replies: { parent_id: string; user_id: string | null }[], max = 3): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const r of replies) {
    if (!r.user_id) continue;
    const list = out.get(r.parent_id) ?? [];
    if (list.length < max && !list.includes(r.user_id)) list.push(r.user_id);
    out.set(r.parent_id, list);
  }
  return out;
}
