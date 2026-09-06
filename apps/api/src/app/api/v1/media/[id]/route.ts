/**
 * GET /api/v1/media/:id  ->  302 to a freshly signed storage URL
 *
 * THE STABLE ADDRESS FOR A FILE THAT LIVES IN A PRIVATE BUCKET.
 *
 * This answers the question the identity lane raised in `lib/avatars.ts`, and
 * the answer is written here rather than there because media is this lane's to
 * decide.
 *
 * THE PROBLEM. `profiles.avatar_url` is read months after it is written. A
 * signed storage URL expires in an hour. Store one in that column and every
 * member's picture is a broken image by the afternoon.
 *
 * THE TWO OBVIOUS ANSWERS, AND WHY NEITHER IS TAKEN.
 *   · Make the `avatars` bucket public. Then the address never expires — and
 *     the bucket serves every avatar to the open internet with no check at all,
 *     which is the opposite of the posture migration 0033 establishes. "The
 *     path is a random UUID" is obscurity, not access control, and a URL that
 *     leaks once leaks permanently.
 *   · Put the asset id in the column. It is not a URL, the identity lane's own
 *     validation trigger rejects it, and every reader would have to know to
 *     turn it into one.
 *
 * THE ANSWER. A permanent address ON THIS API that resolves to a temporary one
 * at fetch time. `avatar_url` holds `<api>/api/v1/media/<asset id>` — a real
 * https URL, stable forever, that passes the identity lane's check unchanged.
 * The signature is minted per request, so it is never stale, and every fetch
 * goes past an authorisation check that a public bucket would not have.
 *
 * WHO MAY FETCH WHAT:
 *   · an AVATAR — any signed-in member. It is a profile picture and it is shown
 *     next to every post its owner has made; pretending otherwise would be
 *     theatre.
 *   · a MESSAGE ATTACHMENT — only a member of the room it was posted in, and
 *     only while the message is still standing. A removed post's pictures are
 *     deleted from the bucket outright, so this arm mostly matters in the
 *     seconds before the purge runs.
 *
 * A caller who is not entitled gets NOT_FOUND, not FORBIDDEN. "You may not see
 * this" confirms the file exists and that somebody has it.
 *
 * ON THE PHONE: `expo-image` takes headers on its source, so an authenticated
 * fetch is `source={{ uri, headers: { Authorization: 'Bearer …' } }}`. When the
 * server hands a message's pictures back inside the message itself it sends the
 * signed URL directly and this route is not involved — it exists for the case
 * where an address has to be WRITTEN DOWN and read back later.
 */
import type { NextRequest } from 'next/server';
import { authedParams, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { serviceClient } from '@/lib/db';
import { loadMembership } from '@/lib/rooms';
import { SIGNED_URL_TTL_S } from '@/lib/media/limits';

export const dynamic = 'force-dynamic';

const GONE = () => new ApiError('NOT_FOUND', 'That picture is no longer available.');

export const GET = authedParams<{ id: string }>(
  async (_req: NextRequest, ctx: Ctx & { params: { id: string } }) => {
    const db = serviceClient();

    const found = await db
      .from('media_assets')
      .select('id,purpose,bucket_id,object_path,message_id')
      .eq('id', ctx.params.id)
      .maybeSingle();
    const asset = (found.data as Record<string, unknown> | null) ?? null;
    if (!asset) throw GONE();

    if (asset.purpose === 'message') {
      if (!asset.message_id) throw GONE();
      const msg = await db
        .from('messages')
        .select('room_id,deleted_at')
        .eq('id', String(asset.message_id))
        .maybeSingle();
      const row = (msg.data as Record<string, unknown> | null) ?? null;
      if (!row || row.deleted_at) throw GONE();

      const membership = await loadMembership(String(row.room_id), ctx.user.id);
      if (!membership || membership.banned) throw GONE();
    }

    const signed = await db.storage
      .from(String(asset.bucket_id))
      .createSignedUrl(String(asset.object_path), SIGNED_URL_TTL_S);
    if (!signed.data?.signedUrl) throw GONE();

    // 302 and not 301: the target changes on every request, and a permanent
    // redirect is exactly the thing a browser caches forever.
    return new Response(null, {
      status: 302,
      headers: {
        location: signed.data.signedUrl,
        // Let a client reuse the redirect for a while, but expire it well
        // inside the signature's own life so it never follows a dead link.
        'cache-control': `private, max-age=${Math.floor(SIGNED_URL_TTL_S / 2)}`,
      },
    });
  }
);
