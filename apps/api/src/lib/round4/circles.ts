/**
 * Circles — the time-boxed rooms the team opens.
 *
 * A circle is a `rooms` row with `type='setup'` and an expiry. It exists while
 * the thing it is about is worth talking about and then it closes, which is
 * the whole point: a room about a META breakout that is still open in November
 * is not a community, it is litter.
 *
 * =====================================================================
 * ONE WAY A CIRCLE OPENS: A MEMBER OF STAFF OPENS IT.
 * =====================================================================
 * Owner instruction, 2026-09-05: "circles should be setup admin only not
 * based on alerts". Until 0034 there were three doors and the widest of them
 * was automatic — the paper tick opened a room for every setup that reached
 * `ready` at grade A or B, once a minute, for ever. Eight rooms had appeared
 * that way on the hosted database and nobody had ever posted in one of them.
 *
 * That door is gone at both ends. `openSetupCircle` was deleted along with
 * everything that only existed to serve it:
 *   * the sweep's OPEN pass, which is what actually created the rooms;
 *   * `reviveLiveCircles`, which re-derived a fresh expiry for every circle
 *     whose setup was still live and put it back — the reason those eight
 *     rooms would never have expired on their own, whatever their clock said;
 *   * `closeDeadSetupCircles`, which closed a circle when its setup died;
 *   * the clock helpers `circleTtlHours` / `circleExpiryFor` / `circleName`,
 *     which derived a room's name and its lifetime FROM a setup.
 * And 0034 closes it in the DATABASE, which is the part that actually matters:
 * dropping `open_setup_circle()` alone was not enough, because `openSetupCircle`
 * fell through to a direct insert whenever the RPC failed. The eight rooms were
 * deleted and came back inside a minute — the deployed cron simply took the
 * fallback. So 0034 also adds `rooms_no_setup_link`, a check constraint saying
 * a room may not be tied to a setup at all, and that holds whatever version of
 * this file is deployed. All eight rooms were empty; nothing was lost.
 *
 * What is left is `createCircle`, whose only caller is `POST /api/v1/circles`
 * behind `staff_role()` at `admin` or above. A circle opened this way carries
 * no `setup_id`, so a setup no longer has a room of its own — the surfaces
 * that used to link to one already handle that (`discussion_room_id` is null
 * and every reader of it has a null path).
 *
 * ONE WAY ONE CLOSES: the expiry passes. Closing means READ-ONLY plus a move
 * into history — messages are never deleted, because a room where the
 * conversation vanishes teaches nobody anything.
 *
 * WHERE THE CLOCK LIVES. Older rows carry the expiry in `config.expires_at`;
 * 0021 added a real `expires_at` column. Both are read through the same code
 * path (`expiryOf`), and `hasRoomExpiry()` decides whether the column can be
 * asked for at all, so a migration mid-flight cannot lose a circle's clock.
 */
import { CIRCLE_TTL_HOURS, type CircleRow, type GradeMedallion } from '@shared/api';
import { serviceClient } from '../db';
import { ApiError } from '../errors';
import { emitUserEvent } from '../events';
import { log } from '../log';
import { medallion } from './grade';
import { hasRoomExpiry } from './schema-probe';

export const CIRCLE_COLUMNS = 'id,type,mode,slug,name,description,setup_id,config,pinned,created_at';

/** The expiry, wherever it is stored. */
export function expiryOf(row: Record<string, unknown>): string | null {
  const col = row.expires_at;
  if (typeof col === 'string') return col;
  const cfg = (row.config as Record<string, unknown>) ?? {};
  return typeof cfg.expires_at === 'string' ? cfg.expires_at : null;
}

export function timeLeftPlain(expiresAt: string | null): { plain: string; expired: boolean } {
  if (!expiresAt) return { plain: 'No closing time set', expired: false };
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (Number.isNaN(ms)) return { plain: 'No closing time set', expired: false };
  if (ms <= 0) return { plain: 'Closed', expired: true };
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 48) return { plain: `${Math.floor(hours / 24)} days left`, expired: false };
  if (hours >= 24) return { plain: '1 day left', expired: false };
  if (hours >= 1) return { plain: `${hours}h left`, expired: false };
  return { plain: `${Math.max(1, Math.round(ms / 60_000))}m left`, expired: false };
}


