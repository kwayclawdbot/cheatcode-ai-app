/**
 * GET /api/v1/alerts → {needs_attention, watching, resolved}
 *
 * Drafts appear under Watching as "draft — activate" (BUILD-BRIEF, Alerts stub).
 */
import type { NextRequest } from 'next/server';
import { AlertsResponse } from '@shared/api';
import { authed, ok, type Ctx } from '@/lib/http';
import { serviceClient } from '@/lib/db';
import { ApiError } from '@/lib/errors';
import { alertRow } from './shape';

export const dynamic = 'force-dynamic';

const EMPTY_COPY = "Kai isn't watching anything for you yet.";

export const GET = authed(async (_req: NextRequest, ctx: Ctx) => {
  const db = serviceClient();
  const { data, error } = await db
    .from('alerts')
    .select('id,status,natural_language,condition,data_dependency,frequency,expires_at,refs,created_at')
    .eq('user_id', ctx.user.id)
    .order('created_at', { ascending: false });
  if (error) throw new ApiError('INTERNAL', 'We could not load your alerts. Please try again.', { detail: error.message });

  const rows = (data ?? []).map((r) => alertRow(r as Record<string, unknown>));
  return ok(
    AlertsResponse.parse({
      needs_attention: rows.filter((r) => r.status === 'triggered'),
      watching: rows.filter((r) => r.status === 'draft' || r.status === 'active' || r.status === 'paused'),
      resolved: rows.filter((r) => r.status === 'expired' || r.status === 'cancelled'),
      empty_copy: EMPTY_COPY,
    })
  );
});
