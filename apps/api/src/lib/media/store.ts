/**
 * MEDIA — accepting a file, handing one back, and making one genuinely go away.
 *
 * ONE UPLOAD PATH FOR THE WHOLE APP. A post's photo and a profile's avatar are
 * the same problem wearing two names: bytes from a phone that must be checked,
 * stripped of location data, stored somewhere a stranger cannot browse, served
 * only to people entitled to see them, and destroyed on request. Building that
 * twice means two strippers, two size rules and two places to forget the
 * deletion. `purpose` is the only thing that differs, and it selects a bucket
 * and a size ceiling from lib/media/limits.ts.
 *
 * SECURITY BOUNDARY, same as lib/db.ts. Everything here runs with the service
 * role, which bypasses RLS. The buckets have NO storage policy at all
 * (migration 0033 §3), so this module is the only code in the world that can
 * read or write them. Every exported function that returns bytes or a URL is
 * therefore responsible for asking who is calling FIRST — and none of them ask;
 * the ROUTES do, before they call in here. If you add a caller, the membership
 * or ownership check is yours to write.
 */
import { randomUUID } from 'node:crypto';
import { serviceClient } from '../db';
import { ApiError } from '../errors';
import { log } from '../log';
import {
  LIMITS,
  MAX_DIMENSION,
  SIGNED_URL_TTL_S,
  bytesPlain,
  plainSizeLimit,
  type MediaPurpose,
} from './limits';
import { stripImageMetadata } from './strip';

export type MediaAsset = {
  id: string;
  owner_id: string;
  purpose: MediaPurpose;
  kind: 'image' | 'video';
  message_id: string | null;
  bucket_id: string;
  object_path: string;
  mime_type: string;
  bytes: number;
  width: number | null;
  height: number | null;
  position: number;
  created_at: string;
};

const ASSET_COLUMNS =
  'id,owner_id,purpose,kind,message_id,bucket_id,object_path,mime_type,bytes,width,height,position,created_at';

/* ------------------------------------------------------------------ */
/* Accepting a file                                                     */
/* ------------------------------------------------------------------ */

/**
 * Take raw bytes from a member, and either store a clean copy or refuse in a
 * sentence they can act on.
 *
 * THE ORDER IS THE DESIGN, and it is cheapest-check-first on purpose so a
 * hostile upload is dropped before anything expensive happens to it:
 *
 *   1. SIZE, measured on what actually arrived. Not the `Content-Length`, not
 *      a field in the form — `bytes.length`.
 *   2. FORMAT, sniffed from the file's own first bytes. The `Content-Type` the
 *      client sent is never consulted for anything except the error message,
 *      because it is a string the client chose.
 *   3. STRIP. Rebuild the file from its image data with a metadata keep-list.
 *      This is also the second half of (2): a file that cannot be walked as a
 *      real JPEG or PNG never gets past here.
 *   4. DIMENSIONS, from the rebuilt header, against the bomb ceiling.
 *   5. STORE, then write the row. In that order, so a failed upload cannot
 *      leave a row pointing at nothing. The reverse — row first — produces a
 *      message that renders a broken image forever.
 */
