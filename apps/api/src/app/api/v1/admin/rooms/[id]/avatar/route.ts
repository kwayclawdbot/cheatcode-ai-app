/**
 * POST /api/v1/admin/rooms/[id]/avatar — put a picture on a room, or take it
 * off.
 *
 * The write half of the hand described in `AdminRoomRow`. `RoomAvatar.tsx` has
 * read `rooms.config.image_url` since it was written and nothing has ever
 * written it; this is the only thing in the product that does.
 *
 * `{ "image_url": null }` CLEARS. It is not "leave it alone" — an operator who
 * put the wrong picture on a room needs a way back, and clearing is that way.
 * There is no DELETE endpoint because a clear is the same decision as a set,
 * made by the same person on the same screen.
 *
 * THREE RULES, AND ALL THREE ARE ENFORCED HERE RATHER THAN IN THE CONTRACT:
 *
 *   1. THE URL MUST BE ONE OF OURS. A room picture is fetched by every member
 *      of the room every time they open it. An external URL would therefore be
 *      a tracking pixel pointed at our membership — whoever owns that host
 *      learns who is in which room, and when — and a dependency on a stranger's
 *      uptime for a screen we are responsible for. So only a
 *      `<this origin>/api/v1/media/<id>` address is accepted, which is exactly
 *      what `POST /api/v1/media` hands back as `stable_url`.
 *
 *   2. THE ASSET MUST EXIST, AND MUST BE AN AVATAR. A well-formed URL for a
 *      file that was never uploaded is a broken image on every member's screen,
 *      so the row is read before the write. `purpose = 'avatar'` is the second
 *      half of it and it is not pedantry: a `message` asset is served by
 *      `/api/v1/media/:id` ONLY to members of the room the post was in, so as a
 *      room picture it would be a broken image for everyone else — and the
 *      orphan sweep deletes an unattached `message` asset after an hour
 *      (`sweepOrphans`), which would make the picture work for one hour and
 *      then stop. An `avatar` asset is served to any signed-in member and is
 *      never swept. It is the only kind that can be a room's picture.
 *
 *   3. THE CONFIG BAG IS MERGED, NEVER REPLACED. That rule and the reason a
 *      clear DELETES the key rather than storing a null both live on
 *      `setRoomImageUrl` in `lib/rooms.ts`, next to the code that does it.
 *
 * ADMIN AND ABOVE. Reading which rooms have a picture is a look; changing what
 * every member of a room sees is not, so `min: 'admin'` — support's access is
 * read-and-note, and this is the door that check exists for.
 */
import type { NextRequest } from 'next/server';
import { AdminRoomAvatarResponse, AdminSetRoomAvatarRequest } from '@shared/api';
import { ok, parseBody, staffedParams, type StaffCtx } from '@/lib/http';
import { serviceClient } from '@/lib/db';
import { ApiError } from '@/lib/errors';
import { writeAudit } from '@/lib/admin/audit';
import { loadRoom, roomImageUrl, setRoomImageUrl, toAdminRoomRow } from '@/lib/rooms';

export const dynamic = 'force-dynamic';

/**
 * The shape `POST /api/v1/media` mints: `<origin>/api/v1/media/<uuid>`, and
 * nothing else. Anchored at both ends on purpose — `/api/v1/media/<id>/../..`
 * and `/api/v1/media/<id>?x=1` are not addresses this API issued, and the only
 * safe reading of a URL we did not write is "no".
 */
const MEDIA_PATH = /^\/api\/v1\/media\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** One sentence, used for every way a URL can fail to be one of ours. */
const NOT_OURS =
  'That has to be a picture uploaded to this app. Upload the image here first and use the address the upload gives you — a link to somewhere else would let that site see every member who opens the room, and would break the moment they took the file down.';

/**
 * WHICH UPLOADED FILE IS THIS, IF ANY.
 *
 * The host is compared against THIS REQUEST'S host rather than an environment
 * variable, for the same reason `POST /api/v1/media` builds `stable_url` from
 * the request: localhost, a preview deployment and production are then all
 * correct with nothing to keep in step. It is compared on `host` and not on
 * the full origin because a proxy can terminate TLS and hand this function an
 * `http://` request URL, which would make a perfectly good `https://` address
 * fail on the scheme alone.
 *
 * The zod contract deliberately types this field as a plain string, so a value
 * that is not a URL at all arrives here intact — hence the try/catch. That is
 * the intended division: zod says "a string, and not too long", this says "one
 * of ours", and only the second one protects anybody.
 */
