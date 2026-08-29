/**
 * The web transport — Web Push with VAPID.
 *
 * This one is REAL and verifiable. `web-push` encrypts the payload to the
 * browser's own `{p256dh, auth}` keys and signs the request with our VAPID key
 * pair; the push service (Mozilla, FCM, Apple) is a dumb relay that cannot read
 * the body. `PUSH_DRY_RUN` deliberately does NOT apply here — there is a real
 * endpoint to POST to and a real status code to act on, and pretending
 * otherwise would throw away the only transport this round can actually prove.
 *
 * THE STATUS CODES ARE THE PRODUCT:
 *   201/200   accepted by the push service. Not "delivered" — Web Push has no
 *             receipt, so `sent` is as far as the truth goes here and the row
 *             never claims `delivered`.
 *   404/410   the subscription is gone. Permanent: the browser unsubscribed or
 *             the profile was wiped. Revoke the row, do not retry, and do not
 *             treat it as an error worth surfacing — it is the normal way a
 *             subscription ends.
 *   429       we are being rate limited. Back off; honour Retry-After.
 *   400/413   our fault (bad VAPID, payload too large). Fail without retrying;
 *             hammering a request that cannot succeed just burns the endpoint.
 *   5xx       theirs. Retry.
 *
 * iOS NOTE for whoever reads this next: Safari only grants a web push
 * subscription to a site the user has added to the home screen. That is a
 * client concern (MOBILE-5) but it is the reason a phone can register on
 * Android and appear to "do nothing" on iOS.
 */
import webpush, { type PushSubscription, type RequestOptions } from 'web-push';
import { env } from '../env';
import type { PushPayload } from './payload';
import type { SendOutcome } from './send';

/** How long a push service should hold the message for a device that is offline. */
const TTL_S = 60 * 30;

let configured: boolean | null = null;

export function vapidConfigured(): boolean {
  return Boolean(env('VAPID_PUBLIC_KEY') && env('VAPID_PRIVATE_KEY'));
}

export function vapidPublicKey(): string | null {
  return env('VAPID_PUBLIC_KEY') ?? null;
}

/**
 * `setVapidDetails` is global state in `web-push`, so it is set once and only
 * when the keys exist. Calling it with an undefined key throws, which is why
 * this returns a boolean instead of assuming.
 */
function ensureVapid(): boolean {
  if (configured !== null) return configured;
  const publicKey = env('VAPID_PUBLIC_KEY');
  const privateKey = env('VAPID_PRIVATE_KEY');
  const subject = env('VAPID_SUBJECT') ?? 'mailto:support@cheatcode.com';
  if (!publicKey || !privateKey) {
    configured = false;
    return false;
  }
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
  } catch {
    configured = false;
  }
  return configured;
}

/** Test seam: the smoke run changes nothing, but a unit run may. */
export function resetVapid(): void {
  configured = null;
}

function subscription(handle: string, keys: { p256dh?: string | null; auth?: string | null } | null): PushSubscription {
  return {
    endpoint: handle,
    keys: { p256dh: String(keys?.p256dh ?? ''), auth: String(keys?.auth ?? '') },
  };
}

/**
 * Build and sign without sending. `web-push` does the part that must not be
 * hand-rolled — AES-128-GCM to the browser's own keys and the ES256 VAPID JWT —
 * and hands back exactly what a push service expects.
 */
export function buildRequest(
  handle: string,
  keys: { p256dh?: string | null; auth?: string | null } | null,
  payload: PushPayload
): { endpoint: string; headers: Record<string, string>; bodyLength: number } | null {
  if (!ensureVapid()) return null;
  const details = webpush.generateRequestDetails(
    subscription(handle, keys),
    JSON.stringify(payload),
    { TTL: TTL_S } as RequestOptions
  );
  const body = details.body as Buffer | null;
  return {
    endpoint: details.endpoint,
    headers: details.headers as unknown as Record<string, string>,
    bodyLength: body ? body.length : 0,
  };
}

