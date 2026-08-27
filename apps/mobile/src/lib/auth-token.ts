/**
 * One place that hands out a *valid* access token.
 *
 * Why this exists: local Supabase access tokens live one hour. supabase-js
 * refreshes them, but on React Native the refresh timer only runs while
 * `startAutoRefresh()` is active (see supabase.ts), and any request that
 * races the timer can still carry a token the API will reject. So:
 *   1. refresh proactively when the token is within REFRESH_MARGIN of expiry;
 *   2. callers retry a 401 once after `recoverSession()`;
 *   3. if the refresh token is gone too, sign out — the route gate then shows
 *      the sign-in screen instead of a dead end.
 */
import { supabase } from './supabase';

const REFRESH_MARGIN_S = 120;
let inflight: Promise<string | null> | null = null;

async function refreshOnce(): Promise<string | null> {
  if (!supabase) return null;
  if (!inflight) {
    inflight = supabase.auth
      .refreshSession()
      .then(({ data, error }) => (error ? null : data.session?.access_token ?? null))
      .finally(() => { inflight = null; });
  }
  return inflight;
}

/** Access token that is not about to expire, or null when signed out. */
export async function getAccessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const s = data.session;
  if (!s) return null;
  const now = Math.floor(Date.now() / 1000);
  if (s.expires_at && s.expires_at - now < REFRESH_MARGIN_S) {
    const fresh = await refreshOnce();
    if (fresh) return fresh;
  }
  return s.access_token;
}

/**
 * The API said our token is no good. Try a refresh; if that fails the refresh
 * token is dead (revoked, rotated elsewhere, or the project was reset) and the
 * only honest move is to sign out so the user can sign back in.
 */
export async function recoverSession(): Promise<string | null> {
  const fresh = await refreshOnce();
  if (fresh) return fresh;
  await supabase?.auth.signOut().catch(() => {});
  return null;
}

export const SESSION_EXPIRED_COPY = 'Your session expired. Sign in again to pick up where you left off.';
