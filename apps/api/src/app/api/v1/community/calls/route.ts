/**
 * POST /api/v1/community/calls   — publish a call
 * GET  /api/v1/community/calls   — one member's calls (?user_id=, default you)
 *                                  or one desk's calls (?mode=)
 *
 * A CALL IS NOT A POST. A member may say anything they like in a room; a member
 * who publishes an entry and a stop or a target has said something that can be
 * checked against a price later, and 0038's generated `scoreable` column is
 * what decides which of those they did. This route never sets it.
 *
 * WHAT PUBLISHING DOES, IN THIS ORDER (0040, and the header of
 * `lib/social/rooms-bridge.ts` argues every step):
 *
 *   1. work out the desk — the request said, or the author's own primary mode
 *   2. find that desk's room and JOIN IT — a banned member is refused here,
 *      before anything is written
 *   3. write the call
 *   4. post it into the room as a real message
 *   5. write the receipt on the call
 *
 * Steps 4 and 5 CANNOT FAIL THE PUBLISH. If the chat refuses the post the call
 * still stands, with `message_id` null — 0040's documented degraded state. A
 * member's call is not lost because the room had a bad minute.
 *
 * The resolver (`/internal/social/resolve`) does everything after that —
 * nothing here waits for a price.
 */
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { AppMode, CommunityCall, CreateCommunityCallBody } from '@shared/api';
import { authed, ok, parseBody, parseQuery, type Ctx } from '@/lib/http';
import { emitUserEvent } from '@/lib/events';
import { log } from '@/lib/log';
import { rateLimit } from '@/lib/ratelimit';
import { loadAuthor, mentionFor } from '@/lib/social/authors';
import { createCall, listCalls, listCallsByMode, shapeCall } from '@/lib/social/calls';
import { fanOutToFollowers } from '@/lib/social/fanout';
import { modeForCall, postCallIntoRoom, prepareRoomForCall } from '@/lib/social/rooms-bridge';

export const dynamic = 'force-dynamic';

/**
 * Ten published calls an hour. Room posting is 10/min (03 Unit 1) because a
 * room is a conversation; a call is a claim that goes into somebody's permanent
 * record and onto every follower's phone, and nobody has ten of those in a
 * minute. The limit is the product saying so.
 */
const CALL_LIMIT = 10;
const CALL_WINDOW_MS = 60 * 60_000;

/**
 * TWO QUESTIONS, ONE ROUTE.
 *
 * `?user_id=` asks "what has this person called" — the profile list, which has
 * always been here and is unchanged. `?mode=` asks "what has this DESK called",
 * which is the Community tab on that mode's alert board, and is the read 0040's
 * `community_calls_mode_feed_idx` exists for.
 *
 * A REQUEST CARRYING BOTH GETS THE DESK. They are different lists rather than
 * two filters on one list, and answering "this person, on this desk" would be a
 * third thing nothing has asked for yet; guessing at it would mean the board tab
 * silently returns one member's calls the day a client sends both by accident.
 */
const Query = z.object({
  user_id: z.string().optional(),
  mode: AppMode.optional(),
});

export const GET = authed(async (req: NextRequest, ctx: Ctx) => {
  const { user_id, mode } = parseQuery(req, Query);
  const calls = mode
    ? await listCallsByMode({ mode })
    : await listCalls({ authorId: user_id ?? ctx.user.id, viewerId: ctx.user.id });
  return ok({ calls: calls.map((c) => CommunityCall.parse(c)) });
});

/**
 * The composer may name the desk; it does not have to. `CreateCommunityCallBody`
 * in the shared package does not carry `mode` yet, so it is extended here rather
 * than dropped on the floor by the parse — an unrecognised key is stripped, and
 * a member who picked "Swing" in the composer would have silently published to
 * whichever desk their profile happens to be set to.
 */
const CreateBody = CreateCommunityCallBody.extend({ mode: AppMode.optional() });

