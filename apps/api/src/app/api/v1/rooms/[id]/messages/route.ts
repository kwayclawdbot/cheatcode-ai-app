/**
 * GET  /api/v1/rooms/:id/messages?after_seq=&limit=
 * POST /api/v1/rooms/:id/messages
 *
 * Reads come through `messages_public`, the view that keeps a deleted message's
 * place in the thread while nulling its body (01 §14).
 *
 * Writes run the full 03 Unit 1 pipeline, in this order and no other:
 *   zod → membership → mute/ban → posting-restriction → rate limit (10/min) →
 *   spam precheck → disclosure requirement → seq assignment → insert → audit.
 * The disclosure step is the one that is easy to skip and must not be: a
 * structured trade idea without a position disclosure is refused, because "does
 * the person telling me this own it?" is the first question any reader has.
 */
import type { NextRequest } from 'next/server';
import { MessagesQuery, MessagesResponse, PostMessageBody, PostMessageResponse } from '@shared/api';
import { authedParams, ok, parseBody, parseQuery, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { serviceClient } from '@/lib/db';
import { emitUserEvent } from '@/lib/events';
import { rateLimit } from '@/lib/ratelimit';
import { spamPrecheck } from '@/lib/spam';
import { callRpc, noteFallback } from '@/lib/rpc';
import {
  loadRoom,
  loadMembership,
  requireMember,
  isModerationMuted,
  roomStats,
  toRoomRow,
  MESSAGE_COLUMNS,
  authorsFor,
  objectsFor,
  toMessageRow,
  unreadFor,
  catchUpPlain,
} from '@/lib/rooms';

export const dynamic = 'force-dynamic';

const POST_LIMIT = 10;
const POST_WINDOW_MS = 60_000;

export const GET = authedParams<{ id: string }>(async (req: NextRequest, ctx: Ctx & { params: { id: string } }) => {
  const q = parseQuery(req, MessagesQuery);
  const room = await loadRoom(ctx.params.id);
  if (!room) throw new ApiError('NOT_FOUND', 'I could not find that room.');

  const membership = await loadMembership(ctx.params.id, ctx.user.id);
  requireMember(membership, String(room.name));

  const db = serviceClient();
  let query = db
    .from('messages_public')
    .select(MESSAGE_COLUMNS)
    .eq('room_id', ctx.params.id)
    .order('seq', { ascending: true })
    .limit(q.limit + 1);
  if (q.after_seq !== undefined) query = query.gt('seq', q.after_seq);

  const { data, error } = await query;
  if (error) {
    throw new ApiError('INTERNAL', 'We could not load that conversation. Please try again.', {
      detail: error.message,
    });
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  const has_more = rows.length > q.limit;
  const page = has_more ? rows.slice(0, q.limit) : rows;

  const [authors, objects, stats] = await Promise.all([
    authorsFor(page.map((r) => String(r.user_id ?? ''))),
    objectsFor(
      page
        .map((r) => (r.refs as Record<string, unknown> | null)?.kai_object_id)
        .filter((v): v is string => typeof v === 'string')
    ),
    roomStats([ctx.params.id]),
  ]);

  const messages = page.map((r) => toMessageRow(r, authors, objects));
  const lastSeq = stats.get(ctx.params.id)?.last_seq ?? 0;
  const sinceSeq = membership.last_read_seq;
  // Counted BEFORE the read mark moves below, and never counting the caller's
  // own posts — "3 new since you left" over three of your own messages is a lie.
  const unread = await unreadFor(ctx.params.id, ctx.user.id, sinceSeq);

  // Mark read up to what we just handed over.
  const maxShown = messages.length ? messages[messages.length - 1].seq : sinceSeq;
  if (maxShown > sinceSeq) {
    await db
      .from('room_members')
      .update({ last_read_seq: maxShown })
      .eq('room_id', ctx.params.id)
      .eq('user_id', ctx.user.id);
  }

  return ok(
    MessagesResponse.parse({
      room: toRoomRow(room, stats.get(ctx.params.id), membership),
      messages,
      last_seq: lastSeq,
      has_more,
      catch_up: {
        since_seq: sinceSeq,
        count: unread,
        plain: catchUpPlain(unread),
      },
    })
  );
});

export const POST = authedParams<{ id: string }>(async (req: NextRequest, ctx: Ctx & { params: { id: string } }) => {
  const body = await parseBody(req, PostMessageBody);
  const room = await loadRoom(ctx.params.id);
  if (!room) throw new ApiError('NOT_FOUND', 'I could not find that room.');

  const membership = await loadMembership(ctx.params.id, ctx.user.id);
  requireMember(membership, String(room.name));
  if (isModerationMuted(membership)) {
    throw new ApiError('ROOM_RESTRICTED', 'A moderator has muted you in this room right now.');
  }

  const config = (room.config as Record<string, unknown>) ?? {};
  if (config.posting_restricted && membership.role === 'member') {
    throw new ApiError('ROOM_RESTRICTED', 'This room is read-only right now.');
  }

  const db = serviceClient();

  // Slow mode, when the room asks for it.
  const slowSeconds = Number(config.slow_mode_s ?? 0);
  if (Number.isFinite(slowSeconds) && slowSeconds > 0) {
    rateLimit({
      key: `room-slow:${ctx.params.id}:${ctx.user.id}`,
      limit: 1,
      windowMs: slowSeconds * 1000,
      messagePlain: `This room is in slow mode — one post every ${slowSeconds} seconds.`,
    });
  }

  rateLimit({
    key: `room-post:${ctx.user.id}`,
    limit: POST_LIMIT,
    windowMs: POST_WINDOW_MS,
    messagePlain: 'You are posting quickly. Give it a minute.',
  });

  const previous = await db
    .from('messages')
    .select('body')
    .eq('room_id', ctx.params.id)
    .eq('user_id', ctx.user.id)
    .order('seq', { ascending: false })
    .limit(1)
    .maybeSingle();

  const verdict = spamPrecheck(body.body, ((previous.data as Record<string, unknown> | null)?.body as string) ?? null);
  if (!verdict.ok) throw new ApiError('VALIDATION_FAILED', verdict.plain, { detail: { reason: verdict.reason } });

  // Structured ideas carry a position disclosure. Not optional (08 §7).
  if (body.structured_idea && !body.position_disclosure) {
    throw new ApiError(
      'CONSENT_REQUIRED',
      'Say whether you hold this before you post it as an idea. Readers deserve to know.'
    );
  }

  const rpcArgs = {
    p_user_id: ctx.user.id,
    p_room_id: ctx.params.id,
    p_kind: body.kind,
    p_body: body.body,
    p_refs: body.refs ?? null,
    p_structured_idea: body.structured_idea ?? null,
    p_position_disclosure: body.position_disclosure ?? null,
    p_parent_id: body.parent_id ?? null,
  };

  let inserted: Record<string, unknown> | null = null;
  const rpc = await callRpc<Record<string, unknown> | Record<string, unknown>[]>(
    'post_room_message',
    rpcArgs,
    ctx.requestId
  );
  if (rpc.ok) {
    inserted = Array.isArray(rpc.data) ? ((rpc.data[0] as Record<string, unknown>) ?? null) : (rpc.data ?? null);
  } else if (!rpc.missing) {
    throw postError(rpc.message);
  }

  if (!inserted) {
    // FALLBACK (documented in README): seq is read-then-write here, so two
    // simultaneous posts to one room can collide on unique(room_id, seq).
    // `post_room_message` in 0018 takes the counter lock and removes it.
    noteFallback(ctx.requestId, 'post_room_message');
    const top = await db
      .from('messages')
      .select('seq')
      .eq('room_id', ctx.params.id)
      .order('seq', { ascending: false })
      .limit(1)
      .maybeSingle();
    const seq = Number((top.data as Record<string, unknown> | null)?.seq ?? 0) + 1;

    const res = await db
      .from('messages')
      .insert({
        room_id: ctx.params.id,
        user_id: ctx.user.id,
        seq,
        kind: body.kind,
        body: body.body,
        parent_id: body.parent_id ?? null,
        refs: (body.refs ?? null) as never,
        structured_idea: (body.structured_idea ?? null) as never,
        position_disclosure: (body.position_disclosure ?? null) as never,
      })
      .select('id,room_id,user_id,seq,kind,body,parent_id,refs,structured_idea,position_disclosure,deleted_at,created_at')
      .single();
    if (res.error || !res.data) {
      throw new ApiError('INTERNAL', 'We could not post that. Please try again.', { detail: res.error?.message });
    }
    inserted = res.data as Record<string, unknown>;

    await emitUserEvent(
      ctx.user.id,
      'system',
      'message',
      String(inserted.id),
      { event: 'message_posted', room_id: ctx.params.id, kind: body.kind },
      ctx.requestId
    );
  }

  const authors = await authorsFor([ctx.user.id]);
  const message = toMessageRow(inserted, authors, new Map());

  await db
    .from('room_members')
    .update({ last_read_seq: message.seq })
    .eq('room_id', ctx.params.id)
    .eq('user_id', ctx.user.id);

  return ok(
    PostMessageResponse.parse({
      message,
      plain: body.structured_idea
        ? 'Posted, with your disclosure attached.'
        : 'Posted.',
    }),
    { status: 201 }
  );
});

/**
 * post_room_message raises named conditions (0018 header). Translate them into
 * the plain copy a member should read — never the raw SQLSTATE message.
 */
function postError(message: string): ApiError {
  const key = (message || '').toLowerCase();
  if (key.includes('not_a_member')) return new ApiError('FORBIDDEN', 'Join the room first and then you can post.');
  if (key.includes('room_banned')) return new ApiError('ROOM_RESTRICTED', 'You cannot post in that room.');
  if (key.includes('room_muted')) return new ApiError('ROOM_RESTRICTED', 'A moderator has muted you in this room right now.');
  if (key.includes('room_posting_restricted')) return new ApiError('ROOM_RESTRICTED', 'This room is read-only right now.');
  if (key.includes('slow_mode')) return new ApiError('RATE_LIMITED', 'This room is in slow mode. Give it a moment.');
  if (key.includes('kind_not_postable')) return new ApiError('VALIDATION_FAILED', 'That kind of post is not allowed here.');
  if (key.includes('disclosure_required')) {
    return new ApiError('CONSENT_REQUIRED', 'Say whether you hold this before you post it as an idea. Readers deserve to know.');
  }
  if (key.includes('parent_not_in_room')) return new ApiError('VALIDATION_FAILED', 'That reply points at a message in another room.');
  return new ApiError('INTERNAL', 'We could not post that. Please try again.');
}
