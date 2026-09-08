/**
 * A PUBLISHED CALL LANDS IN THE ROOM'S CONVERSATION.
 *
 * =====================================================================
 * WHAT CHANGED AND WHY THIS FILE EXISTS
 * =====================================================================
 * 0038 gave a member's call a home of its own: a Following feed, reachable from
 * a toggle at the top of Community. The owner has taken that toggle out. A call
 * is now supposed to ARRIVE WHERE THE PEOPLE ARE — in the desk's room, in real
 * time, in the middle of the conversation it belongs to — and to stack up
 * afterwards on a Community tab on that desk's alert board.
 *
 * This file is the half that puts it in the room. Migration 0040 is the half
 * that made it possible, and its header is the argument for every decision
 * below; what follows is only the part that lives in TypeScript.
 *
 * =====================================================================
 * THE ROOM IS DERIVED, NEVER STORED
 * =====================================================================
 * What a member chose when they published is a DESK — "this is a day trade".
 * The room is a consequence. So the call records `mode` and this file looks the
 * room up from it. Nothing writes a `room_id` onto a call, because the day
 * there are two sources of truth is the day they start disagreeing.
 *
 * =====================================================================
 * AND SINCE 0045 THE DERIVATION IS A NAMED MAP, NOT A COLUMN
 * =====================================================================
 * This used to be `.eq('mode', mode)` — one core room per mode, asserted by
 * 0040 §4(b). Community is now THREE chats (owner, 8 Sept: "Just make it
 * traders chat, investors chat and beginners chat"), `day_trade` and `swing`
 * share the Traders room, and no core room carries a mode at all. A join key
 * cannot express "two of these go to the same place", so the mapping is written
 * out in `MODE_TO_ROOM` below and the lookup is by SLUG.
 *
 * NOTHING ABOUT 0040'S DECISION CHANGED, AND THIS IS THE PROOF OF IT. Its
 * header said: "If the room mapping ever changes — a second day-trade room, a
 * room retired — the calls do not need rewriting, because none of them recorded
 * a room as their meaning." A room was retired and two modes now share one, and
 * not a single `community_calls` row moved.
 *
 * `MODE_TO_ROOM` IS MIRRORED IN SQL, in 0045 §4(b), which fails the migration
 * if a value of `app_mode` is missing from the map or the room it names is not
 * there exactly once. Duplication is the cost of the database being able to
 * check itself; the two are written in the same order so a diff between them is
 * visible at a glance.
 *
 * =====================================================================
 * THE ORDER OF OPERATIONS, AND WHY IT IS THAT ORDER
 * =====================================================================
 *   1. work out the desk        — the request said, or the author's own
 *   2. find the room, JOIN IT   — and refuse a banned member HERE
 *   3. insert the call
 *   4. post the message
 *   5. write the receipt (`community_calls.message_id`)
 *
 * The ban check is at step 2 and not at step 4 because `post_room_message`
 * would refuse a banned member anyway — that is exactly the point, the RPC is
 * not bypassed — but by step 4 the call row already exists, and telling
 * somebody "you are banned from that room" AFTER writing their call is both
 * confusing and a mess to clean up. So the refusal happens before anything is
 * written, in the words that fit what they were actually trying to do.
 *
 * Steps 4 and 5 are the other way round: THEY MUST NEVER FAIL THE PUBLISH. A
 * moderator mute, slow mode, or simply a bad minute in the chat leaves the call
 * on the board with `message_id` null, which 0040 documents as a deliberate
 * degraded state. Losing a member's call because chat had a hiccup would be the
 * worse outcome by a distance, and a muted member's call still being their own
 * record while staying out of the conversation they were muted from is the
 * honest reading of a mute rather than a hole in it.
 *
 * =====================================================================
 * WHY THE POST IS ORDINARY TEXT
 * =====================================================================
 * `message_kind` is an enum and 0040 §"NO NEW MESSAGE KIND" refuses to migrate
 * it. The row is a `text` message carrying `refs.community_call_id`, exactly the
 * way a Kai object rides on `refs.kai_object_id`, and `callsFor` in lib/rooms.ts
 * re-attaches it on the way out so the room draws the real card.
 *
 * Which makes the BODY the safety net, and it is written as a proper sentence
 * for that reason: any client that has never heard of a community call still
 * shows "Long NVDA at 231.40 — stop 225.00, target 245.00" instead of an empty
 * bubble. See `callSentence`.
 */
