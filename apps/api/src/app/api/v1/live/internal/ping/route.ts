/**
 * GET /api/v1/live/internal/ping
 *
 * "Can the worker do its job?" answered before a show starts rather than four
 * minutes into one. Reports CONFIGURATION, never values: which capabilities are
 * wired, so a run that is about to produce a show with no chart marks or no
 * market data says so at second zero.
 */
import { ok } from '@/lib/http';
import { internalRoute } from '../../_lib/internal';
import { env } from '@/lib/env';
import { supabaseConfigured } from '@/lib/db';
import { polygonConfigured } from '@/lib/market/polygon';
import { hasAnnotationsTable } from '@/lib/round4/schema-probe';

export const dynamic = 'force-dynamic';

export const GET = internalRoute(async () => {
  const annotations = await hasAnnotationsTable().catch(() => false);
  return ok({
    ok: true,
    supabase: supabaseConfigured(),
    polygon: polygonConfigured(),
    anthropic: Boolean(env('ANTHROPIC_API_KEY')),
    annotations,
  });
});
