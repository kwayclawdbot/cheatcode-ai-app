/**
 * GET /api/v1/admin/rooms — every room, and whether anyone has given it a
 * picture.
 *
 * This is the list half of the missing hand described in `AdminRoomRow`.
 * `apps/mobile/src/ui/RoomAvatar.tsx` has read `rooms.config.image_url` since
 * it was written and nothing has ever written it, so the honest first question
 * an operator has is not "set this one" but "which of these are still wearing
 * an initial". `has_image=no` is that question, and it is the reason the filter
 * exists at all.
 *
 * WHAT THIS ROUTE DOES NOT DECIDE. It never says which of the three avatar
 * cases a room renders — see the note on `AdminRoomRow`. It reports `name` and
 * `image_url` and lets the phone apply the ticker rule it already owns.
 *
 * ORDERED NEWEST FIRST, LIKE EVERY OTHER ADMIN LIST. Alphabetical would read
 * better on a picker, but the keyset cursor would then be the room's NAME, and
 * a name carrying a comma or a bracket cannot be put in a PostgREST `or=`
 * filter without escaping it — a paging bug that shows up only for the one
 * room somebody named "Ideas, Trades". `created_at` is a timestamp, it is
 * always safe in a filter, and it is the same key `/admin/invites` pages on.
 * Finding a specific room is what `q` is for.
 *
 * A READ WRITES AN AUDIT ROW. Brief §3 — the damage an admin surface does is
 * usually a read, and a log of writes shows that as nothing at all.
 */
import { AdminRoomsQuery, AdminRoomsResponse } from '@shared/api';
import { ok, parseQuery, staffed, type StaffCtx } from '@/lib/http';
import { serviceClient } from '@/lib/db';
import { writeAudit } from '@/lib/admin/audit';
import { decodeCursor, encodeCursor } from '@/lib/admin/cursor';
import { ROOM_COLUMNS, toAdminRoomRow } from '@/lib/rooms';

export const dynamic = 'force-dynamic';

/**
 * `created_at` is not in `ROOM_COLUMNS` — no member-facing read needs it — but
 * the cursor is built from it, so this list asks for it on top rather than
 * widening the shared literal for everyone else.
 */
const LIST_COLUMNS = `${ROOM_COLUMNS},created_at`;

/**
 * THE SEARCH TERM, MADE SAFE TO PUT IN AN `or=` FILTER.
 *
 * PostgREST's `or=(a.ilike.*x*,b.ilike.*x*)` is a comma-and-bracket grammar,
 * so a search for "Ideas, Trades" or "AAPL (long)" would not be a search — it
 * would be a second filter clause the caller got to write. The punctuation
 * that carries meaning in that grammar is stripped rather than escaped,
 * because a room name containing a bracket is not a thing anyone searches for
 * and a half-right escaping scheme is worse than none.
 *
 * `*` and `%` go too: both are ilike wildcards here, and a `q` of `%` would
 * quietly mean "everything" while looking like a typo.
 */
