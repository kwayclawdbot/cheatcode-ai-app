/**
 * Circles — time-boxed setup rooms.
 *
 * A circle is a `rooms` row with `type='setup'` and an expiry. It exists while
 * the setup it belongs to is worth talking about and then it closes, which is
 * the whole point: a room about a META breakout that is still open in November
 * is not a community, it is litter.
 *
 * THREE WAYS ONE OPENS
 *   1. automatically, in the tick, for a setup that reaches `ready` at grade
 *      A or B — the conversation the room exists for is the one the app just
 *      told everybody about;
 *   2. by a premium member, for a symbol they choose (entitlement flag
 *      `circles_create`);
 *   3. by Kai, from a room action, which already existed.
 *
 * ONE WAY ONE CLOSES: the expiry passes, or the setup dies. Closing means
 * READ-ONLY plus a move into history — messages are never deleted, because a
 * room where the conversation vanishes teaches nobody anything.
 *
 * SCHEMA. `rooms.expires_at` belongs to SCHEMA-4. Until it lands the expiry is
 * kept in `rooms.config.expires_at`, which exists today and is read by exactly
 * the same code path (`expiryOf`). Both are written so a migration mid-flight
 * cannot lose a circle's clock.
 */
import { CIRCLE_TTL_HOURS, type CircleRow, type GradeMedallion } from '@shared/api';
import { serviceClient } from '../db';
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

/** "<SYM> <pattern>" — the room's name comes from the setup, not from a user. */
export function circleName(symbol: string, setup: { thesis_plain?: string | null } | null): string {
  const thesis = setup?.thesis_plain ?? '';
  const pattern = /breakout/i.test(thesis)
    ? 'Breakout'
    : /reclaim/i.test(thesis)
      ? 'Reclaim'
      : /pullback/i.test(thesis)
        ? 'Pullback'
        : /range/i.test(thesis)
          ? 'Range'
          : 'Setup';
  return `${symbol.toUpperCase()} ${pattern}`;
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

/* ------------------------------------------------------------------ */
/* Opening                                                              */
/* ------------------------------------------------------------------ */

export type OpenResult = { id: string; created: boolean } | null;

/**
 * Idempotent per setup. Prefers SCHEMA-4's `open_setup_circle` RPC (which does
 * the insert and the moderator row in one transaction); falls back to a direct
 * insert when the function is not there yet, keeping the same idempotency.
 */
export async function openSetupCircle(opts: {
  setupId: string;
  symbol: string;
  ttlHours?: number;
  thesisPlain?: string | null;
  creatorUserId?: string | null;
}): Promise<OpenResult> {
  const db = serviceClient();
  const ttl = opts.ttlHours ?? 72;

  // Ask first, so "created" is honest. 0021's `open_setup_circle` is idempotent
  // per setup (a unique partial index makes that a database guarantee) and
  // returns the EXISTING row unchanged on a second call — which is right, but
  // means the RPC alone cannot tell us whether this call opened anything.
  const existing = await db.from('rooms').select('id').eq('type', 'setup').eq('setup_id', opts.setupId).maybeSingle();
  if (existing.data) {
    return { id: String((existing.data as Record<string, unknown>).id), created: false };
  }

  try {
    const rpc = await db.rpc('open_setup_circle', {
      p_setup_id: opts.setupId,
      p_ttl: `${ttl} hours`,
    });
    if (!rpc.error && rpc.data) {
      const row = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
      const id = typeof row === 'string' ? row : String((row as Record<string, unknown>)?.id ?? '');
      if (id) return { id, created: true };
    }
  } catch {
    /* fall through to the direct path */
  }

  const expiresAt = new Date(Date.now() + ttl * 3_600_000).toISOString();
  const withExpiry = await hasRoomExpiry();
  const insert: Record<string, unknown> = {
    type: 'setup',
    setup_id: opts.setupId,
    name: circleName(opts.symbol, { thesis_plain: opts.thesisPlain ?? null }),
    description: `A room for this ${opts.symbol.toUpperCase()} setup. It closes when the setup does.`,
    config: { intel_eligible: false, expires_at: expiresAt, circle: true },
  };
  if (withExpiry) insert.expires_at = expiresAt;

  const { data, error } = await db.from('rooms').insert(insert).select('id').single();
  if (error || !data) {
    log('warn', '-', 'circles.open_failed', { setup_id: opts.setupId, message: error?.message });
    return null;
  }
  const id = String((data as Record<string, unknown>).id);

  // The setup points at its room, so the workspace and the alert card can find it.
  await db.from('setups').update({ discussion_room_id: id }).eq('id', opts.setupId);

  if (opts.creatorUserId) {
    await db
      .from('room_members')
      .upsert({ room_id: id, user_id: opts.creatorUserId, role: 'moderator' } as never, { onConflict: 'room_id,user_id' });
  }
  return { id, created: true };
}

/** A member-created circle: named for the symbol, no setup behind it. */
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
  };
  if (await hasRoomExpiry()) insert.expires_at = expiresAt;

  const { data, error } = await db.from('rooms').insert(insert).select('id').single();
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

export type SweepResult = { opened: number; closed: number };

