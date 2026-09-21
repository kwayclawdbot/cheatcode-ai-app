/**
 * The V2 Community contract: the social feed and the Live Rooms strip.
 *
 * Design note: docs/COMMUNITY-FEED-2026-09-21.md. Migrations 0050–0053.
 *
 * A POST IS A MESSAGE. Every `CommunityPost` is a `messages` row — in the feed
 * room, or a member call in a chat room — shaped for a feed instead of a chat.
 * That is why `reply_count`, `like_count` and the media come from the same
 * places a room reads them, and why a moderator's removal in a room takes the
 * post out of the feed too.
 *
 * WHAT IS NEVER HERE: position size. A post can carry a call (direction and
 * levels) and a result (a percent off the entry, from the resolver), and
 * nothing that says how much anybody bought. 0038 and 0050 assert the columns
 * do not exist.
 *
 * Imported by the API routes (zod values) and, type-only, by the phone.
 */
import { z } from 'zod';
import { AppMode, CommunityCall, MessageMedia, MessageQuote, SocialAuthor } from './api';

/* ------------------------------------------------------------------ */
/* Chart attachments                                                    */
/* ------------------------------------------------------------------ */

export const ChartTimeframe = z.enum(['1m', '5m', '15m', '1h', '4h', '1D', '1W']);
export type ChartTimeframe = z.infer<typeof ChartTimeframe>;

export const ChartLevelKind = z.enum(['entry', 'stop', 'target', 'support', 'resistance', 'level']);
export type ChartLevelKind = z.infer<typeof ChartLevelKind>;

export const ChartLevel = z.object({
  price: z.number().positive().max(1_000_000),
  kind: ChartLevelKind.default('level'),
  label: z.string().trim().max(24).optional(),
});
export type ChartLevel = z.infer<typeof ChartLevel>;

/** Ticker shape the rest of the app accepts: letters first, then letters, digits, `.` or `-`. */
export const CHART_SYMBOL_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;

/**
 * A chart is DATA, not a picture: a symbol, a timeframe and optional levels.
 * The phone draws it from live candles, so it is never a stale screenshot and
 * it can never carry somebody's account in the corner of the image.
 */
export const ChartAttachment = z.object({
  symbol: z
    .string()
    .trim()
    .transform((s) => s.toUpperCase())
    .pipe(z.string().regex(CHART_SYMBOL_RE, 'That does not look like a ticker.')),
  timeframe: ChartTimeframe,
  levels: z.array(ChartLevel).max(6, 'A chart can carry up to six levels.').default([]),
});
export type ChartAttachment = z.infer<typeof ChartAttachment>;

export const MAX_CHARTS_PER_POST = 2;
export const MAX_IMAGES_PER_POST = 4;
export const POST_BODY_MAX = 4000;

/** One item of `media[]`: a stored picture, or a chart the phone draws. */
export const PostMedia = z.discriminatedUnion('type', [
  MessageMedia.extend({ type: z.literal('image') }),
  ChartAttachment.extend({ type: z.literal('chart'), position: z.number() }),
]);
export type PostMedia = z.infer<typeof PostMedia>;

/* ------------------------------------------------------------------ */
/* Result card                                                          */
/* ------------------------------------------------------------------ */

/**
 * A resolved call's outcome, straight from the resolver (`community_calls`
 * status + result_pct). Present only once the call has resolved — an open call
 * has no result, and nothing here is ever typed in by the author.
 */
export const PostResult = z.object({
  call_id: z.string(),
  symbol: z.string(),
  direction: z.enum(['long', 'short']),
  status: z.enum(['target', 'stop', 'expired']),
  /** "Hit target" · "Stopped" · "Expired unresolved". */
  outcome_label: z.string().nullable(),
  /** Percent move off the entry, signed for the direction taken. Never dollars. */
  result_pct: z.number().nullable(),
  resolved_at: z.string().nullable(),
  /** True when it counted toward points (entry plus a stop or a target). */
  scoreable: z.boolean(),
});
export type PostResult = z.infer<typeof PostResult>;

/* ------------------------------------------------------------------ */
/* The post                                                             */
/* ------------------------------------------------------------------ */

