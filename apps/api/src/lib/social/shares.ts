/**
 * SHARED TRADES: reading them safely, writing them at the fill, closing them at
 * the exit.
 *
 * =====================================================================
 * THE PRIVACY MODEL, AND WHY IT IS ONE FUNCTION AND NOT A PATTERN
 * =====================================================================
 * 0038 §6 writes the read this app is required to use:
 *
 *   select s.* from trade_shares s
 *     join profiles p on p.user_id = s.user_id
 *    where p.share_trades = true
 *      and s.user_id = $1;
 *
 * The join is not an optimisation. `profiles.share_trades` is RETROACTIVE — a
 * member who switches sharing off means "stop showing people my trades", not
 * "stop showing the new ones" — and the rows are deliberately kept rather than
 * deleted so that switching back on restores the record instead of starting a
 * suspiciously clean new one. Which means the ONLY thing standing between a
 * user who opted out and their trades being published is that join, on every
 * read path, forever.
 *
 * So there is exactly one read path: `readSharedTrades()`. Nothing else in this
 * app selects from `trade_shares` for display. A rule written as "remember to
 * add the join" is a rule that lasts until the third route; a rule written as
 * "there is one function and it does the join" is a rule a future contributor
 * cannot forget, because there is nothing for them to forget.
 *
 * IT ALSO REFUSES TO ANSWER "EVERYONE". The helper takes a list of author ids
 * and returns nothing for an empty list. There is no way to ask it for the
 * whole table, which is the shape a leak actually takes.
 *
 * =====================================================================
 * SIZE IS NOT HERE AND CANNOT BE PUT HERE
 * =====================================================================
 * `trade_shares` has no `qty`, no `notional`, no `realized_pnl` and no
 * `avg_cost` — 0038 §7(c) fails the migration if one is ever added. The writer
 * below copies four numbers off the position (symbol, direction, entry price,
 * and the two levels) and the quantity never leaves the execution tables.
 * `result_pct` is a PERCENT: a fact about the instrument, not about the
 * account.
 *
 * =====================================================================
 * THIS FILE DOES NOT SCORE ANYTHING
 * =====================================================================
 * Sharing governs VISIBILITY. Points are the RECORD, they live in `points.ts`,
 * and they are keyed on the position rather than on a share — so a member with
 * sharing switched off earns exactly the same points as one with it on. See
 * that file's header for why the two were separated.
 *
 * =====================================================================
 * A SHARE MUST NEVER BE ABLE TO FAIL A FILL
 * =====================================================================
 * `shareOnFill` and `resolveShareOnClose` are called from the middle of an
 * order path. Both swallow everything and log, exactly the way `notify()` is
 * wrapped (see the header of `lib/notify.ts`): the worst a broken share may do
 * to somebody's trade is leave a row unwritten.
 */
import type { SharedTrade, SocialAuthor } from '@shared/api';
import { serviceClient } from '../db';
import { log } from '../log';
import { agePlain } from '../moderation';
import { loadAuthor, mentionFor } from './authors';
import { fanOutToFollowers } from './fanout';
import { coherentLevels, outcomeLabel, resultPct, round2 } from './outcomes';

export const SHARE_COLUMNS =
  'id,user_id,position_id,symbol,direction,entry,stop,target,opened_at,closed_at,outcome,result_pct,created_at';

export type ShareRow = {
  id: string;
  user_id: string;
  position_id: string;
  symbol: string;
  direction: 'long' | 'short';
  entry: number;
  stop: number | null;
  target: number | null;
  opened_at: string;
  closed_at: string | null;
  outcome: 'open' | 'target' | 'stop' | 'closed';
  result_pct: number | null;
};

/* ------------------------------------------------------------------ */
/* Reading — the only path                                              */
/* ------------------------------------------------------------------ */

/**
 * Which of these people currently have sharing switched ON.
 *
 * Written as its own function because it is the half of the join that carries
 * the promise, and because the feed needs the same answer for calls it has
 * already loaded. `profiles.share_trades` is `not null default false`, so an
 * absent row is an author we do not show — the safe direction.
 */
