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
import {
  ADVICE_NUDGE_PLAIN,
  MessagesQuery,
  MessagesResponse,
  PostMessageBody,
  PostMessageResponse,
} from '@shared/api';
import { authedParams, ok, parseBody, parseQuery, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { serviceClient } from '@/lib/db';
import { emitUserEvent } from '@/lib/events';
import { rateLimit } from '@/lib/ratelimit';
import { spamPrecheck } from '@/lib/spam';
import { adviceCheck, flagAdviceShaped } from '@/lib/moderation';
import { callRpc, noteFallback } from '@/lib/rpc';
import { log } from '@/lib/log';
import { attachToMessage, attachmentsForMessages } from '@/lib/media/store';
import {
  loadRoom,
  loadMembership,
  requireMember,
  isModerationMuted,
  roomStats,
  toRoomRow,
  MESSAGE_COLUMNS,
  authorsFor,
  callsFor,
  objectsFor,
  toMessageRow,
  reactionsMineFor,
  quotesFor,
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
  // THE ROOM SHOWS POSTS, NOT COMMENTS. A comment lives under the post it
  // answers (`GET /messages/:id/replies`); letting replies back into the main
  // feed would mean every conversation appears twice and the "N new" count
  // counts each one of them.
  let query = db
    .from('messages_public')
    .select(MESSAGE_COLUMNS)
    .eq('room_id', ctx.params.id)
    .is('parent_id', null)
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

  // SEVEN BATCHED LOOKUPS FOR THE WHOLE PAGE, and never one per message. The
  // reaction COUNTS are not among them — they are denormalised onto the message
  // row (migration 0033 §2b) and arrived with the select above, so they cost
  // nothing. `mine` cannot be, because it is per-person; `media` is only asked
  // for the messages whose `attachment_count` says they have any, which on an
  // ordinary page of text is no query at all; `quotes` is only asked for the
  // messages that actually quote something; and `calls` is only asked for the
  // messages carrying `refs.community_call_id`, so a page with no calls in it
  // makes no query either.
  const [authors, objects, stats, mine, media, quotes, calls] = await Promise.all([
    authorsFor(page.map((r) => String(r.user_id ?? ''))),
    objectsFor(
      page
        .map((r) => (r.refs as Record<string, unknown> | null)?.kai_object_id)
        .filter((v): v is string => typeof v === 'string')
    ),
    roomStats([ctx.params.id]),
    reactionsMineFor(page.map((r) => String(r.id)), ctx.user.id),
    attachmentsForMessages(page.filter((r) => Number(r.attachment_count ?? 0) > 0).map((r) => String(r.id))),
    quotesFor(page.map((r) => r.quoted_message_id).filter((v): v is string => typeof v === 'string')),
    // 0040: a member's call rides on `refs`, exactly like a Kai object, so the
    // room renders the card in the conversation rather than a link out of it.
    callsFor(
      page
        .map((r) => (r.refs as Record<string, unknown> | null)?.community_call_id)
        .filter((v): v is string => typeof v === 'string')
    ),
  ]);

  const messages = page.map((r) => toMessageRow(r, authors, objects, { mine, media, quotes, calls }));
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

  /**
   * YOU NEED A NAME BEFORE YOU CAN POST.
   *
   * Not a hurdle for its own sake. A post signed by nobody cannot be replied
   * to, cannot be mentioned, and cannot be judged over time — which is the
   * whole basis of `contributor_stats` and of the mention lane that is being
   * built on top of this. Reading every room stays open to anybody; writing
   * into one asks for the name it will be signed with.
   *
   * It is checked here rather than only on the phone because the phone is not
   * the only way in: this route is the one door every post goes through.
   */
  const author = await db.from('profiles').select('handle').eq('user_id', ctx.user.id).maybeSingle();
  if (!((author.data as { handle?: string | null } | null)?.handle ?? null)) {
    throw new ApiError(
      'VALIDATION_FAILED',
      'Pick a username before you post. It is the name this will be signed with, and the name other members can mention you by.',
      { detail: { reason: 'handle_required', route: '/account/username' } }
    );
  }

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

  // A picture with no caption has no words to check, and running a repetition
  // check over two empty strings would refuse the second photo somebody posts.
  if (body.body.trim().length > 0) {
    const verdict = spamPrecheck(body.body, ((previous.data as Record<string, unknown> | null)?.body as string) ?? null);
    if (!verdict.ok) throw new ApiError('VALIDATION_FAILED', verdict.plain, { detail: { reason: verdict.reason } });
  }

  // Structured ideas carry a position disclosure. Not optional (08 §7).
  if (body.structured_idea && !body.position_disclosure) {
    throw new ApiError(
      'CONSENT_REQUIRED',
      'Say whether you hold this before you post it as an idea. Readers deserve to know.'
    );
  }

  /**
   * THE QUOTE IS CHECKED BEFORE ANYTHING IS WRITTEN.
   *
   * The database has the final say — migration 0035 refuses a quote pointing at
   * another room on every write path there is — but a trigger's answer is a
   * condition name, and a member should read a sentence. So the same three
   * questions are asked here first, where there is a person to answer them:
   * does that post exist, is it in THIS room, and is it still standing.
   *
   * The room check is the one that matters and it is not about tidiness. A
   * quote is resolved and rendered for whoever reads the reply, so quoting
   * across rooms would republish the words of a room a reader is not in. It is
   * refused here for the sentence and refused in the table so it is refused.
   *
   * A REMOVED POST CANNOT BE QUOTED. Not because the words would leak — the
   * reader only ever gets "This post was removed" — but because starting a new
   * conversation off something a moderator has just taken down is the room
   * arguing with the moderation, the same reasoning the reactions route uses.
   */
  if (body.quoted_message_id) {
    const quoted = await db
      .from('messages')
      .select('id,room_id,deleted_at')
      .eq('id', body.quoted_message_id)
      .maybeSingle();
    const quotedRow = (quoted.data as Record<string, unknown> | null) ?? null;
    if (!quotedRow || String(quotedRow.room_id) !== ctx.params.id) {
      throw new ApiError('VALIDATION_FAILED', 'That post is not in this room, so it cannot be quoted.', {
        detail: { reason: 'quoted_not_in_room' },
      });
    }
    if (quotedRow.deleted_at) {
      throw new ApiError('VALIDATION_FAILED', 'That post has been removed, so it cannot be quoted.', {
        detail: { reason: 'quoted_removed' },
      });
    }
  }

  const rpcArgs = {
    p_user_id: ctx.user.id,
    p_room_id: ctx.params.id,
    p_kind: body.kind,
    // Empty means empty. Storing '' would make a photo-only post look like a
    // message whose text somebody deleted.
    p_body: body.body.trim() || null,
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
        body: body.body.trim() || null,
        parent_id: body.parent_id ?? null,
        refs: (body.refs ?? null) as never,
        structured_idea: (body.structured_idea ?? null) as never,
        position_disclosure: (body.position_disclosure ?? null) as never,
      })
      .select('id,room_id,user_id,seq,kind,body,parent_id,refs,structured_idea,position_disclosure,deleted_at,created_at')
      .single();
    if (res.error || !res.data) {
      // The trigger conditions from 0018 and 0033 reach this path too — the
      // thread-depth guard is on the TABLE, so it fires on the fallback insert
      // exactly as it does inside the RPC. Same translation, so a member reads
      // the same sentence whichever path served them.
      throw postError(res.error?.message ?? '');
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

  /**
   * THE QUOTE IS STAMPED ON AFTER THE ROW EXISTS, exactly the way attachments
   * are, and for a reason that is about the RPC and not about media.
   *
   * `post_room_message` (0018) is a security-definer function that both write
   * paths lean on, and PostgREST resolves an RPC by its argument names. Adding
   * a parameter to it does not extend the function — it creates a SECOND
   * function with a different arity, and every call that does not name the new
   * argument becomes ambiguous. That is a schema-wide breakage in exchange for
   * saving one narrow update on a row nobody else is writing to.
   *
   * So the post is written by the path that already exists, and the quote is a
   * one-column update immediately after.
   *
   * IF THAT UPDATE IS REFUSED, THE POST STILL STANDS AND THIS DOES NOT THROW.
   * That is deliberate and it is the opposite of what looks correct at first
   * glance, so here is the reasoning before somebody "fixes" it back. By the
   * time this runs the message row EXISTS — the member's writing is in the
   * room. Throwing here would answer a landed post with a generic failure,
   * which reads to the member as "that did not send" and invites them to write
   * it again; the room ends up with two copies of the same post because a
   * quote pointer did not save. The refusal can only come from the guard
   * catching something the check above could not — the quoted post was removed
   * or moved in the microseconds between — which is rare and is not worth a
   * duplicate.
   *
   * The member is not left guessing either: the app compares the quote it
   * asked for against the quote that comes back on the response, and tells them
   * in a sentence that the post landed but the quote did not save. So the
   * honest outcome is post kept plus a clear explanation, and a warning in the
   * log for us. Same shape as a partial attachment in `attachToMessage`, logged
   * the same way and for the same reason.
   */
  if (body.quoted_message_id) {
    const stamped = await db
      .from('messages')
      .update({ quoted_message_id: body.quoted_message_id })
      .eq('id', String(inserted.id))
      .select('quoted_message_id')
      .maybeSingle();
    if (stamped.error || !stamped.data) {
      log('warn', ctx.requestId, 'message.quote_not_saved', {
        message_id: String(inserted.id),
        quoted_message_id: body.quoted_message_id,
        room_id: ctx.params.id,
        detail: stamped.error?.message ?? 'no row updated',
      });
    } else {
      inserted = { ...inserted, quoted_message_id: body.quoted_message_id };
    }
  }

  // ATTACHMENTS ARE CLAIMED AFTER THE POST LANDS, never before. An upload that
  // was already stamped with a message id belonging to a post that then failed
  // to insert is a file pointing at nothing, which no purge path can find. This
  // way round, a failure leaves an unattached asset and the orphan sweep takes
  // it an hour later.
  const attached = body.attachment_ids?.length
    ? await attachToMessage({
        assetIds: body.attachment_ids,
        ownerId: ctx.user.id,
        messageId: String(inserted.id),
        requestId: ctx.requestId,
      })
    : [];

  const authors = await authorsFor([ctx.user.id]);
  const mediaMap = attached.length ? await attachmentsForMessages([String(inserted.id)]) : new Map();
  // Resolved here so the row handed back is the same shape the room will send
  // on the next read — the phone should not have to re-fetch to see the quote
  // it just wrote. Read off the ROW and not off the request: if the stamp above
  // did not take, this is absent, the response carries `quote: null`, and the
  // app says so rather than showing a quote that was never saved.
  const quotedId = inserted.quoted_message_id;
  const quotes = typeof quotedId === 'string' ? await quotesFor([quotedId]) : undefined;
  // Same reasoning as the quote above, for a post that carries a call. The
  // publish path (`POST /community/calls`) is where calls normally come from,
  // but a post is a post and this route must hand back the same shape the room
  // will send on the next read.
  const callId = (inserted.refs as Record<string, unknown> | null)?.community_call_id;
  const calls = typeof callId === 'string' ? await callsFor([callId]) : undefined;
  const message = toMessageRow(
    { ...inserted, attachment_count: attached.length },
    authors,
    new Map(),
    { media: mediaMap, quotes, calls }
  );

  await db
    .from('room_members')
    .update({ last_read_seq: message.seq })
    .eq('room_id', ctx.params.id)
    .eq('user_id', ctx.user.id);

  /**
   * DOES THIS READ AS ADVICE?
   *
   * Runs AFTER the insert, deliberately. The post is not blocked and never has
   * been: a filter that eats posts about money would be wrong often and would
   * teach people to write around it. What it does is stamp the row, put it in
   * front of a human in the moderation queue, and tell the person who wrote it
   * what this room is for. See `adviceCheck` in lib/moderation.ts for why it is
   * a word check and not a model call — a classifier in the posting path makes
   * every post wait on Kai, and Kai is out of credit today.
   *
   * It is a tripwire, not a verdict, and it decides nothing.
   */
  const advice = adviceCheck(body.body);
  if (advice.flagged) {
    await flagAdviceShaped({
      messageId: message.id,
      roomId: ctx.params.id,
      notes: advice.notes,
      requestId: ctx.requestId,
    });
  }

  return ok(
    PostMessageResponse.parse({
      message,
      plain: advice.flagged
        ? ADVICE_NUDGE_PLAIN
        : body.structured_idea
          ? 'Posted, with your disclosure attached.'
          : body.parent_id
            ? 'Comment posted.'
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
  // Threads are one level deep and the database is what makes them one
  // (migration 0033 §1). This is the sentence a member reads if a client ever
  // tries to comment on a comment.
  if (key.includes('parent_not_top_level')) {
    return new ApiError('VALIDATION_FAILED', 'You can comment on a post, but not on a comment. Reply to the post itself.');
  }
  // Quoting, guarded on the table by migration 0035 §2b for the same reason
  // threads are: there is more than one way to write a message, so the rule
  // lives under all of them. These three sentences are what a member reads if
  // the guard catches something the route's own check could not.
  if (key.includes('quote_is_self')) {
    return new ApiError('VALIDATION_FAILED', 'A post cannot quote itself.');
  }
  if (key.includes('quoted_not_found')) {
    return new ApiError('VALIDATION_FAILED', 'I could not find the post you were quoting. It may have just been removed.');
  }
  if (key.includes('quoted_not_in_room')) {
    return new ApiError('VALIDATION_FAILED', 'That post is not in this room, so it cannot be quoted.');
  }
  return new ApiError('INTERNAL', 'We could not post that. Please try again.');
}