export async function acceptUpload(opts: {
  ownerId: string;
  purpose: MediaPurpose;
  bytes: Uint8Array;
  declaredMime: string | null;
  requestId: string;
}): Promise<{ asset: MediaAsset; removed: string[] }> {
  const rules = LIMITS[opts.purpose];

  if (opts.bytes.length === 0) {
    throw new ApiError('VALIDATION_FAILED', 'That file came through empty. Try picking it again.');
  }
  if (opts.bytes.length > rules.maxBytes) {
    throw new ApiError(
      'VALIDATION_FAILED',
      `That picture is ${bytesPlain(opts.bytes.length)}. The limit is ${plainSizeLimit(opts.purpose)}.`
    );
  }

  const cleaned = stripImageMetadata(opts.bytes);
  if (!cleaned.ok) throw new ApiError('VALIDATION_FAILED', cleaned.reason);

  if (cleaned.width > MAX_DIMENSION || cleaned.height > MAX_DIMENSION) {
    throw new ApiError(
      'VALIDATION_FAILED',
      `That picture is ${cleaned.width} by ${cleaned.height} pixels, which is larger than this app will store.`
    );
  }

  // The path carries no member id, no filename and no room. A path is the one
  // part of a private object that leaks into logs, error messages and CDN
  // traces, so it is deliberately meaningless: purpose, date, random name.
  // The filename the phone sent is discarded entirely — it is user-controlled
  // text that has no business in a storage key.
  const ext = cleaned.mime === 'image/png' ? 'png' : 'jpg';
  const day = new Date().toISOString().slice(0, 10);
  const objectPath = `${opts.purpose}/${day}/${randomUUID()}.${ext}`;

  const db = serviceClient();
  const up = await db.storage.from(rules.bucket).upload(objectPath, cleaned.bytes, {
    contentType: cleaned.mime,
    upsert: false,
    /**
     * ONE HOUR, AND NOT A YEAR — THIS IS A MODERATION DECISION, NOT A COST ONE.
     *
     * The object is immutable (a random path, never overwritten), so a year
     * would be correct on the merits and would save egress. It is one hour
     * because of what MEASURED on the hosted project on 2026-09-06: after the
     * object was deleted at the origin, an authenticated download still
     * returned it from the edge cache for roughly the next half a minute, and
     * cleared on its own after that.
     *
     * Supabase purges its cache when an object is deleted, so that window is
     * short by design and the measurement agrees. But a purge that fails
     * silently leaves the picture reachable for as long as the header says, and
     * for a file somebody has reported that is not a trade worth making. An
     * hour bounds the worst case; the ordinary case is still a cache hit.
     *
     * STATED PLAINLY BECAUSE A REVIEWER MAY ASK: removal deletes the object
     * immediately and the link stops resolving within about a minute. It is not
     * instantaneous at the edge, and nothing in this design can make it so.
     */
    cacheControl: '3600',
  });
  if (up.error) {
    log('error', opts.requestId, 'media.upload_failed', {
      bucket: rules.bucket,
      message: up.error.message,
    });
    throw new ApiError('INTERNAL', 'We could not store that picture. Please try again.', {
      detail: up.error.message,
    });
  }

  const row = await db
    .from('media_assets')
    .insert({
      owner_id: opts.ownerId,
      purpose: opts.purpose,
      kind: 'image',
      bucket_id: rules.bucket,
      object_path: objectPath,
      mime_type: cleaned.mime,
      bytes: cleaned.bytes.length,
      width: cleaned.width,
      height: cleaned.height,
    })
    .select(ASSET_COLUMNS)
    .single();

  if (row.error || !row.data) {
    // The object is already in the bucket and now has no row, which makes it
    // invisible to every purge path there is. Remove it here rather than leave
    // a file nothing can ever find again.
    await db.storage.from(rules.bucket).remove([objectPath]).catch(() => undefined);
    throw new ApiError('INTERNAL', 'We could not store that picture. Please try again.', {
      detail: row.error?.message,
    });
  }

  log('info', opts.requestId, 'media.stored', {
    purpose: opts.purpose,
    bytes_in: opts.bytes.length,
    bytes_out: cleaned.bytes.length,
    removed: cleaned.removed,
  });

  return { asset: row.data as unknown as MediaAsset, removed: cleaned.removed };
}

/* ------------------------------------------------------------------ */
/* Attaching to a post                                                  */
/* ------------------------------------------------------------------ */

/**
 * Claim uploads for a message that has just been posted.
 *
 * The `where` clause is the whole security model and every arm of it earns its
 * place: the asset must belong to the CALLER, must be a message attachment and
 * not somebody's avatar, and must not already be attached to something. Without
 * the last one a member could re-attach a photo from another member's post by
 * guessing an id; with it, an id that is not theirs and free matches nothing
 * and the count comes back short.
 */
