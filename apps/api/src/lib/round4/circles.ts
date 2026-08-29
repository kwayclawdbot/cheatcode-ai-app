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
 * THE CLOCK IS DERIVED, NEVER GUESSED. A circle's expiry is
 * `max(3 days, time until the setup's valid_until)` and is ALWAYS in the
 * future. `valid_until` that is null, unparseable or already past does not
 * shorten anything — it falls back to the three-day floor. A room stamped with
 * an expiry in the past is a bug, not a state: `close_expired_circles()` would
 * close it on the very next tick and the setup it is about is still live.
 *
 * WHICH IS WHY THE SWEEP REVIVES. `close_expired_circles()` only knows about
 * time, and time can be wrong (a backdated row, a clock skew, a setup that got
 * extended after its room was stamped). So every tick re-derives the clock for
 * every circle whose setup is STILL LIVE and puts it back — see
 * `reviveLiveCircles`. The RPC cannot do this: `open_setup_circle` is
 * idempotent per setup and returns the existing row UNCHANGED, so calling it
 * again never extends anything. The extension is therefore an explicit
 * service-role UPDATE of `expires_at` + `config.posting_restricted=false`,
 * which is exactly the pair `close_expired_circles()` reads.
 *
 * SCHEMA. `rooms.expires_at` belongs to SCHEMA-4. Until it lands the expiry is
 * kept in `rooms.config.expires_at`, which exists today and is read by exactly
 * the same code path (`expiryOf`). Both are written so a migration mid-flight
 * cannot lose a circle's clock.
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

/* ------------------------------------------------------------------ */
/* The clock                                                            */
/* ------------------------------------------------------------------ */

/** The floor. A circle is worth at least three days of conversation. */
export const CIRCLE_MIN_TTL_HOURS = 72;

/** Setup states that mean "there is nothing left to talk about". */
const DEAD_SETUP_STATES = ['invalidated', 'expired'];

/**
 * How long a setup's circle should stay open, in hours.
 *
 * `max(3 days, time until valid_until)` — and never less, never negative. A
 * `valid_until` in the PAST (or null, or unparseable) is not a shorter clock,
 * it is no information, so the floor applies. This is the whole fix for the
 * 1970/2020 expiries: the TTL is a duration derived here, never a timestamp
 * copied from a stale column.
 */
export function circleTtlHours(validUntil: string | null | undefined, now: number = Date.now()): number {
  const floor = CIRCLE_MIN_TTL_HOURS;
  if (typeof validUntil !== 'string' || !validUntil) return floor;
  const at = new Date(validUntil).getTime();
  if (!Number.isFinite(at)) return floor;
  const hours = (at - now) / 3_600_000;
  return hours > floor ? Math.ceil(hours) : floor;
}