/**
 * WHY `generateRequestDetails` + `fetch` AND NOT `sendNotification`.
 *
 * `web-push`'s own sender is a thin wrapper that calls `https.request` — always
 * `https`, hard-coded (see `node_modules/web-push/src/web-push-lib.js`). That
 * makes the sending half untestable against any endpoint we can stand up
 * locally, which would leave the ONE transport this round can actually prove
 * proven only by mocks.
 *
 * So the library still does every part that must not be hand-rolled: the
 * AES-128-GCM encryption to the browser's own `{p256dh, auth}` and the ES256
 * VAPID JWT. What it hands back is the finished request — endpoint, headers,
 * ciphertext — and we post it with `fetch`. The bytes on the wire are identical;
 * the status code comes back where we can act on it.
 */
export async function sendWeb(
  handle: string,
  keys: { p256dh?: string | null; auth?: string | null } | null,
  payload: PushPayload
): Promise<SendOutcome> {
  if (!ensureVapid()) {
    return {
      ok: false,
      retry: false,
      revoke: false,
      reason: 'vapid_missing',
      error: 'no VAPID key pair is configured on this server',
    };
  }
  if (!keys?.p256dh || !keys?.auth) {
    // The policy should have caught this and marked the row stale. Belt and
    // braces: the drain must not throw on one bad row.
    return {
      ok: false,
      retry: false,
      revoke: false,
      reason: 'keys_missing',
      error: 'the subscription has no encryption keys',
    };
  }

  let details: ReturnType<typeof webpush.generateRequestDetails>;
  try {
    details = webpush.generateRequestDetails(subscription(handle, keys), JSON.stringify(payload), {
      TTL: TTL_S,
    } as RequestOptions);
  } catch (e) {
    // A malformed key or endpoint. No amount of retrying fixes the row.
    return {
      ok: false,
      retry: false,
      revoke: false,
      reason: 'encrypt_failed',
      error: e instanceof Error ? e.message : String(e),
    };
  }

  let res: Response;
  try {
    res = await fetch(details.endpoint, {
      method: details.method ?? 'POST',
      headers: details.headers as unknown as Record<string, string>,
      // The ciphertext, as bytes. A Buffer is a Uint8Array view, and fetch
      // wants the view — not Node's Buffer type, which its DOM lib does not know.
      body: details.body ? new Uint8Array(details.body as Buffer) : undefined,
      // A push service that does not answer promptly is a retry, not a hang on
      // a request path that a notification is riding.
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    // Never reached the endpoint at all (DNS, TLS, connection refused, timeout).
    return {
      ok: false,
      retry: true,
      revoke: false,
      reason: 'unreachable',
      error: e instanceof Error ? e.message : String(e),
    };
  }

  if (res.status >= 200 && res.status < 300) {
    // Accepted by the push service. Web Push has no receipt, so this is the
    // furthest the truth goes and the row stops at `sent`.
    return { ok: true, ticketId: null };
  }
  return statusOutcome(res.status, res.headers.get('retry-after'), await safeText(res));
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 400);
  } catch {
    return '';
  }
}

export function statusOutcome(status: number, retryAfter: string | null, body: string): SendOutcome {
  if (status === 404 || status === 410) {
    return {
      ok: false,
      retry: false,
      revoke: true,
      reason: `http_${status}`,
      error: 'the browser subscription no longer exists',
    };
  }
  if (status === 429) {
    const seconds = Number(retryAfter ?? 0);
    return {
      ok: false,
      retry: true,
      revoke: false,
      reason: 'http_429',
      error: 'rate limited by the push service',
      retryAfterMs: Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined,
    };
  }
  return {
    ok: false,
    // Theirs is worth another try; ours (400 bad VAPID, 413 too large) is not.
    retry: status >= 500,
    revoke: false,
    reason: `http_${status}`,
    error: body,
  };
}
