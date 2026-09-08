/**
 * GET /api/v1/rooms?mode=
 *
 * The Community directory. Owner decision 2026-09-08, in their words: "Just
 * make it traders chat, investors chat and beginners chat." Three rooms, and
 * every member sees all three.
 *
 * (It was four — Beginners plus one room per desk — and before that three, one
 * per desk. 0045 is the migration that merged Day Trade and Swing into Traders
 * and took `mode` off all three rows.)
 *
 * `?mode=` is still accepted so an older client does not break, and the response
 * still echoes a `mode` (the caller's primary mode) because the schema carries
 * it. Neither one filters the list any more, and since 0045 neither one could:
 * a room is no longer keyed by a mode. Reading a room is not something that
 * needs gating by what somebody trades.
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

/**
 * The order the directory reads in, BY SLUG.
 *
 * This was `MODE_ORDER = ['day_trade','swing','invest']` — shortest horizon
 * first — which stopped meaning anything at 0045: two of those modes are now
 * the same room and no core room carries a mode, so every row would have ranked
 * equal-last. The three chats are not a horizon scale, so the order is simply
 * the order the owner said them in, which is also the order they are drawn in
 * the switcher: Traders, Investors, Beginners.
 *
 * Anything not in the list sorts last rather than being hidden — a room this
 * file has not heard of is still a room somebody can open.
 */
const ROOM_ORDER = ['traders', 'investors', 'beginners'];
const rank = (slug: string | null) => {
  const i = ROOM_ORDER.indexOf(String(slug));
  return i === -1 ? ROOM_ORDER.length : i;
};

export const GET = authed(async (req: NextRequest, ctx: Ctx) => {
  const q = parseQuery(req, RoomsQuery);
  const profile = await loadProfile(ctx.user.id);
  const mode = q.mode ?? profile.primary_mode;
  const db = serviceClient();

  // Every core room, for everybody. `rooms.mode` is null on all three since
  // 0045 and describes nothing any more; which desk posts where is the named
  // map in lib/social/rooms-bridge.ts, and it has never decided who may READ a
  // room.
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

  const core = shaped.filter((r) => r.type === 'core').sort((a, b) => rank(a.slug) - rank(b.slug));

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
