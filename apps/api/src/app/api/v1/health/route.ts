/** GET /api/v1/health → {ok, supabase, anthropic}. No secrets in the response. */
import { HealthResponse } from '@shared/api';
import { serviceClient, supabaseConfigured } from '@/lib/db';
import { anthropicReachable } from '@/lib/kai/stream';

export const dynamic = 'force-dynamic';

export async function GET() {
  let supabase = false;
  if (supabaseConfigured()) {
    try {
      const { error } = await serviceClient().from('instruments').select('symbol').limit(1);
      supabase = !error;
    } catch {
      supabase = false;
    }
  }
  // `anthropic` means THE KEY IS ACCEPTED, not "a key is set". See
  // `anthropicReachable` — the old presence-only check reported healthy through
  // two days of every single Kai turn failing on a revoked key.
  const anthropic = await anthropicReachable();
  return Response.json(HealthResponse.parse({ ok: supabase && anthropic, supabase, anthropic }));
}