export type LoadedCircle = CircleRow;

export async function listCircles(opts: { userId: string; includeExpired?: boolean }): Promise<{
  circles: LoadedCircle[];
  degraded: boolean;
  degraded_reason: string | null;
}> {
  const db = serviceClient();
  const withExpiry = await hasRoomExpiry();
  const cols = withExpiry ? `${CIRCLE_COLUMNS},expires_at` : CIRCLE_COLUMNS;

  const { data, error } = await db
    .from('rooms')
    .select(cols)
    .eq('type', 'setup')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) {
    log('warn', '-', 'circles.list_failed', { message: error.message });
    return { circles: [], degraded: true, degraded_reason: 'Circles are not switched on for this database yet.' };
  }

  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  if (!rows.length) return { circles: [], degraded: false, degraded_reason: null };

  const ids = rows.map((r) => String(r.id));
  const setupIds = rows.map((r) => r.setup_id).filter((s): s is string => typeof s === 'string');

  const [members, messages, mine, setups] = await Promise.all([
    db.from('room_members').select('room_id').in('room_id', ids),
    db.from('messages').select('room_id,created_at').in('room_id', ids).is('deleted_at', null),
    db.from('room_members').select('room_id').eq('user_id', opts.userId).in('room_id', ids),
    setupIds.length
      ? db.from('setups').select('id,symbol,grade_display,grade_band,score,state').in('id', setupIds)
      : Promise.resolve({ data: [] }),
  ]);

  const memberCount = new Map<string, number>();
  for (const m of (members.data ?? []) as Record<string, unknown>[]) {
    memberCount.set(String(m.room_id), (memberCount.get(String(m.room_id)) ?? 0) + 1);
  }
  const msgCount = new Map<string, number>();
  const lastAt = new Map<string, string>();
  for (const m of (messages.data ?? []) as Record<string, unknown>[]) {
    const id = String(m.room_id);
    msgCount.set(id, (msgCount.get(id) ?? 0) + 1);
    const at = String(m.created_at);
    if (!lastAt.has(id) || at > (lastAt.get(id) as string)) lastAt.set(id, at);
  }
  const joined = new Set(((mine.data ?? []) as Record<string, unknown>[]).map((m) => String(m.room_id)));
  const setupBy = new Map<string, Record<string, unknown>>();
  for (const s of ((setups.data ?? []) as Record<string, unknown>[])) setupBy.set(String(s.id), s);

  const circles = rows
    .map((r) => {
      const id = String(r.id);
      const expiresAt = expiryOf(r);
      const { plain, expired } = timeLeftPlain(expiresAt);
      const setup = r.setup_id ? (setupBy.get(String(r.setup_id)) ?? null) : null;
      const grade: GradeMedallion | null = setup
        ? medallion({
            display: (setup.grade_display as string) ?? null,
            band: (setup.grade_band as string) ?? null,
            score: setup.score === null || setup.score === undefined ? null : Number(setup.score),
          })
        : null;
      return {
        id,
        symbol: (setup?.symbol as string) ?? symbolFromName(String(r.name)),
        name: String(r.name),
        setup_id: (r.setup_id as string) ?? null,
        members: memberCount.get(id) ?? 0,
        messages: msgCount.get(id) ?? 0,
        joined: joined.has(id),
        expires_at: expiresAt,
        time_left_plain: plain,
        expired,
        last_activity_at: lastAt.get(id) ?? null,
        route: `/circle/${id}`,
        grade,
      } satisfies LoadedCircle;
    })
    .filter((c) => (opts.includeExpired ? true : !c.expired))
    .sort((a, b) => {
      const at = (x: LoadedCircle) => (x.expires_at ? new Date(x.expires_at).getTime() : Infinity);
      return at(a) - at(b);
    });

  return { circles, degraded: false, degraded_reason: null };
}

function symbolFromName(name: string): string | null {
  const m = name.match(/^([A-Z]{1,6})\b/);
  return m ? m[1] : null;
}

