/**
 * Presence for the Live Rooms strip (0051). One row per member: where they
 * were last seen in Community and when. "Online" is a heartbeat inside
 * ONLINE_WINDOW_MIN; "live" is a room with a post inside LIVE_WINDOW_MIN.
 *
 * Both numbers are REAL: counted from heartbeats and from posts, never from
 * joins and never padded. A quiet evening shows small numbers, and that is the
 * point of showing them.
 */
import type { SocialAuthor } from '@shared/api';
import type { LiveRoom } from '@shared/community';
import { serviceClient } from '../db';
import { ApiError } from '../errors';
import { log } from '../log';
import { loadAuthors } from './authors';

export const ONLINE_WINDOW_MIN = 5;
export const LIVE_WINDOW_MIN = 15;
export const HEARTBEAT_S = 60;
const SPEAKERS_MAX = 4;
const RECENT_POSTS_SAMPLE = 400;

export async function heartbeat(opts: { userId: string; roomId: string | null; requestId: string }): Promise<string | null> {
  const db = serviceClient();
  let roomId = opts.roomId;
  if (roomId) {
    const [room, member] = await Promise.all([
      db.from('rooms').select('id').eq('id', roomId).maybeSingle(),
      db.from('room_members').select('banned').eq('room_id', roomId).eq('user_id', opts.userId).maybeSingle(),
    ]);
    if (!room.data) throw new ApiError('NOT_FOUND', 'I could not find that room.');
    // A banned member is not counted as being in a room they cannot read.
    if ((member.data as { banned?: boolean } | null)?.banned) roomId = null;
  }
  const { error } = await db
    .from('community_presence')
    .upsert({ user_id: opts.userId, room_id: roomId, last_seen_at: new Date().toISOString() } as never, {
      onConflict: 'user_id',
    });
  if (error) {
    log('warn', opts.requestId, 'social.presence_failed', { message: error.message });
    throw new ApiError('INTERNAL', 'That did not register. It will try again on its own.');
  }
  return roomId;
}

export type OnlineCounts = { byRoom: Map<string, number>; total: number };

export async function onlineCounts(now = Date.now()): Promise<OnlineCounts> {
  const db = serviceClient();
  const since = new Date(now - ONLINE_WINDOW_MIN * 60_000).toISOString();
  const { data, error } = await db.rpc('community_online_counts', { p_since: since });
  const byRoom = new Map<string, number>();
  let total = 0;
  if (error) {
    log('warn', '-', 'social.online_counts_failed', { message: error.message });
    return { byRoom, total };
  }
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const n = Number(r.online ?? 0);
    total += n;
    if (r.room_id) byRoom.set(String(r.room_id), n);
  }
  return { byRoom, total };
}

type StripConfig = { label?: unknown; topic?: unknown; order?: unknown };

export async function liveRooms(viewerId: string, now = Date.now()): Promise<{ rooms: LiveRoom[]; online_total: number }> {
  const db = serviceClient();
  const { data: roomRows } = await db
    .from('rooms')
    .select('id,slug,name,config')
    .eq('type', 'core')
    .not('config->strip', 'is', null);
  const rooms = ((roomRows ?? []) as Record<string, unknown>[]).map((r) => {
    const strip = ((r.config as Record<string, unknown> | null)?.strip ?? {}) as StripConfig;
    return {
      id: String(r.id),
      slug: (r.slug as string) ?? null,
      room_name: String(r.name ?? ''),
      name: typeof strip.label === 'string' && strip.label.trim() ? strip.label.trim() : String(r.name ?? ''),
      topic: typeof strip.topic === 'string' ? strip.topic : null,
      order: Number.isFinite(Number(strip.order)) ? Number(strip.order) : 99,
    };
  });
  const ids = rooms.map((r) => r.id);
  if (!ids.length) return { rooms: [], online_total: (await onlineCounts(now)).total };

  const [online, memberships, recent] = await Promise.all([
    onlineCounts(now),
    db.from('room_members').select('room_id,banned').eq('user_id', viewerId).in('room_id', ids),
    db
      .from('messages')
      .select('room_id,user_id,created_at')
      .in('room_id', ids)
      .is('deleted_at', null)
      .not('user_id', 'is', null)
      .gte('created_at', new Date(now - 24 * 3600_000).toISOString())
      .order('created_at', { ascending: false })
      .limit(RECENT_POSTS_SAMPLE),
  ]);

  const memberRows = (memberships.data ?? []) as Record<string, unknown>[];
  const bannedIn = new Set(memberRows.filter((m) => m.banned === true).map((m) => String(m.room_id)));
  const joined = new Set(memberRows.filter((m) => m.banned !== true).map((m) => String(m.room_id)));

  const lastAt = new Map<string, string>();
  const speakers = new Map<string, string[]>();
  for (const m of (recent.data ?? []) as Record<string, unknown>[]) {
    const rid = String(m.room_id);
    if (!lastAt.has(rid)) lastAt.set(rid, String(m.created_at));
    const list = speakers.get(rid) ?? [];
    const uid = String(m.user_id);
    if (list.length < SPEAKERS_MAX && !list.includes(uid)) list.push(uid);
    speakers.set(rid, list);
  }

  // A room quiet for a day still has a "last activity"; ask for those one by
  // one (there are five rooms on the strip, not fifty).
  await Promise.all(
    ids
      .filter((id) => !lastAt.has(id))
      .map(async (id) => {
        const { data } = await db
          .from('messages')
          .select('created_at')
          .eq('room_id', id)
          .is('deleted_at', null)
          .not('user_id', 'is', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const at = (data as { created_at?: string } | null)?.created_at;
        if (at) lastAt.set(id, at);
      })
  );

  const authors = await loadAuthors([...speakers.values()].flat());
  const liveSince = now - LIVE_WINDOW_MIN * 60_000;

  const out: LiveRoom[] = rooms
    .filter((r) => !bannedIn.has(r.id))
    .map((r) => {
      const last = lastAt.get(r.id) ?? null;
      return {
        id: r.id,
        slug: r.slug,
        name: r.name,
        room_name: r.room_name,
        topic: r.topic,
        live: last !== null && new Date(last).getTime() >= liveSince,
        listener_count: online.byRoom.get(r.id) ?? 0,
        speaker_avatars: (speakers.get(r.id) ?? [])
          .map((u) => authors.get(u))
          .filter((a): a is SocialAuthor => Boolean(a)),
        last_activity_at: last,
        joined: joined.has(r.id),
        order: r.order,
        route: `/room/${r.id}`,
      };
    })
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

  return { rooms: out, online_total: online.total };
}