function mediaAssetIdFrom(raw: string, req: NextRequest): string {
  const value = raw.trim();
  if (!value) throw new ApiError('VALIDATION_FAILED', NOT_OURS);

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    // Includes a bare `/api/v1/media/<id>` path, which is tempting to accept
    // and is not accepted: a relative address is not the thing the upload
    // handed back, and guessing at what host it meant is how the check gets
    // loosened later.
    throw new ApiError('VALIDATION_FAILED', NOT_OURS);
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new ApiError('VALIDATION_FAILED', NOT_OURS);
  if (url.host !== new URL(req.url).host) throw new ApiError('VALIDATION_FAILED', NOT_OURS);
  if (url.search || url.hash || url.username || url.password) {
    throw new ApiError('VALIDATION_FAILED', NOT_OURS);
  }

  const match = MEDIA_PATH.exec(url.pathname);
  if (!match?.[1]) throw new ApiError('VALIDATION_FAILED', NOT_OURS);
  return match[1].toLowerCase();
}

export const POST = staffedParams<{ id: string }>(
  async (req: NextRequest, ctx: StaffCtx & { params: { id: string } }) => {
    const body = await parseBody(req, AdminSetRoomAvatarRequest);

    const before = await loadRoom(ctx.params.id);
    if (!before) throw new ApiError('NOT_FOUND', 'We could not find that room.');
    const previous = roomImageUrl(before.config);

    // Null short-circuits every check below it: there is no URL to validate and
    // no asset to look up, because clearing is the one operation that cannot
    // put a bad address in front of a member.
    let imageUrl: string | null = null;

    if (body.image_url !== null) {
      const assetId = mediaAssetIdFrom(body.image_url, req);

      const db = serviceClient();
      const { data, error } = await db
        .from('media_assets')
        .select('id,purpose')
        .eq('id', assetId)
        .maybeSingle();
      if (error) throw error;
      const asset = (data as Record<string, unknown> | null) ?? null;

      if (!asset) {
        throw new ApiError(
          'NOT_FOUND',
          'That picture is not here any more. Upload it again and use the new address.'
        );
      }
      if (asset.purpose !== 'avatar') {
        // Named as the fix rather than as a rule: an operator who copied the
        // address of a photo out of a conversation has done something
        // reasonable, and needs to be told what to do instead.
        throw new ApiError(
          'VALIDATION_FAILED',
          'That picture was posted in a conversation, so only the people in that room can open it — as a room picture it would be blank for everyone else. Upload the image again as a room picture and use that address.'
        );
      }

      // Rebuilt from the pieces that passed, never echoed back from the body.
      // What lands in the config is then exactly the shape the phone expects,
      // with no query string and no trailing anything that came along for the
      // ride.
      imageUrl = `${new URL(req.url).origin}/api/v1/media/${assetId}`;
    }

    const after = await setRoomImageUrl({
      roomId: ctx.params.id,
      config: before.config,
      imageUrl,
    });

    await writeAudit({
      actorUserId: ctx.user.id,
      action: imageUrl === null ? 'community.room.avatar.clear' : 'community.room.avatar.set',
      targetKind: 'room',
      targetId: ctx.params.id,
      // The OLD value and the NEW one, both of them, because "who changed this
      // and what was there before" is the entire question anyone brings to
      // this log — and a picture that was replaced is unrecoverable from an
      // `after` alone.
      before: { image_url: previous },
      after: { image_url: imageUrl, room_name: String(after.name ?? before.name ?? '') },
      requestId: ctx.requestId,
      ip: ctx.ip,
    });

    return ok(
      AdminRoomAvatarResponse.parse({
        room: toAdminRoomRow(after),
        plain:
          imageUrl === null
            ? 'Taken off. That room goes back to showing a company logo, or its own initial if it is not about a company.'
            : previous
              ? 'Changed. Everyone in that room sees the new picture the next time they open it.'
              : 'Saved. Everyone in that room sees it the next time they open it.',
      })
    );
  },
  { min: 'admin' }
);
