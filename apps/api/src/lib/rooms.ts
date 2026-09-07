/**
 * Room shaping and membership.
 *
 * Reads use the service role, so every query is explicitly user-scoped and the
 * membership check is done in code — the RLS that would do it for a client is
 * bypassed here by design (see db.ts SECURITY BOUNDARY).
 */
import type {
  RoomRow, MessageRow, MessageAuthor, KaiObjectEnvelope, MessageReactions, ReactionKind, MessageMedia,
  MessageQuote, CommunityCall, AdminRoomRow, Belt,
} from '@shared/api';
import { serviceClient } from './db';
import { ApiError } from './errors';
import { emitUserEvent } from './events';
import { envelope } from './kai/objects';
import { callRpc, noteFallback } from './rpc';
import { beltsFor, loadAuthors } from './social/authors';
import { CALL_COLUMNS, shapeCall, toCallRow } from './social/calls';

export const ROOM_COLUMNS = 'id,type,mode,slug,name,description,setup_id,config,pinned';

export type Membership = {
  role: string;
  banned: boolean;
  /** The member's OWN notification mute. Never blocks posting (0018 note). */
  muted_until: string | null;
  /** A moderator's mute. This one does block posting. */
  moderation_muted_until: string | null;
  last_read_seq: number;
} | null;

export async function loadRoom(roomId: string): Promise<Record<string, unknown> | null> {
  const db = serviceClient();
  const { data } = await db.from('rooms').select(ROOM_COLUMNS).eq('id', roomId).maybeSingle();
  return (data as Record<string, unknown>) ?? null;
}

export async function loadMembership(roomId: string, userId: string): Promise<Membership> {
  const db = serviceClient();
  const { data } = await db
    .from('room_members')
    .select('role,banned,muted_until,moderation_muted_until,last_read_seq')
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    role: String(r.role ?? 'member'),
    banned: Boolean(r.banned),
    muted_until: (r.muted_until as string) ?? null,
    moderation_muted_until: (r.moderation_muted_until as string) ?? null,
    last_read_seq: Number(r.last_read_seq ?? 0),
  };
}

export function requireMember(m: Membership, roomName: string): asserts m is NonNullable<Membership> {
  if (!m) throw new ApiError('FORBIDDEN', `Join ${roomName} first and I will show you what is in there.`);
  if (m.banned) throw new ApiError('ROOM_RESTRICTED', 'You cannot post or read in that room.');
}

/**
 * Posting is blocked by a MODERATOR mute only. `muted_until` is the member's own
 * notification mute (0018 keeps the two columns separate so a self-unmute can
 * never lift a moderation action), and muting your own notifications must not
 * silence you.
 */
export function isModerationMuted(m: NonNullable<Membership>): boolean {
  return Boolean(m.moderation_muted_until && new Date(m.moderation_muted_until).getTime() > Date.now());
}

/**
 * GETTING SOMEBODY INTO A CORE ROOM — the one implementation.
 *
 * This was written inside `POST /rooms/:id/join` and had exactly one caller
 * until a published call needed the same thing (0040: a call lands in its
 * desk's room, and publishing into a room should put you in it so you see the
 * replies). Two copies of "join a room" would be two places for the ban check
 * to be forgotten, so it moved here and the route now calls it.
 *
 * A BANNED MEMBER IS REFUSED AND THAT REFUSAL IS THE POINT. `post_room_message`
 * would refuse them anyway — it raises `room_banned` — but by then a call row
 * may already exist, and the honest answer is to stop before anything is
 * written. `bannedPlain` lets the caller say why in the words that fit what the
 * member was actually trying to do.
 *
 * ONLY CORE ROOMS. Circles (`type = 'setup'`) join through `joinCircle`, and
 * announcement rooms are not joinable at all; the caller checks the type.
 */
