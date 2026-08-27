/**
 * POST /api/v1/setups/:id/follow
 *
 * Two things, both reversible, neither financial: put the symbol on the
 * watchlist, and draft the ready-alert this setup implies. The alert is a
 * DRAFT — Kai never arms anything on the user's behalf; POST /alerts does that
 * after the user taps Activate.
 */
import type { NextRequest } from 'next/server';
import { SetupFollowResponse, AlertPreviewPayload } from '@shared/api';
import { authedParams, ok, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { serviceClient } from '@/lib/db';
import { emitUserEvent } from '@/lib/events';
import { setupsByIds } from '@/lib/kai/context';
import { persistKaiObject, DETERMINISTIC_MODEL } from '@/lib/kai/objects';
import { levels, isLong } from '@/lib/setups';
import { addToWatchlist, WATCHLIST_UNAVAILABLE_PLAIN } from '@/lib/watchlist';
import { alertRow } from '../../../alerts/shape';

export const dynamic = 'force-dynamic';

const ALERT_COLUMNS =
  'id,status,natural_language,condition,data_dependency,frequency,expires_at,refs,created_at';

export const POST = authedParams<{ id: string }>(async (_req: NextRequest, ctx: Ctx & { params: { id: string } }) => {
  const [row] = await setupsByIds([ctx.params.id]);
  if (!row) throw new ApiError('NOT_FOUND', 'I could not find that setup. It may have expired.');

  const db = serviceClient();
  const { entry } = levels(row);
  const long = isLong(row.intent);

  const watch = await addToWatchlist(ctx.user.id, row.symbol, `Followed the ${row.symbol} setup`, ctx.requestId);

  // Already drafted or armed for this setup? Do not stack duplicates.
  const existing = await db
    .from('alerts')
    .select(ALERT_COLUMNS)
    .eq('user_id', ctx.user.id)
    .in('status', ['draft', 'active'])
    .contains('refs', { setup_id: row.id } as never)
    .limit(1);
  const already = (existing.data ?? [])[0] as Record<string, unknown> | undefined;

  if (already) {
    return ok(
      SetupFollowResponse.parse({
        setup_id: row.id,
        symbol: row.symbol,
        watchlisted: watch.ok,
        already_following: true,
        alert: alertRow(already),
        preview: null,
        plain: `You are already watching ${row.symbol}. I have not made a second one.`,
      })
    );
  }

  // The default ready-alert: the setup's own trigger, nothing invented.
  const summary =
    entry === null
      ? `Tell me when the ${row.symbol} setup is ready.`
      : `Tell me when ${row.symbol} trades ${long ? 'above' : 'below'} $${entry}.`;

  const payload = AlertPreviewPayload.parse({
    natural_language: summary,
    condition:
      entry === null
        ? { compose: 'all', atoms: [{ atom: 'setup_state', symbol: row.symbol, operator: 'equals', value: 'ready' }] }
        : {
            compose: 'all',
            atoms: [
              {
                atom: 'price_cross',
                symbol: row.symbol,
                operator: long ? 'crosses_up' : 'crosses_down',
                value: entry,
              },
            ],
          },
    data_dependency: { symbols: [row.symbol], feeds: ['equity_quotes'] },
    frequency: 'once',
    expires_at: row.valid_until,
    summary_plain: summary,
    risk_plain: 'This only watches. It never places an order.',
  });

  const inserted = await db
    .from('alerts')
    .insert({
      user_id: ctx.user.id,
      status: 'draft',
      natural_language: summary,
      condition: payload.condition as never,
      data_dependency: payload.data_dependency as never,
      frequency: payload.frequency,
      expires_at: payload.expires_at,
      refs: { setup_id: row.id, symbol: row.symbol, level: entry, origin: 'follow' } as never,
    })
    .select(ALERT_COLUMNS)
    .single();
  if (inserted.error || !inserted.data) {
    throw new ApiError('INTERNAL', 'We could not save that watch. Please try again.', {
      detail: inserted.error?.message,
    });
  }

  const alertId = String((inserted.data as Record<string, unknown>).id);
  const preview = await persistKaiObject({
    type: 'alert_preview',
    payload,
    userId: ctx.user.id,
    refs: { alert_id: alertId, setup_id: row.id, symbol: row.symbol, user_id: ctx.user.id },
    model: DETERMINISTIC_MODEL,
    requestId: ctx.requestId,
  });

  await emitUserEvent(
    ctx.user.id,
    'system',
    'setup',
    row.id,
    { event: 'setup_followed', symbol: row.symbol, alert_id: alertId, watchlisted: watch.ok },
    ctx.requestId
  );

  return ok(
    SetupFollowResponse.parse({
      setup_id: row.id,
      symbol: row.symbol,
      watchlisted: watch.ok,
      already_following: false,
      alert: alertRow(inserted.data as Record<string, unknown>, payload.summary_plain),
      preview,
      plain: watch.missing
        ? `${summary} It is a draft until you activate it. ${WATCHLIST_UNAVAILABLE_PLAIN}`
        : `${row.symbol} is on your watchlist and the alert is drafted. Activate it when you want me watching.`,
    }),
    { status: 201 }
  );
});
