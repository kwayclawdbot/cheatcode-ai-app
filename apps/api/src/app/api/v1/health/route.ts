/** GET /api/v1/health → {ok, supabase, anthropic}. No secrets in the response. */
import { HealthResponse } from '@shared/api';
import { serviceClient, supabaseConfigured } from '@/lib/db';
import { anthropicConfigured } from '@/lib/kai/stream';

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
  const anthropic = anthropicConfigured();
  return Response.json(HealthResponse.parse({ ok: supabase && anthropic, supabase, anthropic }));
}
