/**
 * The feed's database half: which messages are posts, who may act on them, and
 * how a page of message rows becomes a page of `CommunityPost`s.
 *
 * A POST IS A MESSAGE (docs/COMMUNITY-FEED-2026-09-21.md). Every write here goes
 * through `post_room_message` (0018) — the same membership, ban, mute, posting
 * restriction and slow-mode checks a room post gets — and every read hydrates
 * with the same batched helpers a room page uses. Nothing here is a second copy
 * of a rule that lives somewhere else.
 *
 * SECURITY: the service role bypasses RLS, so the rules are here. A post is
 * visible when it is standing and in the feed room, or standing, in a core room
 * and carrying a member call — and never in a room where the viewer is banned.
 * Bookmarks and reposts are read only for the viewer.
 */
import type { CommunityCall, MessageQuote, SocialAuthor } from '@shared/api';
import type { CommunityPost, FeedTab, PostRoom } from '@shared/community';
import { serviceClient } from '../db';
import { ApiError } from '../errors';
import { log } from '../log';
import { agePlain } from '../moderation';
import { attachmentsForMessages } from '../media/store';
import { callsFor, isModerationMuted, joinCoreRoom, loadMembership, quotesFor } from '../rooms';
import { loadAuthors } from './authors';
import { participantIds, postMediaOf, resultOf } from './feed-shape';

/* ------------------------------------------------------------------ */
/* The feed room                                                        */
/* ------------------------------------------------------------------ */

export type RoomLite = { id: string; slug: string | null; name: string; type: string; config: Record<string, unknown> };

let feedRoomCache: { room: RoomLite; at: number } | null = null;
const FEED_ROOM_TTL_MS = 5 * 60_000;

/** Looked up by `config.surface = feed` (0050), never by name. */
export async function feedRoom(): Promise<RoomLite> {
  if (feedRoomCache && Date.now() - feedRoomCache.at < FEED_ROOM_TTL_MS) return feedRoomCache.room;
  const db = serviceClient();
  const { data } = await db
    .from('rooms')
    .select('id,slug,name,type,config')
    .eq('type', 'core')
    .eq('config->>surface', 'feed')
    .limit(1)
    .maybeSingle();
  if (!data) {
    throw new ApiError('INTERNAL', 'The community feed is not set up yet. Please try again later.', {
      status: 503,
      detail: { reason: 'feed_room_missing', migration: '0050' },
    });
  }
  const room = toRoomLite(data as Record<string, unknown>);
  feedRoomCache = { room, at: Date.now() };
  return room;
}

/** Test seam. */
export function resetFeedRoomCache(): void {
  feedRoomCache = null;
}

function toRoomLite(r: Record<string, unknown>): RoomLite {
  return {
    id: String(r.id),
    slug: (r.slug as string) ?? null,
    name: String(r.name ?? ''),
    type: String(r.type ?? ''),
    config: (r.config as Record<string, unknown>) ?? {},
  };
}

/* ------------------------------------------------------------------ */
/* Rows                                                                 */
/* ------------------------------------------------------------------ */

export const POST_COLUMNS =
  'id,room_id,user_id,seq,kind,body,parent_id,refs,deleted_at,created_at,reaction_counts,reply_count,repost_count,attachment_count,author_deleted,quoted_message_id';

export type PostRow = {
  id: string;
  room_id: string;
  user_id: string | null;
  body: string | null;
  parent_id: string | null;
  refs: Record<string, unknown> | null;
  deleted_at: string | null;
  created_at: string;
  reaction_counts: Record<string, unknown>;
  reply_count: number;
  repost_count: number;
  attachment_count: number;
  author_deleted: boolean;
  quoted_message_id: string | null;
};

export function toPostRow(r: Record<string, unknown>): PostRow {
  return {
    id: String(r.id),
    room_id: String(r.room_id),
    user_id: (r.user_id as string) ?? null,
    body: (r.body as string) ?? null,
    parent_id: (r.parent_id as string) ?? null,
    refs: (r.refs as Record<string, unknown>) ?? null,
    deleted_at: (r.deleted_at as string) ?? null,
    created_at: String(r.created_at),
    reaction_counts: (r.reaction_counts as Record<string, unknown>) ?? {},
    reply_count: Number(r.reply_count ?? 0),
    repost_count: Number(r.repost_count ?? 0),
    attachment_count: Number(r.attachment_count ?? 0),
    author_deleted: Boolean(r.author_deleted),
    quoted_message_id: (r.quoted_message_id as string) ?? null,
  };
}