function searchFilter(raw: string | undefined): string | null {
  const term = (raw ?? '')
    .replace(/[,()*%\\.'"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!term) return null;
  return `name.ilike.*${term}*,slug.ilike.*${term}*`;
}

/**
 * HOW "HAS A PICTURE" IS ASKED OF POSTGRES.
 *
 * `config->>'image_url' is null` is true both for a room whose config has no
 * such key and for one holding a json null, which is exactly right: `->>`
 * yields SQL NULL for a json null, and both of those rooms show a logo or an
 * initial. The filter therefore agrees with `roomImageUrl` rather than merely
 * looking like it does.
 *
 * The one gap it does not close is an `image_url` holding an empty string.
 * Nothing can write one through this API, and a room with one renders exactly
 * as a room with none, so it would be counted as "has a picture" while showing
 * an initial. Left alone deliberately: fixing it means a `<> ''` clause on
 * every count and page query to catch a row that cannot exist.
 */
type ImageFilter = 'yes' | 'no' | undefined;

async function countRooms(search: string | null, hasImage: ImageFilter): Promise<number> {
  const db = serviceClient();
  // `head: true` — the count comes back in a header and not one row of the
  // 2,000 is transferred. A `select('*')` here would fetch the table to count it.
  let sel = db.from('rooms').select('id', { count: 'exact', head: true });
  if (search) sel = sel.or(search);
  if (hasImage === 'yes') sel = sel.not('config->>image_url', 'is', null);
  if (hasImage === 'no') sel = sel.is('config->>image_url', null);
  const { count, error } = await sel;
  if (error) throw error;
  return Number(count ?? 0);
}

export const GET = staffed(async (req, ctx: StaffCtx) => {
  const q = parseQuery(req, AdminRoomsQuery);
  const db = serviceClient();
  const cursor = decodeCursor(q.cursor);
  const search = searchFilter(q.q);

  let sel = db
    .from('rooms')
    .select(LIST_COLUMNS)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    // One more than asked for, which is how the page knows there IS a next one
    // without a second count. The extra row is sliced off below.
    .limit(q.limit + 1);
  if (search) sel = sel.or(search);
  if (q.has_image === 'yes') sel = sel.not('config->>image_url', 'is', null);
  if (q.has_image === 'no') sel = sel.is('config->>image_url', null);
  if (cursor) {
    // Strictly after the last row under `created_at desc, id desc`: an older
    // timestamp, or the same timestamp with a smaller id. Rooms always have a
    // `created_at`, so unlike the CRM's cursor there is no null arm to carry.
    sel = sel.or(`created_at.lt.${cursor.at},and(created_at.eq.${cursor.at},id.lt.${cursor.id})`);
  }

  // The two counts run beside the page rather than after it — three round
  // trips in the time of one, and none of them depends on the others.
  const [{ data, error }, all, withImage] = await Promise.all([
    sel,
    countRooms(search, undefined),
    countRooms(search, 'yes'),
  ]);
  if (error) throw error;

  const rows = (data ?? []) as Record<string, unknown>[];
  const hasMore = rows.length > q.limit;
  const page = hasMore ? rows.slice(0, q.limit) : rows;
  const last = page[page.length - 1];
  const shaped = page.map(toAdminRoomRow);

  await writeAudit({
    actorUserId: ctx.user.id,
    action: 'community.room.list',
    targetKind: 'room',
    targetId: null,
    after: { returned: shaped.length, q: q.q ?? null, has_image: q.has_image ?? null },
    requestId: ctx.requestId,
    ip: ctx.ip,
  });

  return ok(
    AdminRoomsResponse.parse({
      rooms: shaped,
      next_cursor:
        hasMore && last ? encodeCursor({ at: String(last.created_at), id: String(last.id) }) : null,
      /**
       * THE TOTALS FOLLOW THE SEARCH BUT NOT THE `has_image` FILTER, and that
       * asymmetry is the point of them. They are the two numbers an operator
       * is choosing between when they press the filter — "18 rooms, 4 have a
       * picture" — so recomputing them under the filter would answer the
       * question with itself and always show one of them as zero.
       *
       * `without_image` is subtracted rather than counted so the three numbers
       * cannot disagree: a third query runs a moment later than the other two,
       * and a room created in that moment makes the parts stop summing to the
       * whole on a screen where that looks like a bug.
       */
      totals: { all, with_image: withImage, without_image: Math.max(0, all - withImage) },
      plain: totalsPlain(shaped.length, all, withImage, q),
    })
  );
});

/**
 * The sentence at the top of the screen. It leads with the number of rooms
 * still wearing an initial, because that is the only reason anyone opens this
 * list — and it says "none yet" rather than "0" when nobody has ever set one,
 * which is the true state of this feature on the day it ships.
 */
function totalsPlain(
  shown: number,
  all: number,
  withImage: number,
  q: { q?: string; has_image?: 'yes' | 'no' }
): string {
  if (!shown) {
    if (q.q) return `No rooms match "${q.q}".`;
    if (q.has_image === 'yes') return 'No room has a picture yet.';
    if (q.has_image === 'no') return 'Every room has a picture.';
    return 'There are no rooms yet.';
  }
  const without = Math.max(0, all - withImage);
  if (!withImage) return `${shown} of ${all} rooms. None of them has a picture yet.`;
  if (!without) return `${shown} of ${all} rooms. Every one of them has a picture.`;
  return `${shown} of ${all} rooms. ${withImage} have a picture, ${without} are still showing a logo or an initial.`;
}
