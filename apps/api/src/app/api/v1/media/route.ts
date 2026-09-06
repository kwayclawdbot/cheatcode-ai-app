/**
 * POST /api/v1/media   multipart: `file`, `purpose` = message | avatar
 *
 * The one upload door in this app. A photo for a post and a photo for a profile
 * come through here and get identical treatment: measured, sniffed, stripped of
 * every metadata block, and written to a private bucket nothing else can read.
 *
 * IT RETURNS AN ASSET, NOT A POST. Uploading and posting are two steps on
 * purpose. The member picks pictures while they are still typing, the bytes go
 * up in the background, and the post itself is a small JSON call carrying the
 * asset ids. The alternative — one big multipart request that carries the text
 * AND the files — makes every failed upload eat the message the member wrote.
 *
 * An asset that is never claimed by a post is swept an hour later
 * (`sweepOrphans`), so abandoning the composer costs nothing but a little
 * storage for an hour.
 *
 * WHY multipart AND NOT A SIGNED UPLOAD URL. A signed URL would let the phone
 * write straight to the bucket and skip this function entirely — which is
 * exactly where the GPS coordinates come out. Every byte goes through the
 * server because the stripping is not optional. The cost is a request-body
 * ceiling (4.5 MB on this platform) and that ceiling is why the photo limit is
 * 4 MiB and why video is not supported at all; both are written out in
 * lib/media/limits.ts and migration 0033.
 */
import type { NextRequest } from 'next/server';
import { MediaPurpose, MediaUploadResponse } from '@shared/api';
import { authed, ok, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { rateLimit } from '@/lib/ratelimit';
import { acceptUpload, signAsset } from '@/lib/media/store';
import { LIMITS, plainSizeLimit } from '@/lib/media/limits';

export const dynamic = 'force-dynamic';

/** Generous enough that a member never hits it, tight enough that a script does. */
const UPLOAD_LIMIT = 20;
const UPLOAD_WINDOW_MS = 5 * 60_000;

export const POST = authed(async (req: NextRequest, ctx: Ctx) => {
  rateLimit({
    key: `media-upload:${ctx.user.id}`,
    limit: UPLOAD_LIMIT,
    windowMs: UPLOAD_WINDOW_MS,
    messagePlain: 'You have uploaded a lot of pictures in a short time. Give it a few minutes.',
  });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    // This is also what a body over the platform's size cap looks like from in
    // here, so the sentence names the size rather than blaming the format.
    throw new ApiError(
      'VALIDATION_FAILED',
      `We could not read that upload. Pictures need to be under ${plainSizeLimit('message')}.`
    );
  }

  const purposeParsed = MediaPurpose.safeParse(String(form.get('purpose') ?? 'message'));
  if (!purposeParsed.success) throw new ApiError('VALIDATION_FAILED', 'That is not something this app stores.');
  const purpose = purposeParsed.data;

  const file = form.get('file');
  if (!(file instanceof Blob)) throw new ApiError('VALIDATION_FAILED', 'No picture arrived with that request.');

  // The blob's own size, before anything is read into memory. A client that
  // lies about `Content-Length` still has to actually send the bytes.
  if (file.size > LIMITS[purpose].maxBytes) {
    throw new ApiError(
      'VALIDATION_FAILED',
      `That picture is too big. The limit is ${plainSizeLimit(purpose)}.`
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  const { asset, removed } = await acceptUpload({
    ownerId: ctx.user.id,
    purpose,
    bytes,
    declaredMime: file.type || null,
    requestId: ctx.requestId,
  });

  const view = await signAsset(asset);

  // THE MEMBER IS TOLD WHAT CAME OUT. A person posting a photo taken at home
  // has a right to know their coordinates were in it and are not any more —
  // silently doing the right thing teaches them nothing about the next photo
  // they post somewhere else.
  // EXIF, XMP and IPTC are three different blocks that all carry the same
  // thing in practice — where the shutter was pressed — so all three earn the
  // sentence that names it. A bare comment does not.
  const hadLocation = removed.some((r) => /GPS|EXIF|XMP|IPTC/i.test(r));
  const plain = hadLocation
    ? 'Added. The location and camera details were removed from it before it was stored.'
    : removed.length
      ? 'Added. Hidden details were removed from it before it was stored.'
      : 'Added.';

  // Built from the request's own origin rather than an env var, so it is right
  // on localhost, on a preview deployment and in production without three
  // places to keep in step.
  const origin = new URL(req.url).origin;

  return ok(
    MediaUploadResponse.parse({
      asset: view,
      stable_url: `${origin}/api/v1/media/${asset.id}`,
      removed,
      plain,
    }),
    { status: 201 }
  );
});