/**
 * One pass: open a circle for every ready A/B setup that has none, and close
 * every circle whose clock has run out or whose setup has died.
 *
 * Closing is `config.closed_at` + `config.posting_locked`, which the posting
 * pipeline already respects through the room's config — the room stays readable
 * and stops accepting posts. Nothing is deleted.
 */
export async function sweepCircles(opts: { requestId?: string } = {}): Promise<SweepResult> {
  const db = serviceClient();
  let opened = 0;
  let closed = 0;

  // --- open -------------------------------------------------------------
  const ready = await db
    .from('setups')
    .select('id,symbol,state,grade_band,grade_display,score,thesis_plain,discussion_room_id')
    .eq('state', 'ready')
    .in('grade_band', ['A', 'B'])
    .limit(20);

  for (const s of ((ready.data ?? []) as Record<string, unknown>[])) {
    if (s.discussion_room_id) continue;
    const r = await openSetupCircle({
      setupId: String(s.id),
      symbol: String(s.symbol),
      thesisPlain: (s.thesis_plain as string) ?? null,
      ttlHours: 72,
    });
    if (r?.created) opened += 1;
  }

  // --- close ------------------------------------------------------------
  // 0021 ships `close_expired_circles()`, which flips only the rows THIS call
  // actually closed and returns their ids, so the sweep can narrate them once.
  try {
    const rpc = await db.rpc('close_expired_circles');
    if (!rpc.error && Array.isArray(rpc.data)) {
      closed += rpc.data.length;
      if (opened || closed) log('info', opts.requestId ?? '-', 'circles.swept', { opened, closed });
      await closeDeadSetupCircles();
      return { opened, closed };
    }
  } catch {
    /* fall through to the in-TypeScript sweep below */
  }

  const withExpiry = await hasRoomExpiry();
  const cols = withExpiry ? `${CIRCLE_COLUMNS},expires_at` : CIRCLE_COLUMNS;
  const rooms = await db.from('rooms').select(cols).eq('type', 'setup').limit(200);

  const deadSetupIds = new Set<string>();
  const setupIds = ((rooms.data ?? []) as unknown as Record<string, unknown>[])
    .map((r) => r.setup_id)
    .filter((s): s is string => typeof s === 'string');
  if (setupIds.length) {
    const dead = await db.from('setups').select('id,state').in('id', setupIds).in('state', ['invalidated', 'expired']);
    for (const d of ((dead.data ?? []) as Record<string, unknown>[])) deadSetupIds.add(String(d.id));
  }

  for (const r of ((rooms.data ?? []) as unknown as Record<string, unknown>[])) {
    const cfg = (r.config as Record<string, unknown>) ?? {};
    if (cfg.closed_at) continue;
    const expiresAt = expiryOf(r);
    const past = expiresAt ? new Date(expiresAt).getTime() <= Date.now() : false;
    const setupDead = typeof r.setup_id === 'string' && deadSetupIds.has(r.setup_id);
    if (!past && !setupDead) continue;

    await db
      .from('rooms')
      .update({
        config: {
          ...cfg,
          closed_at: new Date().toISOString(),
          posting_locked: true,
          closed_reason: setupDead
            ? 'The setup this room was about is no longer live.'
            : 'The time on this circle ran out.',
        },
      })
      .eq('id', String(r.id));
    closed += 1;
  }

  if (opened || closed) {
    log('info', opts.requestId ?? '-', 'circles.swept', { opened, closed });
  }
  return { opened, closed };
}

/**
 * A circle whose SETUP died closes too, even if its clock has not run out. The
 * database function only knows about time; "the idea this room is about is no
 * longer live" is a product rule and it lives here.
 */
async function closeDeadSetupCircles(): Promise<void> {
  const db = serviceClient();
  const rooms = await db.from('rooms').select('id,setup_id,config').eq('type', 'setup').limit(200);
  const rows = ((rooms.data ?? []) as Record<string, unknown>[]).filter(
    (r) => typeof r.setup_id === 'string' && !((r.config as Record<string, unknown>) ?? {}).closed_at
  );
  if (!rows.length) return;
  const dead = await db
    .from('setups')
    .select('id')
    .in('id', rows.map((r) => String(r.setup_id)))
    .in('state', ['invalidated', 'expired']);
  const deadIds = new Set(((dead.data ?? []) as Record<string, unknown>[]).map((d) => String(d.id)));
  for (const r of rows) {
    if (!deadIds.has(String(r.setup_id))) continue;
    const cfg = ((r.config as Record<string, unknown>) ?? {}) as Record<string, unknown>;
    await db
      .from('rooms')
      .update({
        config: {
          ...cfg,
          posting_restricted: true,
          closed_at: new Date().toISOString(),
          closed_reason: 'The setup this room was about is no longer live.',
        },
      })
      .eq('id', String(r.id));
  }
}

export const CIRCLE_TTL_OPTIONS = [
  { key: '24h', label: '24 hours', hours: CIRCLE_TTL_HOURS['24h'] },
  { key: '3d', label: '3 days', hours: CIRCLE_TTL_HOURS['3d'] },
  { key: '7d', label: '7 days', hours: CIRCLE_TTL_HOURS['7d'] },
];