export async function joinCoreRoom(opts: {
  roomId: string;
  userId: string;
  roomName: string;
  requestId: string;
  bannedPlain?: string;
}): Promise<{ alreadyMember: boolean }> {
  const before = await loadMembership(opts.roomId, opts.userId);
  if (before?.banned) {
    throw new ApiError('ROOM_RESTRICTED', opts.bannedPlain ?? 'You cannot join that room.');
  }
  if (before) return { alreadyMember: true };

  const rpc = await callRpc('join_core_room', { p_user_id: opts.userId, p_room_id: opts.roomId }, opts.requestId);
  if (!rpc.ok) {
    if (!rpc.missing) throw new ApiError('INTERNAL', 'We could not get you into that room. Please try again.');
    // FALLBACK (documented in README): insert + outbox, two round-trips.
    noteFallback(opts.requestId, 'join_core_room');
    const db = serviceClient();
    const { error } = await db
      .from('room_members')
      .upsert({ room_id: opts.roomId, user_id: opts.userId, role: 'member' } as never, {
        onConflict: 'room_id,user_id',
      });
    if (error) throw new ApiError('INTERNAL', 'We could not get you into that room. Please try again.');
    await emitUserEvent(
      opts.userId,
      'system',
      'room',
      opts.roomId,
      { event: 'room_joined', room_name: opts.roomName },
      opts.requestId
    );
  }
  return { alreadyMember: false };
}

export async function roomStats(roomIds: string[]): Promise<
  Map<string, { members: number; messages: number; last_seq: number }>
> {
  const out = new Map<string, { members: number; messages: number; last_seq: number }>();
  if (!roomIds.length) return out;
  const db = serviceClient();

  const [members, messages] = await Promise.all([
    db.from('room_members').select('room_id').in('room_id', roomIds),
    db.from('messages').select('room_id,seq').in('room_id', roomIds).is('deleted_at', null),
  ]);

  for (const id of roomIds) out.set(id, { members: 0, messages: 0, last_seq: 0 });
  for (const r of (members.data ?? []) as Record<string, unknown>[]) {
    const e = out.get(String(r.room_id));
    if (e) e.members += 1;
  }
  for (const r of (messages.data ?? []) as Record<string, unknown>[]) {
    const e = out.get(String(r.room_id));
    if (e) {
      e.messages += 1;
      e.last_seq = Math.max(e.last_seq, Number(r.seq ?? 0));
    }
  }
  return out;
}

/**
 * What the member has actually missed: past their read mark, still visible,
 * and NOT their own writing. You did not miss your own post, and a "3 new"
 * pill over three of your own messages is simply wrong.
 *
 * Kai's posts DO count. `user_id` is null on those, and a bare `neq` would
 * drop them with the NULL — hence the explicit `is.null` arm.
 */
export async function unreadFor(roomId: string, userId: string, sinceSeq: number): Promise<number> {
  const db = serviceClient();
  const { count } = await db
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('room_id', roomId)
    .gt('seq', sinceSeq)
    .is('deleted_at', null)
    .or(`user_id.is.null,user_id.neq.${userId}`);
  return Math.max(0, Number(count ?? 0));
}

/** One sentence for the catch-up pill. */
export function catchUpPlain(count: number): string {
  if (count <= 0) return 'You are up to date.';
  return `${count} new since you left.`;
}

export function toRoomRow(
  row: Record<string, unknown>,
  stats: { members: number; messages: number; last_seq: number } | undefined,
  membership: Membership
): RoomRow {
  const lastSeq = stats?.last_seq ?? 0;
  const lastRead = membership?.last_read_seq ?? null;
  return {
    id: String(row.id),
    type: row.type as RoomRow['type'],
    mode: (row.mode as RoomRow['mode']) ?? null,
    slug: (row.slug as string) ?? null,
    name: String(row.name),
    description: (row.description as string) ?? null,
    setup_id: (row.setup_id as string) ?? null,
    config: (row.config as Record<string, unknown>) ?? {},
    pinned: row.pinned ?? [],
    member_count: stats?.members ?? 0,
    message_count: stats?.messages ?? 0,
    joined: Boolean(membership),
    last_read_seq: lastRead,
    last_seq: lastSeq,
    unread: lastRead === null ? 0 : Math.max(0, lastSeq - lastRead),
    route: `/room/${String(row.id)}`,
  };
}

/* ------------------------------------------------------------------ */
/* The picture on a room — the admin side                              */
/* ------------------------------------------------------------------ */

