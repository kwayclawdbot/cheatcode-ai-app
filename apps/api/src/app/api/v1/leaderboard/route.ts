/**
 * GET /api/v1/leaderboard?period=week|month|all
 *
 * The board, the caller's own row when it is off the bottom of it, and the
 * formula — printed from `points_config()` so the numbers a member reads are
 * the numbers the database actually used.
 *
 * THE ORDERING IS SQL'S, NOT THIS ROUTE'S. `social_leaderboard()` and
 * `social_rank()` (0039 §6) share one ordering expression on purpose: the
 * pinned row is only true if it was ranked the same way as the rows above it.
 * Nothing here sorts anybody.
 *
 * NOTE THE PERIOD FILTERS THE LEDGER, NOT THE ROLLUP. "This week" means points
 * earned this week, which is the only reading that lets somebody new climb.
 */
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { LeaderboardPeriod, LeaderboardResponse } from '@shared/api';
import { authed, ok, parseQuery, type Ctx } from '@/lib/http';
import { BOARD_LIMIT, leaderboard } from '@/lib/social/board';

export const dynamic = 'force-dynamic';

const Query = z.object({
  period: LeaderboardPeriod.default('week'),
  limit: z.coerce.number().int().min(1).max(BOARD_LIMIT).optional(),
});

export const GET = authed(async (req: NextRequest, ctx: Ctx) => {
  const { period, limit } = parseQuery(req, Query);
  const board = await leaderboard({
    viewerId: ctx.user.id,
    period,
    limit,
    requestId: ctx.requestId,
  });
  return ok(LeaderboardResponse.parse(board));
});