import type { AppMode } from '@shared/api';
import { serviceClient } from '../db';
import { log } from '../log';
import { callRpc } from '../rpc';
import { joinCoreRoom } from '../rooms';
import { stampCallMessage } from './calls';

/** The bits of a call this file needs. Deliberately not `CallRow`: nothing here
 *  cares about a call's status or its resolution, only what it says. */
export type CallForRoom = {
  id: string;
  symbol: string;
  direction: 'long' | 'short';
  entry: number | null;
  stop: number | null;
  target: number | null;
};

export type CoreRoom = { id: string; name: string };

/* ------------------------------------------------------------------ */
/* Which desk                                                           */
/* ------------------------------------------------------------------ */

/**
 * The desk a call belongs to: what the composer said, and failing that the
 * member's own primary mode.
 *
 * `day_trade` is the last resort and only for a member with no profile row at
 * all, which is the same default 0040's backfill used for an author whose
 * profile had since been deleted. It is a fallback, not a preference — a member
 * who has been through onboarding always has a `primary_mode`.
 */
export async function modeForCall(opts: {
  userId: string;
  requested?: AppMode | null;
}): Promise<AppMode> {
  if (opts.requested) return opts.requested;
  const db = serviceClient();
  const { data } = await db
    .from('profiles')
    .select('primary_mode')
    .eq('user_id', opts.userId)
    .maybeSingle();
  const mode = (data as { primary_mode?: string } | null)?.primary_mode;
  return (mode as AppMode) ?? 'day_trade';
}

/* ------------------------------------------------------------------ */
/* Which room                                                           */
/* ------------------------------------------------------------------ */

/**
 * WHICH CHAT EACH DESK POSTS INTO. The whole mapping, in one place.
 *
 * `day_trade` and `swing` both land in Traders because a member reading about
 * an intraday break and a member reading about a three-week hold are the same
 * room of people — that is the owner's 8 Sept decision and 0045 is the half of
 * it that lives in the database.
 *
 * NOTHING MAPS TO `beginners`, and that is 0043 §1 unchanged: a call is a trade
 * somebody is standing behind, and the beginners' room is not where it belongs.
 * The map is exhaustive over `AppMode` — a new desk added to the enum will not
 * compile until it is given a room here, which is the same tripwire 0045 §4(b)
 * sets in SQL.
 */
export const MODE_TO_ROOM: Record<AppMode, 'traders' | 'investors'> = {
  day_trade: 'traders',
  swing: 'traders',
  invest: 'investors',
};

/**
 * The core room a desk posts into.
 *
 * BY SLUG, NOT BY MODE. Since 0045 no core room carries a mode, so there is
 * nothing to filter on — and a slug is what the room actually is, rather than a
 * join key standing in for one. It matches how the phone resolves a core room
 * too (0043 §4(ii)): ids are `gen_random_uuid()` and differ per environment,
 * the slug does not.
 *
 * 0045 §4(b) asserts each mapped slug names exactly one core room and fails the
 * migration otherwise, so this cannot normally come back empty. It is still
 * written to survive it: null means "no room to post into", and the caller
 * publishes the call anyway rather than refusing a member's work over a room
 * mapping they had no part in.
 */
export async function coreRoomForMode(mode: AppMode, requestId = '-'): Promise<CoreRoom | null> {
  const slug = MODE_TO_ROOM[mode];
  if (!slug) {
    // Only reachable if `AppMode` grew a value and this map did not. Said out
    // loud, because the silent version is a call that reaches no conversation.
    log('warn', requestId, 'social.call_room_unmapped', { mode });
    return null;
  }

  const db = serviceClient();
  const { data, error } = await db
    .from('rooms')
    .select('id,name')
    .eq('type', 'core')
    .eq('slug', slug)
    .limit(2);

  if (error) {
    log('warn', requestId, 'social.call_room_lookup_failed', { mode, slug, message: error.message });
    return null;
  }
  const rows = (data ?? []) as Record<string, unknown>[];
  if (!rows.length) {
    log('warn', requestId, 'social.call_room_missing', { mode, slug });
    return null;
  }
  // `rooms.slug` is unique (0010), so this is a statement about the schema
  // rather than about the data. If it ever fires, something dropped that
  // constraint and somebody needs to know.
  if (rows.length > 1) {
    log('warn', requestId, 'social.call_room_ambiguous', { mode, slug, count: rows.length });
  }
  return { id: String(rows[0].id), name: String(rows[0].name) };
}