export async function loadPostRows(ids: string[]): Promise<Map<string, PostRow>> {
  const out = new Map<string, PostRow>();
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return out;
  const db = serviceClient();
  const { data, error } = await db.from('messages').select(POST_COLUMNS).in('id', uniq);
  if (error) throw new ApiError('INTERNAL', 'We could not load those posts. Please try again.', { detail: error.message });
  for (const r of (data ?? []) as Record<string, unknown>[]) out.set(String(r.id), toPostRow(r));
  return out;
}

function callIdOf(row: PostRow): string | null {
  const v = row.refs?.community_call_id;
  return typeof v === 'string' ? v : null;
}

function resultCallIdOf(row: PostRow): string | null {
  const v = row.refs?.result_call_id;
  return typeof v === 'string' ? v : null;
}

/* ------------------------------------------------------------------ */
/* Visibility                                                           */
/* ------------------------------------------------------------------ */

async function roomsById(ids: string[]): Promise<Map<string, RoomLite>> {
  const out = new Map<string, RoomLite>();
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return out;
  const db = serviceClient();
  const { data } = await db.from('rooms').select('id,slug,name,type,config').in('id', uniq);
  for (const r of (data ?? []) as Record<string, unknown>[]) out.set(String(r.id), toRoomLite(r));
  return out;
}

async function bannedRooms(viewerId: string, roomIds: string[]): Promise<Set<string>> {
  const uniq = [...new Set(roomIds.filter(Boolean))];
  if (!uniq.length) return new Set();
  const db = serviceClient();
  const { data } = await db
    .from('room_members')
    .select('room_id,banned')
    .eq('user_id', viewerId)
    .in('room_id', uniq);
  return new Set(
    ((data ?? []) as Record<string, unknown>[]).filter((r) => r.banned === true).map((r) => String(r.room_id))
  );
}

/** Is a TOP-LEVEL row a feed post? (Standing is checked by the caller.) */
function isFeedPostRow(row: PostRow, room: RoomLite | undefined, feedId: string): boolean {
  if (!room || row.parent_id) return false;
  if (!row.user_id) return false;
  if (room.id === feedId) return true;
  return room.type === 'core' && callIdOf(row) !== null;
}

export type VisiblePost = { row: PostRow; room: RoomLite; parent: PostRow | null };

const NOT_FOUND = () => new ApiError('NOT_FOUND', 'I could not find that post. It may have been deleted.');

/**
 * Load one post (or one reply to a post) the viewer may see. Deleted posts,
 * posts outside the feed, and posts in a room the viewer is banned from all
 * answer the same NOT_FOUND — this route does not confirm which ids exist.
 */
export async function loadVisiblePost(
  id: string,
  viewerId: string,
  opts?: { allowReply?: boolean; allowDeleted?: boolean }
): Promise<VisiblePost> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw NOT_FOUND();
  const rows = await loadPostRows([id]);
  const row = rows.get(id);
  if (!row) throw NOT_FOUND();
  if (row.deleted_at && !opts?.allowDeleted) throw NOT_FOUND();

  let top = row;
  let parent: PostRow | null = null;
  if (row.parent_id) {
    if (!opts?.allowReply) throw NOT_FOUND();
    parent = (await loadPostRows([row.parent_id])).get(row.parent_id) ?? null;
    if (!parent || parent.deleted_at) throw NOT_FOUND();
    top = parent;
  }

  const [feed, rooms] = await Promise.all([feedRoom(), roomsById([top.room_id])]);
  const room = rooms.get(top.room_id);
  if (!isFeedPostRow(top, room, feed.id) || !room) throw NOT_FOUND();
  const banned = await bannedRooms(viewerId, [room.id]);
  if (banned.has(room.id)) throw NOT_FOUND();
  return { row, room, parent };
}

