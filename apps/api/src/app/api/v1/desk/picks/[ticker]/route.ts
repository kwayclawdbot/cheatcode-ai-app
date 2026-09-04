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
import { kaiSource, loadPicksForTicker, loadTheme } from '@/lib/desk/source';

export const dynamic = 'force-dynamic';

export const GET = authedParams<{ ticker: string }>(
  async (_req: NextRequest, ctx: Ctx & { params: { ticker: string } }) => {
    const src = kaiSource();
    const picks = await loadPicksForTicker(src, ctx.params.ticker);
    if (!picks.length) {
      throw new ApiError('NOT_FOUND', `The desk has not written up ${ctx.params.ticker.toUpperCase()}.`);
    }
    const [pick, ...rest] = picks;
    // How big the claim is and when it lands belong to the THEME, not to the
    // company. The screen shows both, so they are read off the theme table
    // rather than guessed at from anything on the pick.
    const themeJudgement = pick.theme ? await loadTheme(src, pick.theme) : null;
    return ok(DeskPickResponse.parse({
      pick,
      themeJudgement,
      alsoWrittenUp: rest.map((p) => ({
        theme: p.theme ?? '',
        pickDate: p.pickDate,
        grade: p.grade,
        status: p.status,
      })),
    }));
  },
);