/**
 * Find the desk's room and put the member in it — BEFORE the call is written.
 *
 * PUBLISHING INTO A ROOM PUTS YOU IN THE ROOM. That is not a side effect to
 * apologise for, it is the point: a call goes into a conversation, people reply
 * to it, and a member who cannot see the replies to their own call has been
 * given a worse version of the thing they asked for.
 *
 * A BANNED MEMBER IS REFUSED HERE AND THE REFUSAL STANDS. `joinCoreRoom` throws
 * on a ban and this does not catch it. Nothing has been written yet, so there is
 * nothing to unwind, and the member reads a sentence about publishing rather
 * than a sentence about joining.
 */
export async function prepareRoomForCall(opts: {
  mode: AppMode;
  userId: string;
  requestId: string;
}): Promise<CoreRoom | null> {
  const room = await coreRoomForMode(opts.mode, opts.requestId);
  if (!room) return null;

  await joinCoreRoom({
    roomId: room.id,
    userId: opts.userId,
    roomName: room.name,
    requestId: opts.requestId,
    bannedPlain: `You cannot post in ${room.name}, so a call cannot be published to that desk.`,
  });
  return room;
}

/* ------------------------------------------------------------------ */
/* The sentence                                                         */
/* ------------------------------------------------------------------ */

/** Two decimals, always — the same way the follower notification prints a
 *  price. A price that sometimes shows two decimals and sometimes none reads
 *  as two different kinds of number. */
function priceText(n: number): string {
  return n.toFixed(2);
}

/**
 * WHAT THE POST SAYS, IN WORDS.
 *
 *   Long NVDA at 231.40 — stop 225.00, target 245.00
 *   Long NVDA at 231.40 — stop 225.00
 *   Long NVDA at 231.40
 *   Long NVDA — no levels given
 *
 * A NULL LEVEL IS LEFT OUT, never printed as "null" or as a dash. And a call
 * with nothing at all still gets a sentence, because the body is what a client
 * that does not understand `refs.community_call_id` will show, and an empty
 * bubble in the middle of a room is worse than a short sentence.
 *
 * THE THESIS IS NOT IN HERE, and that is a decision. It is up to 280 characters
 * of the member's own reasoning; the card renders it in full, and pasting it
 * into the body as well would bury the levels — which are the part of a call
 * that has to be readable at a glance — under a paragraph.
 */
export function callSentence(call: CallForRoom): string {
  const direction = call.direction === 'long' ? 'Long' : 'Short';
  const at = call.entry === null ? '' : ` at ${priceText(call.entry)}`;

  const levels: string[] = [];
  if (call.stop !== null) levels.push(`stop ${priceText(call.stop)}`);
  if (call.target !== null) levels.push(`target ${priceText(call.target)}`);

  const head = `${direction} ${call.symbol}${at}`;
  if (levels.length) return `${head} — ${levels.join(', ')}`;
  if (call.entry !== null) return head;
  return `${head} — no levels given`;
}

/* ------------------------------------------------------------------ */
/* The post                                                             */
/* ------------------------------------------------------------------ */

/**
 * Put the call in the room, then write the receipt.
 *
 * IT GOES THROUGH `post_room_message` AND NOT THROUGH AN INSERT. The RPC is
 * where membership, bans, moderator mutes, read-only rooms and slow mode are
 * checked, and it is where the room's `seq` counter is taken under a lock so
 * two people posting at once cannot collide. Writing the row directly would
 * dodge every one of those, which is the same as saying a call is exempt from
 * the rules of the room it is being posted into. It is not.
 *
 * NOTHING IN HERE THROWS. By the time it runs the call is published and the
 * member has been told so. A refusal at this point means the call is on the
 * board with no post — 0040's documented degraded state, visible in one query —
 * and it is logged with the reason so somebody can see which of the room's
 * rules stopped it.
 *
 * Returns the message id when the post landed AND the receipt was written.
 */