/**
 * WHERE A ROOM'S PICTURE LIVES: `rooms.config.image_url`.
 *
 * `config` is the room's jsonb metadata bag and it already reaches the client
 * with every room read, so the picture needed no migration and no new column.
 * `apps/mobile/src/ui/RoomAvatar.tsx` has been reading this key since it was
 * written; nothing in the product ever wrote it, which is why every non-ticker
 * room shows an initial today. These helpers are the writing hand.
 *
 * THE LEGACY SECOND KEY. The phone reads `image_url` and falls back to
 * `avatar_url`, so a room could in principle be wearing a picture stored under
 * the older name. This function deliberately does NOT follow that fallback:
 * the admin list must report the same field the admin write touches, or the
 * screen shows a value the "clear" button does not clear. The write path below
 * handles the legacy key by retiring it, which is the honest fix.
 *
 * ANYTHING THAT IS NOT A NON-EMPTY STRING IS "no picture". A half-written
 * value — a number, a json null, an empty string — has to fall through to the
 * logo or the initial rather than render as a broken image, and that is the
 * same rule the phone applies.
 */
export function roomImageUrl(config: unknown): string | null {
  if (!config || typeof config !== 'object') return null;
  const raw = (config as Record<string, unknown>).image_url;
  const s = typeof raw === 'string' ? raw.trim() : '';
  return s.length ? s : null;
}

/**
 * THE FACTS ABOUT A ROOM'S PICTURE, AND NOT THE VERDICT.
 *
 * `AdminRoomRow` carries `name` and `image_url` and pointedly does not carry
 * "which of the three cases does this room render". The rule that decides
 * between a company logo and a tinted initial lives in `RoomAvatar.tsx` and it
 * is the rule the member actually sees; answering the same question a second
 * time here would create two answers that eventually disagree. So the server
 * ships what it knows and the client keeps the rule it already owns.
 *
 * The per-row sentence says "a logo or its initial" for exactly that reason —
 * it is true whichever of the two this particular room turns out to be, and it
 * does not pretend to know which.
 */
export function toAdminRoomRow(row: Record<string, unknown>): AdminRoomRow {
  const imageUrl = roomImageUrl(row.config);
  return {
    id: String(row.id),
    type: String(row.type),
    slug: (row.slug as string) ?? null,
    name: String(row.name),
    image_url: imageUrl,
    plain: imageUrl
      ? 'Someone chose a picture for this room.'
      : 'No picture chosen, so it wears a company logo or its own initial.',
  };
}

/**
 * SET OR CLEAR THE PICTURE — BY MERGING THE CONFIG BAG, NEVER BY REPLACING IT.
 *
 * `rooms.config` is shared. It already holds `slow_mode_s`,
 * `posting_restricted` and `intel_eligible` (migration 0010), a circle's
 * expiry, and whatever the next feature puts there. Writing
 * `{ image_url: … }` into the column would set the picture and silently switch
 * slow mode off, un-restrict a locked room, and drop a circle's expiry — a
 * single-field edit quietly performing four other edits nobody asked for. So
 * the existing bag is read, spread, and handed back with one key changed.
 *
 * CLEARING DELETES THE KEY RATHER THAN STORING NULL. `{"image_url": null}` and
 * an absent key render identically today — `->>` yields SQL NULL for a json
 * null either way — but they are not the same row. Deleting puts the config
 * back to exactly what it was before anyone touched it, which means "clear"
 * genuinely undoes "set" and leaves nothing behind for a later reader to
 * wonder about. A stored null is a tombstone that has to be explained forever.
 *
 * THE LEGACY `avatar_url` KEY GOES ON EVERY WRITE, set or clear. The phone
 * falls back to it, so leaving it in place would make a clear a lie — the
 * operator presses "remove the picture", the key it reads is gone, and the
 * room keeps showing a picture from the older key. After any write through
 * here, `image_url` alone describes the room's picture.
 *
 * THE ONE RACE, NAMED. This is a read-modify-write, so two operators editing
 * two DIFFERENT keys of the same room's config in the same instant can have
 * one edit overwrite the other. Doing better needs a `config = config || …`
 * update in SQL, which is a migration this change does not carry. Two admins
 * editing one room's config within the same second is not a situation this
 * product has; the note is here so the next person does not have to rediscover
 * the shape of it.
 */
