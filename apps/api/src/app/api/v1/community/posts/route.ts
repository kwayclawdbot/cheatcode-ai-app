/**
 * POST /api/v1/community/posts — write a post into the feed.
 *
 * A post is a message in the feed room (0050), written by `post_room_message`
 * so it passes the same checks a room post does. The pipeline, in this order:
 *
 *   zod → a username → join/ban/mute/read-only → rate limit (the SAME 10/min
 *   bucket as room posts, so the feed is not a way around it) → slow mode →
 *   spam precheck → attachments are the caller's and unused → result card is
 *   the caller's own RESOLVED call → the call (if any) is created → the message
 *   is written → the call is stamped with it → pictures are claimed → the
 *   advice tripwire → followers are told about a call.
 *
 * WHAT A POST CAN CARRY
 *   body            up to 4000 characters
 *   attachment_ids  up to 4 pictures from POST /api/v1/media
 *   charts          up to 2 { symbol, timeframe, levels[] } — data, drawn by
 *                   the phone from live candles, stored in refs.charts
 *   trade_call      a structured call; it becomes a community_calls row with
 *                   the same level rules and the same scoring as any call
 *   result_call_id  one of YOUR OWN resolved calls, shown as a result card
 *
 * No field anywhere carries position size.
 */
import type { NextRequest } from 'next/server';
import { ADVICE_NUDGE_PLAIN } from '@shared/api';
import { CreatePostBody, PostWriteResponse } from '@shared/community';
import { authed, ok, parseBody, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { serviceClient } from '@/lib/db';
import { emitUserEvent } from '@/lib/events';
import { log } from '@/lib/log';
import { rateLimit } from '@/lib/ratelimit';
import { spamPrecheck } from '@/lib/spam';
import { adviceCheck, flagAdviceShaped } from '@/lib/moderation';
import { callRpc } from '@/lib/rpc';
import { attachToMessage } from '@/lib/media/store';
import { loadAuthor, mentionFor } from '@/lib/social/authors';
import { CALL_COLUMNS, createCall, stampCallMessage, toCallRow, type CallRow } from '@/lib/social/calls';
import { fanOutToFollowers } from '@/lib/social/fanout';
import { modeForCall } from '@/lib/social/rooms-bridge';
import { thesisFor } from '@/lib/social/feed-shape';
import {
  ensureCanWrite,
  feedRoom,
  hydratePosts,
  loadPostRows,
  postWriteError,
  requireHandle,
  validateAttachments,
} from '@/lib/social/posts';

export const dynamic = 'force-dynamic';

const POST_LIMIT = 10;
const POST_WINDOW_MS = 60_000;
const CALL_LIMIT = 10;
const CALL_WINDOW_MS = 60 * 60_000;

export const POST = authed(async (req: NextRequest, ctx: Ctx) => {
  const body = await parseBody(req, CreatePostBody);
  await requireHandle(ctx.user.id);

  const room = await feedRoom();
  await ensureCanWrite(room, ctx.user.id, ctx.requestId);

  const slowSeconds = Number(room.config.slow_mode_s ?? 0);
  if (Number.isFinite(slowSeconds) && slowSeconds > 0) {
    rateLimit({
      key: `room-slow:${room.id}:${ctx.user.id}`,
      limit: 1,
      windowMs: slowSeconds * 1000,
      messagePlain: `The feed is in slow mode — one post every ${slowSeconds} seconds.`,
    });
  }
  rateLimit({
    key: `room-post:${ctx.user.id}`,
    limit: POST_LIMIT,
    windowMs: POST_WINDOW_MS,
    messagePlain: 'You are posting quickly. Give it a minute.',
  });

  const db = serviceClient();
  const text = body.body.trim();
  if (text) {
    const previous = await db
      .from('messages')
      .select('body')
      .eq('room_id', room.id)
      .eq('user_id', ctx.user.id)
      .order('seq', { ascending: false })
      .limit(1)
      .maybeSingle();
    const verdict = spamPrecheck(text, ((previous.data as Record<string, unknown> | null)?.body as string) ?? null);
    if (!verdict.ok) throw new ApiError('VALIDATION_FAILED', verdict.plain, { detail: { reason: verdict.reason } });
  }

  const attachmentIds = await validateAttachments(body.attachment_ids, ctx.user.id);

  // A RESULT CARD IS NEVER TYPED IN. It points at one of the author's own calls
  // and only once the resolver has resolved it — a withdrawn or open call has
  // no outcome to show.
  if (body.result_call_id) {
    const { data } = await db.from('community_calls').select('id,user_id,status').eq('id', body.result_call_id).maybeSingle();
    const r = (data as Record<string, unknown> | null) ?? null;
    if (!r || r.user_id !== ctx.user.id) {
      throw new ApiError('VALIDATION_FAILED', 'You can only show the result of one of your own calls.', {
        detail: { reason: 'result_not_yours' },
      });
    }
    if (!['target', 'stop', 'expired'].includes(String(r.status))) {
      throw new ApiError('VALIDATION_FAILED', 'That call has not resolved yet, so it has no result to show.', {
        detail: { reason: 'result_not_resolved' },
      });
    }
  }

  let call: CallRow | null = null;
  if (body.trade_call) {
    rateLimit({
      key: `community-call:${ctx.user.id}`,
      limit: CALL_LIMIT,
      windowMs: CALL_WINDOW_MS,
      messagePlain: 'That is a lot of calls in an hour. Give it a while — a call is a claim, not a comment.',
    });
    const tc = body.trade_call;
    const mode = await modeForCall({ userId: ctx.user.id, requested: tc.mode ?? null });
    call = await createCall({
      userId: ctx.user.id,
      symbol: tc.symbol,
      direction: tc.direction,
      entry: tc.entry ?? null,
      stop: tc.stop ?? null,
      target: tc.target ?? null,
      thesis: tc.thesis ?? thesisFor(text, tc.symbol, tc.direction),
      mode,
      requestId: ctx.requestId,
    });
  }

  const refs: Record<string, unknown> = {};
  if (body.charts?.length) refs.charts = body.charts;
  if (call) refs.community_call_id = call.id;
  if (body.result_call_id) refs.result_call_id = body.result_call_id;

  const rpc = await callRpc<Record<string, unknown> | Record<string, unknown>[]>(
    'post_room_message',
    {
      p_user_id: ctx.user.id,
      p_room_id: room.id,
      p_kind: body.charts?.length ? 'chart' : 'text',
      p_body: text || null,
      p_refs: Object.keys(refs).length ? refs : null,
      p_structured_idea: null,
      p_position_disclosure: null,
      p_parent_id: null,
    },
    ctx.requestId
  );
  const inserted = rpc.ok ? (Array.isArray(rpc.data) ? (rpc.data[0] ?? null) : rpc.data) : null;
  if (!inserted) {
    // The call must not outlive the post that was meant to carry it: a call
    // with no post is a claim nobody can see being scored. Withdrawn, not
    // deleted — the row stays as the record that it was attempted.
    if (call) {
      await db
        .from('community_calls')
        .update({ status: 'withdrawn', resolved_at: new Date().toISOString() })
        .eq('id', call.id)
        .eq('status', 'open');
    }
    throw postWriteError(rpc.ok ? '' : rpc.missing ? 'rpc missing' : rpc.message);
  }
  const messageId = String(inserted.id);

  if (call) {
    await stampCallMessage({ callId: call.id, messageId, requestId: ctx.requestId });
    const fresh = await db.from('community_calls').select(CALL_COLUMNS).eq('id', call.id).maybeSingle();
    if (fresh.data) call = toCallRow(fresh.data as Record<string, unknown>);
  }

  if (attachmentIds.length) {
    await attachToMessage({ assetIds: attachmentIds, ownerId: ctx.user.id, messageId, requestId: ctx.requestId });
  }

  const advice = adviceCheck(text);
  if (advice.flagged) {
    await flagAdviceShaped({ messageId, roomId: room.id, notes: advice.notes, requestId: ctx.requestId });
  }

  await emitUserEvent(
    ctx.user.id,
    'system',
    'message',
    messageId,
    { event: 'feed_posted', room_id: room.id, call_id: call?.id ?? null, charts: body.charts?.length ?? 0, pictures: attachmentIds.length },
    ctx.requestId
  );

  if (call) {
    try {
      const author = await loadAuthor(ctx.user.id, ctx.requestId);
      if (author) {
        const who = mentionFor(author);
        const verb = call.direction === 'long' ? 'went long' : 'went short';
        const at = call.entry === null ? '' : ` at ${call.entry.toFixed(2)}`;
        await fanOutToFollowers({
          authorId: ctx.user.id,
          kind: 'community_call',
          titlePlain: `${who} · ${call.symbol}`,
          bodyPlain: `${who} ${verb} ${call.symbol}${at}`,
          route: `/community/post/${messageId}`,
          payload: { call_id: call.id, message_id: messageId, symbol: call.symbol, direction: call.direction },
          requestId: ctx.requestId,
        });
      }
    } catch (e) {
      log('warn', ctx.requestId, 'social.post_fanout_threw', { message: e instanceof Error ? e.message : String(e) });
    }
  }

  const row = (await loadPostRows([messageId])).get(messageId);
  if (!row) throw new ApiError('INTERNAL', 'Posted, but I could not read it back. Pull to refresh.');
  const [post] = await hydratePosts([row], ctx.user.id);

  return ok(
    PostWriteResponse.parse({
      post,
      plain: advice.flagged
        ? ADVICE_NUDGE_PLAIN
        : call
          ? call.scoreable
            ? 'Posted. Your call has real levels, so it will be scored when it resolves.'
            : 'Posted. Without an entry and a stop or a target, the call will not be scored.'
          : 'Posted.',
    }),
    { status: 201 }
  );
});