export const POST = authed(async (req: NextRequest, ctx: Ctx) => {
  const body = await parseBody(req, CreateBody);

  rateLimit({
    key: `community-call:${ctx.user.id}`,
    limit: CALL_LIMIT,
    windowMs: CALL_WINDOW_MS,
    messagePlain: 'That is a lot of calls in an hour. Give it a while — a call is a claim, not a comment.',
  });

  /**
   * THE DESK, THEN THE ROOM, THEN THE CALL — and in that order for a reason.
   *
   * `prepareRoomForCall` throws if this member is banned from the desk's room,
   * and it throws HERE, before a single row is written. A ban is the one
   * refusal that must stop a publish outright: `post_room_message` would refuse
   * them further down anyway, but by then the call would exist and the member
   * would have been told it was published.
   *
   * A missing room is NOT a refusal. 0040 asserts there is exactly one core
   * room per desk, so `null` should never happen — and if it ever does, the
   * member's call is still written and simply does not reach a conversation.
   * Losing somebody's work over a room mapping they had no part in would be the
   * wrong way round.
   */
  const mode = await modeForCall({ userId: ctx.user.id, requested: body.mode ?? null });
  const room = await prepareRoomForCall({ mode, userId: ctx.user.id, requestId: ctx.requestId });

  const row = await createCall({
    userId: ctx.user.id,
    symbol: body.symbol,
    direction: body.direction,
    entry: body.entry ?? null,
    stop: body.stop ?? null,
    target: body.target ?? null,
    thesis: body.thesis,
    mode,
    requestId: ctx.requestId,
  });

  /**
   * INTO THE CONVERSATION. This is the point of 0040: a call arrives in the
   * room in real time, as a real message with a real `seq`, so the five-second
   * poll the room already runs carries it with no second stream.
   *
   * It cannot throw and it cannot fail the publish — see the header. What comes
   * back is the message id, or null when the room refused it, and the call
   * object is re-read so what the composer gets back tells the truth about
   * whether its post landed.
   */
  const messageId = room
    ? await postCallIntoRoom({ room, call: row, userId: ctx.user.id, requestId: ctx.requestId })
    : null;
  const published = { ...row, message_id: messageId };

  const author = await loadAuthor(ctx.user.id, ctx.requestId);

  await emitUserEvent(
    ctx.user.id,
    'system',
    'community_call',
    row.id,
    {
      event: 'call_published',
      symbol: row.symbol,
      direction: row.direction,
      scoreable: row.scoreable,
      mode,
      // Recorded because "which calls never reached a room" is a question an
      // operator will want answered from the event stream and not only from a
      // null column.
      room_id: room?.id ?? null,
      message_id: messageId,
    },
    ctx.requestId
  );

  /**
   * THE FAN-OUT CANNOT FAIL THE PUBLISH. The call is already written; a broken
   * notification service must not turn a published call into an error the
   * member sees. Same wrapping `notify()` itself uses — see the header of
   * `lib/notify.ts`.
   */
  if (author) {
    try {
      const who = mentionFor(author);
      const verb = row.direction === 'long' ? 'went long' : 'went short';
      // The banner copy IS the inbox copy, so the sentence is written once.
      // "@kway went long NVDA at 231.40", and no entry price when there is none
      // to print rather than the word "null".
      const at = row.entry === null ? '' : ` at ${row.entry.toFixed(2)}`;
      await fanOutToFollowers({
        authorId: ctx.user.id,
        kind: 'community_call',
        titlePlain: `${who} · ${row.symbol}`,
        bodyPlain: `${who} ${verb} ${row.symbol}${at}`,
        route: `/contributor/${ctx.user.id}`,
        payload: { call_id: row.id, symbol: row.symbol, direction: row.direction },
        requestId: ctx.requestId,
      });
    } catch (e) {
      log('warn', ctx.requestId, 'social.call_fanout_threw', {
        call_id: row.id,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  /**
   * WHAT THE MEMBER IS TOLD, and it never claims more than happened. A call
   * that reached the room says which room; a call whose post the room refused
   * says so plainly, because the member will go and look for it in there. The
   * one thing this must not do is say "Published" and leave them hunting.
   */
  const roomClause = !room
    ? ''
    : messageId
      ? ` It is in ${room.name} now.`
      : ` It did not make it into the ${room.name} chat, but it is on the board.`;

  return ok(
    {
      call: author ? CommunityCall.parse(shapeCall(published, author)) : null,
      plain:
        (row.scoreable
          ? 'Published. It has real levels, so it will be scored when it resolves.'
          : 'Published. Without an entry and a stop or a target there is nothing to check it against, so it will not be scored.') +
        roomClause,
    },
    { status: 201 }
  );
});
