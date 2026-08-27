/**
 * GET /api/v1/market/session
 *
 * Session status from the America/New_York clock and weekends only. There is
 * still no market-holidays table, so `holidays_known:false` travels with every
 * answer and the notice says it out loud (README known gap 2).
 */
import type { NextRequest } from 'next/server';
import { SessionResponse } from '@shared/api';
import { authed, ok, type Ctx } from '@/lib/http';
import { marketBlock } from '@/lib/market';

export const dynamic = 'force-dynamic';

export const GET = authed(async (_req: NextRequest, _ctx: Ctx) =>
  ok(
    SessionResponse.parse({
      market: marketBlock(),
      holidays_known: false,
      notice_plain:
        'Market holidays are not known to this system yet — weekends only. On a holiday this will read as open.',
    })
  )
);