export async function setRoomImageUrl(opts: {
  roomId: string;
  /** The room's CURRENT config, as read by `loadRoom`. */
  config: unknown;
  /** A stable media URL, or null to clear. */
  imageUrl: string | null;
}): Promise<Record<string, unknown>> {
  const current =
    opts.config && typeof opts.config === 'object' ? { ...(opts.config as Record<string, unknown>) } : {};

  delete current.avatar_url;
  if (opts.imageUrl === null) delete current.image_url;
  else current.image_url = opts.imageUrl;

  const db = serviceClient();
  const { data, error } = await db
    .from('rooms')
    .update({ config: current } as never)
    .eq('id', opts.roomId)
    .select(ROOM_COLUMNS)
    .single();
  if (error) throw error;
  return data as Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/* Messages                                                            */
/* ------------------------------------------------------------------ */

/**
 * ONE STRING LITERAL, NOT A CONCATENATION. supabase-js reads this at the type
 * level to shape the row it returns, and it can only do that for a literal —
 * split it over a `+` and every read through it degrades to an error type.
 *
 * The middle four are migration 0033's. `reaction_counts` and
 * `attachment_count` are denormalised onto the message precisely so that
 * reading them is free: they arrive with the row the room was already fetching.
 *
 * `quoted_message_id` is migration 0035's and is an ID, not the quoted words —
 * `quotesFor` below turns a page of them into rendered quotes in one query.
 */
export const MESSAGE_COLUMNS =
  'id,room_id,user_id,seq,kind,body,parent_id,refs,structured_idea,position_disclosure,deleted,created_at,reaction_counts,reply_count,attachment_count,author_deleted,quoted_message_id';

/**
 * WHICH REACTIONS DID *THIS* PERSON GIVE — for a whole page, in one query.
 *
 * The counts are on the message row already. This is the only part that cannot
 * be: it is per-person, so it lives in `message_reactions` and is fetched with
 * a single `in (...)` over the page's ids. One round trip for fifty messages,
 * never one per message.
 */
export async function reactionsMineFor(
  messageIds: string[],
  userId: string
): Promise<Map<string, ReactionKind[]>> {
  const out = new Map<string, ReactionKind[]>();
  const ids = [...new Set(messageIds.filter(Boolean))];
  if (!ids.length) return out;

  const db = serviceClient();
  const { data } = await db
    .from('message_reactions')
    .select('message_id,kind')
    .eq('user_id', userId)
    .in('message_id', ids);

  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const key = String(r.message_id);
    const list = out.get(key) ?? [];
    list.push(r.kind as ReactionKind);
    out.set(key, list);
  }
  return out;
}

/**
 * Every author on a page, in ONE query.
 *
 * `profiles_public` (0015) is a definer view over `profiles` joined to
 * `contributor_stats` — identity fields only, never a financial one — so a
 * page of fifty messages costs one round trip, not fifty. Do not move this
 * lookup inside the row mapper.
 *
 * EVERY ID ASKED FOR COMES BACK, even when the profile row does not.
 * `toMessageRow` used to write `author: null` whenever this map had no entry,
 * and the phone's rule for a null author is "this was written by Kai"
 * (`community-api.ts`, `isKai = raw.user_id == null`). So a member whose
 * profile row was missing for any reason — a half-finished sign-up, a row
 * removed by hand, a view that failed to resolve — had their posts silently
 * signed by the assistant. A member with no profile row is a member we know
 * nothing about, which is a blank name, not somebody else's name.
 *
 * THE BELT COMES FROM `beltsFor`, THE SAME HELPER `loadAuthors` USES. It is a
 * second query, not a second definition: there is one answer to "what rank is
 * this member" and it lives in `lib/social/authors.ts`. It is issued INSIDE the
 * `Promise.all` below, so a page of fifty messages goes from one round trip to
 * two that overlap — one query more, and no measurable wait more, on a list the
 * room polls every five seconds. Do not move it into the row mapper and do not
 * take it out of the `Promise.all`.
 *
 * `opts.belts` EXISTS FOR ONE CALLER. `quotesFor` uses this loader only to
 * print a name above a quoted line, and that line is never coloured by rank, so
 * paying for a belt query there would be a round trip whose answer nothing
 * renders. Anything drawing a name a member can recognise wants the default.
 */
