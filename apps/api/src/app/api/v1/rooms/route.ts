/**
 * GET /api/v1/rooms?mode=
 *
 * The Community directory. Owner decision 2026-08-26: Community is THREE rooms
 * — Day Trade, Swing, Investing — and every member sees all three.
 *
 * `?mode=` is still accepted so an older client does not break, and the response
 * still echoes a `mode` (the caller's primary mode) because the schema carries
 * it. Neither one filters the list any more: a swing trader who wants to read
 * the intraday room is not doing anything that needs gating.
 *
 * Not in the brief's endpoint list, added because the screen needs it: counts
 * are aggregates a client cannot compute under RLS.
 *
 * There is no live block. Live sessions are Phase 2 and the response says so —
 * a fake "LIVE" card would be a lie about a feature that does not exist.
 */
import type { NextRequest } from 'next/server';
import { RoomsQuery, RoomsResponse } from '@shared/api';
import { authed, ok, parseQuery, type Ctx } from '@/lib/http';
import { serviceClient } from '@/lib/db';
import { loadProfile } from '@/lib/kai/context';
import { ROOM_COLUMNS, roomStats, toRoomRow, type Membership } from '@/lib/rooms';

export const dynamic = 'force-dynamic';

const LIVE_NOTICE = 'Live sessions arrive in a later release.';

/**
 * Setup rooms are not surfaced for now (owner decision 2026-08-26 — Community
 * is the three core rooms and nothing else). The shaping below still handles
 * them, and `setup_rooms` stays in the response contract, so turning this back
 * on is one boolean rather than a re-write. Kai may still open a setup room and
 * a deep link into one still works; it just is not listed in the directory.
 */
const INCLUDE_SETUP_ROOMS = false;

/** The order the directory reads in. Not alphabetical — shortest horizon first. */
const MODE_ORDER = ['day_trade', 'swing', 'invest'];
const rank = (mode: string | null) => {
  const i = MODE_ORDER.indexOf(String(mode));
  return i === -1 ? MODE_ORDER.length : i;
};

export const GET = authed(async (req: NextRequest, ctx: Ctx) => {
  const q = parseQuery(req, RoomsQuery);
  const profile = await loadProfile(ctx.user.id);
  const mode = q.mode ?? profile.primary_mode;
  const db = serviceClient();

  // Every core room, for everybody. The `mode` column still describes what a
  // room is about; it no longer decides who may see it.
  const query = db.from('rooms').select(ROOM_COLUMNS).order('created_at', { ascending: true });
  const { data } = await (INCLUDE_SETUP_ROOMS ? query : query.eq('type', 'core'));

  const rows = (data ?? []) as Record<string, unknown>[];
  const ids = rows.map((r) => String(r.id));

  const [stats, memberships] = await Promise.all([
    roomStats(ids),
    db
      .from('room_members')
      .select('room_id,role,banned,muted_until,moderation_muted_until,last_read_seq')
      .eq('user_id', ctx.user.id)
      .in('room_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']),
  ]);

  const memberBy = new Map<string, Membership>();
  for (const m of (memberships.data ?? []) as Record<string, unknown>[]) {
    memberBy.set(String(m.room_id), {
      role: String(m.role ?? 'member'),
      banned: Boolean(m.banned),
      muted_until: (m.muted_until as string) ?? null,
      moderation_muted_until: (m.moderation_muted_until as string) ?? null,
      last_read_seq: Number(m.last_read_seq ?? 0),
    });
  }

  const shaped = rows.map((r) => toRoomRow(r, stats.get(String(r.id)), memberBy.get(String(r.id)) ?? null));

  const core = shaped.filter((r) => r.type === 'core').sort((a, b) => rank(a.mode) - rank(b.mode));

  return ok(
    RoomsResponse.parse({
      mode,
      core,
      setup_rooms: INCLUDE_SETUP_ROOMS ? shaped.filter((r) => r.type === 'setup') : [],
      live_notice: LIVE_NOTICE,
      empty_copy: 'No rooms yet.',
    })
  );
});
