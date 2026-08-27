/**
 * Service-role Supabase client.
 *
 * SECURITY BOUNDARY (03 Unit 3): the service role bypasses RLS, so EVERY query
 * in this app must be user-scoped explicitly — `.eq('user_id', userId)` on any
 * table that carries a user_id. There is no code path that reads another
 * user's rows. Global tables (setups, instruments, rooms) are readable by any
 * authenticated user by design (01 §13).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env, requireEnv } from './env';

let cached: SupabaseClient | null = null;

export function serviceClient(): SupabaseClient {
  if (cached) return cached;
  const url = requireEnv('SUPABASE_URL');
  const key = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-application-name': 'cheatcode-api' } },
  });
  return cached;
}

export function supabaseConfigured(): boolean {
  return Boolean(env('SUPABASE_URL') && env('SUPABASE_SERVICE_ROLE_KEY'));
}

/** Postgres "relation/function does not exist" — used for graceful degradation. */
export function isMissingObject(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return (
    err.code === '42P01' || // undefined_table
    err.code === '42883' || // undefined_function
    err.code === 'PGRST202' || // PostgREST: function not found
    err.code === 'PGRST205' || // PostgREST: table not found in schema cache
    /does not exist|not found in the schema cache/i.test(err.message ?? '')
  );
}
