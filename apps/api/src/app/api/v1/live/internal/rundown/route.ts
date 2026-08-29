/**
 * GET /api/v1/live/internal/rundown?mode=&limit=&exclude=
 *
 * Everything the show could talk about next, ranked, with every number already
 * derived by the app's own helpers. Worker-only (`x-internal-secret`).
 *
 * `exclude` is the worker's no-repeat set — symbols already prepared, in flight
 * or recently played. Passing it in rather than filtering afterwards means the
 * fallback tier fills the gap in the same request, so a rundown never comes back
 * shorter than asked for just because the top of it was already used.
 */
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ok } from '@/lib/http';
import { validationError } from '@/lib/errors';
import { internalRoute } from '../../_lib/internal';
import { buildRundown } from '../../_lib/rundown';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const Query = z.object({
  mode: z.enum(['review', 'market']).default('review'),
  limit: z.coerce.number().int().min(1).max(24).default(12),
  exclude: z.string().max(400).optional(),
});

export const GET = internalRoute(async (req: NextRequest) => {
  const url = new URL(req.url);
  const parsed = Query.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) throw validationError(parsed.error.issues);

  const exclude = (parsed.data.exclude ?? '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  const result = await buildRundown({ limit: parsed.data.limit, exclude });
  return ok(result);
});