export async function sharingAuthors(userIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return new Set();
  const db = serviceClient();
  const { data, error } = await db
    .from('profiles')
    .select('user_id')
    .in('user_id', ids)
    .eq('share_trades', true);
  if (error) {
    // FAIL CLOSED. If we cannot establish that somebody opted in, we do not
    // show their trades. An empty feed is a bug report; a published position is
    // not something an apology fixes.
    log('warn', '-', 'social.share_switch_read_failed', { message: error.message });
    return new Set();
  }
  return new Set(((data ?? []) as Record<string, unknown>[]).map((r) => String(r.user_id)));
}

/**
 * THE read. Author ids in, shares of the ones who are sharing out, newest
 * first. There is no variant of this that takes no ids.
 */
export async function readSharedTrades(opts: {
  authorIds: string[];
  limit?: number;
  /** Only shares opened at or after this instant. Used by the feed. */
  since?: string | null;
}): Promise<ShareRow[]> {
  const authors = await sharingAuthors(opts.authorIds);
  if (!authors.size) return [];

  const db = serviceClient();
  let q = db
    .from('trade_shares')
    .select(SHARE_COLUMNS)
    .in('user_id', [...authors])
    .order('opened_at', { ascending: false })
    .limit(opts.limit ?? 50);
  if (opts.since) q = q.gte('opened_at', opts.since);

  const { data, error } = await q;
  if (error) {
    log('warn', '-', 'social.shares_read_failed', { message: error.message });
    return [];
  }
  return ((data ?? []) as Record<string, unknown>[]).map(toShareRow);
}

function toShareRow(r: Record<string, unknown>): ShareRow {
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    id: String(r.id),
    user_id: String(r.user_id),
    position_id: String(r.position_id),
    symbol: String(r.symbol),
    direction: String(r.direction) === 'short' ? 'short' : 'long',
    entry: Number(r.entry),
    stop: n(r.stop),
    target: n(r.target),
    opened_at: String(r.opened_at),
    closed_at: (r.closed_at as string) ?? null,
    outcome: String(r.outcome ?? 'open') as ShareRow['outcome'],
    result_pct: n(r.result_pct),
  };
}

/** The wire shape. Note what is not in it: quantity, notional, dollar P/L. */
export function shapeSharedTrade(row: ShareRow, author: SocialAuthor): SharedTrade {
  return {
    id: row.id,
    author,
    symbol: row.symbol,
    direction: row.direction,
    entry: row.entry,
    stop: row.stop,
    target: row.target,
    outcome: row.outcome,
    outcome_label: outcomeLabel(row.outcome),
    result_pct: row.result_pct,
    opened_at: row.opened_at,
    time_label: agePlain(row.opened_at),
    closed_at: row.closed_at,
  };
}

/* ------------------------------------------------------------------ */
/* Writing — at the fill                                                */
/* ------------------------------------------------------------------ */

/**
 * WHOSE DECISION IT WAS.
 *
 * `orders.share_trade` is a NULLABLE boolean and all three states are meant
 * (0038 §2): true = share this one, false = never this one, null = whatever my
 * account setting says AT FILL TIME. A route that coalesces null to false has
 * broken the per-trade override; a route that coalesces it to true has
 * published somebody's positions.
 */
async function shouldShare(userId: string, orderShareTrade: unknown): Promise<boolean> {
  if (orderShareTrade === true) return true;
  if (orderShareTrade === false) return false;
  const db = serviceClient();
  const { data } = await db.from('profiles').select('share_trades').eq('user_id', userId).maybeSingle();
  return (data as Record<string, unknown> | null)?.share_trades === true;
}

/**
 * A position just opened. If this trade is one the member chose to show, mirror
 * it into `trade_shares` — the levels and nothing else — and tell their
 * followers.
 *
 * IDEMPOTENT BY THE TABLE. `unique (position_id)` means a second call for the
 * same position writes nothing; adding to a position (a second fill on the same
 * open row) therefore does not double it in anybody's feed. The insert is done
 * as an ignoring upsert so the ordinary second call is not an error in the log.
 *
 * NOTHING HERE CAN THROW INTO THE ORDER PATH. Everything is inside the try.
 */