/**
 * Before a member WRITES into a room through the feed (a post or a reply):
 * they become a member if they were not (core rooms are open to everyone, and
 * `post_room_message` requires membership), and a moderator's mute holds.
 */
export async function ensureCanWrite(room: RoomLite, userId: string, requestId: string): Promise<void> {
  await joinCoreRoom({
    roomId: room.id,
    userId,
    roomName: room.name,
    requestId,
    bannedPlain: 'You cannot post there.',
  });
  const m = await loadMembership(room.id, userId);
  if (!m || m.banned) throw new ApiError('ROOM_RESTRICTED', 'You cannot post there.');
  if (isModerationMuted(m)) throw new ApiError('ROOM_RESTRICTED', 'A moderator has muted you here right now.');
  if (room.config.posting_restricted && m.role === 'member') {
    throw new ApiError('ROOM_RESTRICTED', 'This room is read-only right now.');
  }
}

/** Likes, reposts and bookmarks do not join anyone to anything, but a mute still holds. */
export async function ensureNotMuted(room: RoomLite, userId: string): Promise<void> {
  const m = await loadMembership(room.id, userId);
  if (m && isModerationMuted(m)) throw new ApiError('ROOM_RESTRICTED', 'A moderator has muted you here right now.');
}

/** The sentence a member needs before they can post: the name it will be signed with. */
export async function requireHandle(userId: string): Promise<void> {
  const db = serviceClient();
  const { data } = await db.from('profiles').select('handle').eq('user_id', userId).maybeSingle();
  if (!((data as { handle?: string | null } | null)?.handle ?? null)) {
    throw new ApiError(
      'VALIDATION_FAILED',
      'Pick a username before you post. It is the name this will be signed with, and the name other members can mention you by.',
      { detail: { reason: 'handle_required', route: '/account/username' } }
    );
  }
}

/* ------------------------------------------------------------------ */
/* Hydration                                                            */
/* ------------------------------------------------------------------ */

async function mineFor(table: 'post_reposts' | 'post_bookmarks', ids: string[], viewerId: string): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const db = serviceClient();
  const { data, error } = await db.from(table).select('message_id').eq('user_id', viewerId).in('message_id', ids);
  if (error) log('warn', '-', 'social.post_mine_failed', { table, message: error.message });
  return new Set(((data ?? []) as Record<string, unknown>[]).map((r) => String(r.message_id)));
}

async function likedFor(ids: string[], viewerId: string): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const db = serviceClient();
  const { data } = await db
    .from('message_reactions')
    .select('message_id')
    .eq('user_id', viewerId)
    .eq('kind', 'like')
    .in('message_id', ids);
  return new Set(((data ?? []) as Record<string, unknown>[]).map((r) => String(r.message_id)));
}

async function participantsFor(parents: PostRow[]): Promise<Map<string, string[]>> {
  const ids = parents.filter((p) => p.reply_count > 0 && !p.parent_id).map((p) => p.id);
  if (!ids.length) return new Map();
  const db = serviceClient();
  const { data } = await db
    .from('messages')
    .select('parent_id,user_id,created_at')
    .in('parent_id', ids)
    .is('deleted_at', null)
    .not('user_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(Math.min(ids.length * 20, 1000));
  return participantIds(
    ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      parent_id: String(r.parent_id),
      user_id: (r.user_id as string) ?? null,
    }))
  );
}

/**
 * A page of rows → a page of posts, in the order given. Nine batched lookups
 * for the whole page and never one per post.
 */
