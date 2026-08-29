/**
 * Supabase JWT verification.
 *
 * The client sends `Authorization: Bearer <supabase access token>`. We verify
 * it by asking Supabase who it belongs to; a service-role client is used only
 * as the transport — the token itself is what is verified.
 */
import type { NextRequest } from 'next/server';
import { resetServiceClient, serviceClient } from './db';
import { ApiError, UNAUTHENTICATED, UNVERIFIABLE_SESSION } from './errors';

export type AuthedUser = { id: string; email: string | null };

export function bearerToken(req: Request | NextRequest): string | null {
  const header = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (!token || scheme.toLowerCase() !== 'bearer') return null;
  return token.trim();
}

export async function requireUser(req: Request | NextRequest): Promise<AuthedUser> {
  const token = bearerToken(req);
  if (!token) throw UNAUTHENTICATED();

  let db;
  try {
    db = serviceClient();
  } catch {
    throw new ApiError('INTERNAL', 'We could not reach your account right now. Please try again.', {
      status: 503,
    });
  }

  let { data, error } = await db.auth.getUser(token);

  // The token did not verify. Before calling it the user's problem, rule out
  // OURS: the client caches Supabase's signing keys (JWKS) for the life of the
  // process, so a rotated key — `supabase db reset`, a hosted rotation — makes
  // this server reject every token ever issued, including one minted a second
  // ago, until someone restarts it. Rebuild the client once and re-verify.
  //
  // This is still full verification against current keys, not a bypass: a
  // token that fails the retry is refused exactly as before. We skip the retry
  // for a token that is simply past its expiry, because no key rotation can
  // rescue that and the round trip would be waste.
  if ((error || !data?.user) && !isExpired(token)) {
    resetServiceClient();
    try {
      ({ data, error } = await serviceClient().auth.getUser(token));
    } catch {
      /* fall through to the throw below */
    }
  }

  if (error || !data?.user) throw isExpired(token) ? UNAUTHENTICATED() : UNVERIFIABLE_SESSION();
  return { id: data.user.id, email: data.user.email ?? null };
}

/**
 * Is this token past its own `exp`?
 *
 * Reads the payload WITHOUT verifying the signature, and is used only to pick
 * the honest error message and to skip a pointless retry. It never authorises
 * anything — every caller above still requires a verified `getUser`. An
 * unparseable token counts as not-expired, so the failure is reported as
 * unverifiable rather than as a stale session we cannot actually attest to.
 */
function isExpired(token: string): boolean {
  try {
    const [, payload] = token.split('.');
    if (!payload) return false;
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { exp?: number };
    return typeof json.exp === 'number' && json.exp * 1000 <= Date.now();
  } catch {
    return false;
  }
}