export async function authorsFor(
  userIds: string[],
  opts?: { belts?: boolean }
): Promise<Map<string, MessageAuthor>> {
  const out = new Map<string, MessageAuthor>();
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return out;
  const db = serviceClient();
  const wantBelts = opts?.belts !== false;
  const [{ data }, belts] = await Promise.all([
    db
      .from('profiles_public')
      .select('user_id,handle,display_name,avatar_url,role_labels')
      .in('user_id', ids),
    wantBelts ? beltsFor(ids) : Promise.resolve(new Map<string, Belt>()),
  ]);
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const id = String(r.user_id);
    out.set(id, {
      user_id: id,
      handle: (r.handle as string) ?? null,
      display_name: (r.display_name as string) ?? null,
      avatar_url: (r.avatar_url as string) ?? null,
      role_labels: (r.role_labels as string[]) ?? [],
      route: `/contributor/${id}`,
      // A member we could read is standing on a rung, and White is a rung —
      // `beltsFor` explains why an absent row is White rather than unknown.
      // Null here only ever means "this loader was told not to look".
      belt: wantBelts ? (belts.get(id) ?? 'white') : null,
    });
  }
  // The gap is filled with a member who has no name yet, never left empty.
  for (const id of ids) {
    if (out.has(id)) continue;
    out.set(id, {
      user_id: id,
      handle: null,
      display_name: null,
      avatar_url: null,
      role_labels: [],
      route: `/contributor/${id}`,
      // No profile row means we know nothing about them, and that includes
      // their rank. White here would be a claim about a person we cannot name.
      belt: null,
    });
  }
  return out;
}

/**
 * THE POSTS A PAGE OF MESSAGES IS QUOTING, RESOLVED IN ONE QUERY.
 *
 * `messages.quoted_message_id` (migration 0035) holds an id and never a copy of
 * the words, so the quoted line has to be read back on every render. Done
 * naively that is one lookup per quoting message; done here it is one `in (...)`
 * over the page's quoted ids plus the one `authorsFor` round trip the page was
 * already making anyway. Same rule as `reactionsMineFor`: batched, or not at
 * all.
 *
 * IT IS READ THROUGH `messages_public`, not through `messages`, which is what
 * makes it safe to skip a per-quote membership check. The view carries its own
 * membership test, and the database refuses a quote pointing at another room
 * (0035 §2b), so a quote can only ever resolve to a post the reader was already
 * entitled to see.
 *
 * A REMOVED POST COMES BACK AS `deleted` WITH NO TEXT. Never its words — if a
 * removal left the quoted line standing in ten replies, the removal would be
 * theatre. A quote we cannot read at all (the row is gone, or something went
 * wrong) comes back the same way rather than as a blank, because "This post was
 * removed" is the honest thing to show and an empty box is not.
 */
const QUOTE_MAX_CHARS = 180;

export async function quotesFor(quotedIds: string[]): Promise<Map<string, MessageQuote>> {
  const out = new Map<string, MessageQuote>();
  const ids = [...new Set(quotedIds.filter(Boolean))];
  if (!ids.length) return out;

  const db = serviceClient();
  const { data } = await db
    .from('messages_public')
    .select('id,user_id,body,deleted,author_deleted')
    .in('id', ids);

  const rows = (data ?? []) as Record<string, unknown>[];
  // The same author lookup every other read uses, so a quoted post is signed
  // exactly the way the post itself is — minus the belt, which a quote line
  // does not colour by. Asking for it here would add a second round trip to
  // every page carrying a quote and nothing on screen would use the answer.
  const authors = await authorsFor(
    rows.map((r) => String(r.user_id ?? '')),
    { belts: false }
  );

  for (const r of rows) {
    const id = String(r.id);
    const removed = Boolean(r.deleted);
    const author = r.user_id ? (authors.get(String(r.user_id)) ?? null) : null;
    out.set(id, {
      message_id: id,
      author_name: quoteAuthorName(author, Boolean(r.author_deleted), r.user_id == null),
      handle: author?.handle ?? null,
      text: removed ? '' : quoteSnippet((r.body as string) ?? null),
      deleted: removed,
    });
  }

  // Every id asked for comes back, the same guarantee `authorsFor` makes. A
  // quote that resolved to nothing is a removal as far as the screen is
  // concerned; the alternative is a reply answering an invisible gap.
  for (const id of ids) {
    if (out.has(id)) continue;
    out.set(id, { message_id: id, author_name: 'A member', handle: null, text: '', deleted: true });
  }
  return out;
}

/**
 * Who to put above the quoted line. Never empty, and never the wrong person:
 * a null `user_id` means Kai ONLY when the author did not delete their account,
 * which is the same trap `toMessageRow` avoids with `author_deleted`.
 */
