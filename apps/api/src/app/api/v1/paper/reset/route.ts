/**
 * POST /api/v1/paper/reset
 *
 * Once per calendar month. Balances go back to `starting_balance`,
 * `reset_count` goes up — and NOTHING is closed or deleted. A reset is not an
 * undo: the trades that happened still happened, and the debriefs that explain
 * them stay exactly where they are.
 */
import type { NextRequest } from 'next/server';
import { PaperResetResponse } from '@shared/api';
import { authed, ok, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { serviceClient } from '@/lib/db';
import { emitUserEvent } from '@/lib/events';
import { notify } from '@/lib/notify';
import { callRpc, noteFallback } from '@/lib/rpc';
import { canResetPaper, nextResetAllowedAt } from '@/lib/paper';

export const dynamic = 'force-dynamic';

const COLUMNS = 'id,cash,buying_power,equity,starting_balance,reset_count,last_reset_at';

export const POST = authed(async (_req: NextRequest, ctx: Ctx) => {
  const db = serviceClient();
  const found = await db
    .from('accounts')
    .select(COLUMNS)
    .eq('user_id', ctx.user.id)
    .eq('kind', 'paper')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  const acc = found.data as Record<string, unknown> | null;
  if (!acc) throw new ApiError('NOT_FOUND', 'Your paper account is not set up yet.');

  const lastReset = (acc.last_reset_at as string) ?? null;
  if (!canResetPaper(lastReset)) {
    throw new ApiError(
      'STATE_CONFLICT',
      'You have already reset this month. The next one is available on the 1st.',
      { detail: { next_reset_allowed_at: nextResetAllowedAt(lastReset) } }
    );
  }

  const rpc = await callRpc<{ ok?: boolean; reason?: string | null; next_allowed_at?: string | null }>(
    'reset_paper_account',
    { p_user_id: ctx.user.id },
    ctx.requestId
  );

  // 0018 returns a refusal as a VALUE so the API renders copy instead of
  // parsing error strings.
  if (rpc.ok && rpc.data && rpc.data.ok === false) {
    const reason = rpc.data.reason ?? 'unknown';
    if (reason === 'no_paper_account') {
      throw new ApiError('NOT_FOUND', 'Your paper account is not set up yet.');
    }
    throw new ApiError(
      'STATE_CONFLICT',
      'You have already reset this month. The next one is available on the 1st.',
      { detail: { next_reset_allowed_at: rpc.data.next_allowed_at ?? nextResetAllowedAt(lastReset) } }
    );
  }

  if (!rpc.ok) {
    if (!rpc.missing) {
      throw new ApiError('INTERNAL', 'We could not reset your practice balance. Please try again.');
    }
    // FALLBACK (documented in README): update + outbox, two round-trips.
    noteFallback(ctx.requestId, 'reset_paper_account');
    const start = Number(acc.starting_balance ?? 0);
    const { error } = await db
      .from('accounts')
      .update({
        cash: start,
        buying_power: start,
        equity: start,
        reset_count: Number(acc.reset_count ?? 0) + 1,
        last_reset_at: new Date().toISOString(),
      })
      .eq('id', acc.id)
      .eq('user_id', ctx.user.id);
    if (error) {
      throw new ApiError('INTERNAL', 'We could not reset your practice balance. Please try again.', {
        detail: error.message,
      });
    }
    await emitUserEvent(
      ctx.user.id,
      'system',
      'account',
      String(acc.id),
      { event: 'paper_reset', starting_balance: start },
      ctx.requestId
    );
  }

  const after = await db.from('accounts').select(COLUMNS).eq('id', acc.id).single();
  const row = after.data as Record<string, unknown>;

  await notify({
    userId: ctx.user.id,
    kind: 'paper_reset',
    titlePlain: 'Practice balance reset',
    bodyPlain: `Back to $${Number(row.starting_balance ?? 0).toLocaleString('en-US')}. Your past trades and write-ups are still here.`,
    route: '/account/paper',
    payload: { account_id: String(row.id) },
    requestId: ctx.requestId,
  });

  return ok(
    PaperResetResponse.parse({
      account: {
        id: String(row.id),
        cash: num(row.cash),
        buying_power: num(row.buying_power),
        equity: num(row.equity),
        starting_balance: num(row.starting_balance),
        reset_count: Number(row.reset_count ?? 0),
        last_reset_at: (row.last_reset_at as string) ?? null,
      },
      next_reset_allowed_at: nextResetAllowedAt((row.last_reset_at as string) ?? new Date().toISOString()),
      plain: `Back to $${Number(row.starting_balance ?? 0).toLocaleString('en-US')}. Nothing was closed and nothing was deleted — your trades and write-ups are still here.`,
    })
  );
});

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
