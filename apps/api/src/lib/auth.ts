/**
 * Supabase JWT verification.
 *
 * The client sends `Authorization: Bearer <supabase access token>`. We verify
 * it by asking Supabase who it belongs to; a service-role client is used only
 * as the transport — the token itself is what is verified.
 */
import type { NextRequest } from 'next/server';
import { serviceClient } from './db';
import { ApiError, UNAUTHENTICATED } from './errors';

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

  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) throw UNAUTHENTICATED();
  return { id: data.user.id, email: data.user.email ?? null };
}
