/**
 * GET /api/v1/desk/picks/[ticker] → the full written argument.
 *
 * A company can be written up under more than one theme — KLIC came back under
 * three on 4 September — so the newest write-up is the answer and the others
 * are listed beside it. They are different arguments about the same company,
 * not duplicates to be silently dropped.
 */
import type { NextRequest } from 'next/server';
import { DeskPickResponse } from '@shared/desk';
import { authedParams, ok, type Ctx } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { kaiSource, loadPicksForTicker } from '@/lib/desk/source';

export const dynamic = 'force-dynamic';

export const GET = authedParams<{ ticker: string }>(
  async (_req: NextRequest, ctx: Ctx & { params: { ticker: string } }) => {
    const picks = await loadPicksForTicker(kaiSource(), ctx.params.ticker);
    if (!picks.length) {
      throw new ApiError('NOT_FOUND', `The desk has not written up ${ctx.params.ticker.toUpperCase()}.`);
    }
    const [pick, ...rest] = picks;
    return ok(DeskPickResponse.parse({
      pick,
      alsoWrittenUp: rest.map((p) => ({
        theme: p.theme ?? '',
        pickDate: p.pickDate,
        grade: p.grade,
        status: p.status,
      })),
    }));
  },
);