function quoteAuthorName(author: MessageAuthor | null, authorDeleted: boolean, noUserId: boolean): string {
  if (authorDeleted) return 'A member who left';
  if (noUserId) return 'Kai';
  return author?.display_name || author?.handle || 'A member';
}

/**
 * Two lines of the quoted post, cut at a word so it does not end mid-word.
 * Newlines collapse, because a quote is a reminder of what was said and not a
 * second copy of the post's layout.
 */
function quoteSnippet(body: string | null): string {
  const text = (body ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= QUOTE_MAX_CHARS) return text;
  const cut = text.slice(0, QUOTE_MAX_CHARS);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export async function objectsFor(objectIds: string[]): Promise<Map<string, KaiObjectEnvelope>> {
  const out = new Map<string, KaiObjectEnvelope>();
  const ids = [...new Set(objectIds.filter(Boolean))];
  if (!ids.length) return out;
  const db = serviceClient();
  const { data } = await db
    .from('kai_objects')
    .select('id,type,payload,disclosures,model,prompt_version,refs,created_at')
    .in('id', ids);
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    out.set(
      String(r.id),
      envelope({
        id: String(r.id),
        type: r.type as never,
        payload: r.payload,
        model: String(r.model),
        createdAt: String(r.created_at),
        refs: (r.refs as Record<string, unknown>) ?? null,
        disclosures: (r.disclosures as string[]) ?? [],
      })
    );
  }
  return out;
}

/**
 * THE CALLS A PAGE OF MESSAGES CARRIES, RESOLVED IN ONE QUERY.
 *
 * The exact shape of `objectsFor` above and for the same reason. 0040 chose to
 * carry a member's call on `messages.refs -> 'community_call_id'` rather than
 * invent a message kind, so the room renders the real card — direction, levels,
 * belt, outcome — instead of a link the reader has to leave the conversation to
 * follow. Resolving that one call at a time would be a query per message; this
 * is one `in (...)` for the whole page, and a page with no calls on it makes no
 * query at all.
 *
 * IT USES THE SAME SHAPER AS `/community/calls`. `shapeCall` is imported rather
 * than reimplemented, so the card in the room and the card on the board's
 * Community tab are the same object with the same fields — a second shaper here
 * would drift the moment one of the two gained a field.
 *
 * AUTHORS COME FROM `loadAuthors`, NOT FROM `authorsFor`. They are different
 * people-shapes: a message author is `MessageAuthor` (handle, name, avatar,
 * role labels) and a call author is `SocialAuthor` (handle, name, avatar,
 * initial, BELT). The belt is the difference and it is the reason the call card
 * looks the way it does, so the call brings its own author with it.
 *
 * A CALL THAT DOES NOT RESOLVE IS SIMPLY ABSENT and the message falls back to
 * its body, which is a readable sentence describing the trade. That is the
 * whole reason the body is written as a sentence — see `callSentence` in
 * `lib/social/rooms-bridge.ts`.
 */
export async function callsFor(callIds: string[]): Promise<Map<string, CommunityCall>> {
  const out = new Map<string, CommunityCall>();
  const ids = [...new Set(callIds.filter(Boolean))];
  if (!ids.length) return out;

  const db = serviceClient();
  const { data } = await db.from('community_calls').select(CALL_COLUMNS).in('id', ids);
  const rows = ((data ?? []) as Record<string, unknown>[]).map(toCallRow);
  if (!rows.length) return out;

  const authors = await loadAuthors(rows.map((r) => r.user_id));
  for (const row of rows) {
    const author = authors.get(row.user_id);
    // No author means the profile is gone mid-delete. The card is a person
    // saying something; without the person there is nothing to draw, and the
    // message still has its sentence.
    if (!author) continue;
    out.set(row.id, shapeCall(row, author));
  }
  return out;
}

