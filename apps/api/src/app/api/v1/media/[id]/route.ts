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
 *   · an AVATAR — ANYBODY HOLDING THE ADDRESS. No bearer token. Read the next
 *     block, because this is a deliberate loosening and it is not free.
 *   · a MESSAGE ATTACHMENT — only a member of the room it was posted in, and
 *     only while the message is still standing. A removed post's pictures are
 *     deleted from the bucket outright, so this arm mostly matters in the
 *     seconds before the purge runs.
 *
 * A caller who is not entitled gets NOT_FOUND, not FORBIDDEN. "You may not see
 * this" confirms the file exists and that somebody has it.
 *
 * =====================================================================
 * WHY AN AVATAR IS NO LONGER BEHIND THE BEARER TOKEN — SAY IT PLAINLY
 * =====================================================================
 * This route used to be wrapped in `authedParams`, which requires an
 * `Authorization: Bearer …` header on every request. NOTHING THAT DRAWS AN
 * AVATAR CAN SEND ONE. `expo-image` is handed `source={{ uri }}` in
 * `features/community/ui/Chrome.tsx` (member pictures) and in
 * `ui/RoomAvatar.tsx` (admin-set room pictures), and an `<Image>` is not a
 * `fetch` the caller controls. So the first profile picture anybody saved would
 * have rendered as a blank disc on every screen in the app, and the room
 * pictures the admin board has been setting since 6 Sept have the identical
 * latent bug for the same reason.
 *
 * THE TWO WAYS OUT, AND WHY THIS IS THE ONE TAKEN.
 *   · Pass the token into the image source. `ImageSource.headers` exists — but
 *     expo-image's own types say of it: "On web requires the
 *     `Access-Control-Allow-Origin` header returned by the server to include
 *     the current domain." This app ships on web, the web build reaches the API
 *     through a same-origin `/api` rewrite, and this route answers with a 302
 *     to a DIFFERENT origin (Supabase), across which browsers strip the
 *     Authorization header by specification. It would work on the phone and
 *     quietly not on the web, which is the worst of the available outcomes.
 *   · Let an avatar be fetched without a token. That is this.
 *
 * WHAT IS ACTUALLY GIVEN UP. Before, an avatar was readable by ANY signed-in
 * member — every one of them, with no relationship to the owner required,
 * because a profile picture is shown next to every post its owner has made.
 * Now it is readable by anyone who HAS THE ADDRESS. The address contains a
 * random UUID, is only ever handed out inside authenticated responses, and the
 * signed URL it redirects to dies in an hour. So the real delta is: a member
 * who copies an avatar's link out of the app can hand it to somebody who is not
 * a member. That is the same exposure as any profile picture on any social
 * product, and it is the honest price of the picture rendering at all.
 *
 * WHAT IS NOT GIVEN UP. The bucket stays PRIVATE with no policy, so this route
 * is still the only door and it still refuses anything that is not an avatar
 * without a token. Message attachments are unchanged: token required, room
 * membership checked, deleted posts gone. And a room's picture is stored as an
 * avatar-purpose asset (the admin board uploads through `purpose=avatar`), so
 * this same arm is what makes room pictures render too.
 */
import type { NextRequest } from 'next/server';
import { type Ctx } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { ApiError, errorResponse } from '@/lib/errors';
import { log, newRequestId } from '@/lib/log';
import { serviceClient } from '@/lib/db';
import { loadMembership } from '@/lib/rooms';
import { SIGNED_URL_TTL_S } from '@/lib/media/limits';

export const dynamic = 'force-dynamic';

const GONE = () => new ApiError('NOT_FOUND', 'That picture is no longer available.');

/**
 * Hand-rolled rather than `authedParams` for exactly one reason: the auth check
 * has to happen AFTER the asset is looked up, because whether a token is needed
 * depends on what the asset is. Everything else — the request id, the log line,
 * the error envelope — is `authedParams`' own shape, kept identical so this
 * route reads the same in the logs as every other one.
 */
export async function GET(req: NextRequest, route: { params: Promise<{ id: string }> }): Promise<Response> {
  const requestId = newRequestId();
  const started = Date.now();
  try {
    const params = (await route?.params) ?? ({ id: '' } as { id: string });
    const db = serviceClient();

    const found = await db
      .from('media_assets')
      .select('id,purpose,bucket_id,object_path,message_id')
      .eq('id', params.id)
      .maybeSingle();
    const asset = (found.data as Record<string, unknown> | null) ?? null;
    if (!asset) throw GONE();

    if (asset.purpose === 'message') {
      // The token is demanded HERE and not at the top of the function. An
      // avatar never reaches this branch and never needs one.
      const user = await requireUser(req);
      const ctx: Ctx = { user, requestId };

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
    const res = new Response(null, {
      status: 302,
      headers: {
        location: signed.data.signedUrl,
        // Let a client reuse the redirect for a while, but expire it well
        // inside the signature's own life so it never follows a dead link.
        //
        // `private` even for an avatar: the redirect target carries a signature
        // minted for this fetch, and a shared cache handing that same signed
        // link to the next caller is not something this route should invite.
        'cache-control': `private, max-age=${Math.floor(SIGNED_URL_TTL_S / 2)}`,
        'x-request-id': requestId,
      },
    });
    log('info', requestId, 'request.ok', {
      method: req.method,
      path: new URL(req.url).pathname,
      status: res.status,
      ms: Date.now() - started,
    });
    return res;
  } catch (e) {
    const err = e instanceof ApiError
      ? e
      : new ApiError('INTERNAL', 'Something went wrong on our side. Please try again.');
    log(err.status >= 500 ? 'error' : 'warn', requestId, 'request.error', {
      method: req.method,
      path: new URL(req.url).pathname,
      code: err.code,
      status: err.status,
      ms: Date.now() - started,
      message: err.message,
    });
    return errorResponse(err, requestId);
  }
}