export async function attachToMessage(opts: {
  assetIds: string[];
  ownerId: string;
  messageId: string;
  requestId: string;
}): Promise<MediaAsset[]> {
  if (!opts.assetIds.length) return [];

  const db = serviceClient();
  const out: MediaAsset[] = [];

  // Position is the order the member picked them in, so it is set one at a
  // time rather than in one statement. Four is the ceiling; this is not a loop
  // that can get long.
  for (let i = 0; i < opts.assetIds.length; i++) {
    const res = await db
      .from('media_assets')
      .update({ message_id: opts.messageId, position: i })
      .eq('id', opts.assetIds[i])
      .eq('owner_id', opts.ownerId)
      .eq('purpose', 'message')
      .is('message_id', null)
      .select(ASSET_COLUMNS)
      .maybeSingle();
    if (res.data) out.push(res.data as unknown as MediaAsset);
  }

  if (out.length !== opts.assetIds.length) {
    log('warn', opts.requestId, 'media.attach_partial', {
      asked: opts.assetIds.length,
      attached: out.length,
      message_id: opts.messageId,
    });
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Handing one back                                                     */
/* ------------------------------------------------------------------ */

export type MediaView = {
  id: string;
  url: string | null;
  mime_type: string;
  width: number | null;
  height: number | null;
  bytes: number;
  /** Height ÷ width, so a phone can reserve the space before the image lands. */
  aspect: number | null;
  position: number;
};

/**
 * Signed URLs for a page of messages, in ONE round trip per bucket rather than
 * one per picture.
 *
 * The signature is what enforces access, and it is minted only after the
 * caller's membership of the room has already been checked by the route. It
 * expires (limits.ts), and — the part that matters for a removal — a signature
 * over an object that has been deleted resolves to nothing. Taking a photo
 * down therefore breaks every link to it that was ever handed out, including
 * one somebody pasted elsewhere.
 */
export async function attachmentsForMessages(messageIds: string[]): Promise<Map<string, MediaView[]>> {
  const out = new Map<string, MediaView[]>();
  const ids = [...new Set(messageIds.filter(Boolean))];
  if (!ids.length) return out;

  const db = serviceClient();
  const { data, error } = await db
    .from('media_assets')
    .select(ASSET_COLUMNS)
    .in('message_id', ids)
    .order('position', { ascending: true });
  if (error || !data?.length) return out;

  const rows = data as unknown as MediaAsset[];
  const byBucket = new Map<string, MediaAsset[]>();
  for (const r of rows) {
    const list = byBucket.get(r.bucket_id) ?? [];
    list.push(r);
    byBucket.set(r.bucket_id, list);
  }

  const signed = new Map<string, string>();
  for (const [bucket, list] of byBucket) {
    const res = await db.storage
      .from(bucket)
      .createSignedUrls(list.map((r) => r.object_path), SIGNED_URL_TTL_S);
    for (const s of res.data ?? []) {
      if (s.signedUrl && s.path) signed.set(`${bucket}:${s.path}`, s.signedUrl);
    }
  }

  for (const r of rows) {
    const list = out.get(String(r.message_id)) ?? [];
    list.push(toView(r, signed.get(`${r.bucket_id}:${r.object_path}`) ?? null));
    out.set(String(r.message_id), list);
  }
  return out;
}

/** One asset, signed. Used by the upload response and by the avatar lane. */
export async function signAsset(asset: MediaAsset): Promise<MediaView> {
  const db = serviceClient();
  const res = await db.storage.from(asset.bucket_id).createSignedUrl(asset.object_path, SIGNED_URL_TTL_S);
  return toView(asset, res.data?.signedUrl ?? null);
}

function toView(a: MediaAsset, url: string | null): MediaView {
  return {
    id: a.id,
    url,
    mime_type: a.mime_type,
    width: a.width,
    height: a.height,
    bytes: a.bytes,
    aspect: a.width && a.height ? Number((a.height / a.width).toFixed(4)) : null,
    position: a.position,
  };
}

/* ------------------------------------------------------------------ */
/* Making one go away                                                   */
/* ------------------------------------------------------------------ */

/**
 * Drain the purge queue: delete the actual objects for rows the database has
 * already marked as gone.
 *
 * THE REASON THIS EXISTS AT ALL is written out in migration 0033 §5 and is
 * worth repeating in one line here, because it is the single easiest thing to
 * get wrong: deleting a row from `storage.objects` does not delete the file.
 * Removing a file is an HTTP call, and a database trigger cannot make one. So
 * the trigger records the intent and this function carries it out.
 *
 * Called from two places, deliberately:
 *   · the moderation removal route, inline, so a reported picture is gone in
 *     the same second a moderator taps the button;
 *   · a cron, so an intent that failed the first time is retried and nothing
 *     is lost to one bad minute.
 *
 * It never throws. The queue rows carry the failure and stay pending.
 */
export async function purgePending(opts: { limit?: number; requestId: string }): Promise<{
  attempted: number;
  purged: number;
  failed: number;
}> {
  const db = serviceClient();
  const limit = opts.limit ?? 200;

  const { data, error } = await db
    .from('media_deletions')
    .select('id,bucket_id,object_path,attempts')
    .is('purged_at', null)
    .order('requested_at', { ascending: true })
    .limit(limit);
  if (error || !data?.length) return { attempted: 0, purged: 0, failed: 0 };

  const rows = data as Record<string, unknown>[];
  const byBucket = new Map<string, { id: number; path: string }[]>();
  for (const r of rows) {
    const b = String(r.bucket_id);
    const list = byBucket.get(b) ?? [];
    list.push({ id: Number(r.id), path: String(r.object_path) });
    byBucket.set(b, list);
  }

  let purged = 0;
  let failed = 0;

  for (const [bucket, list] of byBucket) {
    const paths = list.map((x) => x.path);
    const res = await db.storage.from(bucket).remove(paths);

    if (res.error) {
      failed += list.length;
      await db
        .from('media_deletions')
        .update({ attempts: 1, last_error: res.error.message.slice(0, 500) })
        .in('id', list.map((x) => x.id));
      log('error', opts.requestId, 'media.purge_failed', { bucket, count: list.length, message: res.error.message });
      continue;
    }

    // Storage answers with the objects it actually removed. An object that was
    // already gone is not in that list and is NOT a failure — it is the desired
    // state, reached earlier. Both are stamped, because a queue that keeps
    // retrying a file nobody can find never empties.
    const now = new Date().toISOString();
    await db.from('media_deletions').update({ purged_at: now }).in('id', list.map((x) => x.id));
    purged += list.length;
  }

  if (purged || failed) {
    log('info', opts.requestId, 'media.purged', { purged, failed });
  }
  return { attempted: rows.length, purged, failed };
}

/**
 * Uploads nobody ever attached to a post. Deleting the ROW is enough — the
 * trigger from 0033 §5 turns it into a queued object deletion, which the drain
 * above then carries out.
 */
export async function sweepOrphans(opts: { olderThanMs: number; requestId: string }): Promise<number> {
  const db = serviceClient();
  const cutoff = new Date(Date.now() - opts.olderThanMs).toISOString();
  const { data, error } = await db
    .from('media_assets')
    .delete()
    .is('message_id', null)
    .eq('purpose', 'message')
    .lt('created_at', cutoff)
    .select('id');
  if (error) {
    log('error', opts.requestId, 'media.sweep_failed', { message: error.message });
    return 0;
  }
  const n = (data ?? []).length;
  if (n) log('info', opts.requestId, 'media.orphans_swept', { count: n });
  return n;
}