export const PostRoom = z.object({
  id: z.string(),
  slug: z.string().nullable(),
  name: z.string(),
  /** True for the feed room; false when the post is a call from a chat room. */
  is_feed: z.boolean(),
});
export type PostRoom = z.infer<typeof PostRoom>;

export const CommunityPost = z.object({
  id: z.string(),
  room: PostRoom,
  /** The post this is a reply to, or null for a post. Threads are one level deep. */
  parent_id: z.string().nullable(),
  /**
   * Display name first, handle second, belt for the dyed name. Null only when
   * the author deleted their account (then `author_deleted` is true).
   */
  author: SocialAuthor.nullable(),
  author_deleted: z.boolean(),
  /** ISO timestamp. */
  timestamp: z.string(),
  /** "2h ago". */
  time_label: z.string(),
  body: z.string().nullable(),
  media: z.array(PostMedia),
  /** An embedded structured call, when the post carries one. */
  trade_call: CommunityCall.nullable(),
  /** The outcome of a resolved call — the embedded one once it resolves, or one the author attached. */
  result: PostResult.nullable(),
  quote: MessageQuote.nullable(),
  reply_count: z.number(),
  repost_count: z.number(),
  like_count: z.number(),
  /** The caller's own state. */
  liked: z.boolean(),
  reposted: z.boolean(),
  bookmarked: z.boolean(),
  /** Up to three people who replied most recently, for the thread's avatar stack. */
  participants: z.array(SocialAuthor),
  /** Following tab only: the followee whose repost put this in your feed. */
  reposted_by: SocialAuthor.nullable(),
  /** The caller wrote this and may delete it. */
  mine: z.boolean(),
  route: z.string(),
});
export type CommunityPost = z.infer<typeof CommunityPost>;

/* ------------------------------------------------------------------ */
/* Feed                                                                 */
/* ------------------------------------------------------------------ */

export const FeedTab = z.enum(['for_you', 'following', 'trade_calls', 'media']);
export type FeedTab = z.infer<typeof FeedTab>;

export const FEED_PAGE_MAX = 50;

export const FeedQuery = z.object({
  tab: FeedTab.default('for_you'),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(FEED_PAGE_MAX).default(20),
});
export type FeedQuery = z.infer<typeof FeedQuery>;

export const FeedResponse = z.object({
  tab: FeedTab,
  posts: z.array(CommunityPost),
  /** Opaque. Pass it back as `cursor` for the next page; null means the end. */
  next_cursor: z.string().nullable(),
  /** A sentence for an empty tab, so the screen never invents one. Null when there are posts. */
  empty_plain: z.string().nullable(),
});
export type FeedResponse = z.infer<typeof FeedResponse>;

/* ------------------------------------------------------------------ */
/* Writing                                                              */
/* ------------------------------------------------------------------ */

/** The call inside a post. `thesis` defaults to the post's first 280 characters. */
export const PostTradeCallInput = z.object({
  symbol: z.string().min(1).max(10),
  direction: z.enum(['long', 'short']),
  mode: AppMode.optional(),
  entry: z.number().positive().nullable().optional(),
  stop: z.number().positive().nullable().optional(),
  target: z.number().positive().nullable().optional(),
  thesis: z.string().min(1).max(280).optional(),
});
export type PostTradeCallInput = z.infer<typeof PostTradeCallInput>;

export const CreatePostBody = z
  .object({
    body: z.string().max(POST_BODY_MAX).default(''),
    /** Ids from `POST /api/v1/media` (purpose=message), in display order. */
    attachment_ids: z.array(z.string().uuid()).max(MAX_IMAGES_PER_POST).optional(),
    charts: z.array(ChartAttachment).max(MAX_CHARTS_PER_POST).optional(),
    trade_call: PostTradeCallInput.optional(),
    /** One of YOUR OWN resolved calls, to show its result card. */
    result_call_id: z.string().uuid().optional(),
  })
  .refine(
    (v) =>
      v.body.trim().length > 0 ||
      (v.attachment_ids?.length ?? 0) > 0 ||
      (v.charts?.length ?? 0) > 0 ||
      Boolean(v.trade_call) ||
      Boolean(v.result_call_id),
    { message: 'Write something, or attach a picture, a chart or a call.', path: ['body'] }
  );
