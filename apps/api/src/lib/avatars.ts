/**
 * Avatars — the FIELD, not the upload.
 *
 * `profiles.avatar_url` has existed since 0002 and was null on every account
 * in the database. This file is the half of the job that belongs to the
 * identity lane: accepting an address, checking it is ours, and storing it.
 *
 * =====================================================================
 * THERE IS ONE UPLOAD PATH IN THIS APP AND IT IS NOT HERE
 * =====================================================================
 * `POST /api/v1/media` with `purpose=avatar` (media lane, migration 0033) is
 * where bytes go: it is the thing that strips EXIF, enforces the size limit
 * and writes to the `avatars` bucket. Nothing in this lane uploads, resizes,
 * or writes to storage, and nothing here should ever grow that ability — two
 * upload paths means two places to get metadata stripping wrong.
 *
 * =====================================================================
 * ONE THING STILL HAS TO BE SETTLED BETWEEN THE TWO LANES
 * =====================================================================
 * `signAsset()` in `lib/media/store.ts` returns a SIGNED url with a TTL. A
 * signed url is fine for a message attachment, which is fetched with the page
 * that shows it — but it is wrong to STORE in `profiles.avatar_url`, because
 * the column is read months later and by then the signature has expired and
 * every member's picture is a broken image.
 *
 * THAT DECISION HAS SINCE BEEN MADE, AND IT IS THE THIRD ANSWER.
 * `GET /api/v1/media/:id` (media lane) is a permanent address ON THIS API that
 * 302s to a freshly signed storage URL on every fetch. So the value that ends
 * up in `profiles.avatar_url` is `<this api>/api/v1/media/<asset id>` — never a
 * Supabase URL at all.
 *
 * WHICH IS WHY THIS FILE USED TO REFUSE THE ONE URL THE UPLOAD RETURNS.
 * `allowedOrigins()` listed SUPABASE_URL and PUBLIC_STORAGE_ORIGIN and nothing
 * else, so `POST /api/v1/media` handed back an address on the API's own origin
 * and `PUT /api/v1/settings` then rejected it with "A profile picture has to be
 * one you uploaded here." — about a picture that had just been uploaded here.
 * The API's own media address is by definition one "you uploaded here", so it
 * is now accepted explicitly — and only at the `/api/v1/media/` path that mints
 * these. See `selfOrigin` below.
 *
 * THE SAME CHECK, WRITTEN THE SAME WAY, ALREADY EXISTS FOR ROOM PICTURES in
 * `app/api/v1/admin/rooms/[id]/avatar/route.ts` (`mediaAssetIdFrom`). That one
 * was written when the admin board landed and it is the reason room pictures
 * saved and profile pictures did not. This follows it deliberately, including
 * the decision to compare HOST rather than full origin, so the two do not drift.
 */
import { env } from './env';
import { ApiError } from './errors';

/** The only path on this API that hands out a storable picture address. */
const SELF_MEDIA_PREFIX = '/api/v1/media/';

/**
 * The storage origins an avatar may live on: the app's Supabase project, and
 * (in local development only) the address a phone can actually reach this
 * machine at. This API's own address is handled separately, below, because it
 * is allowed for one PATH rather than wholesale.
 */
function allowedOrigins(): string[] {
  const out: string[] = [];
  for (const key of ['SUPABASE_URL', 'PUBLIC_STORAGE_ORIGIN'] as const) {
    const raw = env(key);
    if (!raw) continue;
    try {
      out.push(new URL(raw).origin);
    } catch {
      /* a malformed env value is not an allowed origin */
    }
  }
  return out;
}

/**
 * Is this the address `POST /api/v1/media` handed back on this same request's
 * host?
 *
 * `selfOrigin` comes from the route (`new URL(req.url).origin`) rather than an
 * env var, for the reason `POST /api/v1/media` builds `stable_url` the same
 * way: localhost, a preview deployment and production are then all correct with
 * nothing to keep in step, and whatever host minted the address is the host
 * that accepts it back.
 *
 * COMPARED ON HOST, NOT ORIGIN. A proxy that terminates TLS hands this function
 * an `http://` request URL while the member is holding a perfectly good
 * `https://` address, and failing that on the scheme alone would be a refusal
 * with no cause. The web build of this app reaches the API through exactly such
 * a same-origin rewrite, so this is not hypothetical.
 *
 * THE PATH IS CHECKED BECAUSE THE HOST IS NOT ENOUGH. The host says whose
 * server serves the bytes; the path says whether the address is a picture at
 * all. `/api/v1/media/<id>` is the one address the upload mints — anything else
 * on this host is a route, and putting a route in an `<img>` every member's
 * screen loads is at best a broken image and at worst a way to make their phone
 * fire a GET at an endpoint on their behalf.
 */
function isOurMediaAddress(url: URL, selfOrigin?: string | null): boolean {
  if (!selfOrigin) return false;
  let self: URL;
  try {
    self = new URL(selfOrigin);
  } catch {
    return false;
  }
  if (url.host !== self.host) return false;
  if (!url.pathname.startsWith(SELF_MEDIA_PREFIX)) return false;
  // A query, a fragment or embedded credentials are not part of what the
  // upload route returns, so their presence means this is not that address.
  return !(url.search || url.hash || url.username || url.password);
}

/**
 * Check an avatar address and return what to store, or throw the sentence the
 * member should read.
 *
 * REFUSING AN ARBITRARY URL IS THE POINT. Without this, a signed-in member
 * could put any address on the internet into a field that every other member's
 * screen then loads: a tracking pixel that logs who opened the room, an image
 * host that sees the club's traffic, or something worse. The column is not a
 * free-text field just because it is typed as text.
 */
export function avatarForStorage(raw: string, selfOrigin?: string | null): string {
  const value = (raw ?? '').trim();
  if (!value) return '';

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ApiError('VALIDATION_FAILED', 'An avatar has to be a web address we can load.');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ApiError('VALIDATION_FAILED', 'An avatar has to be a web address we can load.');
  }
  if (value.length > 2048) {
    throw new ApiError('VALIDATION_FAILED', 'That image address is too long.');
  }

  // Our own media address is checked FIRST, because in practice it is the only
  // value this function ever sees: it is what `POST /api/v1/media` returns and
  // the Account board saves it back unchanged.
  if (isOurMediaAddress(url, selfOrigin)) return value;

  const allowed = allowedOrigins();
  if (allowed.length && !allowed.includes(url.origin)) {
    throw new ApiError(
      'VALIDATION_FAILED',
      'A profile picture has to be one you uploaded here. Pick a photo and I will store it for you.'
    );
  }
  return value;
}
