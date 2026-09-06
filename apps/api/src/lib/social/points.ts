/**
 * POINTS. The private record.
 *
 * =====================================================================
 * SCORING NEVER DEPENDS ON SHARING, AND THIS FILE IS WHERE THAT IS TRUE
 * =====================================================================
 * This module does not import `shares.ts` and must not start. The first cut of
 * this lane keyed a `kai_trade` point event on `trade_shares.id`, which was
 * wrong in a way that only shows up as an absence: `profiles.share_trades`
 * defaults to FALSE, so the only route onto the board through Kai's alerts was
 * to make your positions public. That is a privacy tax on a switch we
 * deliberately shipped off, and it quietly punished exactly the cautious member
 * the ladder is supposed to reward.
 *
 * So the two things are separate and they are separate on purpose:
 *
 *   SHARING governs VISIBILITY.  Who can see this trade. `trade_shares`.
 *   POINTS  are the RECORD.      What it was worth. `point_events`.
 *
 * A member with sharing off earns exactly the same points as a member with it
 * on; nobody else can see the trades either way. The coupling looks natural —
 * both happen at the same instant, off the same position — and somebody will
 * reintroduce it. The guard is that `ref_id` for a `kai_trade` is the
 * POSITION's id and never a share's, and there is no share row read anywhere in
 * this file.
 *
 * `ref_id` HAS NO FOREIGN KEY, AND 0039 SAYS WHY: "the ledger must outlive the
 * thing it scored, or deleting a call would silently rewrite somebody's history
 * and their belt with it." Pointing it at a position is a supported use of
 * that, and `unique (source, ref_id)` still gives full idempotency — now keyed
 * on the position, which is the thing that actually resolved.
 */
import { serviceClient } from '../db';
import { log } from '../log';
import { callRpc } from '../rpc';
import { pointsConfig } from './belts';
import { notifyBeltEarned } from './fanout';
import { hasLevels, resultPct, round2, wasWon } from './outcomes';

export type AwardResult = {
  awarded: boolean;
  points?: number;
  total_points?: number;
  belt?: string;
  belt_changed?: boolean;
  reason?: string;
};

/**
 * The one call that writes points, plus the one notification that follows it.
 *
 * `award_points` computes its own multiplier, refuses to pay twice, and reports
 * whether the belt moved — so the caller never asks a second question to find
 * out (0039 §4). Everything here is best-effort: a resolution that scores is
 * still a resolution if the notification fails.
 */
