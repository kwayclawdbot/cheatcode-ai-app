/**
 * POST /api/v1/orders/preview
 *
 * The review screen's whole payload. Nothing is placed, nothing is reserved,
 * and the footer says so. The pipeline lives in `src/lib/execution/preview.ts`;
 * this route is the shell: parse, resolve the mode, run it, answer.
 *
 * The `advisories[]` / `blockers[]` split is the contract the client renders
 * against. A blocker is not dismissible and `can_submit` is false. An advisory
 * IS dismissible — and it is rendered as a caution. A 58% sector exposure never
 * shows as "Passes" (round-3 brief).
 */
import type { NextRequest } from 'next/server';
import { OrderPreviewRequest, OrderPreviewResponse } from '@shared/api';
import { authed, ok, parseBody, type Ctx } from '@/lib/http';
import { env } from '@/lib/env';
import { loadProfile } from '@/lib/kai/context';
import { buildPreview } from '@/lib/execution/preview';
import { ensureDevTicker } from '@/lib/execution/tick-dev';

export const dynamic = 'force-dynamic';

export const POST = authed(async (req: NextRequest, ctx: Ctx) => {
  ensureDevTicker();
  const body = await parseBody(req, OrderPreviewRequest);
  const profile = await loadProfile(ctx.user.id);

  const preview = await buildPreview({
    userId: ctx.user.id,
    requestId: ctx.requestId,
    accountId: body.account_id,
    symbol: body.symbol,
    side: body.side,
    type: body.type,
    qty: body.qty,
    notional: body.notional,
    limitPrice: body.limit_price ?? null,
    stopPrice: body.stop_price ?? null,
    duration: body.duration,
    planId: body.plan_id,
    setupId: body.setup_id,
    mode: body.mode ?? profile.primary_mode,
    // The stale path is a real gate, so it is only reachable behind DEV_TOOLS —
    // a client must never be able to talk the server into a fake data outage.
    forceStale: body.force_stale === true && env('DEV_TOOLS') === '1',
  });

  return ok(OrderPreviewResponse.parse(preview), { status: 201 });
});