export async function postCallIntoRoom(opts: {
  room: CoreRoom;
  call: CallForRoom;
  userId: string;
  requestId: string;
}): Promise<string | null> {
  const rpc = await callRpc<Record<string, unknown> | Record<string, unknown>[]>(
    'post_room_message',
    {
      p_user_id: opts.userId,
      p_room_id: opts.room.id,
      p_kind: 'text',
      p_body: callSentence(opts.call),
      // THE POINTER, and the whole reason the room can render a card. Same
      // shape as `refs.kai_object_id`; `callsFor` in lib/rooms.ts reads it.
      p_refs: { community_call_id: opts.call.id },
      p_structured_idea: null,
      p_position_disclosure: null,
      p_parent_id: null,
    },
    opts.requestId
  );

  if (!rpc.ok) {
    log('warn', opts.requestId, 'social.call_post_failed', {
      call_id: opts.call.id,
      room_id: opts.room.id,
      reason: rpc.missing ? 'post_room_message is not installed' : rpc.message,
      plain: rpc.missing ? null : refusalPlain(rpc.message),
    });
    return null;
  }

  const inserted = Array.isArray(rpc.data)
    ? ((rpc.data[0] as Record<string, unknown>) ?? null)
    : (rpc.data ?? null);
  const messageId = inserted?.id ? String(inserted.id) : null;
  if (!messageId) {
    log('warn', opts.requestId, 'social.call_post_returned_nothing', {
      call_id: opts.call.id,
      room_id: opts.room.id,
    });
    return null;
  }

  const stamped = await stampCallMessage({
    callId: opts.call.id,
    messageId,
    requestId: opts.requestId,
  });
  // The post is in the room either way. Without the receipt a later withdrawal
  // cannot find it, which is worth knowing about and is not worth undoing a
  // post the room has already seen.
  return stamped ? messageId : null;
}

/**
 * `post_room_message` (0018) raises named conditions. This turns the ones a
 * call can actually hit into a sentence — not for a member to read, since
 * nothing here is shown to anybody, but so the log line says what happened in
 * words rather than in a condition name somebody has to go and look up.
 */
function refusalPlain(message: string): string {
  const key = (message || '').toLowerCase();
  if (key.includes('not_a_member')) return 'The author is not in that room.';
  if (key.includes('room_banned')) return 'The author is banned from that room.';
  if (key.includes('room_muted')) return 'A moderator has the author muted in that room.';
  if (key.includes('room_posting_restricted')) return 'That room is read-only right now.';
  if (key.includes('slow_mode')) return 'That room is in slow mode and the author had just posted.';
  if (key.includes('kind_not_postable')) return 'That room does not take text posts.';
  return message || 'The room refused the post and did not say why.';
}

/* ------------------------------------------------------------------ */
/* Taking it back                                                       */
/* ------------------------------------------------------------------ */

/**
 * WITHDRAWING A CALL TAKES ITS POST DOWN TOO.
 *
 * Withdrawing means "I no longer stand behind that". A card left standing in
 * the room would go on presenting a live trade with an entry and a stop, which
 * is the opposite of what the member just said — the button would be theatre.
 *
 * SOFT-DELETED, THE WAY THIS CODEBASE ALREADY REMOVES A MESSAGE (see
 * `removeMessage` in lib/moderation.ts): `deleted_at` + `deleted_by` +
 * `deleted_reason`. The row keeps its place in the conversation and loses its
 * body, so a reply underneath still makes sense as an answer to something that
 * was there. Nothing is hard-deleted; that is somebody's conversation.
 *
 * TWO DELIBERATE DIFFERENCES FROM A MODERATOR'S REMOVAL:
 *   * NO CASCADE. A moderator removing a post takes its comments with it
 *     because a thread reconstructs what was taken down. Nobody is being ruled
 *     against here — the author changed their mind — and taking down other
 *     members' comments because of that would be wrong.
 *   * `deleted_by` IS THE AUTHOR, not staff. The record should say who did it,
 *     and this was not a moderation action.
 *
 * `message_id` IS LEFT POINTING AT THE POST. 0040 calls it a receipt: the call
 * did reach the room, and that stays true after it is taken back down.
 *
 * Never throws. The call is already withdrawn by the time this runs.
 */
export async function retractCallMessage(opts: {
  messageId: string | null;
  userId: string;
  requestId: string;
}): Promise<boolean> {
  if (!opts.messageId) return false;

  const db = serviceClient();
  const { data, error } = await db
    .from('messages')
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: opts.userId,
      deleted_reason: 'The member withdrew this call.',
    })
    .eq('id', opts.messageId)
    // Idempotent, and it never overwrites a moderator who got there first: a
    // post already taken down keeps the timestamp and the reason it was taken
    // down for.
    .is('deleted_at', null)
    .select('id')
    .maybeSingle();

  if (error) {
    log('warn', opts.requestId, 'social.call_retract_failed', {
      message_id: opts.messageId,
      detail: error.message,
    });
    return false;
  }
  return Boolean(data);
}