export async function hydratePosts(
  rows: PostRow[],
  viewerId: string,
  opts?: { repostedBy?: Map<string, string> }
): Promise<CommunityPost[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const feed = await feedRoom();

  const callIds = rows.map(callIdOf).filter((v): v is string => Boolean(v));
  const resultIds = rows.map(resultCallIdOf).filter((v): v is string => Boolean(v));
  const repostedByIds = [...(opts?.repostedBy?.values() ?? [])];

  const [rooms, calls, media, quotes, liked, reposted, bookmarked, participants] = await Promise.all([
    roomsById(rows.map((r) => r.room_id)),
    callsFor([...callIds, ...resultIds]),
    attachmentsForMessages(rows.filter((r) => r.attachment_count > 0 && !r.deleted_at).map((r) => r.id)),
    quotesFor(rows.map((r) => r.quoted_message_id).filter((v): v is string => Boolean(v))) as Promise<Map<string, MessageQuote>>,
    likedFor(ids, viewerId),
    mineFor('post_reposts', ids, viewerId),
    mineFor('post_bookmarks', ids, viewerId),
    participantsFor(rows),
  ]);

  const authorIds = [
    ...rows.map((r) => r.user_id ?? ''),
    ...[...participants.values()].flat(),
    ...repostedByIds,
  ];
  const authors = await loadAuthors(authorIds);

  return rows.map((r) => shapePost(r, {
    room: rooms.get(r.room_id),
    feedId: feed.id,
    calls,
    media: media.get(r.id) ?? [],
    quote: r.quoted_message_id ? (quotes.get(r.quoted_message_id) ?? null) : null,
    liked: liked.has(r.id),
    reposted: reposted.has(r.id),
    bookmarked: bookmarked.has(r.id),
    participants: (participants.get(r.id) ?? []).map((u) => authors.get(u)).filter((a): a is SocialAuthor => Boolean(a)),
    authors,
    repostedBy: opts?.repostedBy?.get(r.id) ?? null,
    viewerId,
  }));
}

function shapePost(
  r: PostRow,
  x: {
    room: RoomLite | undefined;
    feedId: string;
    calls: Map<string, CommunityCall>;
    media: Parameters<typeof postMediaOf>[0];
    quote: MessageQuote | null;
    liked: boolean;
    reposted: boolean;
    bookmarked: boolean;
    participants: SocialAuthor[];
    authors: Map<string, SocialAuthor>;
    repostedBy: string | null;
    viewerId: string;
  }
): CommunityPost {
  const deleted = Boolean(r.deleted_at);
  const callId = callIdOf(r);
  const resultId = resultCallIdOf(r);
  const call = callId && !deleted ? (x.calls.get(callId) ?? null) : null;
  // A withdrawn call is a claim taken back: it is not presented as a live card.
  const tradeCall = call && call.status !== 'withdrawn' ? call : null;
  const result = deleted ? null : (resultOf(tradeCall) ?? resultOf(resultId ? x.calls.get(resultId) : null));
  const room: PostRoom = {
    id: r.room_id,
    slug: x.room?.slug ?? null,
    name: x.room?.name ?? '',
    is_feed: r.room_id === x.feedId,
  };
  const likeCount = Number(r.reaction_counts?.like ?? 0);
  return {
    id: r.id,
    room,
    parent_id: r.parent_id,
    author: r.user_id && !r.author_deleted ? (x.authors.get(r.user_id) ?? null) : null,
    author_deleted: r.author_deleted,
    timestamp: r.created_at,
    time_label: agePlain(r.created_at),
    body: deleted ? null : r.body,
    media: deleted ? [] : postMediaOf(x.media, r.refs),
    trade_call: tradeCall,
    result,
    quote: x.quote,
    reply_count: r.reply_count,
    repost_count: deleted ? 0 : r.repost_count,
    like_count: deleted || !Number.isFinite(likeCount) ? 0 : likeCount,
    liked: x.liked,
    reposted: x.reposted,
    bookmarked: x.bookmarked,
    participants: x.participants,
    reposted_by: x.repostedBy ? (x.authors.get(x.repostedBy) ?? null) : null,
    mine: Boolean(r.user_id && r.user_id === x.viewerId),
    route: `/community/post/${r.parent_id ?? r.id}`,
  };
}

/* ------------------------------------------------------------------ */
/* One page of the feed                                                 */
/* ------------------------------------------------------------------ */

export type FeedPageRow = { message_id: string; score: unknown; reposted_by: string | null };

