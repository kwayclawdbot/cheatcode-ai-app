/**
 * POST /api/v1/orders/submit  {preview_id, idempotency_key}
 *
 * The only route in this app that moves money, even practice money. It is
 * deliberately dumb: everything it knows came from the preview row, and the
 * three ways it can refuse (`PREVIEW_EXPIRED`, `PREVIEW_INVALID`, the preview's
 * own blocker) all send the user back to look again rather than guessing.
 *
 * A repeated `idempotency_key` returns the ORIGINAL order with
 * `deduplicated:true` — a double-tap can never become two positions.
 */
import type { NextRequest } from 'next/server';
import { OrderSubmitRequest, OrderSubmitResponse } from '@shared/api';
import { authed, ok, parseBody, type Ctx } from '@/lib/http';
import { rateLimit } from '@/lib/ratelimit';
import { submitOrder } from '@/lib/execution/submit';
import { ensureDevTicker } from '@/lib/execution/tick-dev';

export const dynamic = 'force-dynamic';

export const POST = authed(async (req: NextRequest, ctx: Ctx) => {
  ensureDevTicker();
  const body = await parseBody(req, OrderSubmitRequest);

  // 03 Unit 4's SnapTrade launch checklist caps a live account at 1 trade/sec.
  // Paper has no broker to protect, but the habit is the same one, and it stops
  // a runaway client from filling a book by accident.
  rateLimit({
    key: `orders:submit:${ctx.user.id}`,
    limit: 30,
    windowMs: 60_000,
    messagePlain: 'That is a lot of orders in one minute. Take a breath and try again shortly.',
  });

  const result = await submitOrder({
    userId: ctx.user.id,
    previewId: body.preview_id,
    idempotencyKey: body.idempotency_key,
    requestId: ctx.requestId,
  });

  return ok(OrderSubmitResponse.parse(result), { status: result.deduplicated ? 200 : 201 });
});