export async function awardAndAnnounce(opts: {
  userId: string;
  source: 'community_call' | 'kai_trade';
  refId: string;
  won: boolean;
  resolvedAt?: string | null;
  requestId: string;
}): Promise<AwardResult> {
  const rpc = await callRpc<Record<string, unknown>>(
    'award_points',
    {
      p_user_id: opts.userId,
      p_source: opts.source,
      p_ref_id: opts.refId,
      p_won: opts.won,
      p_resolved_at: opts.resolvedAt ?? new Date().toISOString(),
    },
    opts.requestId
  );
  if (!rpc.ok) {
    log('warn', opts.requestId, 'social.award_failed', { source: opts.source, ref_id: opts.refId });
    return { awarded: false, reason: 'unavailable' };
  }

  const data = (rpc.data ?? {}) as Record<string, unknown>;
  const result: AwardResult = {
    awarded: data.awarded === true,
    points: data.points === undefined ? undefined : Number(data.points),
    total_points: data.total_points === undefined ? undefined : Number(data.total_points),
    belt: data.belt === undefined ? undefined : String(data.belt),
    belt_changed: data.belt_changed === true,
    reason: data.reason === undefined ? undefined : String(data.reason),
  };

  if (!result.awarded) return result;
  log('info', opts.requestId, 'social.points_awarded', {
    source: opts.source,
    ref_id: opts.refId,
    won: opts.won,
    points: result.points,
    belt: result.belt,
    belt_changed: result.belt_changed,
  });

  /**
   * THE BELT NOTIFICATION IS KEYED ON THE AWARD, NOT ON A SHARE. It goes to the
   * person whose points moved, whether or not they show anybody their trades.
   */
  if (result.belt_changed && result.belt) {
    try {
      const cfg = await pointsConfig(opts.requestId);
      const label = cfg?.belts.find((b) => b.key === result.belt)?.label ?? result.belt;
      await notifyBeltEarned({
        userId: opts.userId,
        belt: result.belt,
        label,
        totalPoints: Math.round(result.total_points ?? 0),
        requestId: opts.requestId,
      });
    } catch (e) {
      log('warn', opts.requestId, 'social.belt_notify_threw', {
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* Taking one of Kai's alerts                                           */
/* ------------------------------------------------------------------ */

/**
 * SIX POINTS FOR TAKING KAI'S READ AND HAVING IT WORK, TWO OFF IF IT DID NOT.
 * Less than a member's own call, because the read was Kai's (0039 §1, asserted
 * in §8(b) so it can never be re-tuned the other way round).
 *
 * THREE THINGS HAVE TO BE TRUE, and sharing is not one of them:
 *
 *   1. THE POSITION IS ACTUALLY CLOSED. A partial exit is not an outcome.
 *   2. THE TRADE CAME FROM THE HOUSE. A position the member found themselves is
 *      their own business, and scoring it would make the board a record of who
 *      trades most. `origin_setup_id` is set by the fallback fill path; 0020's
 *      RPC carries the setup through `origin_plan_id` → `trade_plans`, and
 *      stamps `positions.origin` — so all three are read before we conclude the
 *      trade was not Kai's.
 *   3. IT HAD LEVELS. A trade with no stop and no target could not have been
 *      wrong in any defined way, so it cannot be right in one either.
 *
 * IDEMPOTENT on `unique (source, ref_id)` with the position as the ref, so a
 * repeated tick, a retried close and a re-run cron all pay exactly once.
 *
 * IT NEVER THROWS INTO AN ORDER PATH. Everything is inside the try, the way
 * `notify()` is wrapped — see the header of `lib/notify.ts`.
 */
export async function scoreKaiTradeOnClose(opts: {
  userId: string;
  positionId: string;
  /** Which bracket fired, or null for a close the member made by hand. */
  leg: 'target' | 'stop' | null;
  exitPrice: number;
  requestId: string;
}): Promise<void> {
  try {
    const db = serviceClient();
    const posRes = await db
      .from('positions')
      .select('id,direction,avg_cost,closed_at,stop,target,origin_setup_id,origin_plan_id,origin')
      .eq('id', opts.positionId)
      .eq('user_id', opts.userId)
      .maybeSingle();
    const pos = posRes.data as Record<string, unknown> | null;
    if (!pos || !pos.closed_at) return;

    if (!(await cameFromKai(pos))) return;

    const direction = String(pos.direction) === 'short' ? 'short' : 'long';
    const entry = Number(pos.avg_cost);
    const levels = await levelsFor(pos);
    if (!hasLevels(entry, levels.stop, levels.target)) {
      log('info', opts.requestId, 'social.points_skipped_no_levels', { position_id: opts.positionId });
      return;
    }

    const pct = resultPct(direction, entry, opts.exitPrice);
    // A target leg is a win, a stop leg is a loss, and a close the member made
    // by hand is decided by the percent — where flat is not a win.
    const won = wasWon(opts.leg ?? 'closed', pct);

    await awardAndAnnounce({
      userId: opts.userId,
      source: 'kai_trade',
      // THE POSITION, NOT A SHARE. See this file's header.
      refId: opts.positionId,
      won,
      resolvedAt: String(pos.closed_at),
      requestId: opts.requestId,
    });
  } catch (e) {
    log('warn', opts.requestId, 'social.score_kai_trade_threw', {
      position_id: opts.positionId,
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

/** Did this position start life as one of Kai's setups or alerts? */
async function cameFromKai(pos: Record<string, unknown>): Promise<boolean> {
  if (pos.origin_setup_id) return true;
  const origin = (pos.origin as Record<string, unknown>) ?? {};
  if (origin.setup_id || origin.alert_id) return true;
  if (!pos.origin_plan_id) return false;
  const { data } = await serviceClient()
    .from('trade_plans')
    .select('setup_id')
    .eq('id', String(pos.origin_plan_id))
    .maybeSingle();
  return Boolean((data as Record<string, unknown> | null)?.setup_id);
}

/**
 * The levels this position was taken with.
 *
 * `positions.stop` / `positions.target` arrive with 0020 and are written by its
 * `submit_paper_order`. The no-RPC fallback in `lib/execution/engine.ts` creates
 * the bracket ORDERS but never stamps the position, so on a database without
 * 0020 both columns are null and a real bracketed trade would look level-less —
 * and score nothing. The entry order's own preview is read as the fallback so
 * the two paths agree about what the trade was.
 */
async function levelsFor(pos: Record<string, unknown>): Promise<{ stop: number | null; target: number | null }> {
  const num = (v: unknown): number | null => {
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? round2(n) : null;
  };

  const direct = { stop: num(pos.stop), target: num(pos.target) };
  if (direct.stop !== null || direct.target !== null) return direct;

  const origin = (pos.origin as Record<string, unknown>) ?? {};
  const orderId = typeof origin.order_id === 'string' ? origin.order_id : null;
  if (!orderId) return direct;

  const { data } = await serviceClient().from('orders').select('preview').eq('id', orderId).maybeSingle();
  const preview = ((data as Record<string, unknown> | null)?.preview as Record<string, unknown>) ?? {};
  const targets = Array.isArray(preview.targets) ? (preview.targets as Record<string, unknown>[]) : [];
  const first = targets[0];
  return {
    stop: num(preview.stop),
    target: num(first ? (first.price ?? first.level ?? first) : null),
  };
}