export async function feedPageIds(opts: {
  viewerId: string;
  tab: FeedTab;
  limit: number;
  cursor: { s: string; i: string } | null;
  requestId: string;
}): Promise<FeedPageRow[]> {
  const db = serviceClient();
  const { data, error } = await db.rpc('community_feed_page', {
    p_viewer: opts.viewerId,
    p_tab: opts.tab,
    p_limit: opts.limit + 1,
    p_cursor_score: opts.cursor ? opts.cursor.s : null,
    p_cursor_id: opts.cursor ? opts.cursor.i : null,
  });
  if (error) {
    log('error', opts.requestId, 'social.feed_page_failed', { code: error.code, message: error.message });
    throw new ApiError('INTERNAL', 'We could not load the feed. Please try again.');
  }
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    message_id: String(r.message_id),
    score: r.score,
    reposted_by: (r.reposted_by as string) ?? null,
  }));
}

/* ------------------------------------------------------------------ */
/* Writing                                                              */
/* ------------------------------------------------------------------ */

/**
 * `post_room_message` raises named conditions (0018, 0033). The same sentences
 * the room route uses, so a member reads the same words whichever door they
 * used.
 */
export function postWriteError(message: string): ApiError {
  const key = (message || '').toLowerCase();
  if (key.includes('not_a_member')) return new ApiError('FORBIDDEN', 'Join the room first and then you can post.');
  if (key.includes('room_banned')) return new ApiError('ROOM_RESTRICTED', 'You cannot post there.');
  if (key.includes('room_muted')) return new ApiError('ROOM_RESTRICTED', 'A moderator has muted you here right now.');
  if (key.includes('room_posting_restricted')) return new ApiError('ROOM_RESTRICTED', 'This room is read-only right now.');
  if (key.includes('slow_mode')) return new ApiError('RATE_LIMITED', 'This room is in slow mode. Give it a moment.');
  if (key.includes('parent_not_top_level')) {
    return new ApiError('VALIDATION_FAILED', 'You can reply to a post, but not to a reply. Reply to the post itself.');
  }
  if (key.includes('parent_not_in_room')) return new ApiError('VALIDATION_FAILED', 'That reply points at a post somewhere else.');
  return new ApiError('INTERNAL', 'We could not post that. Please try again.');
}

/**
 * Every attachment must be the caller's own, a message picture, and not already
 * on a post — checked BEFORE the post is written, so a bad id is a sentence
 * rather than a post that silently lost its picture.
 */
export async function validateAttachments(ids: string[] | undefined, ownerId: string): Promise<string[]> {
  const list = ids ?? [];
  if (!list.length) return [];
  if (new Set(list).size !== list.length) {
    throw new ApiError('VALIDATION_FAILED', 'The same picture is attached twice.', { detail: { reason: 'media_duplicate' } });
  }
  const db = serviceClient();
  const { data } = await db
    .from('media_assets')
    .select('id,owner_id,purpose,message_id')
    .in('id', list);
  const rows = (data ?? []) as Record<string, unknown>[];
  const usable = new Set(
    rows
      .filter((r) => r.owner_id === ownerId && r.purpose === 'message' && r.message_id == null)
      .map((r) => String(r.id))
  );
  if (list.some((id) => !usable.has(id))) {
    throw new ApiError(
      'VALIDATION_FAILED',
      'One of those pictures cannot be attached. Upload it again and retry.',
      { detail: { reason: 'media_not_attachable' } }
    );
  }
  return list;
}

/** Drop reposts and bookmarks that point at posts which are now gaps. */
export async function dropPointersTo(messageIds: string[]): Promise<void> {
  if (!messageIds.length) return;
  const db = serviceClient();
  await Promise.all([
    db.from('post_reposts').delete().in('message_id', messageIds),
    db.from('post_bookmarks').delete().in('message_id', messageIds),
  ]);
}

/** Which of these rows the viewer may see as feed posts right now (standing, in the feed, not banned). */
export async function visibleForViewer(rows: PostRow[], viewerId: string): Promise<Set<string>> {
  const out = new Set<string>();
  if (!rows.length) return out;
  const [feed, rooms, banned] = await Promise.all([
    feedRoom(),
    roomsById(rows.map((r) => r.room_id)),
    bannedRooms(viewerId, rows.map((r) => r.room_id)),
  ]);
  for (const r of rows) {
    if (r.deleted_at || banned.has(r.room_id)) continue;
    if (isFeedPostRow(r, rooms.get(r.room_id), feed.id)) out.add(r.id);
  }
  return out;
}
