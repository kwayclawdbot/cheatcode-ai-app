/**
 * EVERY NUMBER THAT DECIDES WHETHER AN UPLOAD IS ALLOWED, IN ONE FILE.
 *
 * Same rule this repo already applies to model prices (lib/kai/pricing.ts) and
 * to plan allowances (lib/kai/plans.ts): a limit that is written in three
 * places is three limits, and the one that bites is whichever the reader did
 * not find.
 *
 * WHERE EACH ONE IS ACTUALLY ENFORCED — this is the part that matters, because
 * a limit the client checks is a suggestion:
 *
 *   1. THE PHONE downsizes before it uploads (features/media/pick.ts). This is
 *      a courtesy to the member's data plan. It decides nothing.
 *   2. THIS API refuses, by measuring the bytes it actually received and
 *      sniffing the actual file header — never the `Content-Type` the client
 *      sent, never the filename, never a size the client claimed. This is the
 *      number a member sees in an error message.
 *   3. THE BUCKET refuses, at `storage.buckets.file_size_limit` and
 *      `allowed_mime_types` (migration 0033). Deliberately set ABOVE this
 *      file's numbers so that (2) is what a member hits and (3) only ever
 *      catches something that reached storage without asking this API — which
 *      nothing can today, because the buckets are private with no policy.
 *
 * WHY THE PHOTO CEILING IS 4 MiB AND NOT 10 — MEASURED, NOT ASSUMED.
 *
 * Bodies of increasing size posted at the real production deployment
 * (cheatcode-ai-api.vercel.app), 2026-09-06:
 *
 *     1.00 MiB   HTTP 401  our own error envelope   <- reached the function
 *     3.00 MiB   HTTP 401  our own error envelope
 *     4.00 MiB   HTTP 401  our own error envelope
 *     4.25 MiB   HTTP 401  our own error envelope
 *     4.30 MiB   HTTP 413  FUNCTION_PAYLOAD_TOO_LARGE   <- never arrived
 *     5.00 MiB   HTTP 413  FUNCTION_PAYLOAD_TOO_LARGE
 *    16.00 MiB   HTTP 413  FUNCTION_PAYLOAD_TOO_LARGE
 *
 * The line is between 4.25 and 4.30 MiB — the platform's documented 4.5 MB.
 * Past it the request never reaches a line of this app's code: no auth check,
 * no size check, no stripping, and the member reads the platform's plain-text
 * page instead of one of our sentences. 4 MiB sits under it with room for the
 * multipart framing, so every refusal a member sees is one we wrote.
 *
 * THE SAME MEASUREMENT IS WHY VIDEO IS NOT SUPPORTED. Ten seconds of 1080p off
 * an iPhone is 15-25 MB. It cannot be posted through the route where the
 * stripping lives, and the only way around that — a signed upload straight to
 * storage — is precisely the path that skips the stripping. See migration 0033.
 *
 * `scripts/media-limits-proof.mts` re-runs this against any deployment.
 */

export const MEDIA_BUCKET = 'community-media';
export const AVATAR_BUCKET = 'avatars';

export type MediaPurpose = 'message' | 'avatar';

/** The only two formats this server can strip metadata from. See strip.ts. */
export const ACCEPTED_MIME = ['image/jpeg', 'image/png'] as const;
export type AcceptedMime = (typeof ACCEPTED_MIME)[number];

export const LIMITS = {
  message: {
    bucket: MEDIA_BUCKET,
    /** 4 MiB. Under Vercel's 4.5 MB body cap, so the refusal is ours. */
    maxBytes: 4 * 1024 * 1024,
    maxPerMessage: 4,
  },
  avatar: {
    bucket: AVATAR_BUCKET,
    /** 2 MiB. An avatar renders at 40pt; anything larger is waste. */
    maxBytes: 2 * 1024 * 1024,
    maxPerMessage: 1,
  },
} as const satisfies Record<MediaPurpose, { bucket: string; maxBytes: number; maxPerMessage: number }>;

/**
 * A decompression-bomb guard. Nothing here decodes an image — the stripper
 * reads headers only — but the PHONE will, and a 60,000 x 60,000 PNG that is
 * 200 KB on disk is 14 GB decoded. Rejected on the declared dimensions in the
 * header, which is the same number the decoder will trust.
 */
export const MAX_DIMENSION = 8000;

/** How long a signed read URL lives. Long enough to scroll a room, short
 *  enough that a link somebody copied out stops working the same afternoon. */
export const SIGNED_URL_TTL_S = 60 * 60;

/**
 * An upload that was never attached to a post. It happens honestly — the member
 * picked a photo and then closed the app — and the bytes must not live forever
 * because of it. Older than this with no `message_id` and the sweep takes it.
 */
export const ORPHAN_AGE_MS = 60 * 60 * 1000;

export function plainSizeLimit(purpose: MediaPurpose): string {
  const mb = LIMITS[purpose].maxBytes / (1024 * 1024);
  return `${mb} MB`;
}

export function bytesPlain(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
