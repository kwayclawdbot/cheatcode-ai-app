/** GET /api/v1/health → {ok, supabase, anthropic, anthropic_status, ...}. No secrets in the response. */
import { HealthResponse } from '@shared/api';
import { serviceClient, supabaseConfigured } from '@/lib/db';
import { anthropicHealth } from '@/lib/kai/anthropic-health';

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
  // `anthropic` means KAI CAN ACTUALLY ANSWER: a real one-token call, cached for
  // five minutes. Listing models said "fine" through an empty credit balance.
  // See lib/kai/anthropic-health.ts.
  const probe = await anthropicHealth();
  return Response.json(
    HealthResponse.parse({
      ok: supabase && probe.healthy,
      supabase,
      anthropic: probe.healthy,
      anthropic_status: probe.status,
      anthropic_message: probe.message,
      anthropic_checked_at: probe.checked_at,
    })
  );
}