/** The expiry a circle should carry right now, as an ISO string in the future. */
export function circleExpiryFor(validUntil: string | null | undefined, now: number = Date.now()): string {
  return new Date(now + circleTtlHours(validUntil, now) * 3_600_000).toISOString();
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
  /** Explicit override. Left out, the clock is derived from `validUntil`. */
  ttlHours?: number;
  /** The setup's `valid_until`. Past/null/unparseable = the three-day floor. */
  validUntil?: string | null;
  thesisPlain?: string | null;
  creatorUserId?: string | null;
}): Promise<OpenResult> {
  const db = serviceClient();
  // max(3 days, time until the setup dies) — and always a positive duration, so
  // `now() + p_ttl` inside the RPC cannot land in the past.
  const ttl = Math.max(1, Math.round(opts.ttlHours ?? circleTtlHours(opts.validUntil)));

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

export type SweepResult = { opened: number; closed: number; revived: number };

/**
 * Put the clock back on every circle whose SETUP is still live.
 *
 * `close_expired_circles()` only knows about time. A circle can carry an expiry
 * in the past for reasons that have nothing to do with the setup being over —
 * it was stamped from a stale `valid_until`, a fixture backdated it, the row
 * predates this fix — and closing it hides a room people are still using.
 *
 * The RPC cannot fix that: `open_setup_circle` is idempotent per setup and
 * returns the EXISTING row unchanged, so a second call never extends anything.
 * So this is an explicit service-role UPDATE. It writes both halves of what
 * "open" means, because `close_expired_circles()` reads both:
 *   `expires_at`                    — a fresh, future clock;
 *   `config.posting_restricted`     — back to false (the RPC's close guard);
 * and it clears `closed_at` / `closed_reason` / `posting_locked` so the room
 * does not read as history in the UI. Nothing else in the config is touched.
 *
 * Runs BEFORE the close pass, so a circle that should never have expired is
 * repaired rather than closed and re-opened — `circles_closed` stays an honest
 * count of rooms whose conversation actually ended.
 */
async function reviveLiveCircles(requestId?: string): Promise<number> {
  const db = serviceClient();
  const withExpiry = await hasRoomExpiry();
  const cols = withExpiry ? `${CIRCLE_COLUMNS},expires_at` : CIRCLE_COLUMNS;

  const rooms = await db.from('rooms').select(cols).eq('type', 'setup').limit(200);
  const rows = ((rooms.data ?? []) as unknown as Record<string, unknown>[]).filter(
    (r) => typeof r.setup_id === 'string' && r.setup_id
  );
  if (!rows.length) return 0;

  const setups = await db
    .from('setups')
    .select('id,state,valid_until')
    .in('id', rows.map((r) => String(r.setup_id)));
  const live = new Map<string, string | null>();
  for (const s of ((setups.data ?? []) as Record<string, unknown>[])) {
    if (DEAD_SETUP_STATES.includes(String(s.state))) continue;
    live.set(String(s.id), (s.valid_until as string) ?? null);
  }

  const now = Date.now();
  let revived = 0;

  for (const r of rows) {
    const setupId = String(r.setup_id);
    if (!live.has(setupId)) continue; // the setup is over: it stays closed.

    const cfg = ((r.config as Record<string, unknown>) ?? {}) as Record<string, unknown>;
    const expiresAt = expiryOf(r);
    const at = expiresAt ? new Date(expiresAt).getTime() : NaN;
    const stale = !Number.isFinite(at) || at <= now;
    const closed = Boolean(cfg.closed_at) || cfg.posting_restricted === true || cfg.posting_locked === true;
    if (!stale && !closed) continue;

    const fresh = circleExpiryFor(live.get(setupId) ?? null, now);
    const nextCfg: Record<string, unknown> = { ...cfg, expires_at: fresh, posting_restricted: false };
    delete nextCfg.closed_at;
    delete nextCfg.closed_reason;
    delete nextCfg.posting_locked;
    nextCfg.reopened_at = new Date(now).toISOString();

    const patch: Record<string, unknown> = { config: nextCfg };
    if (withExpiry) patch.expires_at = fresh;

    const { error } = await db.from('rooms').update(patch).eq('id', String(r.id));
    if (error) {
      log('warn', requestId ?? '-', 'circles.revive_failed', { room_id: String(r.id), message: error.message });
      continue;
    }
    revived += 1;
  }

  if (revived) log('info', requestId ?? '-', 'circles.revived', { revived });
  return revived;
}

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
    .select('id,symbol,state,grade_band,grade_display,score,thesis_plain,valid_until,discussion_room_id')
    .eq('state', 'ready')
    .in('grade_band', ['A', 'B'])
    .limit(20);

  for (const s of ((ready.data ?? []) as Record<string, unknown>[])) {
    if (s.discussion_room_id) continue;
    const r = await openSetupCircle({
      setupId: String(s.id),
      symbol: String(s.symbol),
      thesisPlain: (s.thesis_plain as string) ?? null,
      validUntil: (s.valid_until as string) ?? null,
    });
    if (r?.created) opened += 1;
  }

  // --- revive -----------------------------------------------------------
  // Before anything is closed: a circle whose setup is still live gets its
  // clock re-derived and put back. See reviveLiveCircles.
  const revived = await reviveLiveCircles(opts.requestId);

  // --- close ------------------------------------------------------------
  // 0021 ships `close_expired_circles()`, which flips only the rows THIS call
  // actually closed and returns their ids, so the sweep can narrate them once.
  try {
    const rpc = await db.rpc('close_expired_circles');
    if (!rpc.error && Array.isArray(rpc.data)) {
      closed += rpc.data.length;
      if (opened || closed || revived) {
        log('info', opts.requestId ?? '-', 'circles.swept', { opened, closed, revived });
      }
      await closeDeadSetupCircles();
      return { opened, closed, revived };
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
    const dead = await db.from('setups').select('id,state').in('id', setupIds).in('state', DEAD_SETUP_STATES);
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

  if (opened || closed || revived) {
    log('info', opts.requestId ?? '-', 'circles.swept', { opened, closed, revived });
  }
  return { opened, closed, revived };
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
    .in('state', DEAD_SETUP_STATES);
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
