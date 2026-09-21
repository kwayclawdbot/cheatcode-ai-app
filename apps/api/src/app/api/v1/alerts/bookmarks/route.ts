/**
 * GET /api/v1/alerts/bookmarks — the alert cards this member saved.
 * PUT /api/v1/alerts/bookmarks {card_id, symbol, saved} — save or unsave one.
 *
 * THE BOOKMARK ON A V2 ALERT CARD (redesign 2026-09-21): "Entire card opens
 * detail; bookmark remains the only separate trailing control." It is a
 * member's own marker on one card, not a watchlist entry and not an alert —
 * following a setup already means "watchlist + a draft alert" (POST
 * /setups/:id/follow), and a bookmark must not quietly do either.
 *
 * PRIVATE. The table (0055) is RLS-on with zero policies; only this route,
 * with the service role, reads or writes it, and only ever for `ctx.user`.
 *
 * NOT APPLIED YET IS A REAL STATE. Until 0055 runs, GET answers
 * `available: false` with no ids and PUT refuses plainly — the app keeps the
 * mark on the device for the session rather than pretending it was saved.
 */
import type { NextRequest } from 'next/server';
import { AlertBookmarkRequest, AlertBookmarksResponse } from '@shared/api';
import { authed, ok, parseBody, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { serviceClient } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Postgres "relation does not exist" / PostgREST "table not in schema cache". */
function tableMissing(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === '42P01' || err.code === 'PGRST205' || /alert_bookmarks/.test(err.message ?? '') && /does not exist|schema cache/.test(err.message ?? '');
}

export const GET = authed(async (_req: NextRequest, ctx: Ctx) => {
  const db = serviceClient();
  const res = await db
    .from('alert_bookmarks')
    .select('card_id')
    .eq('user_id', ctx.user.id)
    .order('created_at', { ascending: false })
    .limit(500);
  if (res.error) {
    if (tableMissing(res.error)) return ok(AlertBookmarksResponse.parse({ card_ids: [], available: false }));
    throw new ApiError('INTERNAL', 'I could not read your saved alerts.', { detail: res.error.message });
  }
  const ids = ((res.data ?? []) as { card_id: string }[]).map((r) => r.card_id);
  return ok(AlertBookmarksResponse.parse({ card_ids: ids, available: true }));
});

export const PUT = authed(async (req: NextRequest, ctx: Ctx) => {
  const body = await parseBody(req, AlertBookmarkRequest);
  const db = serviceClient();
  const res = body.saved
    ? await db.from('alert_bookmarks').upsert(
        { user_id: ctx.user.id, card_id: body.card_id, symbol: body.symbol.toUpperCase() } as never,
        { onConflict: 'user_id,card_id', ignoreDuplicates: true },
      )
    : await db.from('alert_bookmarks').delete().eq('user_id', ctx.user.id).eq('card_id', body.card_id);
  if (res.error) {
    if (tableMissing(res.error)) throw new ApiError('NOT_FOUND', "Saving alerts isn't live on this stack yet.");
    throw new ApiError('INTERNAL', 'That did not save. Try again.', { detail: res.error.message });
  }
  return ok({ card_id: body.card_id, saved: body.saved });
});