export async function shareOnFill(opts: {
  userId: string;
  orderId: string;
  positionId: string;
  requestId: string;
}): Promise<void> {
  try {
    const db = serviceClient();

    const already = await db
      .from('trade_shares')
      .select('id')
      .eq('position_id', opts.positionId)
      .maybeSingle();
    if (already.data) return;

    const orderRes = await db
      .from('orders')
      .select('id,share_trade,preview')
      .eq('id', opts.orderId)
      .eq('user_id', opts.userId)
      .maybeSingle();
    const order = (orderRes.data as Record<string, unknown> | null) ?? {};
    if (!(await shouldShare(opts.userId, order.share_trade))) return;

    const posRes = await db
      .from('positions')
      .select('id,symbol,direction,avg_cost,opened_at,stop,target,closed_at')
      .eq('id', opts.positionId)
      .eq('user_id', opts.userId)
      .maybeSingle();
    const pos = posRes.data as Record<string, unknown> | null;
    if (!pos) return;
    // A position that is already closed by the time we get here (a fill and its
    // stop inside the same tick) is history, not a share. The close path writes
    // the outcome; there is nothing for the open path to announce.
    if (pos.closed_at) return;

    const direction = String(pos.direction) === 'short' ? 'short' : 'long';
    const entry = round2(Number(pos.avg_cost));
    if (!Number.isFinite(entry) || entry <= 0) return;

    // The levels: the position's own, falling back to the bracket the preview
    // carried. `positions.stop` / `positions.target` arrive with 0020 and are
    // absent on an un-migrated database, which is why the preview is read too.
    const preview = (order.preview as Record<string, unknown>) ?? {};
    const targets = Array.isArray(preview.targets) ? (preview.targets as Record<string, unknown>[]) : [];
    const firstTarget = targets[0];
    const raw = {
      stop: pick(pos.stop, preview.stop),
      target: pick(pos.target, firstTarget ? (firstTarget.price ?? firstTarget.level ?? firstTarget) : null),
    };
    const levels = coherentLevels(direction, entry, raw.stop, raw.target);

    const inserted = await db
      .from('trade_shares')
      .upsert(
        {
          user_id: opts.userId,
          position_id: opts.positionId,
          symbol: String(pos.symbol),
          direction,
          entry,
          stop: levels.stop,
          target: levels.target,
          opened_at: String(pos.opened_at ?? new Date().toISOString()),
          outcome: 'open',
        } as never,
        { onConflict: 'position_id', ignoreDuplicates: true }
      )
      .select('id')
      .maybeSingle();

    if (inserted.error) {
      log('warn', opts.requestId, 'social.share_insert_failed', {
        position_id: opts.positionId,
        message: inserted.error.message,
      });
      return;
    }
    // `ignoreDuplicates` returns no row when the share already existed. Nothing
    // new happened, so nobody is told about it a second time.
    if (!inserted.data) return;

    const shareId = String((inserted.data as Record<string, unknown>).id);
    log('info', opts.requestId, 'social.share_created', { share_id: shareId, symbol: String(pos.symbol) });

    // The fan-out is its own failure domain. A follower's notification going
    // wrong must not undo a share that is already written.
    try {
      const author = await loadAuthor(opts.userId, opts.requestId);
      if (!author) return;
      const who = mentionFor(author);
      const verb = direction === 'long' ? 'went long' : 'went short';
      await fanOutToFollowers({
        authorId: opts.userId,
        kind: 'trade_shared',
        titlePlain: `${who} · ${String(pos.symbol)}`,
        bodyPlain: `${who} ${verb} ${String(pos.symbol)} at ${entry.toFixed(2)}`,
        route: `/contributor/${opts.userId}`,
        payload: { share_id: shareId, symbol: String(pos.symbol), direction },
        requestId: opts.requestId,
      });
    } catch (e) {
      log('warn', opts.requestId, 'social.share_fanout_threw', {
        message: e instanceof Error ? e.message : String(e),
      });
    }
  } catch (e) {
    log('warn', opts.requestId, 'social.share_on_fill_threw', {
      position_id: opts.positionId,
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

function pick(primary: unknown, fallback: unknown): number | null {
  for (const v of [primary, fallback]) {
    if (v === null || v === undefined) continue;
    const n = Number(v);
    if (Number.isFinite(n)) return round2(n);
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Writing — at the exit                                                */
/* ------------------------------------------------------------------ */

/**
 * A position closed. Stamp the share with how it ended and what it did, and —
 * when the trade came from one of Kai's alerts — score it.
 *
 * `leg` is which bracket fired, and the paper tick already knows: `target`,
 * `stop`, or null for a close the member made by hand. That is the whole
 * difference between "it worked" and "they decided", and inferring it from the
 * percent would get a scratch exit wrong in both directions.
 *
 * IT VERIFIES THE POSITION IS ACTUALLY CLOSED and does nothing otherwise. That
 * is what makes it safe to call from any exit path, including a PARTIAL close:
 * selling half of something is not an outcome, and a share stamped `closed` on
 * the first half would report a result the trade had not reached yet.
 *
 * IDEMPOTENT: a share that already carries a `closed_at` is left alone, so a
 * repeated tick cannot rewrite an outcome that has already been published.
 */
export async function resolveShareOnClose(opts: {
  userId: string;
  positionId: string;
  leg: 'target' | 'stop' | null;
  exitPrice: number;
  requestId: string;
}): Promise<void> {
  try {
    const db = serviceClient();

    const posRes = await db
      .from('positions')
      .select('closed_at')
      .eq('id', opts.positionId)
      .eq('user_id', opts.userId)
      .maybeSingle();
    const closedAtOnPosition = (posRes.data as Record<string, unknown> | null)?.closed_at ?? null;
    if (!closedAtOnPosition) return;

    const found = await db
      .from('trade_shares')
      .select(SHARE_COLUMNS)
      .eq('position_id', opts.positionId)
      .eq('user_id', opts.userId)
      .maybeSingle();
    const row = found.data ? toShareRow(found.data as Record<string, unknown>) : null;
    // No share means this trade was never shown to anybody. Nothing to close —
    // and, per the note below, nothing to score either.
    if (!row) return;
    if (row.closed_at) return;

    const pct = resultPct(row.direction, row.entry, opts.exitPrice);
    const outcome: ShareRow['outcome'] = opts.leg ?? 'closed';
    // The POSITION's stamp, not `now()`. The share is a mirror of the
    // execution; two timestamps a few hundred milliseconds apart would put the
    // share and the position it reflects on different sides of a minute.
    const closedAt = String(closedAtOnPosition);

    const { error } = await db
      .from('trade_shares')
      .update({ closed_at: closedAt, outcome, result_pct: pct })
      .eq('id', row.id);
    if (error) {
      log('warn', opts.requestId, 'social.share_close_failed', { share_id: row.id, message: error.message });
      return;
    }
    log('info', opts.requestId, 'social.share_closed', { share_id: row.id, outcome, result_pct: pct });

    /**
     * NO POINTS ARE AWARDED HERE, AND THAT IS DELIBERATE.
     *
     * Scoring a Kai trade used to hang off this function, which meant it only
     * ever happened for members who had switched sharing ON — and
     * `profiles.share_trades` defaults to FALSE. That made the board reachable
     * only by making your positions public, which is a privacy tax on a switch
     * we shipped off on purpose, and it punished the cautious member the ladder
     * exists to reward.
     *
     * So: SHARING GOVERNS VISIBILITY, POINTS ARE THE RECORD. The award lives in
     * `points.ts` — which does not import this file — and is keyed on the
     * POSITION rather than on the share. The coupling looks natural because
     * both happen at the same instant off the same position; it is not one.
     */
  } catch (e) {
    log('warn', opts.requestId, 'social.resolve_share_threw', {
      position_id: opts.positionId,
      message: e instanceof Error ? e.message : String(e),
    });
  }
}
