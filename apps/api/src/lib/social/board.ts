/**
 * THE BOARD, AND THE RECORD BEHIND IT.
 *
 * `social_leaderboard()` and `social_rank()` (0039 §6) do the ordering in SQL,
 * and they must both be used or neither: they share one ordering expression,
 * and the moment this file ranks anybody itself the pinned row starts lying
 * about where that person is.
 *
 * WHAT THE BOARD IS NOT. Not one number here is denominated in money. Ranking
 * is by accuracy-weighted resolved calls, so the person with the biggest
 * account cannot buy a position on it — that is the half of the old prohibition
 * (08 §8) that survived the owner's reversal, and it survives in the SQL rather
 * than in a promise.
 *
 * THE ACCURACY COLUMN IS PRINTED BESIDE EVERY ROW ON PURPOSE. The board is
 * supposed to teach that being right is what is measured; a column of points
 * with no accuracy beside it teaches that volume is.
 */
import type { LeaderboardPeriod, LeaderboardResponse, LeaderboardRow, SocialRecord } from '@shared/api';
import { serviceClient } from '../db';
import { log } from '../log';
import { callRpc } from '../rpc';
import { loadAuthors } from './authors';
import { beltBlock, inWarmup, pointsConfig, pointsExplainer } from './belts';

/** Long enough to be a board, short enough to be one screen's worth of reading. */
export const BOARD_LIMIT = 50;

type BoardRow = {
  rank: number;
  user_id: string;
  points: number;
  wins: number;
  resolved: number;
  accuracy: number | null;
};

type RankRow = {
  rank: number;
  points: number;
  wins: number;
  resolved: number;
  accuracy: number | null;
};

export async function leaderboard(opts: {
  viewerId: string;
  period: LeaderboardPeriod;
  limit?: number;
  requestId: string;
}): Promise<LeaderboardResponse> {
  const limit = Math.min(Math.max(opts.limit ?? BOARD_LIMIT, 1), 200);

  const [boardRpc, rankRpc, cfg] = await Promise.all([
    callRpc<Record<string, unknown>[]>(
      'social_leaderboard',
      { p_period: opts.period, p_limit: limit },
      opts.requestId
    ),
    callRpc<Record<string, unknown>[]>(
      'social_rank',
      { p_user_id: opts.viewerId, p_period: opts.period },
      opts.requestId
    ),
    pointsConfig(opts.requestId),
  ]);

  if (!boardRpc.ok) {
    log('warn', opts.requestId, 'social.board_unavailable', { period: opts.period });
    return {
      period: opts.period,
      rows: [],
      you: null,
      explainer: pointsExplainer(cfg),
      empty_plain: 'The board is not available just now. Nothing is lost — it is a view over the ledger.',
    };
  }

  const board = (boardRpc.data ?? []).map(toBoardRow);
  // `social_rank` returns a table, so PostgREST hands back an array. Nobody who
  // has never resolved anything appears in it at all, and that is not an error:
  // there is no rank to show them yet.
  const mineRaw = rankRpc.ok ? (rankRpc.data ?? [])[0] : null;
  const mine = mineRaw ? toRankRow(mineRaw) : null;

  const ids = [...board.map((r) => r.user_id)];
  if (mine) ids.push(opts.viewerId);
  const authors = await loadAuthors(ids, opts.requestId);

  const rows: LeaderboardRow[] = [];
  for (const r of board) {
    const author = authors.get(r.user_id);
    if (!author) continue;
    rows.push({
      rank: r.rank,
      author,
      points: r.points,
      wins: r.wins,
      resolved: r.resolved,
      accuracy: r.accuracy,
      is_you: r.user_id === opts.viewerId,
    });
  }

  // PINNED ONLY WHEN THEY ARE NOT ALREADY ON SCREEN. A row that appears twice
  // reads as a bug in the ranking, which is the one thing a board must never
  // look like.
  const onScreen = rows.some((r) => r.is_you);
  const you: LeaderboardRow | null =
    mine && !onScreen && authors.get(opts.viewerId)
      ? {
          rank: mine.rank,
          author: authors.get(opts.viewerId)!,
          points: mine.points,
          wins: mine.wins,
          resolved: mine.resolved,
          accuracy: mine.accuracy,
          is_you: true,
        }
      : null;

  return {
    period: opts.period,
    rows,
    you,
    explainer: pointsExplainer(cfg),
    empty_plain: rows.length
      ? null
      : opts.period === 'all'
        ? 'Nobody has resolved a call yet. Publish one with real levels and you will be the first name here.'
        : 'Nothing has resolved in this period yet. Try the all-time board.',
  };
}

function toBoardRow(r: Record<string, unknown>): BoardRow {
  return {
    rank: Number(r.rank ?? 0),
    user_id: String(r.user_id),
    points: Number(r.points ?? 0),
    wins: Number(r.wins ?? 0),
    resolved: Number(r.resolved ?? 0),
    accuracy: r.accuracy === null || r.accuracy === undefined ? null : Number(r.accuracy),
  };
}

function toRankRow(r: Record<string, unknown>): RankRow {
  return {
    rank: Number(r.rank ?? 0),
    points: Number(r.points ?? 0),
    wins: Number(r.wins ?? 0),
    resolved: Number(r.resolved ?? 0),
    accuracy: r.accuracy === null || r.accuracy === undefined ? null : Number(r.accuracy),
  };
}

/* ------------------------------------------------------------------ */
/* One person's record                                                  */
/* ------------------------------------------------------------------ */

/**
 * The all-time record shown on a profile, read from the `user_points` rollup.
 *
 * A member with no row has never resolved anything: zeroes, White belt, and no
 * accuracy — `null`, not `0`. A blank never looks blank on a screen, and 0%
 * accuracy is a statement about somebody who has been wrong, not about somebody
 * who has not started.
 */
export async function socialRecord(userId: string, requestId = '-'): Promise<SocialRecord> {
  const db = serviceClient();
  const [{ data }, cfg] = await Promise.all([
    db
      .from('user_points')
      .select('points,wins,losses,resolved,accuracy,belt')
      .eq('user_id', userId)
      .maybeSingle(),
    pointsConfig(requestId),
  ]);

  const r = (data as Record<string, unknown> | null) ?? {};
  const points = Number(r.points ?? 0);
  const resolved = Number(r.resolved ?? 0);
  return {
    points,
    wins: Number(r.wins ?? 0),
    losses: Number(r.losses ?? 0),
    resolved,
    accuracy: r.accuracy === null || r.accuracy === undefined ? null : Number(r.accuracy),
    belt: beltBlock((r.belt as string) ?? 'white', points, cfg),
    in_warmup: inWarmup(resolved, cfg),
  };
}