export function toMessageRow(
  row: Record<string, unknown>,
  authors: Map<string, MessageAuthor>,
  objects: Map<string, KaiObjectEnvelope>,
  extras?: {
    mine?: Map<string, ReactionKind[]>;
    media?: Map<string, MessageMedia[]>;
    quotes?: Map<string, MessageQuote>;
    calls?: Map<string, CommunityCall>;
  }
): MessageRow {
  const refs = (row.refs as Record<string, unknown>) ?? null;
  const objectId = typeof refs?.kai_object_id === 'string' ? refs.kai_object_id : null;
  const callId = typeof refs?.community_call_id === 'string' ? refs.community_call_id : null;
  return {
    id: String(row.id),
    room_id: String(row.room_id),
    user_id: (row.user_id as string) ?? null,
    seq: Number(row.seq),
    kind: row.kind as MessageRow['kind'],
    body: (row.body as string) ?? null,
    parent_id: (row.parent_id as string) ?? null,
    refs,
    structured_idea: (row.structured_idea as Record<string, unknown>) ?? null,
    position_disclosure: (row.position_disclosure as Record<string, unknown>) ?? null,
    deleted: Boolean(row.deleted ?? row.deleted_at),
    created_at: String(row.created_at),
    author: messageAuthorOf(row, authors),
    kai_object: objectId ? (objects.get(objectId) ?? null) : null,
    /**
     * A REMOVED MESSAGE LOSES ITS CARD, the same way it loses its body, its
     * reactions and its pictures. This is also how withdrawing reaches the
     * conversation: withdrawing a call takes its post down, and a card left
     * standing over a "this was removed" gap would still be presenting a live
     * trade the member has taken back.
     */
    community_call:
      callId && !(row.deleted ?? row.deleted_at) ? (extras?.calls?.get(callId) ?? null) : null,
    author_deleted: Boolean(row.author_deleted),
    reactions: reactionsOf(row, extras?.mine?.get(String(row.id)) ?? []),
    reply_count: Number(row.reply_count ?? 0),
    media: extras?.media?.get(String(row.id)) ?? [],
    quote: quoteOf(row, extras?.quotes),
  };
}

/**
 * WHO SIGNED A MESSAGE, AND THEREFORE WHOSE BELT COLOURS THE NAME.
 *
 * Two rows carry no author at all and both of them look identical in the
 * column: `user_id` is null. Kai's posts have always been null there, and
 * migration 0032 severs a deleted member's authorship by nulling the same
 * column — which is why `author_deleted` exists and why nothing may read the
 * null on its own. Neither has an author object, so neither can have a belt:
 * Kai is not a member and has no rank, and an account that is gone cannot be
 * standing on a rung.
 *
 * THE `author_deleted` STRIP IS BELT AND BRACES. A severed row should have no
 * `user_id` to look up, so it should never reach the last branch — but if one
 * ever did (a half-applied delete, a row fixed by hand), a stranger's rank
 * would be painted over a post signed "a member who left". Dropping the belt
 * costs nothing and closes that off at the only place it could happen.
 */
function messageAuthorOf(
  row: Record<string, unknown>,
  authors: Map<string, MessageAuthor>
): MessageAuthor | null {
  const userId = row.user_id ? String(row.user_id) : '';
  if (!userId) return null;
  const author = authors.get(userId) ?? null;
  if (!author) return null;
  return row.author_deleted ? { ...author, belt: null } : author;
}

/**
 * A message that quotes nothing gets null. A message that quotes something the
 * caller did not hand us a resolution for gets a removal, never a silent null —
 * dropping the quote would make the reply read as an answer to whatever is
 * above it, which is the exact confusion quoting exists to fix.
 */
function quoteOf(
  row: Record<string, unknown>,
  quotes: Map<string, MessageQuote> | undefined
): MessageQuote | null {
  const quotedId = (row.quoted_message_id as string) ?? null;
  if (!quotedId) return null;
  return (
    quotes?.get(quotedId) ?? {
      message_id: quotedId,
      author_name: 'A member',
      handle: null,
      text: '',
      deleted: true,
    }
  );
}

/**
 * A removed message keeps its place and loses everything else. The view already
 * blanks the counts, and this repeats it on the way out rather than trusting one
 * of the two: reactions on a post nobody can read are a score with no game.
 */
function reactionsOf(row: Record<string, unknown>, mine: ReactionKind[]): MessageReactions {
  const deleted = Boolean(row.deleted ?? row.deleted_at);
  if (deleted) return { counts: {}, mine: [] };
  const raw = (row.reaction_counts as Record<string, unknown> | null) ?? {};
  const counts: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) counts[k] = n;
  }
  return { counts: counts as MessageReactions['counts'], mine };
}