/**
 * A STAFF-created circle: named for the symbol, with no setup behind it.
 *
 * The ONLY way a circle is created. Was "member-created" until 2026-09-05 and
 * "created by the tick as well" until 0034. The gate is in the route
 * (`/api/v1/circles`), against `staff_role()`, and it is NOT repeated here —
 * this function does the work and the route decides who may ask for it.
 * Anything that calls this without checking first is the bug.
 *
 * `created_by` is written twice on purpose: the real column (0031) is the fact,
 * and `config.created_by` stays for the rows that already carry it and for any
 * deployment where 0031 has not landed yet.
 */
export async function createCircle(opts: {
  userId: string;
  symbol: string;
  ttlHours: number;
}): Promise<{ id: string } | null> {
  const db = serviceClient();
  const expiresAt = new Date(Date.now() + opts.ttlHours * 3_600_000).toISOString();

  try {
    const rpc = await db.rpc('create_circle', {
      p_user_id: opts.userId,
      p_symbol: opts.symbol.toUpperCase(),
      p_ttl: `${opts.ttlHours} hours`,
    });
    if (!rpc.error && rpc.data) {
      const row = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
      const id = typeof row === 'string' ? row : String((row as Record<string, unknown>)?.id ?? '');
      if (id) return { id };
    }
  } catch {
    /* fall through */
  }

  const insert: Record<string, unknown> = {
    type: 'setup',
    name: `${opts.symbol.toUpperCase()} Circle`,
    description: `A time-boxed room for ${opts.symbol.toUpperCase()}. It closes on its own.`,
    config: { intel_eligible: false, expires_at: expiresAt, circle: true, created_by: opts.userId },
    created_by: opts.userId,
  };
  if (await hasRoomExpiry()) insert.expires_at = expiresAt;

  let { data, error } = await db.from('rooms').insert(insert).select('id').single();
  if (error && /created_by/i.test(error.message ?? '')) {
    // 0031 has not been applied here yet. The room still gets opened and its
    // author still survives, in config, exactly as it did before.
    delete insert.created_by;
    ({ data, error } = await db.from('rooms').insert(insert).select('id').single());
  }
  if (error || !data) {
    log('warn', '-', 'circles.create_failed', { symbol: opts.symbol, message: error?.message });
    return null;
  }
  const id = String((data as Record<string, unknown>).id);
  await db
    .from('room_members')
    .upsert({ room_id: id, user_id: opts.userId, role: 'moderator' } as never, { onConflict: 'room_id,user_id' });
  return { id };
}


/* ------------------------------------------------------------------ */
/* Closing (called from the tick)                                       */
/* ------------------------------------------------------------------ */

export type SweepResult = { closed: number };

/**
 * One pass: close every circle whose clock has run out.
 *
 * NOTHING OPENS HERE ANY MORE. This function used to begin by opening a room
 * for every ready A/B setup that did not have one, and that is exactly the
 * behaviour the owner ruled out. What is left is the half that was always
 * right: a circle the team opened for three days stops taking posts after
 * three days, on its own, without anybody having to remember.
 *
 * Closing is `config.closed_at` + `config.posting_locked`, which the posting
 * pipeline already respects through the room's config — the room stays
 * readable and stops accepting posts. Nothing is deleted.
 */
export async function sweepCircles(opts: { requestId?: string } = {}): Promise<SweepResult> {
  const db = serviceClient();
  let closed = 0;

  // 0021 ships `close_expired_circles()`, which flips only the rows THIS call
  // actually closed and returns their ids, so the sweep can narrate them once.
  try {
    const rpc = await db.rpc('close_expired_circles');
    if (!rpc.error && Array.isArray(rpc.data)) {
      closed += rpc.data.length;
      if (closed) log('info', opts.requestId ?? '-', 'circles.swept', { closed });
      return { closed };
    }
  } catch {
    /* fall through to the in-TypeScript sweep below */
  }

  const withExpiry = await hasRoomExpiry();
  const cols = withExpiry ? `${CIRCLE_COLUMNS},expires_at` : CIRCLE_COLUMNS;
  const rooms = await db.from('rooms').select(cols).eq('type', 'setup').limit(200);

  for (const r of ((rooms.data ?? []) as unknown as Record<string, unknown>[])) {
    const cfg = (r.config as Record<string, unknown>) ?? {};
    if (cfg.closed_at) continue;
    const expiresAt = expiryOf(r);
    if (!expiresAt || new Date(expiresAt).getTime() > Date.now()) continue;

    await db
      .from('rooms')
      .update({
        config: {
          ...cfg,
          closed_at: new Date().toISOString(),
          posting_locked: true,
          closed_reason: 'The time on this circle ran out.',
        },
      })
      .eq('id', String(r.id));
    closed += 1;
  }

  if (closed) log('info', opts.requestId ?? '-', 'circles.swept', { closed });
  return { closed };
}

