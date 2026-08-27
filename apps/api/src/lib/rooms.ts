/**
 * Room shaping and membership.
 *
 * Reads use the service role, so every query is explicitly user-scoped and the
 * membership check is done in code — the RLS that would do it for a client is
 * bypassed here by design (see db.ts SECURITY BOUNDARY).
 */
import type { RoomRow, MessageRow, MessageAuthor, KaiObjectEnvelope } from '@shared/api';
import { serviceClient } from './db';
import { ApiError } from './errors';
import { envelope } from './kai/objects';

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
/* Messages                                                            */
/* ------------------------------------------------------------------ */

export const MESSAGE_COLUMNS =
  'id,room_id,user_id,seq,kind,body,parent_id,refs,structured_idea,position_disclosure,deleted,created_at';

export async function authorsFor(userIds: string[]): Promise<Map<string, MessageAuthor>> {
  const out = new Map<string, MessageAuthor>();
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return out;
  const db = serviceClient();
  const { data } = await db
    .from('profiles_public')
    .select('user_id,handle,display_name,avatar_url,role_labels')
    .in('user_id', ids);
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    out.set(String(r.user_id), {
      user_id: String(r.user_id),
      handle: (r.handle as string) ?? null,
      display_name: (r.display_name as string) ?? null,
      avatar_url: (r.avatar_url as string) ?? null,
      role_labels: (r.role_labels as string[]) ?? [],
      route: `/contributor/${String(r.user_id)}`,
    });
  }
  return out;
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

export function toMessageRow(
  row: Record<string, unknown>,
  authors: Map<string, MessageAuthor>,
  objects: Map<string, KaiObjectEnvelope>
): MessageRow {
  const refs = (row.refs as Record<string, unknown>) ?? null;
  const objectId = typeof refs?.kai_object_id === 'string' ? refs.kai_object_id : null;
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
    author: row.user_id ? (authors.get(String(row.user_id)) ?? null) : null,
    kai_object: objectId ? (objects.get(objectId) ?? null) : null,
  };
}
