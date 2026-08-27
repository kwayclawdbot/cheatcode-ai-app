/**
 * GET /api/v1/rooms?mode=
 *
 * The Community directory: core rooms for the mode plus any setup rooms, each
 * with real counts and the reader's unread position.
 *
 * Not in the brief's endpoint list, added because the screen needs it: counts
 * are aggregates a client cannot compute under RLS, and `rooms` RLS only shows
 * a non-member the CORE rooms, so setup rooms would be invisible without a
 * server read. Documented in the README.
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

export const GET = authed(async (req: NextRequest, ctx: Ctx) => {
  const q = parseQuery(req, RoomsQuery);
  const profile = await loadProfile(ctx.user.id);
  const mode = q.mode ?? profile.primary_mode;
  const db = serviceClient();

  const { data } = await db
    .from('rooms')
    .select(ROOM_COLUMNS)
    .or(`mode.eq.${mode},mode.is.null`)
    .order('created_at', { ascending: true });

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

  return ok(
    RoomsResponse.parse({
      mode,
      core: shaped.filter((r) => r.type === 'core'),
      setup_rooms: shaped.filter((r) => r.type === 'setup'),
      live_notice: LIVE_NOTICE,
      empty_copy: 'No rooms for this mode yet.',
    })
  );
});
