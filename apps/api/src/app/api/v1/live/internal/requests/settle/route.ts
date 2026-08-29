/**
 * POST /api/v1/live/internal/requests/settle
 *
 * The director marking a subscriber request done. Worker-only.
 *
 * A request leaves the queue only when it has actually aired (`presented`) or
 * been consciously passed over (`skipped`) — never when it is merely picked up,
 * because a segment that fails to prepare has to fall back into the queue rather
 * than vanish. Someone asked for that ticker.
 */
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ok } from '@/lib/http';
import { validationError, ApiError } from '@/lib/errors';
import { internalRoute } from '../../../_lib/internal';
import { serviceClient } from '@/lib/db';

export const dynamic = 'force-dynamic';

const Body = z.object({
  id: z.string().min(1),
  status: z.enum(['presented', 'skipped']),
  segment_id: z.string().nullable().optional(),
});

export const POST = internalRoute(async (req: NextRequest) => {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = {};
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) throw validationError(parsed.error.issues);

  const { error } = await serviceClient()
    .from('live_requests')
    .update({
      status: parsed.data.status,
      presented_segment_id: parsed.data.segment_id ?? null,
    })
    .eq('id', parsed.data.id);

  if (error) throw new ApiError('INTERNAL', 'That request could not be settled.', { detail: error.message });
  return ok({ ok: true });
});