/* ------------------------------------------------------------------ */
/* Joining                                                              */
/* ------------------------------------------------------------------ */

/**
 * Join a circle.
 *
 * `join_core_room` (0018) refuses `type='setup'` by design — it is the CORE
 * room function. Circles are opened by the tick with nobody in them, so
 * routing them through that RPC left every auto-opened room read-only for
 * everyone: there was no way to become a member, and posting requires
 * membership. The membership row is therefore written here, with the service
 * role, exactly as the RPC's fallback path already does for core rooms.
 *
 * Idempotent: joining twice is a 200 that says so, never a duplicate row and
 * never an error. A CLOSED circle is refused in words — the thread stays
 * readable in History, it just does not take new members.
 */
export type JoinCircleResult = {
  room: Record<string, unknown>;
  already_member: boolean;
};

export async function joinCircle(opts: {
  roomId: string;
  userId: string;
  requestId?: string;
}): Promise<JoinCircleResult> {
  const db = serviceClient();
  const withExpiry = await hasRoomExpiry();
  const cols = withExpiry
    ? 'id,type,mode,slug,name,description,setup_id,config,pinned,expires_at'
    : 'id,type,mode,slug,name,description,setup_id,config,pinned';

  const { data } = await db.from('rooms').select(cols).eq('id', opts.roomId).maybeSingle();
  const room = (data as unknown as Record<string, unknown>) ?? null;
  if (!room) throw new ApiError('NOT_FOUND', 'I could not find that circle.');
  if (String(room.type) !== 'setup') {
    throw new ApiError('NOT_FOUND', 'That is not a circle. Core rooms are joined from the Community board.');
  }

  // Membership is settled BEFORE the clock. Somebody already in a circle that
  // has since closed is still in it — the room went read-only, it did not throw
  // its members out — so re-asking is a 200 that says so, never a 403.
  const before = await db
    .from('room_members')
    .select('role,banned')
    .eq('room_id', opts.roomId)
    .eq('user_id', opts.userId)
    .maybeSingle();
  const prior = (before.data as Record<string, unknown>) ?? null;
  if (prior?.banned) throw new ApiError('ROOM_RESTRICTED', 'You cannot join that circle.');
  if (prior) return { room, already_member: true };

  const cfg = ((room.config as Record<string, unknown>) ?? {}) as Record<string, unknown>;
  const { expired } = timeLeftPlain(expiryOf(room));
  if (expired || cfg.closed_at) {
    throw new ApiError(
      'ROOM_RESTRICTED',
      'That circle has closed. You can still read everything that was said in it, but it is not taking new members.'
    );
  }

  const { error } = await db
    .from('room_members')
    .upsert({ room_id: opts.roomId, user_id: opts.userId, role: 'member' } as never, {
      onConflict: 'room_id,user_id',
    });
  if (error) {
    log('warn', opts.requestId ?? '-', 'circles.join_failed', { room_id: opts.roomId, message: error.message });
    throw new ApiError('INTERNAL', 'We could not get you into that circle. Please try again.');
  }

  await emitUserEvent(
    opts.userId,
    'system',
    'room',
    opts.roomId,
    { event: 'circle_joined', room_name: String(room.name) },
    opts.requestId
  );

  return { room, already_member: false };
}

export const CIRCLE_TTL_OPTIONS = [
  { key: '24h', label: '24 hours', hours: CIRCLE_TTL_HOURS['24h'] },
  { key: '3d', label: '3 days', hours: CIRCLE_TTL_HOURS['3d'] },
  { key: '7d', label: '7 days', hours: CIRCLE_TTL_HOURS['7d'] },
];
