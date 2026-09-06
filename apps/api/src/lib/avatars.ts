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
 * So the avatar's address must be stable: either the `avatars` bucket is made
 * public and `getPublicUrl` is what lands here, or the column holds the asset
 * id and the API signs it on the way out. That is the media lane's call to
 * make and it has not been made yet. Until it is, this function accepts an
 * address only if it is on OUR OWN storage origin, so nothing but our storage
 * can end up on a member's screen, and the decision above stays open.
 */
import { env } from './env';
import { ApiError } from './errors';

/**
 * The origins an avatar may live on: the app's Supabase project, and (in local
 * development only) the address a phone can actually reach this machine at.
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
 * Check an avatar address and return what to store, or throw the sentence the
 * member should read.
 *
 * REFUSING AN ARBITRARY URL IS THE POINT. Without this, a signed-in member
 * could put any address on the internet into a field that every other member's
 * screen then loads: a tracking pixel that logs who opened the room, an image
 * host that sees the club's traffic, or something worse. The column is not a
 * free-text field just because it is typed as text.
 */
export function avatarForStorage(raw: string): string {
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

  const allowed = allowedOrigins();
  if (allowed.length && !allowed.includes(url.origin)) {
    throw new ApiError(
      'VALIDATION_FAILED',
      'A profile picture has to be one you uploaded here. Pick a photo and I will store it for you.'
    );
  }
  return value;
}