export type CreatePostBody = z.infer<typeof CreatePostBody>;

export const CreateReplyBody = z
  .object({
    body: z.string().max(POST_BODY_MAX).default(''),
    attachment_ids: z.array(z.string().uuid()).max(MAX_IMAGES_PER_POST).optional(),
  })
  .refine((v) => v.body.trim().length > 0 || (v.attachment_ids?.length ?? 0) > 0, {
    message: 'Write something or attach a picture.',
    path: ['body'],
  });
export type CreateReplyBody = z.infer<typeof CreateReplyBody>;

export const PostWriteResponse = z.object({
  post: CommunityPost,
  plain: z.string(),
});
export type PostWriteResponse = z.infer<typeof PostWriteResponse>;

export const ThreadQuery = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(FEED_PAGE_MAX).default(30),
});

export const ThreadResponse = z.object({
  post: CommunityPost,
  /** Oldest first, like a conversation. */
  replies: z.array(CommunityPost),
  next_cursor: z.string().nullable(),
  empty_plain: z.string().nullable(),
});
export type ThreadResponse = z.infer<typeof ThreadResponse>;

/** like / repost: POST turns it on, DELETE turns it off. Both idempotent. */
export const PostToggleResponse = z.object({
  post_id: z.string(),
  on: z.boolean(),
  count: z.number(),
});
export type PostToggleResponse = z.infer<typeof PostToggleResponse>;

export const BookmarkResponse = z.object({
  post_id: z.string(),
  bookmarked: z.boolean(),
});
export type BookmarkResponse = z.infer<typeof BookmarkResponse>;

export const BookmarksResponse = z.object({
  posts: z.array(CommunityPost),
  next_cursor: z.string().nullable(),
  empty_plain: z.string().nullable(),
});
export type BookmarksResponse = z.infer<typeof BookmarksResponse>;

export const DeletePostResponse = z.object({
  post_id: z.string(),
  deleted: z.boolean(),
  replies_removed: z.number(),
  /** An open call inside the post was withdrawn with it (it will not be scored). */
  call_withdrawn: z.boolean(),
  plain: z.string(),
});
export type DeletePostResponse = z.infer<typeof DeletePostResponse>;

/* ------------------------------------------------------------------ */
/* Live Rooms strip + presence                                          */
/* ------------------------------------------------------------------ */

export const LiveRoom = z.object({
  id: z.string(),
  slug: z.string().nullable(),
  /** The strip label ("War Room"); `room_name` is the room's own name. */
  name: z.string(),
  room_name: z.string(),
  topic: z.string().nullable(),
  /** Somebody posted in the last `live_window_minutes`. A text room, never audio. */
  live: z.boolean(),
  /** Members whose heartbeat says they are in this room right now. */
  listener_count: z.number(),
  /** Up to four people who posted here most recently. */
  speaker_avatars: z.array(SocialAuthor),
  last_activity_at: z.string().nullable(),
  joined: z.boolean(),
  order: z.number(),
  route: z.string(),
});
export type LiveRoom = z.infer<typeof LiveRoom>;

export const LiveRoomsResponse = z.object({
  rooms: z.array(LiveRoom),
  /** Everybody seen anywhere in Community inside the window. */
  online_total: z.number(),
  online_window_minutes: z.number(),
  live_window_minutes: z.number(),
});
export type LiveRoomsResponse = z.infer<typeof LiveRoomsResponse>;

export const PresenceBody = z.object({
  /** The room on screen, or null/absent for the feed. */
  room_id: z.string().uuid().nullable().optional(),
});
export type PresenceBody = z.infer<typeof PresenceBody>;

export const PresenceResponse = z.object({
  ok: z.literal(true),
  room_id: z.string().nullable(),
  /** Send the next heartbeat after this many seconds. */
  next_heartbeat_s: z.number(),
});
export type PresenceResponse = z.infer<typeof PresenceResponse>;
